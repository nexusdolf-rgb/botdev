// Test v212 — Embed du salon privé de ticket : textes + couleur modifiables,
// et actions du staff en MENU DÉROULANT (au lieu de deux rangées de boutons).
// --------------------------------------------------
// — l'embed d'accueil du salon privé est piloté par le réglage « ticket_room »
//   (titre, message d'accueil, étapes, couleur) vide = textes courts par défaut.
// — les textes par défaut ont été raccourcis (salon propre et lisible).
// — le sélecteur « Actions du staff » remplace les boutons bd-tmenu.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v215-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const db = require('fs').readFileSync('server/db.js', 'utf8');
const panels = require('fs').readFileSync('server/discord/panels.js', 'utf8');
const i18n = require('fs').readFileSync('server/i18n.js', 'utf8');
const routes = require('fs').readFileSync('server/routes.js', 'utf8');
const dash = require('fs').readFileSync('public/js/dashboard.js', 'utf8');
const index = require('fs').readFileSync('public/index.html', 'utf8');
const sw = require('fs').readFileSync('public/sw.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v212-test.js');

  // ---------- 1. Textes par défaut raccourcis ----------
  console.log('— Textes concis par défaut —');
  const frWelcome = i18n.match(/ticket_welcome_desc: '([^']*)'/)[1];
  const frButtons = i18n.match(/ticket_buttons_desc: '([^']*)'/)[1];
  check('message d’accueil FR nettement plus court', frWelcome.length < 200);
  check('la mention des actions parle d’un menu déroulant', frButtons.includes('menu déroulant'));
  check('le libellé du champ dit « Actions » et non « Boutons »', i18n.includes("ticket_buttons: '🔒 Actions réservées au staff'"));
  check('6 langues ont un titre de ticket court', (i18n.match(/ticket_title: '🎫 Ticket ouvert'/g) || []).length === 1);

  // ---------- 2. Réglage « salon privé » (db + routes) ----------
  console.log('— Réglage ticket_room (texte + couleur) —');
  check('db : colonne ticket_room', /ALTER TABLE guild_settings ADD COLUMN ticket_room TEXT DEFAULT ''/.test(db));
  check('db : ticket_room dans la liste des colonnes', db.includes("'xp_card', 'ticket_room',"));
  check('db : sérialisation JSON de l’objet réglage', /ticket_room: \(next\.ticket_room && typeof next\.ticket_room === 'object'\)/.test(db));
  check('routes : PUT …/ticket-room présent', routes.includes("'/bots/:id/guilds/:guildId/ticket-room'"));
  check('routes : validation couleur hex #RRGGBB', /next\.color = \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(String\(color\)\)/.test(routes));
  check('routes : bornes des textes (1500/1200/100)', /slice\(0, 1500\)/.test(routes) && /slice\(0, 1200\)/.test(routes) && /slice\(0, 100\)/.test(routes));
  // Fonctionnel : le stockage accepte un objet {color,title,welcome,steps}
  store.guildSettings.set(212, 'G1', { ticket_room: { color: '#e07a5f', title: 'Support {user}', welcome: 'Hello {member} !', steps: 'Une seule étape.' } });
  const raw = store.guildSettings.get(212, 'G1').ticket_room;
  const obj = JSON.parse(raw);
  check('stockage : objet JSON persisté', obj.color === '#e07a5f' && obj.title === 'Support {user}' && obj.welcome.includes('{member}'));
  store.guildSettings.set(212, 'G1', { ticket_room: { title: 'Sans couleur' } });
  check('stockage : mise à jour partielle', JSON.parse(store.guildSettings.get(212, 'G1').ticket_room).title === 'Sans couleur');

  // ---------- 3. Embed du salon privé branché sur le réglage ----------
  console.log('— Embed du salon privé (textes + couleur) —');
  check('panels : helper readRoomCfg', panels.includes('function readRoomCfg(botId, guildId)'));
  check('panels : readRoomCfg exporté', /readRoomCfg, typeOptionDescription/.test(panels));
  check('panels : le welcome reçoit la config (param room)', panels.includes('room = ROOM_DEFAULTS'));
  check('panels : titre perso via {variables}', /resolveRoomVars/.test(panels));
  check('panels : couleur finale = réglage > type > #57F287', panels.includes("const finalColor = room.color || chosenColor || '#57F287';"));
  check('panels : openTicket charge la config du salon', panels.includes('const room = readRoomCfg(botId, guild.id);'));

  // ---------- 4. Actions staff en MENU DÉROULANT ----------
  console.log('— Sélecteur « Actions du staff » —');
  check('panels : un seul menu StringSelect (placeholder staff)', /setPlaceholder\('⚙️ Actions du staff/.test(panels));
  check('panels : customId du menu bd-troom:{botId}', panels.includes('bd-troom:${botId}'));
  check('panels : 6 options couvrent claim/hold/close/reopen/addmember/delete', ['claim', 'hold', 'close', 'reopen', 'addmember', 'delete'].every((v) => panels.includes(`setValue('${v}')`)));
  check('panels : le composant du salon n’a plus 2 rangées', !panels.includes('components: [row1, row2]'));
  check('panels : le salon n’envoie plus qu’une seule ActionRow', panels.includes('components: [row1],'));
  check('panels : le dispatcher route le menu vers les handlers', panels.includes('const actions = {') && panels.includes('claim: handleTicketClaim'));
  check('panels : garde-fou staff à l’usage (handler vérifie isStaff)', (panels.match(/async function handleTicketClaim\(botId, interaction\) \{[\s\S]*?if \(!isStaff/g) || []).length >= 1);

  // ---------- 5. Dashboard ----------
  console.log('— Dashboard : carte « Embed du salon privé » —');
  check('dash : carte dédiée présente', dash.includes("🏠 Embed du salon privé"));
  check('dash : sélecteur de couleur + hex', dash.includes('id="tr-color"') && dash.includes('id="tr-color-hex"'));
  check('dash : titre / accueil / étapes modifiables', dash.includes('id="tr-title"') && dash.includes('id="tr-welcome"') && dash.includes('id="tr-steps"'));
  check('dash : sauvegarde via PUT ticket-room', dash.includes('/ticket-room'));
  check('dash : aperçu live de l’embed', dash.includes('👀 Aperçu de l’embed du salon privé'));
  check('dash : bouton restaurer les valeurs par défaut', dash.includes('id="tr-default"'));

  // ---------- 6. Version ----------
  check('site : bump v212 (index)', index.includes('?v=215'));
  check('site : bump v212 (sw cache)', sw.includes('botdev-v215'));

  console.log(`  ✅ v212 : ${n} vérifications`);
})().catch((e) => { console.error(e); process.exit(1); });
