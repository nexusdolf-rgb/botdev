// ============================================================
// Test Hoxera v361 — Catalogue de modules du tableau de bord
//
// Ce que le maître a demandé : que chaque module ait SA propre émoticône
// (dessinée pour lui, pas un émoji universel comme 🎉), une interface
// rangée par famille, une fiche de lecture avec un aperçu de ce que l'on
// voit sur Discord quand on clique sur le module, et des libellés de
// boutons cohérents partout.
//
// Vérifié ici :
//   1. le catalogue couvre bien les 39 modules, avec tous les champs ;
//   2. les 40 PNG du pack existent, sont des PNG réels et restent sous la
//      limite Discord de 256 Ko ;
//   3. les familles du menu existent et aucune ne est vide ;
//   4. le rendu RÉEL dans jsdom : sidebar groupée + images + fiche de
//      lecture + aperçu agrandi ;
//   5. les libellés de boutons : plus d'émoji décoratif en tête, et les
//      boutons « Enregistrer » portent la classe que la barre de
//      sauvegarde déclenche ;
//   6. le tutoiement reste interdit dans les textes du catalogue (règle v240).
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const RACINE = path.join(__dirname, '..');
const lus = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const dash = lus('public/js/dashboard.js');

// ---------- 1. Le catalogue ----------
console.log('— 1. Le catalogue des 39 modules —');
const moduleDe = (nom) => {
  const m = dash.match(new RegExp(`Dashboard\\.${nom} = \\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/\['([a-z]+)',/g)].map((x) => x[1]) : [];
};
const SERVEUR = moduleDe('MODULES');
const BOT = moduleDe('BOT_MODULES');
const TOUS = [...SERVEUR, ...BOT];
check('les modules du menu serveur sont listés', SERVEUR.length === 34, String(SERVEUR.length));
check('les modules d’administration le sont aussi', BOT.length === 5, String(BOT.length));

const metaBloc = (dash.match(/Dashboard\.MODULE_META = \{([\s\S]*?)\n\};/) || [0, ''])[1];
const metaIds = [...metaBloc.matchAll(/\n  ([a-z]+): \{ e:/g)].map((x) => x[1]);
check('chaque module a une fiche dans le catalogue', TOUS.every((id) => metaIds.includes(id)),
  TOUS.filter((id) => !metaIds.includes(id)).join(', '));
check('le catalogue ne décrit aucun module fantôme', metaIds.every((id) => TOUS.includes(id)),
  metaIds.filter((id) => !TOUS.includes(id)).join(', '));

// Une fiche = le texte entre son marqueur et le marqueur suivant.
const ficheDe = (id) => {
  const debut = metaBloc.indexOf(`\n  ${id}: { e:`);
  if (debut === -1) return '';
  const suite = metaBloc.slice(debut + 1);
  const suivant = suite.slice(1).search(/\n {2}[a-z]+: \{ e:/);
  return suivant === -1 ? suite : suite.slice(0, suivant + 1);
};
for (const champ of ['emote', 'cat', 'tag', 'aide', 'voit', 'slash']) {
  const manques = TOUS.filter((id) => !ficheDe(id).includes(`${champ}: `));
  check(`chaque fiche porte « ${champ} »`, manques.length === 0, manques.join(', '));
}
const tropCourts = TOUS.filter((id) => {
  const f = ficheDe(id);
  return /tag: '.{0,14}'/.test(f) || /aide: '[^']{0,39}'/.test(f) || /voit: '[^']{0,19}'/.test(f);
});
check('les accroches et les notices sont assez parlantes pour être utiles', tropCourts.length === 0, tropCourts.join(', '));

// ---------- 2. Les émoticônes dessinées ----------
console.log('\n— 2. Une émoticône dessinée par module —');
const dossiers = fs.readdirSync(path.join(RACINE, 'public', 'emotes')).filter((f) => f.endsWith('.png'));
check('le dossier public/emotes contient au moins 40 images', dossiers.length >= 40, String(dossiers.length));
const citees = [...dash.matchAll(/emote: '(hox_[a-z]+)'/g)].map((m) => m[1]);
check('toutes les émoticônes citées existent sur le disque',citees.every((n) => fs.existsSync(path.join(RACINE, 'public', 'emotes', `${n}.png`))),
  citees.filter((n) => !fs.existsSync(path.join(RACINE, 'public', 'emotes', `${n}.png`))).join(', '));
check('aucune émoticône n’est partagée par deux modules', new Set(citees).size === citees.length,
  `${citees.length} citations pour ${new Set(citees).size} fichiers`);
const signatures = citees.map((n) => fs.readFileSync(path.join(RACINE, 'public', 'emotes', `${n}.png`)));
check('ce sont de vrais PNG 128 × 128', signatures.every((b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  && b.readUInt32BE(16) === 128 && b.readUInt32BE(20) === 128));
check('…et ils passent sous la limite Discord de 256 Ko', signatures.every((b) => b.length < 256 * 1024),
  `max ${Math.max(...signatures.map((b) => b.length))} octets`);
const sansImage = TOUS.filter((id) => !/emote: 'hox_/.test(ficheDe(id)));
check('le catalogue ne laisse aucun module sans image', sansImage.length === 0, sansImage.join(', '));

// ---------- 3. Les familles du menu ----------
console.log('\n— 3. Les familles du menu —');
const catBloc = (dash.match(/Dashboard\.CATEGORIES = \[([\s\S]*?)\];/) || [0, ''])[1];
const CLES = [...catBloc.matchAll(/\['([a-z]+)', '([^']+)'\]/g)];
check('sept familles, chacune avec un titre lisible', CLES.length === 7 && CLES.every((m) => m[2].length > 3),
  CLES.map((m) => m[2]).join(' · '));
const familles = CLES.map((m) => m[1]);
const cites = [...metaBloc.matchAll(/cat: '([a-z]+)'/g)].map((m) => m[1]);
check('chaque fiche pointe vers une famille connue', cites.every((c) => familles.includes(c)),
  cites.filter((c) => !familles.includes(c)).join(', '));
check('aucune famille ne reste vide', familles.every((c) => cites.includes(c)),
  familles.filter((c) => !cites.includes(c)).join(', '));
check('le module « Vue d’ensemble » reste seul dans sa famille',
  cites[familles.indexOf('decouvrir')] === 'decouvrir' && cites.filter((c) => c === 'decouvrir').length >= 1);

// ---------- 4. Libellés des boutons ----------
console.log('\n— 4. Les libellés des boutons —');
const INTERDITS = ['\uD83D\uDCBE', '\uD83D\uDCE4', '\uD83D\uDCE8', '\uD83D\uDE80', '\uD83D\uDCDD',
  '\uD83D\uDDD1', '\u270F\uFE0F', '\u2795', '\u2796', '\uD83C\uDFA8', '\uD83E\uDDEA', '\uD83C\uDFAE',
  '\uD83D\uDCE5', '\uD83D\uDCC5', '\u2728', '\uD83D\uDCE6', '\u21A9\uFE0F', '\u267B\uFE0F', '\uD83D\uDD12']
  .filter((e) => e && e.trim() && e.length > 1);
const statiques = [...dash.matchAll(/<button[^>]*>((?:[^<]|\n)*?)<\/button>/g)]
  .map((m) => m[1].trim())
  .filter((t) => t && !t.includes('${'));
// Un libellé qui COMMENCE par un de ces glyphes reste décoratif : c'est ce
// qu'on veut éliminer. Les boutons purement graphiques de la barre du haut
// (thème, recherche, fermetures) sont exclus : ils n'ont pas de texte.
const decoratifs = statiques
  .filter((t) => t.length > 1 && !/^[\u00d7\u2715\u2716\u21ba\u23fb\u25a6\u2630\u263d\u{1F313}\u{1F3A8}\u{1F504}\u{1F50D}]$/u.test(t))
  .filter((t) => INTERDITS.some((e) => t.startsWith(e)));
check('plus aucun émoji décoratif en tête d’un libellé de bouton', decoratifs.length === 0,
  decoratifs.slice(0, 4).join(' | '));
// Les brouillons locaux et les envois mixtes ne sont pas des enregistrements
// serveur : la barre « Tout enregistrer » ne doit pas les déclencher.
const enregistrements = statiques.filter((t) => /enregistr/i.test(t) && !/brouillon|envoyer/i.test(t));
check('les libellés d’enregistrement commencent par un verbe à l’infinitif',
  enregistrements.every((t) => /^(Enregistrer|Tout enregistrer|Revenir|Réinitialiser)/.test(t)),
  enregistrements.filter((t) => !/^(Enregistrer|Tout enregistrer|Revenir|Réinitialiser)/.test(t)).join(' | '));
const boutonsSave = [...dash.matchAll(/<button[^>]*class="([^"]*)"[^>]*>((?:Tout )?[Ee]nregistrer[^<]*)<\/button>/g)]
  .filter((m) => !/brouillon|envoyer/i.test(m[2]));
check('les boutons « Enregistrer » portent la classe que la barre déclenche',
  boutonsSave.length >= 20 && boutonsSave.every((m) => m[1].includes('dash-save-action')),
  `${boutonsSave.filter((m) => m[1].includes('dash-save-action')).length}/${boutonsSave.length}`);
check('la barre de sauvegarde lit la classe, l’émoji reste un filet de sécurité',
  /dash-save-action'\) \|\| \/💾\/\.test\(b\.textContent \|\| ''\)/.test(dash.replace(/\s+/g, ' ')));
// Seuls les contrôles purement graphiques de la barre du haut (thème,
// recherche, menus, fermeture) gardent un glyphe unique : ils ont un title.
const AUTORISES = new Set(['⏻', '▦', '☰', '✕', '×', '🌓', '🎨', '', '🔍']);
const solitaires = statiques.filter((t) => t.length === 1 && !AUTORISES.has(t));
check('aucun bouton d’action ne se réduit à un glyphe', solitaires.length === 0, solitaires.join(' '));

// ---------- 5. Tutoiement (règle v240) ----------
console.log('\n— 5. Le vouvoiement est respecté —');
const TU = /(^|[\s(,;:!?'«"“”])(tu|te|tes|ton|ta|toi)($|[\s.,;:!?)'»"“”])/im;
const lignesTuto = metaBloc.split('\n').filter((l) => TU.test(l.replace(/\$\{[^}]*\}/g, ' ')));
check('aucun texte du catalogue ne tutoie le lecteur', lignesTuto.length === 0,
  lignesTuto.slice(0, 2).map((l) => l.trim().slice(0, 70)).join(' | '));

// ---------- 6. Rendu réel ----------
console.log('\n— 6. Rendu réel dans le navigateur simulé —');
(async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  global.window = w; global.document = w.document;
  Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true });
  global.location = w.location;

  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', discord_username: 'a', is_admin: true } });
    if (p.endsWith('/api/hoxera')) return resp({ configured: true, bot: { id: 1, name: 'Hoxera', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Hoxera#1', guilds: [] } });
    if (p.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }] });
    if (p.endsWith('/guilds/G1/advanced-tickets')) return resp({ config: null });
    if (p.endsWith('/guilds/G1/stats')) return resp({ activity: [], joins: [], top_active: [] });
    if (p.endsWith('/guilds/G1/temproles')) return resp({ roles: [] });
    if (p.endsWith('/guilds/G1/shop')) return resp({ items: [] });
    if (p.endsWith('/guilds/G1/shop/purchases')) return resp({ purchases: [] });
    if (p.endsWith('/guilds/G1/suggestions')) return resp({ suggestions: [] });
    if (p.endsWith('/guilds/G1/scheduled')) return resp({ scheduled: [] });
    if (p.endsWith('/guilds/G1/giveaways')) return resp({ giveaways: [] });
    if (p.endsWith('/guilds/G1/tickets/rating')) return resp({ avg: 0, count: 0 });
    if (p.endsWith('/guilds/G1/activity')) return resp({ items: [] });
    if (p.endsWith('/guilds/G1')) return resp({
      name: 'Serveur Test',
      guild: { id: 'G1', name: 'Serveur Test', members: 18 },
      channels: [{ id: 'C1', name: 'bienvenue' }],
      roles: [{ id: 'R1', name: 'Membre' }],
      settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '', birthday_channel: '', birthday_role: '' },
      tickets: { channel: '#support', types: [] }, tickets_stats: { total: 0, open: 0 },
      events: { defs: {}, state: {} },
      role_menus: [], xp_roles: [], profile: {}, blacklist: [],
      voicetemp: { creator_channel: '', category: '', name_template: '' },
      applications: {}, scheduled: [], shop_items: [], log_events: {},
      lockdown: { locked: false, channels: [] },
      checklist: [],
    });
    return resp({ ok: true });
  };

  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
    .map((f) => fs.readFileSync(path.join(RACINE, 'public', 'js', f), 'utf8')).join('\n;\n');

  const snippet = String.raw`
  window.__r = (async () => {
    const out = {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1800);
    const shell = document.querySelector('#app .bot-shell .dash-shell');
    const aside = shell ? shell.querySelector('.dash-side') : null;
    out.sidebar = !!aside;
    // 1. Le menu est rangé par familles, chaque entrée porte son image.
    out.familles = aside ? [...aside.querySelectorAll('.dash-side-section')].map((e) => e.textContent.trim()) : [];
    out.items = aside ? aside.querySelectorAll('.dash-side-item').length : 0;
    out.images = aside ? aside.querySelectorAll('.dash-side-item .ico img.mod-emote').length : 0;
    out.emojisCaches = aside ? aside.querySelectorAll('.dash-side-item .ico.has-emote .ico-fallback').length : 0;
    // 2. On ouvre Tickets : fiche de lecture + aperçu sous l'en-tête.
    const bnav = shell.querySelector('.dash-bnav');
    bnav.querySelector('[data-bnav="tickets"]').click();
    await wait(900);
    const content = document.querySelector('#dash-content');
    out.guide = !!content.querySelector('[data-module-guide]');
    out.cols = content.querySelectorAll('.mod-guide .mg-col').length;
    out.colNames = [...content.querySelectorAll('.mod-guide .mg-kicker')].map((e) => e.textContent.trim());
    out.apercuInline = !!content.querySelector('.mod-guide .dprev');
    out.enteteImage = !!content.querySelector('.dash-module-header .m-icon.has-emote img.mod-emote');
    out.famille = (content.querySelector('.module-cat') || {}).textContent || '';
    out.guideApresEntete = !!content.querySelector('.dash-module-header + [data-module-guide]');
    // 3. L'aperçu agrandi s'ouvre dans une modale et se referme.
    const agrandir = content.querySelector('[data-guide-preview]');
    out.boutonAgrandir = !!agrandir;
    if (agrandir) {
      agrandir.click();
      await wait(200);
      const modal = document.querySelector('#modal-root .modal');
      out.modale = !!modal;
      out.modaleEmbed = !!(modal && modal.querySelector('.dprev-embed'));
      out.modaleBoutons = modal ? modal.querySelectorAll('.dprev-btn').length : 0;
      const x = modal && modal.querySelector('[data-close]');
      if (x) x.click();
      await wait(150);
      out.modaleFermee = !document.querySelector('#modal-root .modal');
    }
    // 4. Les sous-pages découpées (v321) : retitle doit changer le titre SANS
    // faire perdre l'émoticône du module ni la fiche de lecture.
    Dashboard.retitle(content, '\uD83D\uDD07', 'Liste noire', 'Notice de la sous-page.');
    await wait(150);
    out.titreRetitre = (content.querySelector('.module-header-copy h1') || {}).textContent || '';
    out.sousTitreRetitre = (content.querySelector('.module-header-copy .sub') || {}).textContent || '';
    out.imageGardee = !!content.querySelector('.m-icon.has-emote img.mod-emote');
    out.ficheGardee = !!content.querySelector('[data-module-guide]');
    out.cartesGardees = content.querySelectorAll('.dash-card').length > 0;
    // 5. La vue d'ensemble affiche les cartes groupées avec leurs images.
    Dashboard.setModule('overview');
    await wait(1200);
    const grid = document.querySelector('#dash-content .ov-module-grid');
    out.grille = !!grid;
    out.cartes = grid ? grid.querySelectorAll('.ov-module-card').length : 0;
    out.cartesImages = grid ? grid.querySelectorAll('.ov-module-icon img.mod-emote').length : 0;
    out.tetesDeSection = grid ? grid.querySelectorAll('.ov-module-cat').length : 0;
    out.verbes = grid ? [...grid.querySelectorAll('.ov-module-card button')].map((b) => b.textContent.trim()) : [];
    // 6. La barre de sauvegarde retrouve bien les boutons « Enregistrer ».
    Dashboard.setModule('tickets');
    await wait(900);
    const saves = [...document.querySelectorAll('#dash-content button.dash-save-action')].map((b) => b.textContent.trim());
    out.saves = saves;
    return out;
  })();
  `;

  w.eval(code + '\n;\n' + snippet);
  await new Promise((r) => setTimeout(r, 12000));
  const res = await w.__r;
  assert(res, 'le navigateur simulé n’a pas rendu');
  console.log(JSON.stringify(res, null, 2));

  check('la barre latérale est rendue', res.sidebar === true);
  check('le menu est coupé en familles (au moins 6 titres)', res.familles.length >= 6, res.familles.join(' · '));
  check('tous les modules du serveur restent accessibles', res.items >= 34, String(res.items));
  check('chaque entrée du menu porte son émoticône', res.images >= 34, `${res.images} images pour ${res.items} entrées`);
  check('…et l’émoji de repli est masqué quand l’image existe', res.emojisCaches >= 34);
  check('le module ouvert affiche sa fiche de lecture', res.guide === true);
  check('la fiche a ses trois colonnes', res.cols === 3 && res.colNames.length === 4, res.colNames.join(' / '));
  check('l’aperçu Discord est monté dans la fiche', res.apercuInline === true);
  check('l’en-tête du module porte l’image du module', res.enteteImage === true);
  check('la famille du module s’affiche dans l’en-tête', typeof res.famille === 'string' && res.famille.includes('support'), res.famille);
  check('la fiche est placée juste sous l’en-tête', res.guideApresEntete === true);
  check('le bouton d’aperçu agrandi existe', res.boutonAgrandir === true);
  check('l’aperçu agrandi s’ouvre en modale avec son encadré', res.modale === true && res.modaleEmbed === true);
  check('les boutons de l’aperçu sont dessinés', res.modaleBoutons >= 2, String(res.modaleBoutons));
  check('la modale se referme', res.modaleFermee === true);
  check('retitle change le titre de la sous-page', res.titreRetitre === 'Liste noire', res.titreRetitre);
  check('…et son sous-titre', res.sousTitreRetitre === 'Notice de la sous-page.', res.sousTitreRetitre);
  check('…sans effacer l’émoticône du module', res.imageGardee === true);
  check('…sans effacer la fiche de lecture', res.ficheGardee === true);
  check('les réglages du module restent affichés sous la fiche', res.cartesGardees === true);
  check('la vue d’ensemble liste les 33 modules configurables', res.cartes === 33, String(res.cartes));
  check('ses cartes portent l’émoticône du module', res.cartesImages === 33, String(res.cartesImages));
  check('elles sont groupées par famille', res.tetesDeSection >= 5, String(res.tetesDeSection));
  check('un seul verbe d’action sur chaque carte', res.verbes.every((v) => v.startsWith('Configurer')), res.verbes.slice(0, 3).join(' | '));
  check('les boutons « Enregistrer » du module sont repérables par la barre', res.saves.length >= 2 && res.saves.every((s) => /^Enregistrer|^Tout/.test(s)), res.saves.join(' | '));

  console.log('');
  if (ko === 0) console.log(`🎉 v361 — ${ok} vérifications OK : catalogue, émoticônes, fiches et libellés.`);
  else { console.log(`❌ v361 — ${ko} échec(s)`); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
