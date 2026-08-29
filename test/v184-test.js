// ══════════════════════════════════════════════════════════════
// TEST v184 — RETOUR à la bannière « 3D premium » ORIGINALE (v179),
// demandé explicitement par l'utilisateur après les essais de
// calque (v181 tête brute, v182 tête calquée, v183 logo argent).
// Fichier actif : banner-premium-final.png, appliqué tel quel sur
// Discord (hash 899d2f260cc4 — identique à l'époque de la v179,
// preuve que le fichier est l'original à l'octet près).
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- 1. Les bannières du site sont la version v179/v184 ----------
const sharp = require('sharp');
(async () => {
  const mp = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata();
  assert(mp.width === 1500 && mp.height === 600, `bannière MP 1500×600 attendue (${mp.width}×${mp.height})`);
  const tk = await sharp(path.join(root, 'public/icons/support-banner.png')).metadata();
  assert(tk.width === 1696 && tk.height === 624, `bannière tickets 1696×624 attendue (${tk.width}×${tk.height})`);
  for (const f of ['public/icons/nexora-profile-banner.png', 'public/icons/support-banner.png']) {
    const st = fs.statSync(path.join(root, f));
    assert(st.size > 400000, `${f} : version HD attendue (${st.size} octets)`);
  }

  // ---------- 2. Le texte de la bannière est lisible (vraie police) ----------
  const raw = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 100, top: 250, width: 950, height: 150 }) // zone « OPTIMUS »
    .greyscale().raw().toBuffer();
  let max = 0, bright = 0;
  for (const v of raw) { if (v > max) max = v; if (v > 200) bright += 1; }
  assert(max >= 250, `le texte doit contenir du blanc pur (max mesuré : ${max})`);
  assert(bright > 3000, `assez de pixels de glyphes attendus (${bright} trouvés)`);

  // ---------- 3. La tête premium 3D est présente à droite ----------
  const rawHead = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 1050, top: 100, width: 420, height: 420 }) // zone de la tête
    .greyscale().raw().toBuffer();
  let headBright = 0;
  for (const v of rawHead) { if (v > 150) headBright += 1; }
  assert(headBright > 5000, `la tête premium doit être visible (${headBright} pixels clairs)`);

  // ---------- 4. Version v184 ----------
  assert.strictEqual((index.match(/\?v=184/g) || []).length, 7,
    'index.html doit référencer v184 7 fois');
  assert(sw.includes('botdev-v184'), 'le cache du service worker n’est pas en v184');
  assert(!index.includes('?v=183'), 'index.html référence encore v183');

  console.log('✅ v184-test : bannière 3D premium originale (v179) restaurée');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
