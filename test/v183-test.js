// ══════════════════════════════════════════════════════════════
// TEST v183 — Le LOGO ARGENT (l'avatar Discord du bot, généré
// plus tôt dans la journée) remplace la tête premium, à la même
// taille et à la même position exactes (centre ~1299/329,
// enveloppe 413×429 — celle de la tête premium de la v182).
// Demande explicite de l'utilisateur : « pas celui que tu viens
// de créer il y a 4 minutes » → le logo argent, pas la tête.
// Composition en mode « écran » : le fond noir pur de l'avatar
// laisse le fond de la bannière intact (vérifié : 0 pixel changé
// hors du logo, texte intact).
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- 1. Les bannières du site sont la version v183 ----------
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

  // ---------- 2. Le texte de la bannière est intact (vraie police) ----------
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

  // ---------- 3. Le logo argent est présent à droite (place de la tête) ----------
  const rawLogo = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    // v386 — zone du logo en proportions de l'image d'origine (1500×600).
    .extract({
      left: Math.round(1050 / 1500 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).width),
      top: Math.round(100 / 600 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).height),
      width: Math.round(420 / 1500 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).width),
      height: Math.round(420 / 600 * (await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata()).height),
    }) // zone du logo calqué
    .greyscale().raw().toBuffer();
  let logoBright = 0;
  for (const v of rawLogo) { if (v > 150) logoBright += 1; }
  assert(logoBright > 5000, `le logo argent doit être visible (${logoBright} pixels clairs)`);

  // ---------- 4. Version : gérée par le test de la version courante (v184) ----------

  console.log('✅ v183-test : logo argent calqué (historique, remplacé par la v184)');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
