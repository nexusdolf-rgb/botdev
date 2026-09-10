// v263 — L'aide ne reste plus affichée (demande du maître).
//
// Constat : quand quelqu'un tapait /help, le panneau restait affiché dans le
// salon pour tout le monde, pour toujours.
//
// Réponse en deux temps :
//   • en slash, le panneau devient ÉPHÉMÈRE : seule la personne qui tape
//     /help le voit — rien ne reste dans le salon ;
//   • un bouton « 🗑️ Effacer ce message » (présent partout : sommaire,
//     catégorie, détail, verrou staff, commande introuvable) permet à cette
//     personne de le faire disparaître complètement de chez elle. En préfixe
//     (!help), où l'éphémère n'existe pas, le bouton est le seul moyen et il
//     est réservé à la personne qui a tapé la commande.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v263test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const { MessageFlags } = require('discord.js');
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

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.modules.set(botId, 'utility', true);

  console.log('— 1. Le bouton « 🗑️ Effacer » suit partout la personne qui demande —');
  const home = premade.buildHelpPanel(botId, record, clientUser, null, null, null, 'home', 'm1');
  const button = v2.rows(home).flatMap((r) => r.components || []).find((c) => c && c.type === 2);
  check('sommaire : bouton présent avec l’identifiant de l’auteur',
    !!button && button.custom_id === `hx-helpdel:${botId}:m1` && brut(button).includes('Effacer ce message'));
  check('…le menu déroulant reste présent aussi', v2.rows(home).length === 2);
  const cat = premade.buildHelpPanel(botId, record, clientUser, null, null, null, 'c0', 'm1');
  check('vue catégorie : bouton présent', brut(cat).includes(`hx-helpdel:${botId}:m1`));
  const detail = premade.buildHelpPanel(botId, record, clientUser, null, 'ping', null, 'home', 'm1');
  check('vue détail : bouton présent', brut(detail).includes(`hx-helpdel:${botId}:m1`));
  const sansAuteur = premade.buildHelpPanel(botId, record, clientUser, null, null);
  check('sans auteur connu (ex. ancien appel) : pas de bouton, pas de crash',
    !brut(sansAuteur).includes('hx-helpdel') && v2.rows(sansAuteur).length === 1);

  console.log('— 2. En slash, le panneau part éphémère —');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/premade.js'), 'utf8');
  const helpCase = src.slice(src.indexOf("case 'help'"), src.indexOf("case 'rank'"));
  check('la commande /help pose le drapeau ÉPHÉMÈRE uniquement en slash',
    helpCase.includes('MessageFlags.Ephemeral') && helpCase.includes('if (isInt)'));
  check('…et transmet l’identifiant de l’auteur au panneau',
    helpCase.includes("member, 'home', author ? author.id : ''"));

  console.log('— 3. Le bouton n’obéit qu’à son auteur —');
  let rep = null;
  let deleted = false;
  let deferred = false;
  const boutonAutre = {
    isButton: () => true,
    isStringSelectMenu: () => false,
    customId: `hx-helpdel:${botId}:m1`,
    user: { id: 'quelquun-dautre' },
    reply: async (p) => { rep = p; },
  };
  const handledAutre = await premade.handleHelpSelect(botId, { client: clientUser }, boutonAutre);
  check('quelqu’un d’autre : refus éphémère, message conservé',
    handledAutre === true && !!rep && rep.ephemeral === true && brut(rep).includes('Seule la personne'));
  const boutonAuteur = {
    isButton: () => true,
    isStringSelectMenu: () => false,
    customId: `hx-helpdel:${botId}:m1`,
    user: { id: 'm1' },
    deferUpdate: async () => { deferred = true; },
    deleteReply: async () => { deleted = true; },
  };
  const handledAuteur = await premade.handleHelpSelect(botId, { client: clientUser }, boutonAuteur);
  check('l’auteur : le message est effacé', handledAuteur === true && deferred && deleted);
  const boutonEtranger = await premade.handleHelpSelect(botId, { client: clientUser }, {
    isButton: () => true, customId: 'autre-bouton:1', user: { id: 'm1' },
  });
  check('bouton d’un autre module : ignoré', boutonEtranger === false);

  console.log('— 4. Le menu déroulant fonctionne toujours —');
  let updated = null;
  const handledSelect = await premade.handleHelpSelect(botId, { client: clientUser }, {
    isButton: () => false,
    isStringSelectMenu: () => true,
    customId: `hx-help:${botId}`,
    values: ['c0'],
    guild: null,
    member: null,
    update: async (p) => { updated = p; },
  });
  check('sélection de catégorie : panneau mis à jour sur place', handledSelect === true && !!updated);

  console.log('— 5. Auto-effacement du !help (préfixe) —');
  check('délai de 5 minutes exporté', premade.HELP_AUTODELETE_MS === 300000, String(premade.HELP_AUTODELETE_MS));
  check('send() renvoie le message envoyé en préfixe', src.includes('return await channel.send(payload);'));
  const helpCase2 = src.slice(src.indexOf("case 'help'"), src.indexOf("case 'rank'"));
  check('le !help programme l’effacement (setTimeout + delete)',
    helpCase2.includes('setTimeout') && helpCase2.includes('msg.delete') && helpCase2.includes('HELP_AUTODELETE_MS'));

  console.log('— 6. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=267 référencé 7 fois', (index.match(/\?v=267/g) || []).length === 7,
    String((index.match(/\?v=267/g) || []).length));
  check('sw.js : cache « botdev-v267 »', sw.includes("const CACHE = 'botdev-v267';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v263 — ${ok} vérifications OK : l'aide s'efface pour de bon.`);
  else { console.log(`❌ v263 — ${ko} échec(s)`); process.exitCode = 1; }
})();
