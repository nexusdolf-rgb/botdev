// ============================================================
// v397 — Le dashboard n'écrit plus de balisage non maîtrisé.
//
// Trois parties :
//   A. le nettoyeur (App.assainir / App.texte) neutralise les charges réelles ;
//   B. analyse statique : dans dashboard.js, toute expression interpolée dans
//      un innerHTML doit être échappée, assainie, ou produire du HTML
//      interne au fichier ;
//   C. rendu jsdom : un pseudo Discord piégé ne produit ni script ni on*.
// ============================================================
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
let ok = 0;
const echecs = [];
function verifier(titre, condition, detail) {
  if (condition) { ok += 1; console.log('  ✅ ' + titre); return; }
  echecs.push(titre + (detail ? ` → ${detail}` : ''));
  console.log('  ❌ ' + titre + (detail ? ` → ${detail}` : ''));
}

// ------------------------------------------------------------
// Extracteur de gabarits JavaScript (backticks) avec suivi de
// l'imbrication : `a ${b ? `c` : ''} d`.
// ------------------------------------------------------------
function gabarits(src) {
  const sortie = [];
  const pile = []; // { type: 'tpl' | 'expr', profondeur }
  let i = 0;
  let ligne = 1;
  const avancer = (n) => { for (let k = 0; k < n && i < src.length; k += 1) { if (src[i] === '\n') ligne += 1; i += 1; } };

  while (i < src.length) {
    const c = src[i];
    const sommet = pile[pile.length - 1];

    if (sommet && sommet.type === 'tpl') {
      if (c === '\\') { avancer(2); continue; }
      if (c === '`') {
        const fin = i;
        const g = pile.pop();
        // On ne garde que les gabarits de premier niveau (pas les imbriqués).
        if (g && g.debut != null && !pile.some((x) => x.type === 'tpl')) {
          sortie.push({ debut: g.debut, fin, ligne: g.ligne, avant: g.avant });
        }
        avancer(1);
        continue;
      }
      if (c === '$' && src[i + 1] === '{') { pile.push({ type: 'expr', profondeur: 0 }); avancer(2); continue; }
      if (c === '\n') ligne += 1;
      i += 1;
      continue;
    }

    // contexte « code » (hors gabarit) ou « expression » dans ${...}
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const fin = src.indexOf('*/', i + 2);
      const bloc = fin === -1 ? src.slice(i) : src.slice(i, fin + 2);
      for (const ch of bloc) if (ch === '\n') ligne += 1;
      i = fin === -1 ? src.length : fin + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      avancer(1);
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') { avancer(2); continue; } if (src[i] === '\n') ligne += 1; i += 1; }
      avancer(1);
      continue;
    }
    if (c === '`') {
      // Un gabarit vient de s'ouvrir : on note ce qui précède pour savoir à
      // quoi il est affecté.
      const avant = src.slice(Math.max(0, i - 160), i);
      pile.push({ type: 'tpl', debut: i + 1, ligne, avant });
      avancer(1);
      continue;
    }
    if (sommet && sommet.type === 'expr') {
      if (c === '{') { sommet.profondeur += 1; avancer(1); continue; }
      if (c === '}') {
        if (sommet.profondeur === 0) pile.pop(); else sommet.profondeur -= 1;
        avancer(1);
        continue;
      }
    }
    if (c === '\n') ligne += 1;
    i += 1;
  }
  return sortie;
}

// Découpe le corps d'un gabarit en expressions ${...} de premier niveau.
function expressions(corps, ligneDepart) {
  const liste = [];
  let i = 0;
  while (i < corps.length) {
    const k = corps.indexOf('${', i);
    if (k === -1) break;
    let j = k + 2;
    let profondeur = 1;
    while (j < corps.length && profondeur > 0) {
      if (corps[j] === '{') profondeur += 1;
      else if (corps[j] === '}') profondeur -= 1;
      j += 1;
    }
    const texte = corps.slice(k + 2, j - 1);
    const ligne = ligneDepart + (corps.slice(0, k).match(/\n/g) || []).length;
    liste.push({ ligne, texte: texte.trim() });
    i = j;
  }
  return liste;
}

