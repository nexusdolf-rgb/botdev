// v378 — Revue de la capture Android du 21/10 : « 1/1 » sous « Bot en ligne »,
// lien support de 16 px, pied de page en franglais, carte bot « Optimus
// Prime#2500 ». Les contrôles ci-dessous figent les correctifs et les défauts
// trouvés ensuite en balayant les 39 modules du tableau de bord.
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok++; console.log('  ✅ ' + nom); } else { ko++; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const pub = lire('public/js/public.js');
const dash = lire('public/js/dashboard.js');
const app = lire('public/js/app.js');
const routes = lire('server/routes.js');
const botmgr = lire('server/discord/botManager.js');
const css = lire('public/css/style.css');
const dcss = lire('public/css/dashboard.css');
const html = lire('public/index.html');
const sw = lire('public/sw.js');
const page = lire('public/index.html');

(async () => {
  console.log('— 1. Statistiques : plus de fraction, libellé accordé —');
  check('la stat n’écrit plus « enLigne/total »', !pub.includes('${onlineBots}/${totalBots}')
    && !/\$\{enLigne\}\/\$\{/.test(pub));
  check('elle affiche le nombre de bots en ligne', /countUp\(vals\[0\], String\(enLigne\)\)/.test(pub));
  check('le libellé s’accorde', /enLigne > 1 \? 'Bots en ligne' : 'Bot en ligne'/.test(pub));

  console.log('— 2. Le discriminateur #2500 ne sort plus —');
  check('écriture : le pseudo enregistré est le nom seul', /bot_username[\s\S]{0,120}me\.username/.test(botmgr)
    && !/me\.username}#\$\{?/.test(botmgr));
  check('lecture : publicBotInfo retire « #1234 »', /replace\(\/#\\d\{0,4\}\$\/, ''\)/.test(botmgr));
  check('route publique : même nettoyage pour les anciennes lignes', routes.includes('const sansDiscriminateur')
    && /username: sansDiscriminateur\(b\.bot_username\)/.test(routes));

  console.log('— 3. Français : plus de « dashboard » à l’écran —');
  const textesVisibles = (src) => {
    // Ce qui est entre balises, hors attributs : le seul texte que le visiteur
    // lit. On écarte les fragments qui sont du code (points-virgules, appels,
    // noms d'objets) : ce sont les lignes de gabarits concaténées, pas l'écran.
    const morceaux = (src.match(/>([^<>{}]{3,})</g) || [])
      .map((m) => m.slice(1, -1).trim())
      .filter((m) => !/[;()=`]|Dashboard\.|App\.|const |return /.test(m));
    return morceaux.join('\n');
  };
  check('accueil : aucun « dashboard » dans le texte', !/dashboard/i.test(textesVisibles(pub)));
  check('tableau de bord : aucun « dashboard » dans le texte', !/dashboard/i.test(textesVisibles(dash)));
  check('les libellés d’action sont nommés en français',
    dash.includes('aria-label="Se déconnecter du tableau de bord"')
    && dash.includes('aria-label="Choisir la couleur du tableau de bord"')
    && dash.includes('aria-label="Actions rapides du tableau de bord"'));
  check('pied de page : « Hoxera », « Aperçu », « Tableau de bord »',
    pub.includes('>Hoxera</a>') && pub.includes('>Aperçu</a>') && pub.includes('>Tableau de bord</a>'));
  check('la description de index.html est accentuée et en français',
    (page.match(/règles, réglés depuis un tableau de bord/g) || []).length === 4
    && !page.includes('moderation et le suivi'));

  console.log('— 3 bis. Bandeau mobile —');
  check('le bandeau colle son groupe de droite au bord',
    /\.navbar \{ justify-content: flex-end; \}/.test(css)
    && /\.navbar > \.logo-row \{ margin-right: auto; \}/.test(css));
  check('le hamburger passe après le groupe de droite (donc au bord)',
    /\.navbar-right \{ order: 2; \}[\s\S]{0,120}\.nav-burger \{ order: 3; \}/.test(css));
  check('le panneau du menu reste la dernière ligne du bandeau',
    /\.nav-menu \{ order: 4; \}/.test(css));
  check('le logo du bandeau ne plante plus sans avatar ni e-mail',
    pub.includes('(user.email || user.discord_username || \'?\')[0]')
    && !/\(user\.email\[0\]/.test(pub));

  console.log('— 3 ter. Robustesse des rendus —');
  check('le module Commandes ne plante plus sur une liste absente',
    /const attendues = Array\.isArray\(s\.wanted\) \? s\.wanted : \[\]/.test(dash));
  check('aucune liste de commandes attendues lue sans garde',
    !/s\.wanted\.length/.test(dash.replace(/attendues\.length/g, '')));

  console.log('— 4. Vouvoiement et typographie —');
  check('plus d’impératif « Rejoins »', !/\bRejoins le serveur support/.test(pub));
  check('un espace insécable précède les « ? » des questions',
    (pub.match(/\u00a0\?/g) || []).length === 7);
  check('les ternaires du script restent intacts', pub.includes(' ? ') && !pub.includes('\u00a0?\u00a0:'));

  console.log('— 5. Cibles tactiles —');
  check('pied de page et lien support portent une hauteur minimale',
    /\.hp-footer-col a,\s*\n\s*\.pub-footer-links a,\s*\n\s*\.pub-support-link a,\s*\n\s*\.nav-menu a \{[\s\S]{0,200}min-height: 40px/.test(css));
  check('le tableau de bord remonte ses petits boutons après la taille de base',
    /v378 — Cibles tactiles du tableau de bord[\s\S]{0,2000}\.dash-btn-sm \{ min-height: 40px; \}[\s\S]{0,1200}\.discord-multi-picker \.dd-add-btn \{ min-height: 40px/.test(dcss));
  check('les cases à cocher posées à la main ont 40 px de haut',
    /#dash-content label:not\(\[class\]\) \{ min-height: 40px; \}/.test(dcss));

  console.log('— 6. Icones et libellés —');
  check('le jeu de glyphes a un « plus » et une « cloche »',
    /plus: '<path d="M12 5\.2v13\.6M5\.2 12h13\.6"\/>'/.test(app) && /cloche: '<path/.test(app));
  check('la cloche de la barre haute affiche son icône', /id="d-bell"[\s\S]{0,220}App\.glyphe\('cloche'/.test(dash));
  check('les boutons « Citation » et « Lien » de l’éditeur ont un glyphe',
    /App\.glyphe\('bulle', \{ taille: 14 \}\), '> '/.test(dash)
    && /App\.glyphe\('lien', \{ taille: 14 \}\), '\[',/.test(dash));
  // On ignore les commentaires : le helper App.pluriel cite justement les
  // formes fautives pour expliquer ce qu'il remplace.
  const sansCommentaires = (src) => src.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  check('plus aucun libellé « (s) » mécanique dans le tableau de bord',
    !/membre\(s\)|étape\(s\)|jour\(s\)|heure\(s\)|ticket\(s\)|vote\(s\)|commande\(s\)|message\(s\)|bot\(s\)|question\(s\)/.test(sansCommentaires(dash))
    && !/membre\(s\)|bot\(s\)/.test(sansCommentaires(app)));
  check('App.pluriel existe et sert au compteur d’étapes',
    /App\.pluriel = \(n, un, plusieurs\)/.test(app)
    && /App\.pluriel\(doneCount, 'étape terminée', 'étapes terminées'\)/.test(dash));

  console.log('— 7. Lisibilité et repères —');
  check('la carte bot a un texte lisible en thème clair',
    /html\.hx-light #public-landing \.bot-card \.uname,[\s\S]{0,120}color: #5f6472/.test(css));
  check('la FAQ utilise un chevron, plus une croix déguisée',
    css.includes('--faq-chevron') && /\.hp-faq-item\[open\] summary::after \{ transform: rotate\(180deg\); \}/.test(css)
    && !/content: '\+'; margin-left: auto; font-size: 22px/.test(css));
  check('l’avatar d’un bot retombe sur la pastille si l’image ne charge pas',
    /const avatarBot = \(b\) => \{[\s\S]{0,300}onerror="this\.outerHTML=this\.dataset\.secours"/.test(pub));
  check('la page /bot/:id partage ce gabarit', pub.includes("avatarBot(b).replace('bot-avatar', 'pub-avatar')"));

  console.log('— 8. Version —');
  check('index.html sert la v378', (html.match(/\?v=381/g) || []).length === 7);
  check('le service worker est en v378', sw.includes("const CACHE = 'botdev-v381';"));
  check('le jeton de version n’apparaît plus nulle part en 377',
    !/v=377/.test(html) && !/v=377/.test(app) && !/botdev-v377/.test(sw));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (ko) process.exit(1);
  console.log('🎉 v378 — la capture Android ne montre plus ni fraction, ni franglais, ni cible de 16 px.');
})().catch((e) => { console.error(e); process.exit(1); });
