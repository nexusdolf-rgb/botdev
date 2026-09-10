// v258 — Le haut du tableau de bord retrouve ses commandes et le compte.
//
// Souvenir utilisateur de la v241, confirmé sur aperçu avant mise en ligne :
// en haut du dashboard, avant même de choisir un serveur, il y avait le
// thème clair/sombre, le choix de couleur, la cloche, le rafraîchissement,
// ET la photo de profil du compte Discord lié avec son pseudo et un bouton
// de déconnexion.
//
// Enquête : les boutons existaient toujours dans le code, mais le bloc
// mobile les masquait en « !important » — sur un PC tombant dans ses
// clauses (écran tactile + hauteur ≤ 800 px), ils disparaissaient. Quant au
// compte (photo, pseudo, déconnexion), il vivait dans le tiroir mobile :
// devenu invisible depuis que le PC affiche la coquille de bureau.
//
// La v258, sur OS de bureau uniquement :
//   • rend la barre d'actions (display: flex !important, largeur auto) ;
//   • ajoute dans cette barre un badge de compte : avatar Discord (ou
//     initiale), pseudo, mention « Compte Discord », bouton ⏻ de
//     déconnexion (POST /auth/logout puis retour à l'accueil) ;
//   • le mobile garde son tiroir et son propre bloc compte, inchangés.

const fs = require('node:fs');
const path = require('node:path');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = racine('public/css/dashboard.css');
const js = racine('public/js/dashboard.js');
const index = racine('public/index.html');

console.log('— 1. La barre d' + 'actions revient sur PC —');
check('le bloc mobile ne la cache plus sur OS de bureau',
  css.includes('html.hx-os-pc .dashboard-shell-host .dash-topbar-actions {\n  display: flex !important;'));
check('…theme, couleur, cloche et refresh sont bien dans le gabarit',
  js.includes('id="d-theme"') && js.includes('id="d-accent"')
  && js.includes('id="d-bell"') && js.includes('id="d-refresh"'));

console.log('— 2. Le badge du compte connecté —');
check('le gabarit porte le badge : avatar, pseudo, déconnexion',
  js.includes('<div class="dash-account-chip"') && js.includes('id="d-logout"')
  && js.includes('<small>Compte Discord</small>'));
check('…l' + 'avatar vient du compte Discord, avec repli sur l' + 'initiale',
  js.includes('acct.discord_avatar') && js.includes('class="acc-fallback"'));
check('…la déconnexion appelle /auth/logout puis revient à l' + 'accueil',
  /logoutBtn\.onclick = async \(\) => \{\s*await App\.api\('\/auth\/logout', \{ method: 'POST' \}\)/.test(js)
  && js.includes("location.hash = '#/';"));
check('…le badge est habillé (carte arrondie, avatar rond 28 px)',
  css.includes('.dash-account-chip {') && css.includes('border-radius: 50%; object-fit: cover;'));

console.log('— 3. Le mobile garde son tiroir —');
check('le bloc compte du tiroir mobile est intact',
  js.includes('dash-mobile-drawer-account') && js.includes('data-mobile-logout'));
check('…la barre d' + 'actions reste masquée sur coquille mobile (règle d' + 'origine conservée)',
  css.includes('.dashboard-shell-host .dash-topbar-actions,\n  .dashboard-shell-host .dash-topbar .topbar-pick { display: none !important; }'));

console.log('— 4. Version —');
check('index.html : ?v=263 référencé 7 fois', (index.match(/\?v=263/g) || []).length === 7,
  String((index.match(/\?v=263/g) || []).length));
check('sw.js : cache « botdev-v263 »', racine('public/sw.js').includes("const CACHE = 'botdev-v263';"));

console.log('');
if (ko === 0) console.log(`🎉 v258 — ${ok} vérifications OK : thème, couleur et compte connecté retrouvent leur place en haut du dashboard PC.`);
else { console.log(`❌ v258 — ${ko} échec(s)`); process.exitCode = 1; }
