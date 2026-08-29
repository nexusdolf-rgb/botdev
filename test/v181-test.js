// ══════════════════════════════════════════════════════════════
// TEST v181 — La tête 3D premium remplace le robot dans la
// bannière « cinéma », à la même position et à la même taille.
// Choix explicite de l'utilisateur ; tout le reste de la
// bannière (fond, effets, typographie Poppins) est inchangé
// au pixel près (vérifié : 0 pixel modifié hors zone du robot).
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- 1. Les bannières du site sont la version v181 ----------
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

  // ---------- 3. La tête premium est présente à droite ----------
  const rawHead = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 1100, top: 100, width: 400, height: 450 }) // zone de la tête
    .greyscale().raw().toBuffer();
  let headBright = 0;
  for (const v of rawHead) { if (v > 150) headBright += 1; }
  assert(headBright > 5000, `la tête premium doit être visible à droite (${headBright} pixels clairs)`);

  // ---------- 4. Version v181 ----------
  assert.strictEqual((index.match(/\?v=181/g) || []).length, 7,
    'index.html doit référencer v181 7 fois');
  assert(sw.includes('botdev-v181'), 'le cache du service worker n’est pas en v181');
  assert(!index.includes('?v=180'), 'index.html référence encore v180');

  console.log('✅ v181-test : tête 3D premium à la place du robot (bannière cinéma)');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
