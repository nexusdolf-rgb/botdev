// v262 — Centre d'aide « pro » : panneau Components V2 + menu déroulant.
//
// Avant : un embed classique, chips serrées 6 par ligne, aucune navigation.
// Après : panneau V2 (sommaire → catégorie → détail) avec un menu déroulant
// « 📂 Naviguer dans les catégories… » qui met le panneau à jour sur place,
// à la façon des gros bots. Comportements conservés et revérifiés ici :
// filtrage par membre, légende des commandes invisibles, verrou staff sur
// le détail d'une commande, commandes personnalisées du serveur.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v262test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const v2 = require('./helpers/v2');
const store = require('../server/db');
const premade = require('../server/discord/premade');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const clientUser = { user: { username: 'Hoxera', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/a.png' } };
const record = { prefix: '!' };
const brut = (p) => JSON.stringify(p);

// Petit membre stub : permissions via bits (même forme que v226).
const F = require('discord.js').PermissionFlagsBits;
const mkMember = (flags) => {
  const bit = flags.reduce((a, f) => a | BigInt(f), 0n);
  return {
    id: 'm1',
    user: { id: 'm1' },
    permissions: {
      bitfield: bit,
      has: (p) => {
        const need = (Array.isArray(p) ? p : [p]).reduce((a, f) => a | BigInt(f), 0n);
        return (bit & need) === need;
      },
    },
  };
};

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.modules.set(botId, 'utility', true);
  store.modules.set(botId, 'moderation', true);

  console.log('— 1. Sommaire : panneau V2 avec menu déroulant —');
  const home = premade.buildHelpPanel(botId, record, clientUser, null, null);
  check('panneau Components V2 (plus d’embed)', v2.isV2(home));
  check('titre « 📚 Centre d’aide — Hoxera »', v2.title(home).includes("Centre d'aide — Hoxera"), v2.title(home));
  const select = v2.rows(home).flatMap((r) => r.components || []).find((c) => c && c.type === 3);
  check('menu déroulant de navigation présent', !!select);
  check('…option Sommaire + catégories, 25 max',
    !!select && select.options.length <= 25 && select.options.some((o) => o.value === 'home') && select.options.length >= 10);
  check('…identifiant routé par bot : hx-help:<id>', select.custom_id === `hx-help:${botId}`);
  check('chaque catégorie annonce son nombre de commandes', brut(home).includes('commandes'));
  check('photo du bot en vignette', brut(home).includes('avatars/1/a.png'));

  console.log('— 2. Filtrage par membre (conservé) —');
  const normal = mkMember([], null);
  const mod = mkMember([F.KickMembers, F.ModerateMembers], null);
  const gNormal = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, null, normal);
  const gMod = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, null, mod);
  check('membre lambda : pas de bloc modération', !brut(gNormal).includes('Modération & sanctions'));
  check('…légende « Commandes invisibles pour vous » présente', brut(gNormal).includes('Commandes invisibles pour vous'));
  check('modérateur : bloc modération + /warns visibles', brut(gMod).includes('Modération & sanctions') && brut(gMod).includes('/warns'));

  console.log('— 3. Vue catégorie via le menu —');
  const catMod = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, null, mod, 'c8');
  check('catégorie modération : une ligne « /kick — description »', brut(catMod).includes('**/kick** — '));
  check('…le menu propose le retour au sommaire', brut(catMod).includes('🏠 Sommaire'));
  const catInterdite = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, null, normal, 'c8');
  check('catégorie invisible pour le membre → retour sommaire', v2.title(catInterdite).includes("Centre d'aide"));
  store.commands.create({ bot_id: botId, name: 'salut', description: 'Dit salut', trigger_type: 'slash', trigger_value: '', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: 0 });
  const catCustom = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, null, normal, 'custom');
  check('commandes personnalisées : liste dédiée avec description', brut(catCustom).includes('**/salut** — Dit salut'));

  console.log('— 4. Détail d’une commande (conservé, en V2) —');
  const admin = mkMember([F.Administrator]);
  const detail = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, 'ticket', admin);
  check('détail ticket : bloc « 📖 Utilisation »', brut(detail).includes('📖 Utilisation'));
  const detailEx = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, 'ping', mod);
  check('détail ping : bloc « ✨ Exemple » en plus', brut(detailEx).includes('📖 Utilisation') && brut(detailEx).includes('✨ Exemple'));
  const lock = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, 'kick', normal);
  check('détail staff pour un lambda : verrou 🔒', brut(lock).includes('réservée au staff'));
  const nope = premade.buildHelpPanel(botId, record, clientUser, { id: 'g', name: 'S' }, 'inexistante', normal);
  check('commande inconnue : « ❓ Commande introuvable »', brut(nope).includes('Commande introuvable'));

  console.log('— 5. Le menu déroulant met le panneau à jour sur place —');
  let updated = null;
  const fakeSelect = {
    isStringSelectMenu: () => true,
    customId: `hx-help:${botId}`,
    values: ['c8'],
    guild: { id: 'g', name: 'S' },
    member: mod,
    update: async (p) => { updated = p; },
  };
  const handled = await premade.handleHelpSelect(botId, { client: clientUser }, fakeSelect);
  check('sélection traitée → i.update avec la catégorie', handled === true && !!updated && v2.title(updated).includes('Modération'));
  const foreign = await premade.handleHelpSelect(botId, { client: clientUser }, { ...fakeSelect, customId: 'autre:menu' });
  check('menu d’un autre module : ignoré', foreign === false);
  const notSelect = await premade.handleHelpSelect(botId, { client: clientUser }, { isStringSelectMenu: () => false });
  check('interaction non-sélecteur : ignorée', notSelect === false);

  console.log('— 6. Câblage et fin de l’embed —');
  const bm = fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/botManager.js'), 'utf8');
  check('routage du menu AVANT les autres gestionnaires',
    bm.indexOf('handleHelpSelect') > 0 && bm.indexOf('handleHelpSelect') < bm.indexOf("require('./extra')"));
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/premade.js'), 'utf8');
  // v263 — l'envoi passe désormais par une variable (drapeau éphémère posé
  // entre-temps) : on vérifie la construction du panneau ET l'envoi.
  check('la commande /help envoie le panneau V2 (plus d’embed)',
    src.includes("const panel = buildHelpPanel(botId, record, client, guild, requested, member, 'home'") && src.includes('await send(panel);'));
  check('plus aucune fonction buildHelpEmbed', !src.includes('function buildHelpEmbed'));

  console.log('— 7. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=267 référencé 7 fois', (index.match(/\?v=267/g) || []).length === 7,
    String((index.match(/\?v=267/g) || []).length));
  check('sw.js : cache « botdev-v267 »', sw.includes("const CACHE = 'botdev-v267';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v262 — ${ok} vérifications OK : le centre d'aide est devenu pro.`);
  else { console.log(`❌ v262 — ${ko} échec(s)`); process.exitCode = 1; }
})();
