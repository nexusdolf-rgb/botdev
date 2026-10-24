// ============================================================
// v377 — Revue du 21/10 : mobile, variables, aperçus, isolation.
// Chaque contrôle vise un défaut constaté à l'écran ou dans le code.
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v377-'));

let ok = 0; const echecs = [];
const check = (label, cond, detail) => {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { echecs.push(label + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};
const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

(async () => {
  const js = lire('public/js/public.js');
  const dash = lire('public/js/dashboard.js');
  const css = lire('public/css/style.css');
  const dashCss = lire('public/css/dashboard.css');
  const html = lire('public/index.html');

  console.log('— 1. En-tête et menu de la vitrine —');
  check('un bouton hamburger existe', /id="pub-burger"/.test(js));
  check('il annonce son état aux lecteurs d\'écran', /aria-expanded/.test(js) && /aria-controls="pub-burger-menu"/.test(js));
  check('le panneau replié reprend les quatre liens', (js.match(/data-anchor="hp-(about|features|preview|faq)"/g) || []).length >= 8);
  check('l\'action principale est aussi dans le menu', /data-menu-action/.test(js));
  check('le menu se ferme sur Échap', /Escape/.test(js));
  check('le hamburger n\'apparaît que sous 900 px', /@media \(max-width: 900px\)[\s\S]{0,400}\.nav-burger \{ display: inline-flex/.test(css));
  check('le bouton du bandeau ne déborde plus', /\.navbar-right \.btn \{ max-width: 100%/.test(css));

  console.log('— 2. Textes marketing retirés —');
  // v378 : « Bots en ligne » redevient legitime — c'est l'accord du libelle
  // quand plusieurs bots sont en ligne. Ce que v377 visait vraiment, c'est la
  // fraction « 1/1 » collee a ce libelle : on la verrouille explicitement.
  for (const phrase of ['digne des plus grands', 'pensé comme un produit', 'expérience complète', 'en direct en direct', 'serveur(s)', '${onlineBots}/${totalBots}']) {
    check('« ' + phrase + ' » a disparu', !js.includes(phrase));
  }
  check('le nombre de bots s\'accorde', /Bot en ligne/.test(js) && /Bots en ligne/.test(js));

  console.log('— 3. Chevrons et carrés blancs —');
  check('plus aucun chevron Unicode dans le CSS', !/[▸▾]/.test(dashCss.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('un masque SVG unique sert de chevron', /--chevron-down/.test(dashCss) && /mask: var\(--chevron-down\)/.test(dashCss));
  check('le sélecteur de serveur porte une icône SVG', /class="srv-caret"[\s\S]{0,120}<svg/.test(dash));
  check('aucun sélecteur de variante orphelin', !/(^|[^\p{Extended_Pictographic}])\uFE0F/u.test(dash));

  console.log('— 4. Variables de message —');
  const moteur = lire('server/discord/engine.js');
  check('le moteur gère {user} et {count}', /replace\(\/\\\{user\\\}\/g/.test(moteur) && /replace\(\/\\\{count\\\}\/g/.test(moteur));
  check('les variables sont cliquables', /Dashboard\.varChips/.test(dash) && /class="var-chip"/.test(dash));
  check('la syntaxe insérée est exacte', /\{`\$\{nom\}`\}/.test(dash.replace(/\\/g, '')) || /const texte = `\{\$\{nom\}\}`/.test(dash));
  check('la puce ne peut pas être mise en majuscules', /\.var-chip \{[^}]*text-transform: none/.test(dashCss.replace(/\n/g, ' ')));
  check('les variables d\'événement sont branchées', /EVENT_VARS/.test(dash));

  console.log('— 5. Aperçus —');
  // Le seul reste est le commentaire qui explique pourquoi il a été retiré.
  check('plus de discriminateur #0001 dans l\'aperçu', !/NouveauMembre#0001 vient/.test(dash) && !/NouveauMembre#0001 s/.test(dash));
  check('l\'aperçu utilise l\'avatar réel du bot', /src="\/api\/public\/bot-avatar"/.test(dash));
  check('pas d\'URL absolue vers notre propre domaine', !/https:\/\/hoxera\.is-a\.dev\/icons\//.test(dash));

  console.log('— 6. Confirmations et sauvegardes —');
  const confirmations = (dash.match(/App\.confirm\(/g) || []).length;
  check('les suppressions demandent confirmation', confirmations >= 12, String(confirmations));
  check('la route des réglages n\'écrit que ce qu\'on lui envoie', /\(prefix !== undefined \? \{ prefix:/.test(lire('server/routes.js')));
  check('le module tickets n\'envoie plus le préfixe', !/ticket_log_channel: c\.querySelector\('#t-logchan'\)\.value,\s*\}\);/.test(dash) || !/prefix: \(data\.settings \|\| \{\}\)\.prefix/.test(dash));

  console.log('— 7. Isolation de la vérification —');
  const routes = lire('server/routes.js');
  check('le rôle est distribué AVANT le masquage', /grantRoleToAll[\s\S]{0,160}applyIsolation/.test(routes));
  check('un rôle non attribuable bloque l\'isolation', /assertGrantReady\(guild\)[\s\S]{0,200}grantRoleToAll/.test(routes));
  check('l\'erreur dit que rien n\'a été touché', /untouched: true/.test(routes));
  check('le dashboard demande confirmation', /Activer l’isolation \?/.test(dash));
  // v378 : le compteur passe par App.pluriel (accord singulier/pluriel).
  check('le compte-rendu donne le nombre de membres', /a été donné à \$\{App\.pluriel\(r\.granted/.test(dash));

  console.log('— 8. Version —');
  check('index.html sert la v377', (html.match(/\?v=381/g) || []).length === 7);
  check('le service worker est en v377', lire('public/sw.js').includes('botdev-v381'));

  try { require('../server/db').db.close(); } catch {}
  try { fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌`);
  if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
  console.log('🎉 v377 — la revue du 21/10 tient ses promesses.');
})();
