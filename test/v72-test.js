// ============================================================
// Test Hoxera v72 — MP de transcription amélioré
// Le membre reçoit en MP un embed soigné (même style que le panneau
// de tickets) avec :
//  - le titre « 🎫 Ton ticket a été clôturé »
//  - le nom du serveur dans le texte de remerciement
//  - la bannière « SUPPORT - {nom du serveur} » générée automatiquement
//  - le lien vers la transcription + le fichier .txt joint
//  - le footer Nexora
// + si les MP sont fermés → aucun crash, retour false propre.
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v72-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');

  // ---------- 1. MP envoyé avec le nouvel embed ----------
  const sent = [];
  const opener = { id: 'u2', username: 'Bob', send: async (p) => { sent.push(p); return {}; } };
  const guild = { id: 'G1', name: 'Carré RP Officiel', members: { fetch: async () => ({ user: opener }) } };
  const interaction = { client: { users: { fetch: async () => opener } } };

  const ok = await panels.sendTranscriptDm(interaction, guild, 'question-bob', {
    text: '[12:00] Bob: Bonjour !\n[12:01] Staff: Bonjour, comment t\'aider ?',
    url: 'https://dash-hoxora.onrender.com/transcript/abc123',
    openerId: 'u2',
  });

  check('MP : envoyé (retour true)', ok === true);
  check('MP : un seul message envoyé', sent.length === 1);
  const payload = sent[0];
  check('MP : un seul embed', payload.embeds && payload.embeds.length === 1);
  const emb = payload.embeds[0].toJSON();
  check('MP : titre « 🎫 Ton ticket a été clôturé »', emb.title === '🎫 Ton ticket a été clôturé');
  check('MP : nom du serveur dans le remerciement', String(emb.description).includes('Carré RP Officiel'));
  check('MP : lien de la transcription', String(emb.description).includes('https://dash-hoxora.onrender.com/transcript/abc123'));
  check('MP : invite à rouvrir un ticket', String(emb.description).includes('Rouvre simplement un ticket'));
  // 🖼️ Bannière du PROFIL du bot (repli local si l'URL Discord n'est pas encore connue)
  check('MP : bannière du profil du bot en image', emb.image && emb.image.url.includes('/icons/nexora-profile-banner.png'));
  check('MP : footer Nexora', String(emb.footer.text).includes('Nexora'));
  // 📄 Fichier .txt joint
  check('MP : fichier transcription .txt joint', payload.files && payload.files.length === 1 && String(payload.files[0].name).includes('question-bob') && payload.files[0].name.endsWith('.txt'));
  check('MP : contenu du fichier correct', String(payload.files[0].attachment.toString()).includes('Bonjour !'));

  // ---------- 1bis. Si l'URL de la bannière du profil est connue (mise à jour
  // automatique au démarrage), c'est ELLE qui est utilisée ----------
  store.settings.set('profile_banner_url', 'https://cdn.discordapp.com/banners/1537443352281088000/abc123.png?size=1024');
  const sent2 = [];
  const opener2 = { id: 'u2', username: 'Bob', send: async (p) => { sent2.push(p); return {}; } };
  const interaction2b = { client: { users: { fetch: async () => opener2 } } };
  await panels.sendTranscriptDm(interaction2b, guild, 'question-bob', { text: 'test', url: '', openerId: 'u2' });
  const emb2 = sent2[0].embeds[0].toJSON();
  check('MP : bannière actuelle du profil utilisée (CDN Discord)', emb2.image && emb2.image.url.includes('cdn.discordapp.com/banners/') && emb2.image.url.includes('abc123'));
  store.settings.set('profile_banner_url', '');

  // ---------- 2. MP fermés → pas de crash, retour false ----------
  const closed = { id: 'u3', username: 'DMfermé', send: async () => { throw new Error('DM fermés'); } };
  const interaction2 = { client: { users: { fetch: async () => closed } } };
  const guild2 = { id: 'G1', name: 'Carré RP Officiel', members: { fetch: async () => { throw new Error('fetch impossible'); } } };
  let ok2 = true, crashed = false;
  try {
    ok2 = await panels.sendTranscriptDm(interaction2, guild2, 'ticket-x', { text: 'test', url: '', openerId: 'u3' });
  } catch (e) { crashed = true; }
  check('MP fermés : retour false sans crash', !crashed && ok2 === false);

  // ---------- 3. Sans créateur (openerId inconnu) ----------
  const interaction3 = { client: { users: { fetch: async () => { throw new Error('introuvable'); } } } };
  const guild3 = { id: 'G1', name: 'X', members: { fetch: async () => { throw new Error('introuvable'); } } };
  let ok3 = true;
  try { ok3 = await panels.sendTranscriptDm(interaction3, guild3, 'ticket-x', { text: 'test', url: '', openerId: 'inconnu' }); } catch { ok3 = 'crash'; }
  check('créateur introuvable : retour false propre', ok3 === false);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V72 — MP de transcription : embed soigné avec bannière du serveur. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