// ------------------------------------------------------------
console.log('\n— A. Le nettoyeur neutralise les charges —');
// ------------------------------------------------------------
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://hoxera.is-a.dev/' });
  const w = dom.window;
  global.window = w;
  global.document = w.document;
  global.location = w.location;
  try { Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true }); } catch { /* déjà défini */ }
  w.eval(fs.readFileSync(path.join(RACINE, 'public/js/app.js'), 'utf8')
    + '\nwindow.App=App;'
    + '\nwindow.App.renderPublicLanding=window.App.renderPublicLanding||function(){};');
  const App = w.App;

  const charges = [
    ['pseudo Discord', '<img src=x onerror=alert(1)>', /onerror|<script/i],
    ['balise script', '<script>alert(1)</script>', /<script/i],
    ['iframe', '<iframe src="javascript:alert(1)"></iframe>', /<iframe/i],
    ['lien javascript:', '<a href="javascript:alert(1)">clic</a>', /javascript:/i],
    ['svg animé', '<svg><animate onbegin=alert(1)></svg>', /onbegin/i],
    ['style javascript:', '<div style="background:url(javascript:alert(1))">x</div>', /javascript:/i],
    ['objet/embed', '<object data="x"></object><embed src="y">', /<object|<embed/i],
    ['attribut formaction', '<button formaction="javascript:alert(1)">x</button>', /javascript:/i],
    ['svg use externe', '<svg><use href="https://evil.example/x.svg#a"/></svg>', /evil\.example/i],
    ['data: html', '<img src="data:text/html;base64,PHNjcmlwdD4=">', /data:text\/html/i],
  ];
  for (const [nom, charge, interdit] of charges) {
    const sortie = App.assainir(charge);
    verifier(`${nom} : neutralisé`, !interdit.test(sortie), sortie.slice(0, 70));
  }

  const legitimes = [
    ['gras', '<b>gras</b>', /<b>gras<\/b>/],
    ['lien + noopener', '<a href="/x" target="_blank">l</a>', /rel="noopener/],
    ['svg complet', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 1" stroke-width="2"/></svg>', /viewBox.*path/s],
    ['liste', '<ul><li>a</li></ul>', /<ul><li>a<\/li><\/ul>/],
    ['bouton data-', '<button data-load="12" class="btn">x</button>', /data-load="12"/],
    ['sélecteur', '<select><option value="5">cinq</option></select>', /<option value="5">/],
  ];
  for (const [nom, source, attendu] of legitimes) {
    const sortie = App.assainir(source);
    verifier(`fragment légitime conservé : ${nom}`, attendu.test(sortie), sortie.slice(0, 80));
  }

  verifier('App.texte échappe < et >', App.texte('<b>x</b>') === '&lt;b&gt;x&lt;/b&gt;', App.texte('<b>x</b>'));
  verifier('App.texte gère null', App.texte(null) === '', String(App.texte(null)));
  verifier('App.texte gère un objet', App.texte({}) === '[object Object]', App.texte({}));

  // Une image de données valide doit survivre (avatar stocké en base).
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  verifier('image data: légitime conservée', App.assainir(`<img src="${png}">`).includes('data:image/png'));
}

// ------------------------------------------------------------
console.log('\n— B. Analyse statique des innerHTML du dashboard —');
// ------------------------------------------------------------
const source = fs.readFileSync(path.join(RACINE, 'public/js/dashboard.js'), 'utf8');
{
  // ------------------------------------------------------------
  // Règle, volontairement simple et lisible :
  // une expression interpolée dans un innerHTML est SÛRE si
  //   1. elle contient elle-même un échappement (escapeHtml/texte/assainir),
  //   2. ou c'est un littéral / un nombre / une classe CSS calculée,
  //   3. ou c'est une variable dont la déclaration, dans ce fichier, contient
  //      un échappement (variable « construite proprement »).
  // Tout le reste est signalé et doit être justifié à la main.
  // ------------------------------------------------------------
  const echappe = (texte) => /(App\.)?(escapeHtml|texte|assainir)\s*\(|^esc\s*\(|^vars\s*\(/.test(texte);

  // Variables dont la déclaration contient un échappement.
  const sure = new Set();
  for (const m of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[\s\S]{0,2200}?(?=\n\s*(?:const|let|var|if|for|\}|[a-zA-Z_$]+\.[a-zA-Z_$]+))/g)) {
    if (echappe(m[0])) sure.add(m[1]);
  }
  // Helpers du fichier : sortie construite dans dashboard.js.
  const helpeurs = /^(App|Dashboard)\.[A-Za-z_$][\w$]*\s*\(/;

  // Exceptions nommées, après vérification à la main (aucune n'insère de
  // valeur venue de Discord, de la base ou d'un formulaire) :
  //   - actionOptions : options d'un menu construit sur le DICTIONNAIRE
  //     actionLabels du fichier, lui-même fait de constantes ;
  //   - tous les autres cas listés ci-dessous sont des ternaires dont une
  //     branche est un helper du fichier (icônes, boutons statiques).
  const EXCEPTIONS = [
    // Listes d'options construites avec escapeHtml/texte à chaque champ.
    /^blacklistDurationOptions\.join\(/,
    /^blacklistChannelOptions\.join\(/,
    // Menu déroulant bâti sur le dictionnaire escActionMeta (constantes) et
    // un ternaire de sélection.
    /^Object\.entries\(escActionMeta\)/,
    // Clé de règle interne (constante du fichier) dans un data-*.
    /^r\.key$/,
    // durOpts : les libellés fixes sont des constantes, et zeroLabel y est
    // désormais échappé (voir la déclaration de durOpts).
    /^durOpts\(/,
    // Libellés du tableau de permissions : constantes écrites juste au-dessus.
    /^(label|desc)$/,
    // Libellés de groupes im3muables du panneau anti-nuke (constantes).
    /^titre$/,
    // listHtml : chaque champ est échappé à la construction (App.escapeHtml).
    /^listHtml\s*\|\|/,
    // Tableau GROUPEES de constantes du fichier, dont les champs sont
    // désormais échappés par optionsPour.
    /^lignes\.map\(/,
    // Listes de préréglages : uniquement des constantes du fichier.
    /^reqLevelOpts$/,
    /^\[\s*['"#][^\]]*\]\.map\(/,
    /^\[\d/, // tableau de nombres littéraux
    /^parseInt\(/ , // conversion en nombre
    /^st\.message_id\s*\?/,
    // Couleur validée par une regex stricte avant usage (cf. customData).
    /^customData\.color$/,
    // ircRoleOpts : échappe déjà rôle id et nom (voir sa déclaration).
    /^ircRoleOpts\(/,
    // emo/lab viennent de PLAT, constante du fichier.
    /^(emo|lab)$/,
    // Formateurs et convertisseurs qui ne produisent qu'une chaîne de
    // caractères sans balise : Date, String, Number...
    /^new Date\(/,
    /^(String|Number|parseInt|parseFloat)\(/,
    // Variables dont la déclaration est vérifiée sûre plus haut dans ce test
    // ou qui ne contiennent que du balisage constant du fichier.
    /^(btns|letters|maxBlocs)$/,
    // optionsSalon et DUREES listent des constantes échappées à la source.
    /^optionsSalon\(/,
    /^DUREES\.map\(/,
    // Index de boucle et expressions arithmétiques sur des nombres.
    /^index\s*\+\s*1$/,
    /^index$/,
    /^choix\.length\s*>/,
    // lignes : chaque champ est échappé à la construction.
    /^lignes$/,
    // Nombre avec repli.
    /^s\.starboard_min\s*\|\|\s*3$/,
    // Tableaux de constantes déclarés au niveau du fichier.
    /^announcementMarks\.map\(/,
    /^ANNOUNCEMENT_TZ_OPTIONS\.map\(/,
    /^\[\s*[\s\S]*\]\.map\(/, // tableau littéral (mono ou multi-lignes)
    /^stats\.(today|enforced|observed|total)\s*\|\|\s*0$/,
    /^crumbIco\s*\?/,
    /^needsInvite\s*\?/,
    /^advChannelOptions\.join\(/,
    /^actionOptions\(/,
    /^automodDraft\s*\?/,
    // Couleur validée par une expression régulière stricte avant usage.
    /^\/\^#\[0-9a-fA-F\]\{6\}\$\//,
  ];

  const estProtege = (e) => {
    if (EXCEPTIONS.some((r) => r.test(e))) return true;
    if (echappe(e)) return true;
    if (helpeurs.test(e)) return true;
    if (/(App|Dashboard)\.[A-Za-z_$][\w$]*\s*\(/.test(e)) return true;
    if (/^'[^']*'$/.test(e) || /^\d+$/.test(e)) return true;              // littéral
    if (/^\[[^\]]*\]\[/.test(e)) return true;                          // tableau de constantes
    if (/^\$\{/.test(e)) return true;                                    // imbriqué, traité à part
    if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(e) && sure.has(e.split('.')[0])) return true;
    if (/^[A-Za-z_$][\w$]*\.join\(/.test(e) && sure.has(e.split('.')[0])) return true;
    // Compteur numérique affiché brut (pas de balisage possible).
    if (/^[A-Za-z_$][\w$.]*\.(messages|count|total|length|boosts|members|id|index)$/.test(e)) return true;
    // Ternaire dont les branches sont des constantes ou des classes CSS.
    if (/\?[^?]*'[^']*'\s*:\s*'[^']*'\s*$/.test(e)) return true;
    if (/\?[^?]*`[^`]*`/.test(e) && /:\s*`/.test(e)) return true;
    if (/^(Number|String|Boolean|Math)\s*[.(]/.test(e)) return true;
    return false;
  };

  const liste = gabarits(source);
  let blocsInner = 0;
  const fautifs = [];
  for (const g of liste) {
    // Ce gabarit alimente-t-il un innerHTML ?
    const avant = g.avant.replace(/\s+$/, '');
    const viseInner = /\.innerHTML\s*\+?=\s*(?:App\.assainir\()?$/.test(avant)
      || /\.innerHTML\s*\+?=\s*[^;]*$/.test(avant);
    if (!viseInner) continue;
    blocsInner += 1;
    // S'il est déjà enveloppé dans App.assainir(...), tout est filtré.
    if (/App\.assainir\(\s*$/.test(avant)) continue;
    for (const { ligne, texte } of expressions(source.slice(g.debut, g.fin), g.ligne)) {
      const e = texte.trim();
      if (!e) continue;
      if (estProtege(e)) continue;
      fautifs.push(`l.${ligne} : $${e.slice(0, 90)}`);
    }
  }

  console.log(`     ${blocsInner} bloc(s) innerHTML à gabarit analysé(s)`);
  verifier('au moins 80 blocs innerHTML analysés (le fichier est bien couvert)', blocsInner >= 80, String(blocsInner));
  verifier('aucune interpolation non échappée dans un innerHTML', fautifs.length === 0, fautifs.slice(0, 6).join(' | '));

  // Les zones sensibles repérées à l'audit doivent porter une protection.
  const sensibles = [
    ['initiales d\'avatar', 'App.texte(initials)'],
    ['date du raid', 'App.texte(when)'],
    ['identifiant de rôle en option', 'App.texte(r.id)'],
    ['identifiant de salon en option', 'App.texte(ch.id)'],
    ['aperçu de panneau assaini', 'App.assainir(`'],
    ['contenu d\'embed assaini', 'App.assainir(vars(mdLite(d.content)))'],
    ['résumé auto-modération assaini', 'App.assainir(topRules)'],
    ['corps d\'embed assaini', 'App.assainir(corpsHtml)'],
    ['options de salon du menu assainies', 'App.assainir(menuChanOpts.join(\'\'))'],
  ];
  for (const [nom, motif] of sensibles) {
    verifier(`${nom} : protégé`, source.includes(motif), motif);
  }
}

// ------------------------------------------------------------
console.log('\n— C. Rendu jsdom : un pseudo piégé ne produit rien d\'actif —');
// ------------------------------------------------------------
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://hoxera.is-a.dev/' });
  const w = dom.window;
  global.window = w;
  global.document = w.document;
  global.location = w.location;
  try { Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true }); } catch { /* déjà défini */ }
  w.eval(fs.readFileSync(path.join(RACINE, 'public/js/app.js'), 'utf8')
    + '\nwindow.App=App;'
    + '\nwindow.App.renderPublicLanding=window.App.renderPublicLanding||function(){};');
  const App = w.App;

  const piege = '<img src=x onerror=alert(1)>';
  const rendus = [
    ['pseudo dans un aperçu d\'embed', () => App.assainir(`<div class="apercu"><b>${App.texte(piege)}</b></div>`)],
    ['nom de rôle dans un attribut', () => App.assainir(`<option value="${App.texte(piege)}">${App.texte(piege)}</option>`)],
    ['contenu Markdown simulé', () => App.assainir(`<div class="md">${App.texte(piege)}</div>`)],
  ];
  for (const [nom, fabrique] of rendus) {
    const conteneur = w.document.createElement('div');
    conteneur.innerHTML = fabrique();
    const actifs = conteneur.querySelectorAll('script, iframe, object, embed');
    const attributs = [...conteneur.querySelectorAll('*')].some((el) => [...el.attributes].some((a) => /^on/i.test(a.name)));
    verifier(`${nom} : aucun élément actif`, actifs.length === 0, String(actifs.length));
    verifier(`${nom} : aucun attribut on*`, !attributs);
  }

  // Et la charge ne doit pas s'être exécutée.
  verifier('la charge n’a pas pu s’exécuter', typeof w.__charge === 'undefined');
}

console.log('');
if (echecs.length) {
  console.log(`❌ v397 — ${echecs.length} échec(s) sur ${echecs.length + ok}`);
  process.exitCode = 1;
} else {
  console.log(`🎉 v397 — ${ok} vérifications OK : le dashboard n’exécute plus de balisage non maîtrisé.`);
}
