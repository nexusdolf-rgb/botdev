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
  // v386 — même dessin, poids divisé : on vérifie les PROPORTIONS (5:2),
  // la netteté minimale (1200 px, Discord affiche 1024) et le poids plafonné.
  assert(mp.width >= 1200 && Math.abs(mp.width / mp.height - 2.5) < 0.06,
    `bannière MP : proportions 5:2 et 1200 px mini attendues (${mp.width}×${mp.height})`);
  const tk = await sharp(path.join(root, 'public/icons/support-banner.png')).metadata();
  assert(tk.width >= 1200 && Math.abs(tk.width / tk.height - 1696 / 624) < 0.06,
    `bannière tickets : proportions d'origine et 1200 px mini (${tk.width}×${tk.height})`);
  for (const f of ['public/icons/nexora-profile-banner.png', 'public/icons/support-banner.png']) {
    const st = fs.statSync(path.join(root, f));
    assert(st.size < 450000, `${f} : ${st.size} octets — au-dessus du plafond v386 (450 Ko)`);
  }

  // ---------- 2. Le texte de la bannière est lisible (vraie police) ----------
  // Vérification par luminosité : la bande du texte contient du blanc
  // pur (255) = glyphes nets dessinés par la police, pas un rendu IA.
  const { createCanvas } = { createCanvas: null }; // (pas de canvas — on passe par sharp)
  const raw = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    // v386 — la zone suit la taille réelle de l'image (elle était calée sur
    // 1500×600) : mêmes proportions, donc même portion du dessin.
    .extract({
      left: Math.round(100 / 1500 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).width),
      top: Math.round(250 / 600 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).height),
      width: Math.round(950 / 1500 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).width),
      height: Math.round(150 / 600 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).height),
    }) // zone « OPTIMUS »
    .greyscale().raw().toBuffer();
  let max = 0, bright = 0;
  for (const v of raw) { if (v > max) max = v; if (v > 200) bright += 1; }
  assert(max >= 250, `le texte doit contenir du blanc pur (max mesuré : ${max})`);
  assert(bright > 1200, `assez de pixels de glyphes attendus (${bright} trouvés)`);

  // ---------- 3. Version : gérée par le test de la version courante (v178) ----------

  console.log('✅ v177-test : bannière pro (typographie réelle) verrouillée');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
