// ============================================================
// v368 — ce qui rendait mal apres la passe de decor, et ce qui ne doit
// plus repartir en arriere : contenants d'icone, bouton de sortie, marque
// unique, texte sans cadratin, liens reels, police locale.
// ------------------------------------------------------------
// Les regles sont verifiees dans la source ET, la ou c'est possible, dans le
// rendu : un contenant vide ne se voit qu'a l'ecran, mais il se lit aussi dans
// le gabarit qui l'imprime.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const lus = {};
const routesJs = fs.readFileSync(path.join(RACINE, 'server/routes.js'), 'utf8');
const permsJs = fs.readFileSync(path.join(RACINE, 'server/discord/permissions.js'), 'utf8');
for (const f of ['public/js/public.js', 'public/js/app.js', 'public/js/dashboard.js', 'public/index.html',
  'public/css/style.css', 'public/css/dashboard.css', 'public/robots.txt', 'public/sitemap.xml',
  'public/llms.txt', 'server/security.js', 'server/index.js', 'public/sw.js']) {
  lus[f] = fs.readFileSync(path.join(RACINE, f), 'utf8');
}
const VERSION = 368;

let ok = 0; let ko = 0;
function check(titre, condition, detail) {
  if (condition) { ok++; console.log('  ✅ ' + titre); return; }
  ko++; console.log('  ❌ ' + titre + (detail ? ' — ' + detail : ''));
}

console.log('— 1. Plus un seul contenant d\'icone vide dans les gabarits —');
const gabarits = ['public/js/public.js', 'public/js/app.js', 'public/js/dashboard.js']
  .map((f) => lus[f]).join('\n');
// .sk-ico est le squelette de chargement : il est vide par construction.
const contenants = ['hp-pillar-ico', 'f-ico', 'am-shield-icon'];
const vides = [];
for (const c of contenants) {
  const r = new RegExp('class="' + c + '"></(?:div|span)>', 'g');
  for (const m of gabarits.match(r) || []) vides.push(m);
}
check('aucun contenant d\'icone rendu sans contenu', vides.length === 0, vides.join(' '));
check('les tuiles d\'acces rapide portent toutes un glyphe',
  !/<button class="ov-quick-action"[^>]*><span><\/span>/.test(lus['public/js/dashboard.js']));
check('les sept icones retirees du decor ont un glyphe SVG en ligne',
  (lus['public/js/public.js'].match(/<svg class="ico-svg"/g) || []).length >= 15,
  String((lus['public/js/public.js'].match(/<svg class="ico-svg"/g) || []).length));
function compteGlyphes(source) {
  const i = source.indexOf('App.GLYPHES');
  const d = source.indexOf('{', i);
  let p = d; let prof = 0;
  do { const c = source[p]; if (c === '{') prof++; else if (c === '}') prof--; p++; } while (prof > 0 && p < source.length);
  return [...source.slice(d + 1, p - 1).matchAll(/^\s*'?([A-Za-zÀ-ÿ0-9_]+)'?\s*:/gm)].map((m) => m[1]);
}
const cles = compteGlyphes(lus['public/js/app.js']);
check('le jeu de glyphes compte au moins 52 entrees et le nouveau signe de sortie',
  cles.length >= 52 && cles.includes('sortie'), cles.length + ' clés');

console.log('— 2. Sortie : glyphe et nom accessible, pas un caractere —');
check('plus de caractere d\'alimentation dans le front', !/[\u232B\u23FB\u23BA\u23BD⏼]/.test(gabarits));
check('le bouton de sortie du tableau de bord est nomme', /id="d-logout"[^>]*aria-label="Se déconnecter du dashboard"/.test(lus['public/js/dashboard.js']));
check('le bouton de sortie de la barre haute est nomme', /aria-label="Se déconnecter du dashboard"/.test(lus['public/js/app.js']));
check('les deux portent un SVG', (lus['public/js/dashboard.js'].match(/id="d-logout"[^>]*>[\s\S]{0,220}?<svg/g) || []).length === 1
  && (lus['public/js/app.js'].match(/id="nav-logout"[^>]*>[\s\S]{0,260}?<svg/g) || []).length === 1);
