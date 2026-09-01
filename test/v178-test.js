// ══════════════════════════════════════════════════════════════
// TEST v178 — Bannière : la tête du logo du profil est désormais
// dans la bannière (identité visuelle unifiée avatar + bannière).
// Typographie réelle Poppins conservée (voir v177).
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

  // ---------- 3. La tête est présente à droite (zone claire du sujet) ----------
  const rawHead = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 1100, top: 100, width: 400, height: 450 }) // zone de la tête
    .greyscale().raw().toBuffer();
  let headBright = 0;
  for (const v of rawHead) { if (v > 150) headBright += 1; }
  assert(headBright > 5000, `la tête du logo doit être visible à droite (${headBright} pixels clairs)`);

  // ---------- 4. Version : gérée par le test de la version courante (v179) ----------

  console.log('✅ v178-test : bannière unifiée (tête du logo + typo réelle) verrouillée');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
