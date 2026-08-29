// ══════════════════════════════════════════════════════════════
// TEST v173 — Nouvelle identité visuelle HD fournie par l'utilisateur
// Logo argent/noir + bannière bleu nuit, régénérés en haute
// définition (1024×1024 / 1632×656) pour éviter le flou sur Discord.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const index = read('public/index.html');
const sw = read('public/sw.js');
const svg = read('public/icons/nexora-robot-mark.svg');

// ---------- 1. Les images HD sont en place (et volumineuses = détaillées) ----------
const minSizes = {
  'public/icons/nexora-robot-mark.png': 100000,        // logo 512 (≈ 300 Ko)
  'public/icons/nexora-robot-mark-192.png': 20000,     // logo 192
  'public/icons/icon-512.png': 100000,
  'public/icons/nexora-profile-banner.png': 300000,    // bannière MP transcription
  'public/icons/support-banner.png': 300000,           // bannière panneaux tickets
};
for (const [f, min] of Object.entries(minSizes)) {
  const st = fs.statSync(path.join(root, f));
  assert(st.size >= min, `${f} : ${st.size} octets < ${min} — image HD manquante ?`);
}

// ---------- 2. Vraies dimensions via sharp (pas d'image étirée/floue) ----------
const sharp = require('sharp');
(async () => {
  const logo = await sharp(path.join(root, 'public/icons/nexora-robot-mark.png')).metadata();
  assert(logo.width === 512 && logo.height === 512, `logo doit être 512×512 (reçu ${logo.width}×${logo.height})`);
  const banner = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata();
  assert(banner.width === 1500 && banner.height === 600,
    `bannière doit être 1500×600 (reçue ${banner.width}×${banner.height})`);
  const fav = await sharp(path.join(root, 'public/icons/nexora-robot-mark-192.png')).metadata();
  assert(fav.width === 192 && fav.height === 192, 'favicon doit être 192×192');

  // ---------- 3. SVG de repli : argent/noir, strings compat v156 ----------
  assert(svg.includes('emblème robot') && svg.includes('#e07a5f') && svg.includes('#f2f3f5'),
    'SVG de repli : structure/colors exigées');
  assert(svg.includes('#c8ccd2'), 'SVG : casque argent du nouveau logo');
  assert(svg.includes('#111418'), 'SVG : fond noir du nouveau logo');

  // ---------- 4. Version : gérée par le test de la version courante (v174) ----------
  assert((sw.match(/nexora-robot-mark/g) || []).length >= 3,
    'le service worker doit mettre en cache les nouveaux visuels');

  console.log('✅ v173-test : identité visuelle HD (logo argent + bannière bleu nuit) verrouillée');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
