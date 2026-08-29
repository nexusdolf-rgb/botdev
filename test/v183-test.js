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

  // ---------- 3. Le logo argent est présent à droite (place de la tête) ----------
  const rawLogo = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png'))
    .extract({ left: 1050, top: 100, width: 420, height: 420 }) // zone du logo calqué
    .greyscale().raw().toBuffer();
  let logoBright = 0;
  for (const v of rawLogo) { if (v > 150) logoBright += 1; }
  assert(logoBright > 5000, `le logo argent doit être visible (${logoBright} pixels clairs)`);

  // ---------- 4. Version v183 ----------
  assert.strictEqual((index.match(/\?v=183/g) || []).length, 7,
    'index.html doit référencer v183 7 fois');
  assert(sw.includes('botdev-v183'), 'le cache du service worker n’est pas en v183');
  assert(!index.includes('?v=182'), 'index.html référence encore v182');

  console.log('✅ v183-test : logo argent calqué à la place de la tête premium');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
