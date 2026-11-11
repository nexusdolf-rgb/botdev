#!/usr/bin/env node
// v391 — la refonte « une seule échelle, une seule matière » tient ses promesses
// mesurées. Ce fichier ne juge pas l'esthétique : il empêche de réintroduire
// les défauts constatés sur captures le 11/11 (Chromium, 1440 / 1024 / 390).
//
// Relevé AVANT (captures test/tools/capture-modules.js) :
//   • tickets : deux cases « undefined » (tickets_stats partiel) ;
//   • boutique : carte « Impossible de charger ce module » quand /shop répond {} ;
//   • fil d'Ariane : case grise vide (colonne d'icône du catalogue vidée) ;
//   • en-tête 1440 : copie de 296 px, sous-titre recouvert par les pastilles ;
//   • en-tête 1024 : sous-titre tronqué sous trois pastilles ;
//   • accordéon fermé : carte blanche vide de ~90 px sous le titre ;
//   • thème sombre : .dash-main restait en #36393f sous des cartes #121214 ;
//   • téléphone : barre d'actions coupée à gauche, en-tête sur 3 blocs.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lecture = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const CSS = lecture('public/css/dashboard.css');
const JS = lecture('public/js/dashboard.js');

let ok = 0;
let ko = 0;
function check(titre, condition, detail) {
  if (condition) { ok++; }
  else {
    ko++;
    console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : ''));
  }
}

// — 1. Un compteur ne dit jamais « undefined » ————————————————————————————————
check('Dashboard.nombre convertit une valeur absente en 0',
  /Dashboard\.nombre = \(v\) => \{ const n = Number\(v\); return Number\.isFinite\(n\) \? n : 0; \};/.test(JS));
check('vue d\'ensemble : le convertisseur partagé remplace le doublon local',
  JS.includes('  const nb = Dashboard.nombre;'));
check('tickets : open et total passent par le convertisseur',
  JS.includes('ts.open = Dashboard.nombre(ts.open); ts.total = Dashboard.nombre(ts.total);'));
check('vue d\'ensemble : la case statistique borne sa valeur',
  JS.includes('${App.escapeHtml(String(nb(value)))}'));
check('tickets : la coercion précède l\'affichage',
  JS.indexOf('ts.open = Dashboard.nombre') > 0 &&
  JS.indexOf('ts.open = Dashboard.nombre') < JS.indexOf('${ts.open}'));
check('libellé corrigé : « Tickets au total »',
  JS.includes('<div class="lbl">Tickets au total</div>') && !JS.includes('Ouverts au total'));

// — 2. Une réponse partielle n'ouvre pas une carte d'erreur ————————————————————
check('boutique : plus de déstructuration nue de /shop',
  !JS.includes('const { items } = await App.api(`/bots/${bot.id}/guilds/${guildId}/shop`);'));
check('boutique : /shop répond { items } ou rien',
  /const items = \(\(await App\.api\(`\/bots\/\$\{bot\.id\}\/guilds\/\$\{guildId\}\/shop`\)\) \|\| \{\}\)\.items \|\| \[\];/.test(JS));
check('boutique : historique d\'achats tolérant',
  /const purchases = \(\(await App\.api\(`\/bots\/\$\{bot\.id\}\/guilds\/\$\{guildId\}\/shop\/purchases`\)\) \|\| \{\}\)\.purchases \|\| \[\];/.test(JS));

// — 3. Le fil d'Ariane montre le pictogramme du module —————————————————————————
check('fil d\'Ariane : pastille dérivée du catalogue',
  JS.includes('const crumbIco = Dashboard.emoteFor(mod[0]);'));
check('fil d\'Ariane : pastille absente si le module n\'a pas d\'image',
  JS.includes('${crumbIco ? `<span class="crumb-ico">${crumbIco}</span>` : \'\'}'));

// — 4. L'en-tête ne recouvre plus son sous-titre ——————————————————————————————
check('en-tête : grille explicite à partir de 900 px',
  CSS.includes('grid-template-columns: auto minmax(0, 1fr) auto !important;'));
check('en-tête : les pastilles reprennent leur place à droite',
  CSS.includes('.dashboard-shell-host .module-header-meta { justify-self: end !important; flex-wrap: nowrap !important; }'));
check('en-tête : la largeur maximale de 320 px est levée sur tablette',
  CSS.includes('max-width: none !important;'));
check('en-tête : trois pastilles sur une ligne en 1 024 px (sous-titre au-dessus)',
  CSS.includes('@media (min-width: 900px) and (max-width: 1199px)'));

// — 5. L'accordéon fermé ne laisse pas une carte vide —————————————————————————
check('fiche « Comment ça marche » repliée en <details>',
  JS.includes('<details class="mod-guide mg-shell" data-module-guide>'));
check('accordéon : le corps ne s\'affiche qu\'ouvert',
  CSS.includes('display: block !important;') && JS.includes('<summary class="mg-summary">'));

// — 6. Le thème sombre a un seul fond ——————————————————————————————————————————
check('thème sombre : .dash-main suit le jeton --ui-bg',
  /\.dashboard-shell-host \.dash-main \{ background: var\(--ui-bg\) !important; \}/.test(CSS));

// — 7. Le téléphone garde une barre lisible ———————————————————————————————————
check('téléphone : les pastilles de compte ne poussent plus les icônes hors écran',
  CSS.includes('.dashboard-shell-host .dash-topbar-actions .dash-bot-chip,') &&
  CSS.includes('.dashboard-shell-host .dash-topbar-actions .dash-account-chip { display: none !important; }'));
check('téléphone : « serveur sélectionné » masqué (déjà dans le tiroir)',
  CSS.includes('html.hx-light .dashboard-shell-host .module-scope { display: none !important; }'));
check('téléphone : en-tête sur deux lignes (pictogramme + titre, pastilles dessous)',
  CSS.includes('grid-template-columns: auto minmax(0, 1fr) !important;'));

// — 8. Un sélecteur multiple = un cadre, une action ———————————————————————————
check('sélecteur multiple : une seule bordure',
  CSS.includes('width: 100% !important;') &&
  CSS.includes('.dashboard-shell-host .discord-multi-picker { flex-direction: column !important; align-items: stretch !important; }'));
check('bloc désactivé : contraste remonté de 0,45 à 0,62',
  JS.includes('opacity:.62;pointer-events:none') && !JS.includes('opacity:.45;pointer-events:none'));

// — 9. Le banc de capture mesure le vrai serveur ——————————————————————————————
const BANC = lecture('test/tools/audit-mobile.js');
check('banc : HOX_BASE respecté (plus de 127.0.0.1:3000 figé)',
  BANC.includes("const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3000';"));
check('banc : service worker bloqué pendant la mesure',
  BANC.includes("serviceWorkers: 'block',"));

console.log('');
if (ko === 0) {
  console.log(`🎉 v391 — ${ok} vérifications OK : compteurs bornés, boutique tolérante, fil d'Ariane illustré, en-tête sans recouvrement, accordéon compact, fond sombre unifié, téléphone lisible.`);
} else {
  console.log(`❌ v391 — ${ko} échec(s) sur ${ok + ko}`);
  process.exitCode = 1;
}
