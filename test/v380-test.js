// ============================================================
// v380 — Une seule palette pour tout le site
// ------------------------------------------------------------
// Le 24/10, un relevé des couleurs réellement calculées par le
// navigateur montrait trois familles d'écrans :
//
//   · accueil public ........................ bleu nuit #1a1c28
//   · tableau de bord, modules, fondateur ... gris Discord #36393f
//   · page « compte banni » ................. encre froide #080b12
//
// Décision : le gris du tableau de bord devient la base partout, le
// terracotta reste le seul accent. Ce test empêche le retour du bleu
// nuit, des halos violets et des couleurs de texte bleutées.
//
// Il ne fige pas un dessin : il vérifie qu'il n'existe qu'UNE famille,
// et que les exceptions sont justifiées (bouton Discord = blurple).
// ============================================================
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');
const style = lire('public/css/style.css');
const styleNu = sansCommentaires(style);
const dashboard = lire('public/css/dashboard.css');
const index = lire('public/index.html');
const sw = lire('public/sw.js');

let ok = 0;
const echecs = [];
function check(nom, condition, detail = '') {
  if (condition) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
}

// ---------------------------------------------------------------
// 1. Une seule base : le gris Discord du tableau de bord
// ---------------------------------------------------------------
console.log('\n— 1. Une seule base de couleur —');
check('le fond racine de la feuille publique est le gris du tableau de bord',
  /:root \{\n  --bg: #36393f;/.test(style), 'valeur racine inattendue');
check('les jetons publics reprennent les surfaçades du tableau de bord',
  /--panel: #2b2d31;/.test(style) && /--panel2: #40444b;/.test(style) && /--border: #4f545c;/.test(style),
  'jetons --panel / --panel2 / --border');
check('les textes publics reprennent les gris du tableau de bord',
  /--text: #f2f3f5;/.test(style) && /--text-dim: #b5bac1;/.test(style), 'jetons --text / --text-dim');

for (const ancienne of ['#1a1c28', '#12141c', '#0e0f15', '#080b12', '#14151f', '#20222f']) {
  check(`l'ancien fond bleu nuit ${ancienne} a disparu de la feuille publique`,
    !styleNu.toLowerCase().includes(ancienne), 'encore présent');
}

// ---------------------------------------------------------------
// 2. Plus aucun halo violet dans le tableau de bord
// ---------------------------------------------------------------
console.log('\n— 2. Plus aucun violet —');
check('le violet des halos (139,92,246) a disparu du tableau de bord',
  !dashboard.includes('139,92,246'), 'halo violet restant');
check('la bannière des cartes serveur n’est plus indigo',
  !dashboard.includes('#1a1c3a') && !dashboard.includes('#2b2d6b'), 'indigo restant');
check('la vignette d’aperçu d’embed n’est plus violette',
  !dashboard.includes('#3a2a4a'), 'violet restant');
check('le reflet du squelette de chargement n’est plus bleu',
  !dashboard.includes('#262a40'), 'reflet bleu restant');
check('le bouton de navigation de l’accueil n’est plus violet',
  !style.includes('6477ff') && !style.includes('906fff'), 'dégradé violet restant');

// ---------------------------------------------------------------
// 3. Le bloc de décision est présent et documenté
// ---------------------------------------------------------------
console.log('\n— 3. La décision est écrite dans la feuille —');
const bloc = style.slice(style.indexOf('v380 — Une seule palette'));
check('la feuille porte le bloc « v380 — Une seule palette »', bloc.length > 0, 'bloc absent');
check('le bloc donne la base, l’accent et l’exception Discord',
  /#36393f/.test(bloc) && /#e07a5f/.test(bloc) && /blurple/i.test(bloc), 'commentaire incomplet');
check('la page d’accueil publique reçoit les jetons alignés',
  /body:has\(#public-landing\)/.test(bloc), 'sélecteur du site public absent');
check('la page de connexion et le panneau banni partagent le même fond',
  /body:has\(\.auth-wrap\)/.test(bloc), 'sélecteur de la connexion absent');
check('le thème clair est traité aussi', /html\.hx-light/.test(bloc), 'pas de variante claire');

// ---------------------------------------------------------------
// 4. Le panneau du compte banni suit la même famille
// ---------------------------------------------------------------
console.log('\n— 4. Le panneau du compte banni —');
check('la carte bannie n’a plus de fond encre (#080b12 / 8, 11, 18)',
  !style.includes('rgba(8, 11, 18'), 'fond encre restant');
check('les encadrés du panneau utilisent le gris du tableau de bord',
  style.includes('rgba(32, 34, 37, .42)') && style.includes('rgba(32, 34, 37, .3)'), 'surfaces non alignées');
check('le pictogramme et le chrono passent au terracotta',
  style.includes('color: #e07a5f; background: rgba(224, 122, 95, .12);') && style.includes('#f0b6a4'),
  'accent non aligné');
check('le rouge vif du pictogramme a disparu', !style.includes('#ff8a8d'), 'rouge restant');
check('la barre de progression va du terracotta au terracotta foncé',
  style.includes('linear-gradient(90deg, #e07a5f, #c95b49)'), 'dégradé non aligné');

// ---------------------------------------------------------------
// 5. Les exceptions assumées
// ---------------------------------------------------------------
console.log('\n— 5. Les deux exceptions sont justifiées —');
check('le bouton « Se connecter avec Discord » garde son blurple',
  style.includes('background-color: #4752c4'), 'blurple du bouton Discord perdu');
check('la barre du navigateur suit le fond réel (meta theme-color)',
  /<meta name="theme-color" content="#36393f" \/>/.test(index), 'meta non aligné');

// ---------------------------------------------------------------
// 6. Version
// ---------------------------------------------------------------
console.log('\n— 6. Version —');
check('index.html porte ?v=383 sept fois', (index.match(/\?v=383/g) || []).length === 7,
  String((index.match(/\?v=383/g) || []).length));
check('le service worker porte le même numéro de cache', sw.includes("const CACHE = 'botdev-v383';"));
check('aucun fichier de public/js ne cite une version périmée',
  !fs.readdirSync(path.join(RACINE, 'public', 'js')).some((f) => /\?v=379/.test(lire('public/js/' + f))),
  'version périmée dans un js');

// ---------------------------------------------------------------
console.log('');
if (echecs.length) {
  console.log(`❌ v380 — ${echecs.length} échec(s) sur ${ok + echecs.length}`);
  echecs.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`🎉 v380 — ${ok} vérifications OK : un seul fond (#36393f), un seul accent (terracotta),`);
console.log('   plus de bleu nuit ni de violet, et le bouton Discord garde sa couleur officielle.');
