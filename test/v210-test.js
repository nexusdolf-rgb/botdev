// Test v210 — Carte image de montée de niveau (XP)
// --------------------------------------------------
// v210 ajoute une carte générée (avatar + « Niveau X » + barre de
// progression) à l'annonce de montée de niveau — comme la carte de
// bienvenue. Option par serveur, activée par défaut, jamais bloquante.
const assert = require('assert');
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const community = require('../server/discord/community');

const db = read('server/db.js');
const routes = read('server/routes.js');
const xp = read('server/discord/xp.js');
const communityJs = read('server/discord/community.js');
const dash = read('public/js/dashboard.js');
const index = read('public/index.html');
const sw = read('public/sw.js');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

console.log('▶ v210-test.js');

// ---------- 1. Génération de la carte (pure) ----------
console.log('— Carte de niveau : SVG —');
const svg = community.levelUpCardSvg({ name: 'OptiPrime', server: 'Serveur Test', level: 7, pct: 0.5 });
check('svg : « Niveau 7 »', svg.includes('Niveau 7'));
check('svg : pseudo présent', svg.includes('OptiPrime'));
check('svg : barre de progression 50 % → 260/520', svg.includes('width="260"') && svg.includes('width="520"'));
check('svg : ne dépasse jamais 100 %', community.levelUpCardSvg({ level: 1, pct: 2 }).includes('width="520"'));
check('svg : échappe les caractères <>&', community.levelUpCardSvg({ name: 'A&B<C>', level: 1 }).includes('A&amp;B&lt;C&gt;'));
check('community : levelUpCard exportée (génère un PNG)', typeof community.levelUpCard === 'function');

// ---------- 2. Réglage par serveur (db + routes) ----------
console.log('— Réglage xp_card —');
check('db : colonne xp_card (migration ALTER)', db.includes('ADD COLUMN xp_card INTEGER DEFAULT 1'));
check('db : xp_card dans la liste des colonnes', db.includes("'xp_card',"));
check('db : défaut activé (1) sauf si 0/false', db.includes('xp_card: (next.xp_card === 0 || next.xp_card === false) ? 0 : 1,'));
check('routes : accepte « card » du dashboard', routes.includes('roles, card } = req.body') && routes.includes('xp_card: (card === false || card === 0) ? 0 : 1,'));

// ---------- 3. Annonce : carte branchée (non bloquante) ----------
console.log('— Annonce de niveau avec carte —');
check('xp : importe la carte depuis community', xp.includes("const community = require('./community')"));
check('xp : génère la carte si option activée', xp.includes('community.levelUpCard({'));
check('xp : active par défaut (sauf xp_card = 0/false)', xp.includes('!(gs.xp_card === 0 || gs.xp_card === false)'));
check('xp : pièce jointe levelup.png + image de l’embed', xp.includes("name: 'levelup.png'") && xp.includes("embed.setImage('attachment://levelup.png')"));
check('xp : jamais bloquante (try/catch)', xp.includes('} catch (e) { console.error(\'[Hoxera] carte de niveau :\', e.message); }'));

// ---------- 4. Dashboard ----------
console.log('— Dashboard —');
check('dashboard : case « Carte de montée de niveau »', dash.includes("🖼️ Carte de montée de niveau") && dash.includes("id=\"xp-card\""));
check('dashboard : envoie « card » à la sauvegarde', dash.includes('card: c.querySelector(\'#xp-card\').checked,'));
check('dashboard : toggle des niveaux ciblé par id (plus de sélecteur générique)', dash.includes("c.querySelector('#xp-enabled').checked"));
check('dashboard : carte activée par défaut', dash.includes("s.xp_card === 0 || s.xp_card === false ? '' : 'checked'"));

// ---------- 5. Versions ----------
check('index : version v210', index.includes('?v=230'));
check('service worker : cache v210', sw.includes('botdev-v230'));

console.log(`\n✅ v210-test.js : ${n} vérifications OK`);
process.exit(0);
