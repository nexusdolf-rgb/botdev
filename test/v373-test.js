// ============================================================
// v373 — l'identité personnalisée est bien celle du SERVEUR, et le choix de
// la photo passe par le sélecteur de fichiers de Discord.
//
// Trois choses corrigées ici :
//   1. le webhook d'identité n'est plus recréé à l'aveugle : il est reconnu à
//      son nom, et s'il a été supprimé à la main il est recréé au lieu de
//      rester mort dans le cache ;
//   2. le journal du serveur signe avec l'identité du serveur (avant, il
//      gardait le visage global du bot) ;
//   3. l'assistant /botprofile setup n'oblige plus à taper
//      « /botprofile avatar » : un bouton ouvre le sélecteur de fichiers.
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v373-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const identity = require('../server/discord/identity');
const wizard = require('../server/discord/profileWizard');

let ok = 0;
const echecs = [];
const check = (label, cond, detail) => {
  if (cond) { ok++; console.log('  ✅ ' + label); return; }
  echecs.push(label);
  console.log('  ❌ ' + label + (detail === undefined ? '' : ' — ' + String(detail).slice(0, 140)));
};

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const VERSION = 373;

const BOT = 'BOT373';
const GUILD = '150000000000003373';

function fauxSalon() {
  const envois = [];
  const channel = {
    id: 'CH373', name: 'general',
    guild: { id: GUILD, name: 'Serveur Test' },
    client: { user: { id: 'CLIENT373', displayAvatarURL: () => 'https://cdn.example/bot.png' } },
    send: async (p) => { envois.push(['direct', p]); return {}; },
    fetchWebhooks: async () => [],
    createWebhook: async () => ({
      send: async (p) => { envois.push(['webhook', p]); return {}; },
    }),
  };
  return { channel, envois };
}

async function main() {
  console.log('— 1. Version —');
  const index = lire('public/index.html');
  const sw = lire('public/sw.js');
  check(`index.html : ?v=${VERSION} référencé 7 fois`, (index.match(/\?v=373/g) || []).length === 7);
  check('service worker au même cache', sw.includes("const CACHE = 'botdev-v373';"));

  console.log('— 2. L’identité est celle du serveur —');
  const { channel, envois } = fauxSalon();
  // Sans profil : envoi direct, aucune signature inventée.
  await identity.sendAs(BOT, channel, { content: 'sans profil' });
  check('sans profil, le bot écrit avec son identité globale',
    envois.length === 1 && envois[0][0] === 'direct');
  // Avec un profil : webhook, nom et avatar du serveur.
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  store.botProfiles.set(BOT, GUILD, { name: 'Hoxera du CHEAT', avatar_url: '/assets/a.png', bio: '', color: '#8B5CF6' });
  envois.length = 0;
  await identity.sendAs(BOT, channel, { content: 'avec profil' });
  check('avec un profil, l’envoi passe par le webhook', envois[0] && envois[0][0] === 'webhook');
  check('le nom du serveur est signé', envois[0] && envois[0][1].username === 'Hoxera du CHEAT');
  check('l’avatar du serveur suit', envois[0] && !!envois[0][1].avatarURL);
  // Un autre serveur n'hérite pas de ce profil.
  const autre = fauxSalon();
  autre.channel.guild.id = '150000000000009999';
  store.botProfiles.set(BOT, '150000000000009999', { name: '', avatar_url: '', bio: '', color: '#e07a5f' });
  await identity.sendAs(BOT, autre.channel, { content: 'autre serveur' });
  check('un serveur sans nom personnalisé garde l’identité globale',
    autre.envois[0][0] === 'direct');

  console.log('— 3. Le webhook supprimé est recréé —');
  {
    const essais = [];
    let vieux = true;
    const ch = {
      id: 'CH2', guild: { id: GUILD, name: 'S' },
      client: { user: { id: 'CLIENT373', displayAvatarURL: () => 'https://cdn.example/bot.png' } },
      send: async () => ({ ok: 'direct' }),
      fetchWebhooks: async () => (vieux ? [{ id: 'W1', name: identity.HOOK_NAME, owner: null }] : []),
      // Discord répond « Unknown Webhook » quand il n'existe plus.
      createWebhook: async () => ({ send: async (p) => { essais.push(p.username); return {}; } }),
    };
    const hookMort = { send: async () => { vieux = false; throw new Error('Unknown Webhook'); } };
    // On force le cache avec un webhook mort.
    identity.__testSetHook(BOT, GUILD, 'CH2', hookMort);
    await identity.sendAs(BOT, ch, { content: 'après suppression' });
    check('un envoi raté fait recréer le webhook et le message part',
      essais.length === 1, essais.length);
  }

  console.log('— 4. Le journal du serveur signe avec son identité —');
  const logging = lire('server/discord/logging.js');
  check('logging.js passe par identity.sendAs', /await identity\.sendAs\(botId, channel, ui\.v2panel\(/.test(logging));
  check('plus d’envoi direct dans le journal', !/await channel\.send\(ui\.v2panel\(/.test(logging));

  console.log('— 5. Le choix de la photo est un sélecteur, pas une commande —');
  const modal = wizard.__testPickModal(BOT, '42', 'avatar').toJSON();
  check('la modale porte le bon préfixe', String(modal.custom_id).startsWith('bpw-file:'));
  check('elle contient un champ de fichier (type 19)',
    JSON.stringify(modal).includes('"type":19'));
  check('le fichier est obligatoire et unique',
    JSON.stringify(modal).includes('"required":true') && JSON.stringify(modal).includes('"max_values":1'));
  const src = lire('server/discord/profileWizard.js');
  check('le bouton « Choisir une image » ouvre la modale', /action === 'pick'[\s\S]{0,200}showModal\(pickModal/.test(src));
  check('les étapes ne disent plus de taper /botprofile avatar',
    !/tapez \`\/botprofile avatar\`/.test(src) && !/tapez \`\/botprofile banner\`/.test(src));
  const panels = lire('server/discord/panels.js');
  check('le dispatcher route la modale bpw-file', /cid\.startsWith\('bpw-file:'\)/.test(panels));
  // v373 — la fenêtre de fichier ne doit pas contourner les gardes.
  const blocFichier = src.slice(src.indexOf("parts[0] === 'bpw-file'"), src.indexOf("if (!uid || uid !== interaction.user.id)"));
  check('la fenêtre de fichier revérifie la permission à chaque envoi',
    /canConfigureGuild\(interaction\.guild, interaction\.member/.test(blocFichier));
  check('la fenêtre de fichier applique aussi l’expiration',
    /WIZARD_TTL/.test(blocFichier));

  console.log('— 6. Le diagnostic de permission —');
  const props = lire('server/discord/profileCommands.js');
  check('/botprofile view prévient si les webhooks sont refusés',
    /identity\.identityStatus/.test(props) && /Gérer les webhooks/.test(props));
  const idSrc = lire('server/discord/identity.js');
  check('le webhook est reconnu à son nom, pas seulement à son propriétaire',
    /h\.name === HOOK_NAME/.test(idSrc));
  check('un envoi raté oublie le webhook du cache', /forgetWebhook\(botId, guild\.id, channel\.id\)/.test(idSrc));

  console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌ sur ${ok + echecs.length} vérifications`);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
  console.log('🎉 v373 — identité par serveur appliquée, photo choisie au sélecteur.');
}

main().catch((e) => { console.error('Erreur fatale du test :', e.message); process.exit(1); });
