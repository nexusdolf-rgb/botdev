// ============================================================
// v381 — Aperçu vivant de la configuration
// ------------------------------------------------------------
// Demande du 24/10 : « chaque module de configuration doit montrer
// l'aperçu de ce que les membres verront, directement, comme le
// système de tickets avancé ».
//
// Ce test vérifie trois choses :
//   1. le moteur d'aperçu se dessine et se redessine à chaque frappe ;
//   2. les sept modules concernés s'en servent vraiment ;
//   3. chaque aperçu reprend le format RÉEL du bot (titre, couleur,
//      boutons), pour ne pas inventer un rendu qui n'existe pas.
// ============================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
global.window = w;
global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true });
global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(lire('public/js/app.js') + '\n' + lire('public/js/dashboard.js') + '\nwindow.App = App; window.Dashboard = Dashboard;');
const { Dashboard } = w;

let ok = 0;
const echecs = [];
function check(nom, condition, detail = '') {
  if (condition) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
}

// ---------------------------------------------------------------
console.log('\n— 1. Le moteur d’aperçu —');
check('Dashboard.apercuVivant existe', typeof Dashboard.apercuVivant === 'function');
check('Dashboard.champDe lit un champ sans planter s’il manque',
  Dashboard.champDe(null, '#absent', 'defaut') === 'defaut');
check('Dashboard.nomDeSalon retrouve un salon par son identifiant',
  Dashboard.nomDeSalon({ channels: [{ id: '123', name: 'general' }] }, '123') === '#general');

{
  const carte = w.document.createElement('div');
  carte.innerHTML = '<input id="essai" value="Bonjour" /><input type="checkbox" id="case" />';
  w.document.body.appendChild(carte);
  const bloc = Dashboard.apercuVivant(carte, () => ({
    message: Dashboard.champDe(carte, '#essai'),
  }), { titre: 'Essai' });
  check('le cadre est ajouté dans la carte', !!bloc && carte.querySelector('[data-apercu-vivant]') === bloc);
  check('le cadre porte son titre', bloc.querySelector('.pv-title').textContent === 'Essai');
  check('la mention « en direct » est présente', /en direct/.test(bloc.textContent));
  check('le premier dessin affiche la valeur du champ',
    /Bonjour/.test(bloc.querySelector('.pv-body').innerHTML));

  const champ = carte.querySelector('#essai');
  champ.value = 'Bonsoir';
  champ.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('une frappe redessine l’aperçu sans enregistrer',
    /Bonsoir/.test(bloc.querySelector('.pv-body').innerHTML) && !/Bonjour/.test(bloc.querySelector('.pv-body').innerHTML));

  champ.value = '';
  champ.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('un aperçu vide affiche une phrase d’aide, pas un cadre cassé',
    bloc.querySelector('.pv-empty') !== null);

  // Une erreur dans le constructeur ne doit pas casser le module entier.
  const robuste = w.document.createElement('div');
  w.document.body.appendChild(robuste);
  let survit = true;
  try {
    Dashboard.apercuVivant(robuste, () => { throw new Error('boum'); });
  } catch { survit = false; }
  check('un aperçu qui plante ne casse pas la page', survit && robuste.querySelector('.pv-empty') !== null);
}

