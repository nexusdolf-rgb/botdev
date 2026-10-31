// ══════════════════════════════════════════════════════════════
// TEST v175 — Bannière ultra-nette (v3) + bio complète restaurée
// L'utilisateur a signalé : (1) la bannière devait être plus nette,
// (2) la bio du bot avait été raccourcie pendant le renommage v172.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const botManager = fs.readFileSync(path.join(root, 'server/discord/botManager.js'), 'utf8');

// ---------- 1. La bio du code est complète et au nom du bot ----------
assert(botManager.includes("'🤖 Hoxera, le bot qui anime votre serveur !'"),
  'aboutText : première ligne au nom du bot, sans tutoiement');
assert(!botManager.includes("'✨ Hoxera — le bot qui anime ton serveur !'"),
  'aboutText : l’ancienne première ligne doit être remplacée');
// les 4 lignes de la bio complète (dashboard + support + /help)
assert(botManager.includes('OFFICIAL_URL') && botManager.includes('SUPPORT_URL'),
  'aboutText : liens dashboard et support conservés');
assert(botManager.includes('/help'), 'aboutText : le /help doit rester');
assert(botManager.includes('.slice(0, 190)'), 'aboutText : garde-fou 190 caractères');

// ---------- 2. Les bannières du site sont les nouvelles (HD) ----------
const sharp = require('sharp');
(async () => {
  const mp = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata();
  // v386 — même dessin, poids divisé : proportions 5:2 et 1200 px mini.
  assert(mp.width >= 1200 && Math.abs(mp.width / mp.height - 2.5) < 0.06,
    `bannière MP : proportions 5:2 et 1200 px mini (${mp.width}×${mp.height})`);
  const tk = await sharp(path.join(root, 'public/icons/support-banner.png')).metadata();
  assert(tk.width >= 1200 && Math.abs(tk.width / tk.height - 1696 / 624) < 0.06,
    `bannière tickets : proportions d'origine et 1200 px mini (${tk.width}×${tk.height})`);
  const stMp = fs.statSync(path.join(root, 'public/icons/nexora-profile-banner.png'));
  const stTk = fs.statSync(path.join(root, 'public/icons/support-banner.png'));
  assert(stMp.size > 200000 && stMp.size < 450000, `bannière MP hors plage v386 (${stMp.size} octets)`);
  assert(stTk.size > 200000 && stTk.size < 450000, `bannière tickets hors plage v386 (${stTk.size} octets)`);

  // ---------- 3. Version : gérée par le test de la version courante (v176) ----------

  console.log('✅ v175-test : bannière ultra-nette + bio complète « Optimus Prime » verrouillées');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
