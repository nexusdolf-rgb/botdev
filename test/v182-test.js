// ══════════════════════════════════════════════════════════════
// TEST v182 — La tête 3D premium est CALQUÉE depuis la bannière
// v179 : mêmes pixels, même taille (426×450), même position
// (centre 1300/322), posée sur le fond v177 sans le robot.
// Choix explicite de l'utilisateur (« t'aurais dû le calquer »).
// Tout le reste de la bannière est inchangé au pixel près.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- 1. Les bannières du site sont la version v182 ----------
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

  // ---------- 2. Le texte de la bannière est intact (vraie police) ----------
  const raw = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 100, top: 250, width: 950, height: 150 }) // zone « OPTIMUS »
    .greyscale().raw().toBuffer();
  let max = 0, bright = 0;
  for (const v of raw) { if (v > max) max = v; if (v > 200) bright += 1; }
  assert(max >= 250, `le texte doit contenir du blanc pur (max mesuré : ${max})`);
  assert(bright > 3000, `assez de pixels de glyphes attendus (${bright} trouvés)`);

  // ---------- 3. La tête calquée est présente à droite (position v179) ----------
  const rawHead = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 1050, top: 100, width: 420, height: 420 }) // zone tête calquée
    .greyscale().raw().toBuffer();
  let headBright = 0;
  for (const v of rawHead) { if (v > 150) headBright += 1; }
  assert(headBright > 5000, `la tête premium calquée doit être visible (${headBright} pixels clairs)`);

  // ---------- 4. Version v182 ----------
  assert.strictEqual((index.match(/\?v=182/g) || []).length, 7,
    'index.html doit référencer v182 7 fois');
  assert(sw.includes('botdev-v182'), 'le cache du service worker n’est pas en v182');
  assert(!index.includes('?v=181'), 'index.html référence encore v181');

  console.log('✅ v182-test : tête premium calquée depuis la v179 sur le fond v177');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
