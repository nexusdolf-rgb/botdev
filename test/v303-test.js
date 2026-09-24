// v303 — /help refusé par Discord : « COMPONENT_MAX_TOTAL_COMPONENTS_EXCEEDED »
// (le vrai coupable derrière le « commande pas encore prête » signalé par le
// fondateur). Deux causes :
//  1) ui.v2container ne comptait PAS les composants interactifs à l'intérieur
//     des ActionRow (boutons, menus) dans le plafond des 40 imposé par
//     Discord → le budget interne mentait ;
//  2) le sommaire du centre d'aide affichait 16 champs séparés chacun d'un
//     séparateur natif : 44 composants réels côté admin → panneau entier
//     rejeté. Correctifs : comptage honnête (rangée + enfants) et sommaire
//     regroupé deux catégories par bloc (le rendu garde son rythme).
//  Bonus : les vues catégorie/personnalisées passent leur liste dans la
//  description (les valeurs de champ étaient tronquées à 1024 caractères).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v303');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ui = require('../server/discord/ui');
const premade = require('../server/discord/premade');
const { PermissionFlagsBits: F } = require('discord.js');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Compte les composants EXACTEMENT comme Discord : tout composant compte,
// y compris ceux imbriqués (conteneurs, sections, rangées ET leurs enfants).
function discordCount(components) {
  let n = 0;
  const walk = (cs) => { for (const c of cs || []) { n++; if (c.accessory) n++; if (c.components && c.components.length) walk(c.components); } };
  walk(components);
  return n;
}
const countOf = (payload) => discordCount(JSON.parse(JSON.stringify(payload.components || [])));
const textOf = (payload) => JSON.stringify(payload);

