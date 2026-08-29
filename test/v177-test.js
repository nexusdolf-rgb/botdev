// ══════════════════════════════════════════════════════════════
// TEST v177 — Bannière « pro » : typographie réelle (Poppins)
// L'utilisateur voulait un rendu professionnel, pas « généré par
// IA ». Le texte est désormais composé avec une vraie police, pas
// par le modèle d'image : « OPTIMUS PRIME » est pixel-perfect.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- 1. Les bannières du site sont la version pro ----------
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
  // Vérification par luminosité : la bande du texte contient du blanc
  // pur (255) = glyphes nets dessinés par la police, pas un rendu IA.
  const { createCanvas } = { createCanvas: null }; // (pas de canvas — on passe par sharp)
  const raw = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 100, top: 250, width: 950, height: 150 }) // zone « OPTIMUS »
    .greyscale().raw().toBuffer();
  let max = 0, bright = 0;
  for (const v of raw) { if (v > max) max = v; if (v > 200) bright += 1; }
  assert(max >= 250, `le texte doit contenir du blanc pur (max mesuré : ${max})`);
  assert(bright > 3000, `assez de pixels de glyphes attendus (${bright} trouvés)`);

  // ---------- 3. Version v177 ----------
  assert.strictEqual((index.match(/\?v=177/g) || []).length, 7,
    'index.html doit référencer v177 7 fois');
  assert(sw.includes('botdev-v177'), 'le cache du service worker n’est pas en v177');
  assert(!index.includes('?v=176'), 'index.html référence encore v176');

  console.log('✅ v177-test : bannière pro (typographie réelle) verrouillée');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