check('le libellé de la tuile de garde n\'est pas vide', /am-shield-icon"><svg/.test(lus['public/js/dashboard.js']));

console.log('— 3. Une seule marque —');
check('« Optimus Prime » a disparu du front', !/Optimus Prime/.test(lus['public/js/public.js'] + lus['public/js/app.js'] + lus['public/js/index.html'] + lus['public/index.html']));
check('le tableau de bord non plus ne la cite pas', !/Optimus Prime/.test(lus['public/js/dashboard.js']));
check('Hoxera est nommee dans le pied de l\'accueil', /© \$\{new Date\(\)\.getFullYear\(\)\} Hoxera</.test(lus['public/js/public.js']));

console.log('— 4. Ecriture du texte —');
const lignesCode = [];
for (const f of ['public/js/public.js', 'public/js/app.js', 'public/js/dashboard.js']) {
  for (const l of lus[f].split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue;
    lignesCode.push(l);
  }
}
const cadratins = lignesCode.filter((l) => /[A-Za-zÀ-ÿ0-9] — [A-Za-zÀ-ÿ0-9]/.test(l));
check('aucun cadratin dans le texte affiche', cadratins.length === 0, cadratins.slice(0, 2).join(' | ').slice(0, 120));
const tics = ['en quelques clics', 'tout-en-un', 'token protégé', 'Dernière synchronisation disponible', 'Bonjour, administrateur'];
const rests = tics.filter((t) => gabarits.includes(t));
check('aucune des formules signalees ne revient', rests.length === 0, rests.join(', '));

console.log('— 5. Liens et ressources —');
check('plus de href="#" dans l\'accueil', (lus['public/js/public.js'].match(/href="#"/g) || []).length === 0);
check('le lien du pied mene au tableau de bord', lus['public/js/public.js'].includes('<a href="/#/dashboard" id="pub-foot-dash">'));
check('aucune police externe dans la page', !/fonts\.(googleapis|gstatic)/.test(lus['public/index.html']));
check('les ancres de la landing portent un decalage d\'une seule source',
  /html \{ scroll-padding-top: 84px; \}/.test(lus['public/css/style.css']) && !/\.hp-section \{ scroll-margin-top/.test(lus['public/css/style.css']));

console.log('— 6. Boutons et contrastes de la vitrine —');
check('un seul fond pour le bouton Discord', /\.btn-discord, \.navbar #public-landing \.btn-discord \{ background-color: #4752c4; color: #fff; \}/.test(lus['public/css/style.css']));
check('le heros ne rend plus son bouton transparent', !/#public-landing \.pub-hero-actions \.btn-discord,/.test(lus['public/css/style.css']));
check('le fond terracotta des boutons primaires est assombri',
  (lus['public/css/style.css'].match(/background: #b4452c;/g) || []).length >= 3
  && !/#public-landing \.pub-hero-actions \.btn-primary \{\n  background: #e07a5f;/.test(lus['public/css/style.css']));
check('la couronne de l\'administration globale herite du lien',
  /html\.hx-light \.dashboard-shell-host \.dash-global-admin \.ico \{ color: inherit; \}/.test(lus['public/css/dashboard.css'])
  || /html \.dashboard-shell-host \.dash-global-admin \.ico,\s*\nhtml\.hx-light/.test(lus['public/css/dashboard.css']));

check('le trait des glyphes est defini une seule fois, dans la feuille',
  /\.ico-svg :is\([^)]*\):not\(\[fill\]\) \{\s*\n?\s*fill: none; stroke: currentColor/.test(lus['public/css/style.css']));
check('aucun SVG de gabarit ne laisse un path sans remplissage ni groupe',
  (gabarits.match(/<svg class="ico-svg"[^>]*><(path|rect|circle)/g) || []).length === 0
  || /\.ico-svg :is\(path/.test(lus['public/css/style.css']));
check('les trois boutons de connexion partagent le meme fond',
  /\.btn-discord, \.navbar #public-landing \.btn-discord \{ background-color: #4752c4; color: #fff; \}/.test(lus['public/css/style.css'])
  && /\.navbar \.btn-discord, \.navbar \.btn-discord:hover \{ background-color: #4752c4; color: #fff; \}/.test(lus['public/css/style.css']));


check('le robots.txt existe, autorise l’accueil et coupe /api',
  /^User-agent: \*/m.test(lus['public/robots.txt'])
  && /Disallow: \/api\//.test(lus['public/robots.txt'])
  && /Sitemap: https:\/\/hoxera\.is-a\.dev\/sitemap\.xml/.test(lus['public/robots.txt']));
check('le sitemap ne promet que la page qui existe',
  (lus['public/sitemap.xml'].match(/<loc>/g) || []).length === 1
  && !/lastmod/.test(lus['public/sitemap.xml']));
check('llms.txt reste sur des faits verifiables',
  /discord\.gg\/X9hTdr9N3/.test(lus['public/llms.txt']) && !/ — /.test(lus['public/llms.txt']));
check('le head porte canonical, OG et Twitter sur le domaine officiel',
  /<link rel="canonical" href="https:\/\/hoxera\.is-a\.dev\/" \/>/.test(lus['public/index.html'])
  && (lus['public/index.html'].match(/hoxera\.is-a\.dev\//g) || []).length >= 3
  && /property="og:site_name" content="Hoxera"/.test(lus['public/index.html']));
check('le JSON-LD est lisible et ne promet pas un prix invente',
  (() => {
    const m = lus['public/index.html'].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return false;
    const d = JSON.parse(m[1]);
    return d.name === 'Hoxera' && d.url === 'https://hoxera.is-a.dev/' && !('offers' in d) && !('aggregateRating' in d);
  })());
check('un chemin inconnu renvoie un vrai 404, plus la coquille en 200',
  /CHEMINS_PAGE = new Set\(\['\/', '\/index\.html'\]\)/.test(lus['server/index.js'])
  && /res\.status\(404\)\.sendFile\(fichier\)/.test(lus['server/index.js'])
  && /X-Robots-Tag', 'noindex, follow'/.test(lus['server/index.js']));
check('la CSP ne laisse plus passer les hotes de polices externes',
  !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(lus['server/security.js'])
  && /img-src 'self' data: https:\/\/cdn\.discordapp\.com/.test(lus['server/security.js']));
check('le dashboard se declare noindex a la navigation',
  /App\.marquageIndexation = \(publique\)/.test(lus['public/js/app.js'])
  && /App\.marquageIndexation\(parts\.length === 0/.test(lus['public/js/app.js']));

// — 8. Sécurité des routes (audit transformé en garde permanente) —
check('la garde de serveur ne se contente plus du cache Discord',
  /async function userCanManageGuild[\s\S]{0,900}await refreshDiscordData\(req\.userId\)/.test(routesJs));
check("la configuration d'un serveur reste au propriétaire ou à Administrateur",
  /function oauthGuildCanConfigure\(guild\) \{[\s\S]{0,160}return !!guild\.owner \|\| hasAdministratorPermission\(guild\.permissions\);/.test(permsJs)
  && !/function oauthGuildCanConfigure[\s\S]{0,220}return true/.test(permsJs));
check('le bandeau public ne garde que des chiffres dans l\'identifiant de serveur',
  /function servePanelBannerPng[\s\S]{0,220}replace\(\/\[\^0-9\]\/g, \'\'\)/.test(routesJs));
check('aucune route touchant un serveur n\'est ajoutée sans garde d\'accès',
  (() => {
    const lignes = routesJs.split('\n');
    const pat = /^\s*(?:router|app)\.(get|post|put|patch|delete)\(\s*(['"])(.+?)\2/;
    const debuts = [];
    lignes.forEach((l, i) => { const m = pat.exec(l); if (m) debuts.push([i, m[3]]); });
    const connues = new Set(['/tickets/panel-banner/:guildId.png', '/tickets/panel-banner/:guildId.gif', '/bots', '/bots/:id']);
    const gardes = /userCanManageGuild|requireAdmin|getOwnBot|adminTarget|isPlatformAdmin|403/;
    for (let k = 0; k < debuts.length; k++) {
      const [i, chemin] = debuts[k];
      const fin = k + 1 < debuts.length ? debuts[k + 1][0] : lignes.length;
      const corps = lignes.slice(i, fin).join('\n');
      if (!/guildId|userId|user_id/.test(corps.slice(0, 1200))) continue;
      if (gardes.test(corps)) continue;
      if (connues.has(chemin)) continue;
      return false;
    }
    return true;
  })());

console.log('— 7. Version —');
const index = lus['public/index.html'];
check(`index.html : ?v=${VERSION} référencé 7 fois`, (index.match(/\?v=371/g) || []).length === 7,
  String((index.match(/\?v=371/g) || []).length));
const sw = fs.readFileSync(path.join(RACINE, 'public/sw.js'), 'utf8');
check('le service worker porte la même version de cache', sw.includes("const CACHE = 'botdev-v371';"));
check('aucun fichier de public/js ne cite une version périmée',
  !/\?v=3[0-9][0-9]/.test(gabarits.replace(/\?v=371/g, '')), (gabarits.match(/\?v=3\d\d/g) || []).join(' '));

console.log('');
if (ko === 0) console.log(`🎉 v368 — ${ok} vérifications OK : icônes remplies, sortie nommée, marque unique, texte sans cadratin, liens réels.`);
else console.log(`❌ v368 — ${ko} échec(s) sur ${ok + ko}`);
process.exit(ko ? 1 : 0);
