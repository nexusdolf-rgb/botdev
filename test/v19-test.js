// Test v1.19 : assistant /botprofile setup (nom → bio → couleurs → avatar → bannière → Enregistrer)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v19-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const { buildSlashPayloads } = require('../server/discord/premade');

// Simule le bouton ➕ de Discord : un collecteur qui attrape la pièce jointe (galerie)
let collectorHandler = null;
const fakeChannel = {
  createMessageCollector: (opts) => ({
    on: (evt, fn) => { if (evt === 'collect') collectorHandler = fn; },
    stop: () => {},
  }),
};

// Petit serveur HTTP local qui sert un PNG factice (pour l'URL de l'avatar)
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8]);
const imgServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/png' });
  res.end(PNG);
});

(async () => {
  await new Promise((r) => imgServer.listen(0, '127.0.0.1', r));
  const imgUrl = `http://127.0.0.1:${imgServer.address().port}/avatar.png`;

  store.bots.create({ user_id: 1, name: 'Noxera', token: 'T', client_id: '1', prefix: '!' });

  const guild = { id: 'G1', name: 'Serveur', ownerId: 'OWNER1' };
  let lastReply = null, lastEdit = null, shownModal = null;

  const cmd = (sub, opts = {}) => ({
    guild,
    user: { id: opts.userId || 'OWNER1' },
    member: { permissions: { has: () => false } },
    channel: null,
    commandName: 'botprofile',
    options: { getSubcommand: () => sub },
    reply: async (p) => { lastReply = p; return { id: 'WMSG', edit: async (q) => { lastEdit = q; } }; },
    showModal: async (m) => { shownModal = m; },
    isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    isChatInputCommand: () => true,
  });

  const wizard = (cid, extra = {}) => ({
    guild,
    user: { id: 'OWNER1' },
    member: { permissions: { has: () => false } },
    channel: fakeChannel,
    customId: cid,
    isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    isChatInputCommand: () => false, isChannelSelectMenu: () => false, isRoleSelectMenu: () => false,
    reply: async (p) => { lastReply = p; return { id: 'WMSG', edit: async (q) => { lastEdit = q; } }; },
    update: async (p) => { lastReply = p; },
    showModal: async (m) => { shownModal = m; },
    ...extra,
  });

  // ---------- 1. /botprofile setup → modale nom ----------
  await panels.dispatchPanels(1, cmd('setup'));
  assert(shownModal && shownModal.data.title.includes('Nom du bot'), 'modale nom attendue');
  console.log('1️⃣  /botprofile setup → modale « 📛 Nom du bot » ✅');

  // ---------- 2. Nom soumis → message de l\\'assistant (étape 1/5) ----------
  await panels.dispatchPanels(1, wizard('bpw-modal:1:OWNER1', { isModalSubmit: () => true, fields: { getTextInputValue: () => 'Noxera du CHEAT' } }));
  assert(lastReply.embeds && lastReply.embeds[0].data.title.includes('Étape 1/5'), 'étape 1 attendue');
  assert(lastReply.embeds[0].data.fields[0].value.includes('Noxera du CHEAT'), 'nom dans le récap');
  console.log('2️⃣  Nom enregistré → assistant affiché (étape 1/5) ✅');

  // ---------- 3. Suivant → modale bio ----------
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:next', { isButton: () => true }));
  assert(shownModal && shownModal.data.title.includes('Bio'), 'modale bio attendue');
  await panels.dispatchPanels(1, wizard('bpw-modal:1:OWNER1', { isModalSubmit: () => true, fields: { getTextInputValue: () => 'Le bot officiel du serveur !' } }));
  assert(lastReply.content.includes('Bio enregistrée'), 'bio confirmée');
  console.log('3️⃣  Suivant → modale bio → « Le bot officiel du serveur ! » ✅');

  // ---------- 4. Suivant → sélecteur de couleurs ----------
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:next', { isButton: () => true }));
  assert(lastReply.embeds[0].data.title.includes('Étape 3/5'), 'étape couleur attendue');
  const sel = lastReply.components[0].components[0];
  assert(sel.data.type === 3, 'sélecteur attendu');
  assert(sel.options.length === 11, '11 couleurs attendues, obtenu ' + sel.options.length);
  const colorLabels = sel.options.map((o) => o.data.label).join(', ');
  console.log('4️⃣  Sélecteur de couleurs ✅ (', colorLabels.slice(0, 60) + '… )');

  // ---------- 5. Choix d'une couleur ----------
  await panels.dispatchPanels(1, wizard('bpw-sel:1:OWNER1', { isStringSelectMenu: () => true, values: ['#ED4245'] }));
  assert(lastReply.embeds[0].data.fields[0].value.includes('#ED4245'), 'couleur dans le récap');
  console.log('5️⃣  Couleur 🔴 #ED4245 choisie ✅');

  // ---------- 6. Suivant → étape avatar (boutons URL/Passer) ----------
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:next', { isButton: () => true }));
  assert(lastReply.embeds[0].data.title.includes('Étape 4/5'), 'étape avatar attendue');
  const btnLabels = lastReply.components[0].components.map((c) => c.data.label);
  assert(btnLabels.some((l) => String(l).includes('Passer')), 'bouton Passer attendu');
  assert(!btnLabels.some((l) => String(l).includes('URL')), 'aucun bouton URL');
  console.log('6️⃣  Étape avatar ✅ (', btnLabels.join(' | '), ') — galerie via ➕');

  // ---------- 7. Galerie : pièce jointe envoyée dans le salon → récupérée automatiquement ----------
  assert(!lastReply.components[0].components.some((c) => c.data.label && String(c.data.label).includes('URL')), 'plus de bouton URL');
  assert(collectorHandler, 'collecteur actif (attend la photo de la galerie)');
  await new Promise((r) => setImmediate(r));
  await collectorHandler({
    author: { id: 'OWNER1' },
    attachments: { size: 1, first: () => ({ url: imgUrl, contentType: 'image/png', size: PNG.length }) },
    reply: async () => {},
  });
  await new Promise((r) => setImmediate(r));
  assert(lastEdit && lastEdit.embeds[0].data.title.includes('Étape 5/5'), 'étape bannière attendue');
  assert(lastEdit.embeds[0].data.fields[0].value.includes('✅ image'), 'avatar dans le récap');
  console.log('7️⃣  Photo envoyée depuis la galerie → avatar récupéré automatiquement → étape bannière ✅');

  // ---------- 8. Passer la bannière → Enregistrement final ----------
  await panels.dispatchPanels(1, wizard('bpw:1:OWNER1:skip', { isButton: () => true }));
  assert(lastReply.embeds && lastReply.embeds[0].data.title.includes('Identité mise à jour'), 'état final : ' + (lastReply.embeds && lastReply.embeds[0].data.title));
  // Le « Passer » sur la bannière avance → finalise
  const p = store.botProfiles.get(1, 'G1');
  assert(p, 'profil enregistré');
  assert(p.name === 'Noxera du CHEAT', 'nom : ' + p.name);
  assert(p.bio === 'Le bot officiel du serveur !', 'bio');
  assert(p.color === '#ED4245', 'couleur');
  assert(p.avatar_url && p.avatar_url.endsWith('.png'), 'avatar stocké : ' + p.avatar_url);
  assert(!p.banner_url || p.banner_url === '', 'bannière vide');
  console.log('8️⃣  ✅ Enregistrement final → profil en base :', JSON.stringify({ name: p.name, bio: p.bio, color: p.color, avatar: p.avatar_url }));

  // ---------- 9. Non-propriétaire refusé ----------
  shownModal = null; lastReply = null;
  await panels.dispatchPanels(1, cmd('setup', { userId: 'STRANGER' }));
  assert(lastReply.content.includes('propriétaire'), 'refus attendu');
  console.log('9️⃣  Non-propriétaire → REFUSÉ ✅');

  // ---------- 10. Payload : sous-commande setup ----------
  const payloads = buildSlashPayloads(1);
  const bp = payloads.find((x) => x.name === 'botprofile');
  assert(bp.options[0].name === 'setup', 'setup en premier');
  console.log('🔟  Payload /botprofile : setup ✅ (', bp.options.map((o) => o.name).join(', '), ')');

  imgServer.close();
  console.log('\n🎉 Tous les tests v1.19 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
