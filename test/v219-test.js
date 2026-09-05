// Test v219 — Menus de rôles modifiables, y compris déjà envoyés
// --------------------------------------------------
// Bug remonté : un panneau de rôles déjà envoyé sur Discord ne pouvait pas
// être modifié depuis le dashboard. Deux manques :
//   1. La liste des panneaux n'avait pas de bouton « Modifier » (le code
//      d'édition existait pourtant dans la modale).
//   2. « Envoyer » postait toujours un NOUVEAU message (doublon) : le
//      système ne mémorisait pas quel message Discord avait été envoyé.
// Correctif (additif) :
//   - role_menus.message_id + role_menus.message_channel (migration SQLite),
//     renseignés par roleMenus.setMessage() à chaque envoi.
//   - panels.sendRoleMenu met à jour le message existant en place
//     (message.edit) quand il a déjà été envoyé ; renvoie un message neuf si
//     l'ancien a été supprimé. Le rendu visuel ne change pas.
//   - Dashboard : bouton ✏️ par panneau, statut « déjà envoyé », et bouton
//     🔄/📨 qui synchronise. Éditer un panneau déjà envoyé pousse la modif
//     sur Discord automatiquement.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v219-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const { roleMenuPayload, sendRoleMenu } = panels;
let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  console.log('\n▶ v219-test.js');

  // ---------- 1. Correctif présent (lecture source) ----------
  console.log('— Correctif présent —');
  const panelsSrc = read('server/discord/panels.js');
  check('panels : rôleMenuPayload extrait (rendu inchangé)', /function roleMenuPayload\(botId, menu\)/.test(panelsSrc));
  check('panels : envoi = update-or-send (message.edit quand déjà envoyé)', /const existing = await findSentRoleMessage\(client, menu\)/.test(panelsSrc) && /existing\.edit\(payload\)/.test(panelsSrc));
  check('panels : message supprimé → nouvel envoi propre', /Unknown Message\|10008\|10003\|Missing Access\|50001\|Missing Permissions\|50013/.test(panelsSrc));
  check('panels : message_id mémorisé après envoi', /store\.roleMenus\.setMessage\(menu\.id,/.test(panelsSrc));
  const dbSrc = read('server/db.js');
  check('db : colonnes message_id/message_channel migrées', /ALTER TABLE role_menus ADD COLUMN message_id/.test(dbSrc) && /ALTER TABLE role_menus ADD COLUMN message_channel/.test(dbSrc));
  check('db : roleMenus.setMessage disponible', /setMessage: \(id, messageId, channelId\)/.test(dbSrc));
  const dash = read('public/js/dashboard.js');
  check('dashboard : bouton ✏️ Modifier sur chaque panneau', /querySelector\('\[data-edit\]'\)\.onclick = \(\) => BotViews\.openRoleMenuModal\(bot, guildId, m\)/.test(dash));
  check('dashboard : statut « déjà envoyé » (message_id)', /const sent = !!m\.message_id/.test(dash) && /se met à jour sur place/.test(dash));
  check('dashboard : bouton 🔄 Mettre à jour vs 📨 Envoyer', /sent \? '🔄 Mettre à jour' : '📨 Envoyer'/.test(dash));
  const views = read('public/js/views.js');
  check('views : éditer un panneau envoyé synchronise Discord', /if \(isEdit && menu\.message_id\)[\s\S]*?\/role-menus\/\$\{menu\.id\}\/send/.test(views));

  // ---------- 2. Stockage : setMessage + lecture ----------
  console.log('— Stockage message envoyé —');
  const uid = store.users.create('discord:219@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
  const menuId = store.roleMenus.create({
    bot_id: BOT, guild_id: 'G219', name: 'Rôles & notifications', mode: 'menu',
    content: 'Choisis tes rôles', placeholder: 'Choisis…', channel: '#roles',
    options: JSON.stringify([{ label: 'News', emoji: '🔔', role: 'News' }, { label: 'Jeux', emoji: '🎮', role: 'Jeux' }]),
  });
  const menu = store.roleMenus.get(menuId);
  check('créé avec message_id vide par défaut', menu.message_id === '' && menu.message_channel === '');
  store.roleMenus.setMessage(menuId, 'M111', 'C111');
  const after = store.roleMenus.get(menuId);
  check('setMessage enregistre id + salon', after.message_id === 'M111' && after.message_channel === 'C111');

  // ---------- 3. roleMenuPayload : rendu identique, customIds corrects ----------
  console.log('— Construction du message (rendu inchangé) —');
  const payload = roleMenuPayload(BOT, menu);
  check('payload menu : composant présent (select)', Array.isArray(payload.components) && payload.components.length === 1);
  const first = payload.components[0];
  const selectData = first.toJSON ? first.toJSON() : first;
  const customId = (selectData.components && selectData.components[0] && selectData.components[0].custom_id) || (selectData.custom_id) || '';
  check('select porte le customId bd-menu:<bot>:<menu>', String(customId).startsWith(`bd-menu:${BOT}:${menuId}`));
  const optsJson = (selectData.components && selectData.components[0] && selectData.components[0].options) || [];
  check('options du menu conservées', optsJson.length === 2);

  // ---------- 4. sendRoleMenu : 3 scénarios ----------
  console.log('— Envoi / mise à jour en place —');
  // 4a. Nouvel envoi (aucun message enregistré) → channel.send, on mémorise
  let sendCount = 0;
  const fakeGuild = { id: 'G219', channels: { cache: new Map() }, roles: { cache: new Map() } };
  const fakeClient = { guilds: { cache: new Map([['G219', fakeGuild]]) }, channels: { fetch: async () => null } };
  const configChannel = {
    id: 'Ctarget', name: 'roles', send: async () => { sendCount += 1; return { id: 'NEW1', channel: configChannel }; },
  };
  const mFresh = store.roleMenus.get(menuId);
  const r1 = await sendRoleMenu(BOT, fakeClient, mFresh, configChannel);
  check('4a : envoi initial → send appelé 1×', sendCount === 1);
  check('4a : updated = false (message neuf)', r1.updated === false);
  check('4a : message_id mémorisé (NEW1)', store.roleMenus.get(menuId).message_id === 'NEW1');

  // 4b. Ré-envoi → met à jour le message existant (edit), AUCUN doublon
  let edits = 0;
  let editedPayload = null;
  const chanWherePosted = {
    id: 'Cpost', name: 'roles',
    messages: {
      fetch: async () => ({
        id: 'NEW1',
        edit: async (p) => { edits += 1; editedPayload = p; return { id: 'NEW1', channel: chanWherePosted }; },
      }),
    },
  };
  fakeGuild.channels.cache.set('Cpost', chanWherePosted);
  // on enregistre le canal réel du message
  store.roleMenus.setMessage(menuId, 'NEW1', 'Cpost');
  const mPosted = store.roleMenus.get(menuId);
  const beforeSend2 = sendCount;
  const r2 = await sendRoleMenu(BOT, fakeClient, mPosted, configChannel);
  check('4b : message existant édité en place (pas de nouvel envoi)', edits === 1 && sendCount === beforeSend2);
  check('4b : updated = true', r2.updated === true);
  check('4b : le payload édité contient bien les composants', editedPayload && Array.isArray(editedPayload.components) && editedPayload.components.length >= 1);

  // 4c. Message supprimé côté Discord → nouvel envoi propre
  chanWherePosted.messages.fetch = async () => null; // message parti
  const r3 = await sendRoleMenu(BOT, fakeClient, store.roleMenus.get(menuId), configChannel);
  check('4c : ancien message introuvable → nouvel envoi', sendCount === beforeSend2 + 1);
  check('4c : updated = false', r3.updated === false);
  check('4c : nouveau message_id mémorisé', store.roleMenus.get(menuId).message_id === 'NEW1');

  // 4d. Boutons : payload construit avec un customId de bouton correct
  store.roleMenus.update(menuId, { mode: 'buttons' });
  const mBtn = store.roleMenus.get(menuId);
  const btnPayload = roleMenuPayload(BOT, mBtn);
  const row = btnPayload.components[0];
  const rowJson = row.toJSON ? row.toJSON() : row;
  const btnCustomId = rowJson.components && rowJson.components[0] && rowJson.components[0].custom_id;
  check('4d : bouton porte bd-rmbtn:<bot>:<menu>:<rôle>', String(btnCustomId).startsWith(`bd-rmbtn:${BOT}:${menuId}:News`));

  console.log(`  → ${n} assertions v219 ✅`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