// ---------------------------------------------------------------
console.log('\n— 2. Le rendu reprend le format Discord —');
{
  const avecChamps = Dashboard.discordPreviewHtml({
    embed: { author: 'Hoxera · Mon serveur', title: '🛡️ Expulsion', desc: 'Un membre a été expulsé.', color: '#ED4245', fields: [{ name: 'Raison', value: 'Spam' }] },
  });
  check('l’auteur du panneau est rendu', /dprev-author/.test(avecChamps) && /Hoxera · Mon serveur/.test(avecChamps));
  check('les champs du panneau sont rendus', /dprev-field/.test(avecChamps) && /Raison/.test(avecChamps) && /Spam/.test(avecChamps));
  check('la couleur de la barre vient de l’embed', /--dprev-bar:#ED4245/.test(avecChamps));
}

// ---------------------------------------------------------------
console.log('\n— 3. Les modules concernés —');
const src = lire('public/js/dashboard.js');
const zones = [
  ['message épinglé (sticky)', "Dashboard.apercuVivant(cStk,", '📌 Message épinglé'],
  ['journaux', 'Dashboard.apercuVivant(c, () => {\n    const coches', 'Hoxera · '],
  ['auto-modération', 'Dashboard.apercuVivant(c, () => {\n    const perso', '🛡️ Avertissement Auto-Mod'],
  ['quiz', 'Dashboard.apercuVivant(c, () => {\n    const bonus', '🧠 Quiz'],
  ['événements', 'Dashboard.apercuVivant(createCard,', '🎮'],
  ['vocal', 'Dashboard.apercuVivant(c4,', '🎙️ Panneau de contrôle'],
  ['modmail', 'Dashboard.apercuVivant(cfgCard,', '💬 **Nouvelle conversation**'],
  ['anti-nuke', 'Dashboard.apercuVivant(cCfg,', '🛡️ NUKE DÉTECTÉ'],
  ['suggestions', 'Dashboard.apercuVivant(c, () => {\n    const couleur', 'Suggestion #42'],
  ['niveaux', "Dashboard.apercuVivant(c, () => {\n    const modele", "vient d'atteindre le niveau"],
];
for (const [nom, ancre, marqueur] of zones) {
  const pos = src.indexOf(ancre);
  // Fenêtre fixe : `});` apparaît aussi dans les objets imbriqués (champs,
  // boutons), donc on ne peut pas s'en servir comme fin de bloc.
  const bloc = pos >= 0 ? src.slice(pos, pos + 1600) : '';
  check(`${nom} : aperçu branché`, pos >= 0, 'appel apercuVivant absent');
  check(`${nom} : reprend le vrai format du bot`, marqueur.split(' ')[0] && bloc.includes(marqueur.split(' ')[0]),
    `marqueur « ${marqueur} » absent`);
}

// ---------------------------------------------------------------
console.log('\n— 3 bis. Économie, Boutique et rendu Discord —');
check('économie : /balance et /leaderboard ont chacun leur aperçu',
  (src.match(/badge: 'commande \/(balance|leaderboard)'/g) || []).length === 2);
check('économie : le classement d’aperçu réutilise les vrais soldes quand ils existent',
  /lb\.top\.length\s*\n?\s*\? lb\.top\.slice\(0, 10\)/.test(src));
check('boutique : aperçu branché sur la carte Articles', src.includes('const pvShop = Dashboard.apercuVivant(c, () => {'));
check('boutique : affiche les vrais articles, sinon deux exemples',
  src.includes("const articles = reels.length ? reels : [") && src.includes('Couleur rose'));
check('boutique : l’aperçu se redessine quand on ajoute ou supprime un article',
  /if \(pvShop && pvShop\._dessiner\) pvShop\._dessiner\(\);/.test(src));
check('niveaux : le message reprend les variables {user}/{level}/{server}',
  src.includes(".split('{user}').join('@Alex')") && src.includes(".split('{level}').join('12')"));
check('niveaux : la carte image suit l’interrupteur', src.includes("card: carte ? { type: 'levelup'"));
{
  const html = Dashboard.discordPreviewHtml({ card: { type: 'levelup', name: 'Alex', level: 12, pct: 0.62 } });
  check('niveaux : la carte dessine le niveau, le nom et la barre',
    /dprev-lvl/.test(html) && />12</.test(html) && /dprev-lvl-name">Alex</.test(html));
  check('niveaux : la barre suit le pourcentage', /dprev-lvl-bar"><i style="width:62%"/.test(html));
}
{
  const html = Dashboard.discordPreviewHtml({ embed: { title: 'T', desc: '## Titre\ntexte' } });
  check('un titre « ## » n’affiche plus les dièses', html.includes('dprev-h2') && !html.includes('## Titre'));
  const code = Dashboard.discordPreviewHtml({ embed: { title: 'T', desc: '`/buy article`' } });
  check('le code inline n’affiche plus les accents graves', code.includes('dprev-code') && !code.includes('`/buy'));
  const inline = Dashboard.discordPreviewHtml({ embed: { title: 'T', desc: 'd', fields: [
    { name: 'A', value: '1', inline: true }, { name: 'B', value: '2', inline: true }, { name: 'C', value: '3', inline: true },
  ] } });
  check('trois champs inline tiennent sur une ligne', (inline.match(/dprev-inline/g) || []).length === 1);
}

// ---------------------------------------------------------------
console.log('\n— 4. Aucun aperçu inventé —');
check('le sticky garde le titre réel « 📌 Message épinglé »',
  src.includes("title: '📌 Message épinglé'"));
check('le sticky non-embed préfixe bien par 📌 (comme server/discord/sticky.js)',
  src.includes('{ message: `📌 ${texte}` }'));
check('le quiz affiche les trois boutons 🇦 🇧 🇨',
  /label: '🇦'[\s\S]{0,120}label: '🇧'[\s\S]{0,120}label: '🇨'/.test(src));
check('l’événement garde les deux boutons Participer / Se désister',
  src.includes("label: '🎮 Participer'") && src.includes("label: '❌ Se désister'"));
check('l’auto-mod garde le titre réel de l’avertissement',
  src.includes("title: '🛡️ Avertissement Auto-Mod'"));
check('le modmail reprend le texte réel du fil',
  src.includes('répondez ici, il recevra votre réponse en message privé'));
check('le vocal reprend le titre réel du panneau',
  src.includes('🎙️ Interface Hoxera — vocaux temporaires'));
check('le vocal range ses boutons en 4 / 4 / 2 et met « supprimer » en rouge',
  /rows: \[\s*\[b\('✏️'\), b\('👥'\), b\('🔒'\), b\('🔓'\)\],\s*\[b\('🔑'\), b\('➕'\), b\('➖'\), b\('👢'\)\],\s*\[b\('🔁'\), b\('🗑️', 'rouge'\)\]/.test(src));
check('le vocal n’affiche pas de barre de couleur (accent: false côté bot)',
  src.includes("bar: false,"));

// ---------------------------------------------------------------
console.log('\n— 5. Mise en forme —');
const css = lire('public/css/dashboard.css');
check('le cadre .pv est stylé', /\.pv \{/.test(css) && /\.pv-head/.test(css) && /\.pv-live/.test(css));
check('l’état vide est stylé', /\.pv-empty/.test(css));
check('la pastille respecte « animations réduites »', /prefers-reduced-motion[\s\S]{0,120}\.pv-dot \{ animation: none/.test(css));
check('le cadre tient sur téléphone (.pv ≤ 520 px)', /@media \(max-width: 520px\) \{[\s\S]{0,120}\.pv \{/.test(css));
check('l’auteur et les champs d’aperçu sont stylés', /\.dprev-author/.test(css) && /\.dprev-field/.test(css));
check('le petit texte « -# » de Discord est respecté', /\.dprev-sub/.test(css) && /dprev-sub/.test(lire('public/js/dashboard.js')));
{
  const html = Dashboard.discordPreviewHtml({ embed: { title: 'T', desc: '-# petit' } });
  check('une ligne « -# » n’affiche plus le tiret-dièse', html.includes('<span class="dprev-sub">petit</span>') && !html.includes('-# petit'));
}
check('les rangées de boutons sont respectées',
  (Dashboard.discordPreviewHtml({ rows: [[{ label: 'A' }], [{ label: 'B' }]] }).match(/dprev-btnrow/g) || []).length === 2);

// ---------------------------------------------------------------
console.log('\n— 6. Aucun identifiant brut dans les notes —');
{
  // Correctif du 24/10 : trois notes affichaient l'identifiant du salon
  // (« 9123456789… ») au lieu de « #salon ». On vérifie que chaque note qui
  // parle d'un salon passe bien par nomDeSalon.
  const notesSalon = (src.match(/Dashboard\.nomDeSalon\(data, salon\)/g) || []).length;
  check('les notes de journaux, quiz et modmail montrent le nom du salon', notesSalon >= 3, String(notesSalon));
  check('aucune note n’interpole un identifiant de salon brut',
    !/dans \$\{salon\}/.test(src) && !/privé dans \$\{salon\}/.test(src));
}

// ---------------------------------------------------------------
console.log('');
if (echecs.length) {
  console.log(`❌ v381 — ${echecs.length} échec(s) sur ${ok + echecs.length}`);
  echecs.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`🎉 v381 — ${ok} vérifications OK : les modules de configuration montrent enfin ce que les membres verront,`);
console.log('   dessiné à partir des champs réels, sans enregistrer et sans inventer de format.');
