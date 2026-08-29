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
assert(botManager.includes("'🤖 Optimus Prime — le bot qui anime ton serveur !'"),
  'aboutText : première ligne au nom d’Optimus Prime');
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
  assert(mp.width === 1500 && mp.height === 600, `bannière MP doit être 1500×600 (${mp.width}×${mp.height})`);
  const tk = await sharp(path.join(root, 'public/icons/support-banner.png')).metadata();
  assert(tk.width === 1696 && tk.height === 624, `bannière tickets doit être 1696×624 (${tk.width}×${tk.height})`);
  const stMp = fs.statSync(path.join(root, 'public/icons/nexora-profile-banner.png'));
  const stTk = fs.statSync(path.join(root, 'public/icons/support-banner.png'));
  assert(stMp.size > 400000, `bannière MP trop légère (${stMp.size} octets) — version HD manquante ?`);
  assert(stTk.size > 400000, `bannière tickets trop légère (${stTk.size} octets)`);

  // ---------- 3. Version v175 ----------
  assert.strictEqual((index.match(/\?v=175/g) || []).length, 7,
    'index.html doit référencer v175 7 fois');
  assert(sw.includes('botdev-v175'), 'le cache du service worker n’est pas en v175');
  assert(!index.includes('?v=174'), 'index.html référence encore v174');

  console.log('✅ v175-test : bannière ultra-nette + bio complète « Optimus Prime » verrouillées');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
