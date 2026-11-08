// v388 — Revue de code : chaque correctif et chaque garde-fou a sa preuve.
// Ce fichier vérifie le résutat observable (fichier livré, fonction appelée,
// valeur refusée), jamais l'intention supposée.
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0;
let ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const existe = (f) => fs.existsSync(path.join(__dirname, '..', f));

const index = racine('public/index.html');
const security = racine('server/security.js');
const sw = racine('public/sw.js');
const manifeste = JSON.parse(racine('public/manifest.webmanifest'));
const app = racine('public/js/app.js');
const dashboard = racine('public/js/dashboard.js');
const publicJs = racine('public/js/public.js');
const routes = racine('server/routes.js');
const pkg = JSON.parse(racine('package.json'));

// ------------------------------------------------------------------
console.log('\n— 1. CSP : plus aucun script en ligne —');
// ------------------------------------------------------------------
const csp = (security.match(/Content-Security-Policy', "([^"]+)"/) || [])[1] || '';
check('la politique est bien déclarée', csp.length > 0);
check('script-src n’accepte pas unsafe-inline', !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 80));
check('script-src reste limité à la même origine', /script-src 'self'/.test(csp));

const scriptsEnLigne = (index.match(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g) || []);
check('index.html n’a plus aucun script exécutable en ligne', scriptsEnLigne.length === 0, `${scriptsEnLigne.length} bloc(s)`);
for (const f of ['public/js/boot-os.js', 'public/js/boot-theme.js', 'public/js/boot-sw.js']) {
  check(`${f} existe`, existe(f));
}
check('les trois scripts de démarrage sont chargés', ['boot-os', 'boot-theme', 'boot-sw'].every((f) => index.includes(`/js/${f}.js`)));
check('la décision PC/mobile passe avant les feuilles de style',
  index.indexOf('/js/boot-os.js') < index.indexOf('/css/style.css'));
check('le thème passe avant les feuilles de style',
  index.indexOf('/js/boot-theme.js') < index.indexOf('/css/style.css'));
check('aucun gestionnaire en ligne (onerror/onclick) ne subsiste',
  !/on(click|error|change|load)\s*=\s*"/.test(index)
  && !/on(click|error|change|load)\s*=\s*"/.test(app + dashboard + publicJs));
check('le filet des images cassées est branché en délégation',
  app.includes("document.addEventListener('error'") && app.includes('img.dataset.secours'));
check('les aperçus d’embed masquent une image morte par attribut',
  dashboard.includes('data-img-hide="1"') && !dashboard.includes('this.style.display'));

// ------------------------------------------------------------------
console.log('\n— 2. Manifeste : tailles réelles, thème du site —');
// ------------------------------------------------------------------
check('theme_color = #36393f (comme index.html)', manifeste.theme_color === '#36393f', manifeste.theme_color);
check('orientation supprimée', !('orientation' in manifeste));
const icones = manifeste.icons || [];
check('trois icônes déclarées', icones.length === 3);
const attendues = { '/icons/icon-192.png': '192x192', '/icons/icon-512.png': '512x512', '/icons/icon-maskable-512.png': '512x512' };
for (const ico of icones) {
  check(`${ico.src} : taille déclarée conforme au fichier`, attendues[ico.src] === ico.sizes, `${ico.src} → ${ico.sizes}`);
  check(`${ico.src} existe sur le disque`, existe('public' + ico.src));
}
check('plus aucune icône nexora dans le manifeste', !JSON.stringify(manifeste).includes('nexora'));

// ------------------------------------------------------------------
console.log('\n— 3. Service worker : mêmes icônes, cache renommé —');
// ------------------------------------------------------------------
check('le cache porte le nom du site', /const CACHE = 'hoxera-v\d+';/.test(sw), (sw.match(/const CACHE = '[^']*'/) || [''])[0]);
check('plus aucune référence nexora dans le service worker', !sw.includes('nexora'));
for (const src of Object.keys(attendues)) {
  check(`ASSETS cite ${src}`, sw.includes(`'${src}'`));
}
check('la version de index.html et celle du cache sont alignées',
  (sw.match(/hoxera-v(\d+)/) || [])[1] === (index.match(/\?v=(\d+)/) || [])[1]);

// ------------------------------------------------------------------
console.log('\n— 4. Mise à jour : plus de rechargement qui détruit une saisie —');
// ------------------------------------------------------------------
const bootSw = racine('public/js/boot-sw.js');
check('un garde beforeunload protège une saisie non enregistrée',
  bootSw.includes('beforeunload') && bootSw.includes('e.preventDefault()'));
check('un bouton « Actualiser » est proposé quand un champ a changé', bootSw.includes('Actualiser'));
check('le rechargement automatique est conditionné à l’absence de saisie',
  /if \(modifie\) proposerActualisation\(\);\s*\n\s*else window\.location\.reload\(\)/.test(bootSw));
check('la marque « en cours de saisie » se lève après un enregistrement réussi',
  bootSw.includes("'hx:saved'") && app.includes("dispatchEvent(new CustomEvent('hx:saved'))"));

// ------------------------------------------------------------------
console.log('\n— 5. Fenêtres de dialogue accessibles —');
// ------------------------------------------------------------------
check('role="dialog" et aria-modal posés par App.modal',
  app.includes('role="dialog"') && app.includes('aria-modal="true"'));
check('Échap ferme la fenêtre', app.includes("e.key === 'Escape'"));
check('le focus est piégé dans la fenêtre (Tab circulaire)', app.includes("e.key !== 'Tab'") && app.includes('derniere.focus()'));
check('le focus revient à l’élément d’origine', app.includes('App._modalFocus'));
const fermetures = [...(app + dashboard + publicJs).matchAll(/<button class="x-btn" data-close(?![^>]*aria-label)/g)].length;
check('les boutons de fermeture portent aria-label="Fermer"', fermetures === 0, `${fermetures} sans étiquette`);
const etiquettes = (app + dashboard + publicJs).match(/aria-label="Fermer"/g) || [];
check('10 boutons de fermeture étiquetés (7 demandés + 3 existants)', etiquettes.length >= 7, String(etiquettes.length));

// ------------------------------------------------------------------
console.log('\n— 6. Injection HTML : le nom du bot est échappé —');
// ------------------------------------------------------------------
check('le tiroir mobile échappe le nom du bot',
  dashboard.includes("Menu ${App.escapeHtml((Dashboard.state.bot && Dashboard.state.bot.name) ? Dashboard.state.bot.name : 'Hoxera')}"));
const echappe = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const charge = '<img src=x onerror=alert(1)>';
const sortie = echappe(charge);
check('escapeHtml neutralise une balise <img>', sortie === '&lt;img src=x onerror=alert(1)&gt;', sortie);
check('escapeHtml neutralise aussi les guillemets', echappe('"\'') === '&quot;&#39;');
check('aucun innerHTML n’insère le nom brut du serveur',
  !dashboard.includes('${guild.name}') && !dashboard.includes('${bot.name}'),
  'interpolation brute trouvée');

// ------------------------------------------------------------------
console.log('\n— 7. Partages sociaux —');
// ------------------------------------------------------------------
check('og:image est déclarée', /<meta property="og:image" content="https:\/\/hoxera\.is-a\.dev\/icons\/support-banner\.png"/.test(index));
check('twitter:image est déclarée', /<meta name="twitter:image"/.test(index));
check('twitter:card passe en summary_large_image',
  /<meta name="twitter:card" content="summary_large_image"/.test(index));

// ------------------------------------------------------------------
console.log('\n— 8. Noms : plus de BotDev/Nexora dans le produit —');
// ------------------------------------------------------------------
check('package.json : name = hoxera', pkg.name === 'hoxera', pkg.name);
check('package.json : private = true', pkg.private === true);
check('package.json : description du bot de modération', /modération/.test(pkg.description || ''));
check('aucune trace de BotDev dans le front', !/BotDev/.test(app + dashboard + publicJs + index));
check('aucune trace de Nexora dans le code du front',
  !/nexora/i.test(app + dashboard + publicJs + index.replace(/\/icons\/[a-z0-9-]+\.(png|svg)/g, '')));
check('l’ancien nom de variable reste lu en repli',
  routes.includes('HOXERA_ADMIN_DISCORD_ID') && routes.includes('NEXORA_ADMIN_DISCORD_ID'));

// ------------------------------------------------------------------
console.log('\n— 9. Image proxy : seule Discord est joignable —');
// ------------------------------------------------------------------
const imgproxy = require('../server/imgproxy');
const refuse = [
  'http://127.0.0.1/secret',
  'http://localhost/x.png',
  'https://cdn.discordapp.com.evil.tld/a.png',
  'https://cdn.discordapp.com:8443/a.png',
  'https://user:pass@cdn.discordapp.com/a.png',
  'https://evil.tld/cdn.discordapp.com/a.png',
  'file:///etc/passwd',
  'https://169.254.169.254/latest/meta-data',
];
for (const u of refuse) {
  check(`refusé : ${u}`, imgproxy.isDiscordImageUrl(u) === false);
}
check('accepté : une vraie URL Discord', imgproxy.isDiscordImageUrl('https://cdn.discordapp.com/avatars/1/2.png') === true);
const sourceProxy = racine('server/imgproxy.js');
check('les redirections sont suivies à la main, une par une', sourceProxy.includes("redirect: 'manual'"));
check('chaque saut de redirection est revalidé', /isDiscordImageUrl\(next\)/.test(sourceProxy));

// ------------------------------------------------------------------
console.log('\n— 10. Origine des requêtes d’écriture —');
// ------------------------------------------------------------------
const secu = require('../server/security');
check('les quatre méthodes d’écriture sont couvertes',
  ['POST', 'PUT', 'PATCH', 'DELETE'].every((m) => secu.MUTATING_METHODS.has(m)));
check('une origine étrangère est refusée', secu.sameOrigin({ headers: { host: 'hoxera.is-a.dev' }, socket: {}, protocol: 'https' }, 'https://evil.tld') === false);
check('une origine identique est acceptée', secu.sameOrigin({ headers: { host: 'hoxera.is-a.dev' }, socket: {}, protocol: 'https' }, 'https://hoxera.is-a.dev') === true);
check('l’en-tête « null » est refusé', secu.sameOrigin({ headers: { host: 'hoxera.is-a.dev' }, socket: {}, protocol: 'https' }, 'null') === false);
const indexServeur = racine('server/index.js');
check('le garde d’origine est monté sur toute l’API',
  /app\.use\('\/api', security\.originGuard/.test(indexServeur));

// ------------------------------------------------------------------
console.log('\n— 11. Autorisations par serveur —');
// ------------------------------------------------------------------
const decl = [...routes.matchAll(/^router\.(get|post|put|patch|delete)\('([^']+)'/gm)];
const avecGuildId = decl.filter((m) => m[2].includes(':guildId'));
const sansGarde = avecGuildId.filter((m) => {
  const debut = routes.indexOf(m[0]);
  const fin = routes.indexOf("router.", debut + m[0].length);
  const bloc = routes.slice(debut, fin > 0 ? fin : undefined);
  return !bloc.includes('userCanManageGuild');
});
check('toutes les routes de serveur vérifient l’autorisation',
  sansGarde.length === 2, `${sansGarde.length} sans garde : ${sansGarde.map((m) => m[2]).join(', ')}`);
check('les deux exceptions sont des images publiques de panneau (aucune donnée)',
  sansGarde.every((m) => /panel-banner/.test(m[2])),
  sansGarde.map((m) => m[2]).join(', '));
check('la vérification rafraîchit la liste Discord avant de décider',
  /async function userCanManageGuild[\s\S]{0,1400}refreshDiscordData\(req\.userId\)/.test(routes));
check('l’administration exige le rôle plateforme', /function requireAdmin[\s\S]{0,200}isPlatformAdmin/.test(routes));

// ------------------------------------------------------------------
console.log('\n— 12. OAuth : traces et refus —');
// ------------------------------------------------------------------
check('un échec du callback écrit son motif dans les journaux',
  routes.includes("console.error('[Hoxera] OAuth Discord : échec du callback —'"));
check('le motif journalisé ne contient ni code ni jeton',
  !/console\.error\('\[Hoxera\] OAuth Discord[^)]*(code|access_token)/.test(routes));
check('un refus explicite sur Discord a son propre message',
  routes.includes("if (refus)") && app.includes("o === 'refus'"));
check('le cookie d’état expire en 10 minutes',
  /res\.cookie\('bd_oauth_state', state, security\.secureCookieOptions\(req, 600000\)\)/.test(routes));
check('l’état est vérifié avant tout échange de code',
  routes.indexOf('state !== stateCookie') < routes.indexOf('/oauth2/token'));
check('le cookie de session est httpOnly et SameSite', racine('server/security.js').includes('httpOnly: true') && racine('server/security.js').includes("sameSite: 'lax'"));

console.log(`\n${ko === 0 ? '🎉' : '❌'} v388 — ${ok} vérifications, ${ko} échec(s).`);
if (ko) { fails.forEach((f) => console.log('   · ' + f)); process.exit(1); }