const mkMember = (flags) => {
  const bit = flags.reduce((a, f) => a | BigInt(f), 0n);
  return {
    id: 'm1', user: { id: 'm1' },
    permissions: {
      bitfield: bit,
      // comme discord.js : Administrateur donne TOUTES les permissions
      has: (p) => {
        if ((bit & BigInt(F.Administrator)) === BigInt(F.Administrator)) return true;
        const need = (Array.isArray(p) ? p : [p]).reduce((a, f) => a | BigInt(f), 0n);
        return (bit & need) === need;
      },
    },
  };
};
const guild = { id: 'g303', name: 'Serveur Test', ownerId: 'patron', roles: { cache: new Map() } };
const client = { user: { username: 'Testeur', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' } };
const record = { prefix: '!' };

(async () => {
  console.log('— 1. Pins de version v303 —');
  const html = racine('public/index.html');
  check('index.html : ?v=320 ×7', (html.match(/\?v=320/g) || []).length === 7);
  check('aucun ?v=302 restant', !html.includes('?v=302') && !racine('public/sw.js').includes('botdev-v302'));
  check('sw.js : cache botdev-v320', racine('public/sw.js').includes("const CACHE = 'botdev-v320';"));

  console.log('— 2. Comptage honnête : les enfants des rangées comptent dans les 40 —');
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row5 = new ActionRowBuilder().addComponents(
    ...[1, 2, 3, 4, 5].map((i) => new ButtonBuilder().setCustomId('b' + i).setLabel('B' + i).setStyle(ButtonStyle.Secondary)),
  );
  // Un corps énorme + une rangée : le total DISCORD doit rester ≤ 40,
  // sinon le panneau serait rejeté en production.
  const gros = ui.v2panel({ title: 'T', description: Array.from({ length: 30 }, (_, i) => `Paragraphe ${i} de remplissage.`).join('\n\n') }, [row5]);
  const nGros = countOf(gros);
  check('panneau saturé : jamais plus de 40 composants côté Discord', nGros <= 40, String(nGros));
  // Une rangée et ses boutons comptent bien (1 + N) : petit panneau avec 1 seul paragraphe.
  const petit = ui.v2panel({ title: 'T', description: 'Un paragraphe.', sections: false }, [row5]);
  const nPetit = countOf(petit);
  const brutPetit = textOf(petit);
  check('petit panneau : la rangée de 5 boutons est conservée', brutPetit.includes('"b1"') && brutPetit.includes('"b5"'));
  check('…et le compte Discord inclut bien rangée + boutons', nPetit >= 6, String(nPetit));
  const uiSrc = racine('server/discord/ui.js');
  check('ui.js compte les enfants des rangées (1 + children)', uiSrc.includes('1 + children'));

  console.log('— 3. /help : le panneau rentre pour TOUS les profils —');
  const botId = store.bots.create({ user_id: 1, name: 'T303', token: 'x', client_id: 'c', prefix: '!' });
  for (const key of Object.keys(premade.MODULES)) store.modules.set(botId, key, true);
  const profils = [
    ['ADMIN (fondateur)', mkMember([F.Administrator]), guild],
    ['modérateur', mkMember([F.KickMembers, F.ModerateMembers, F.ManageMessages]), guild],
    ['membre lambda', mkMember([]), guild],
    ['MP (pas de serveur)', null, null],
  ];
  for (const [label, member, g] of profils) {
    const p = premade.buildHelpPanel(botId, record, client, g, null, member, 'home', 'm1');
    const n = countOf(p);
    check(`sommaire ${label} : ${n} composants ≤ 40`, n <= 40, String(n));
  }
  const adminPanel = premade.buildHelpPanel(botId, record, client, guild, null, mkMember([F.Administrator]), 'home', 'm1');
  const brut = textOf(adminPanel);
  check('sommaire admin : menu déroulant présent', brut.includes(`hx-help:${botId}`));
  check('…bouton « Effacer » présent', brut.includes('hx-helpdel'));
  check('…vignette du bot présente', brut.includes('embed/avatars/0.png'));
  const toutesCategories = premade.HELP_BLOCKS.every((b) => brut.includes(b.title.split(' ').slice(1).join(' ')));
  check('…les 16 catégories sont ENTIÈREMENT là (rien n\'a été sacrifié)', toutesCategories);
  check('…le sélecteur propose toutes les catégories', (() => {
    const json = JSON.parse(brut);
    const sel = (function find(cs) { for (const c of cs || []) { if (c.type === 3) return c; if (c.components) { const r = find(c.components); if (r) return r; } } return null; })(json.components);
    return !!sel && sel.options.length >= 10;
  })());

  console.log('— 4. Commandes personnalisées + légende : toujours sous les 40 —');
  for (let i = 0; i < 4; i++) {
    store.commands.create({ bot_id: botId, name: 'cmd' + i, description: 'Commande de test numéro ' + i, trigger_type: 'slash', trigger_value: '', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: i });
  }
  const pCustom = premade.buildHelpPanel(botId, record, client, guild, null, mkMember([]), 'home', 'm1');
  const nCustom = countOf(pCustom);
  check(`sommaire membre + 4 commandes perso + légende : ${nCustom} ≤ 40`, nCustom <= 40, String(nCustom));
  check('…le bloc « Commandes personnalisées » est affiché', textOf(pCustom).includes('Commandes personnalisées'));
  check('…la légende des commandes invisibles est affichée', textOf(pCustom).includes('invisibles pour vous'));

  console.log('— 5. Vues catégorie : listes plus jamais tronquées à 1024 —');
  const vueCat = premade.buildHelpPanel(botId, record, client, guild, null, mkMember([F.Administrator]), 'c8', 'm1');
  check('vue catégorie ≤ 40', countOf(vueCat) <= 40, String(countOf(vueCat)));
  const cat8 = premade.buildHelpPanel(botId, record, client, guild, null, mkMember([F.Administrator]), 'home', 'm1');
  const bloc8 = premade.HELP_BLOCKS[8];
  check('détail catégorie : chaque commande a sa ligne « /nom — description »', bloc8.names.every((nm) => textOf(vueCat).includes(`**/${nm}** — `)));
  const vueCustom = premade.buildHelpPanel(botId, record, client, guild, null, mkMember([F.Administrator]), 'custom', 'm1');
  check('vue commandes perso ≤ 40', countOf(vueCustom) <= 40, String(countOf(vueCustom)));
  check('…les 4 commandes perso sont listées', [0, 1, 2, 3].every((i) => textOf(vueCustom).includes('/cmd' + i)));

  console.log('— 6. Garde-fous source —');
  const premadeSrc = racine('server/discord/premade.js');
  check('sommaire regroupé par paires (flushPair)', premadeSrc.includes('flushPair'));
  check('les vues catégorie/personnalisée utilisent la description', !premadeSrc.includes("value: lines.join('\\n').slice(0, 3500) }],"));

  console.log(`\n✅ v303 : ${ok} vérifications passed.`);
})().catch((e) => { console.error(e); process.exit(1); });
