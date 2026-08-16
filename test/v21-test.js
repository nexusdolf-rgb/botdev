// Test v1.21 : la photo importée via /botprofile avatar|banner (galerie native)
// s'applique directement à l'assistant en cours, sinon enregistrement direct.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v21-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const { handleProfileCommand } = require('../server/discord/profileCommands');

const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8]);
const imgServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/png' });
  res.end(PNG);
});

(async () => {
  await new Promise((r) => imgServer.listen(0, '127.0.0.1', r));
  const imgUrl = `http://127.0.0.1:${imgServer.address().port}/photo.png`;

  store.bots.create({ user_id: 1, name: 'Nexora', token: 'T', client_id: '1', prefix: '!' });
  const guild = { id: 'G1', name: 'Serveur', ownerId: 'OWNER1' };
  let lastReply = null, lastEdit = null, shownModal = null;
  let collectorHandler = null;
  const fakeChannel = {
    createMessageCollector: () => ({ on: (e, fn) => { if (e === 'collect') collectorHandler = fn; }, stop: () => {} }),
  };

  const wizard = (cid, extra = {}) => ({
    guild, user: { id: 'OWNER1' }, member: { permissions: { has: () => false } },
    channel: fakeChannel, customId: cid,
    isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    isChatInputCommand: () => false, isChannelSelectMenu: () => false, isRoleSelectMenu: () => false,
    reply: async (p) => { lastReply = p; return { id: 'WMSG', edit: async (q) => { lastEdit = q; } }; },
    update: async (p) => { lastReply = p; },
    showModal: async (m) => { shownModal = m; },
    ...extra,
  });

  const profileCmd = (sub, attachment) => ({
    guild, user: { id: 'OWNER1' }, member: { permissions: { has: () => false } },
    channel: fakeChannel, commandName: 'botprofile',
    options: { getSubcommand: () => sub, getAttachment: () => attachment },
    reply: async (p) => { lastReply = p; },
    deferReply: async () => {},
    editReply: async (p) => { lastReply = p; },
  });

  // ---------- 1. Démarrage de l'assistant ----------
  const cmdSetup = {
    guild, user: { id: 'OWNER1' }, member: { permissions: { has: () => false } },
    channel: fakeChannel, commandName: 'botprofile',
    options: { getSubcommand: () => 'setup' },
    reply: async () => ({ id: 'WMSG', edit: async (q) => { lastEdit = q; } }),
    showModal: async (m) => { shownModal = m; },
    isChatInputCommand: () => true,
  };
  await panels.dispatchPanels(1, cmdSetup);
  assert(shownModal && shownModal.data.title.includes('Nom'), 'modale nom');
  await panels.dispatchPanels(1, wizard('bpw-modal:1:OWNER1', { isModalSubmit: () => true, fields: { getTextInputValue: () => 'Nexora VIP' } }));
  assert(lastReply.embeds[0].data.title.includes('Étape 1/5'), 'étape 1');

  // nom → bio → couleur → avatar
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:next', { isButton: () => true }));
  assert(shownModal.data.title.includes('Bio'), 'modale bio');
  await panels.dispatchPanels(1, wizard('bpw-modal:1:OWNER1', { isModalSubmit: () => true, fields: { getTextInputValue: () => 'Bio VIP' } }));
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:next', { isButton: () => true }));
  await panels.dispatchPanels(1, wizard('bpw-sel:1:OWNER1', { isStringSelectMenu: () => true, values: ['#5865F2'] }));
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:next', { isButton: () => true }));
  assert(lastReply.embeds[0].data.title.includes('Étape 4/5'), 'étape avatar');
  const btns = lastReply.components[0].components.map((c) => c.data.label);
  assert(btns.some((l) => l.includes('Importer la photo')), 'bouton « 📷 Importer la photo » visible : ' + btns.join('|'));
  console.log('1️⃣  Assistant → étape avatar avec bouton visible «', btns.find((l) => l.includes('Importer')), '» ✅');

  // ---------- 2. /botprofile avatar (galerie native) appliqué à l'assistant ----------
  await handleProfileCommand(1, profileCmd('avatar', { url: imgUrl, contentType: 'image/png', size: PNG.length }));
  assert(lastReply.content.includes('appliquée'), 'photo appliquée à l\'assistant : ' + lastReply.content);
  assert(lastEdit && lastEdit.embeds[0].data.title.includes('Étape 5/5'), 'avancé à la bannière');
  assert(lastEdit.embeds[0].data.fields[0].value.includes('✅ image'), 'avatar dans le récap');
  console.log('2️⃣  /botprofile avatar (galerie) → appliqué à l\'assistant → étape bannière ✅');

  // ---------- 3. /botprofile banner → finalise l'assistant ----------
  await handleProfileCommand(1, profileCmd('banner', { url: imgUrl, contentType: 'image/png', size: PNG.length }));
  const p = store.botProfiles.get(1, 'G1');
  assert(p && p.avatar_url && p.banner_url, 'avatar + bannière en base');
  assert(p.name === 'Nexora VIP' && p.bio === 'Bio VIP' && p.color === '#5865F2');
  console.log('3️⃣  /botprofile banner → assistant finalisé :', JSON.stringify({ name: p.name, bio: p.bio, avatar: p.avatar_url.slice(0, 20) + '…', banner: p.banner_url.slice(0, 20) + '…' }), '✅');

  // ---------- 4. Sans assistant → enregistrement direct ----------
  await handleProfileCommand(1, profileCmd('avatar', { url: imgUrl, contentType: 'image/png', size: PNG.length }));
  assert(lastReply.content.includes('enregistré'), 'enregistrement direct : ' + lastReply.content);
  console.log('4️⃣  Sans assistant → enregistrement direct ✅');

  imgServer.close();
  console.log('\n🎉 Tous les tests v1.21 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
