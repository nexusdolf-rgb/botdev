// ============================================================
// Test Hoxera v72 — MP de transcription (actualisé v353)
// Le membre reçoit un MP Components V2 bilingue avec le nom du serveur,
// un bouton-lien vers la transcription et le fichier .txt toujours joint.
// + si les MP sont fermés → aucun crash, retour false propre.
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
const v2 = require('./helpers/v2');

// v239 — 🚨 le MP de transcription est passé en Components V2 : il n'y a plus
// d'`embeds[0]` à relire. On retrouve les MÊMES informations dans le
// conteneur, pour que ces vérifications de contenu restent valables.
const readDm = (payload) => ({
  isV2: v2.isV2(payload),
  title: v2.title(payload),
  description: v2.texts(payload).filter((t) => !t.startsWith('## ') && !t.startsWith('-# ')).join('\n\n'),
  image: v2.mediaUrls(payload)[0] || '',
  footer: v2.footer(payload),
  separators: v2.dividers(payload),
});
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
  check('MP : payload Components V2 (plus d\'embed classique)', readDm(payload).isV2);
  check('MP : les séparateurs natifs pleine largeur sont présents', readDm(payload).separators >= 2, `${readDm(payload).separators}`);
  const emb = readDm(payload);
  check('MP : titre bilingue approuvé', emb.title === '🎫 Ticket clôturé');
  check('MP : texte de clôture concis et nom du serveur',
    String(emb.description).includes('Votre ticket sur **Carré RP Officiel** est clôturé. La transcription complète est jointe.'));
  const transcriptButton = v2.controls(payload).find((button) => button.label === '📄 Voir la transcription');
  check('MP : bouton-lien direct vers la transcription',
    !!transcriptButton && transcriptButton.style === 5
      && transcriptButton.url === 'https://dash-hoxora.onrender.com/transcript/abc123');
  // 🖼️ Bannière du PROFIL du bot (repli local si l'URL Discord n'est pas encore connue)
  check('MP : bannière du profil du bot en MediaGallery', String(emb.image).includes('/icons/nexora-profile-banner.png'), String(emb.image));
  check('MP : plus de signature Hoxera (v312)', !String(emb.footer || '').includes('Hoxera'));
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
  const emb2 = readDm(sent2[0]);
  check('MP : bannière actuelle du profil utilisée (CDN Discord)', String(emb2.image).includes('cdn.discordapp.com/banners/') && String(emb2.image).includes('abc123'), String(emb2.image));
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
  console.log(failures === 0 ? '\n✅ V72 — MP Components V2 de transcription : bouton direct et fichier joint. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
