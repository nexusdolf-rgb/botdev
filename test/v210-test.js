// Test v210 — Carte image de montée de niveau (XP)
// --------------------------------------------------
// Contrat actuel : carte dynamique avec l'avatar propre au membre, niveau, nom
// et barre de progression. Le ping et la carte sont réunis dans un panneau V2.
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

// ---------- 1. Génération de la carte (SVG pur) ----------
console.log('— Carte de niveau : SVG —');
const svg = community.levelUpCardSvg({ name: 'Alex', server: 'Serveur Test', level: 7, pct: 0.5 });
check('svg : libellé NIVEAU + chiffre dynamique', svg.includes('NIVEAU') && svg.includes('>7</text>'));
check('svg : pseudo dynamique présent', svg.includes('Alex'));
check('svg : progression 50 % → 270/540', svg.includes('width="270"') && svg.includes('width="540"'));
check('svg : progression plafonnée à 100 %', community.levelUpCardSvg({ level: 1, pct: 2 }).includes('width="540"'));
check('svg : nom échappé contre l’injection XML', community.levelUpCardSvg({ name: 'A&B<C>', level: 1 }).includes('A&amp;B&lt;C&gt;'));
check('svg : fond à motifs hexagonaux et accent cyan', svg.includes('levelHex') && svg.includes('#30d5ff'));
check('community : générateur PNG exporté', typeof community.levelUpCard === 'function');
check('carte : avatar du membre découpé en cercle', communityJs.includes("blend: 'dest-in'") && xp.includes("displayAvatarURL({ extension: 'png', size: 256 })"));

// ---------- 2. Réglage par serveur (db + routes) ----------
console.log('— Réglage xp_card —');
check('db : colonne xp_card (migration ALTER)', db.includes('ADD COLUMN xp_card INTEGER DEFAULT 1'));
check('db : xp_card dans la liste des colonnes', db.includes("'xp_card',"));
check('db : défaut activé (1) sauf si 0/false', db.includes('xp_card: (next.xp_card === 0 || next.xp_card === false) ? 0 : 1,'));
// v249 : XP texte et XP vocale partagent PUT /xp ; les champs absents ne
// doivent pas écraser les réglages déjà enregistrés.
check('routes : déstructure « card » depuis le corps de la requête', /\bcard,/.test(routes));
check('routes : xp_card n\'est écrit que si « card » est fourni',
  /if \(fourni\(card\)\) paquet\.xp_card =/.test(routes));
check('routes : …et il est bien normalisé en 0/1',
  /paquet\.xp_card = booleen\(card, 1\)/.test(routes));
check('routes : la base normalise toujours xp_card (dernier rempart)',
  db.includes('xp_card: (next.xp_card === 0 || next.xp_card === false) ? 0 : 1,'));

// ---------- 3. Annonce : ping réel + carte ----------
console.log('— Annonce de niveau avec carte —');
check('xp : importe le générateur de carte', xp.includes("const community = require('./community')"));
check('xp : transmet avatar, nom, niveau et progression dynamiques', xp.includes('community.levelUpCard({ avatarUrl, name: displayName, level, pct })'));
check('xp : carte activée par défaut (sauf xp_card = 0/false)', xp.includes('!(gs.xp_card === 0 || gs.xp_card === false)'));
check('xp : carte dynamique présentée par URL dans ui.v2panel', xp.includes('ui.v2panel({') && xp.includes('image: imageUrl'));
check('xp : le texte agrandi contient la mention autorisée dans le panneau', xp.includes('content: panelText') && xp.includes('const allowedMentions = { parse: [], users: userId ? [userId] : [] }'));
check('xp : le cache image et sa route publique sont présents', read('server/levelUpCardCache.js').includes('MAX_ENTRIES = 256') && read('server/index.js').includes("/levelup-card/:key.png"));
check('xp : génération de carte non bloquante', xp.includes("console.error('[Hoxera] carte de niveau :', e.message)"));
check('xp : aucune statistique XP/rang/récompense dans l’annonce', !xp.includes("name: '✨ XP'") && !xp.includes("name: '🏆 Rang'") && !xp.includes("name: '🎁 Rôle débloqué'"));

// ---------- 4. Dashboard ----------
console.log('— Dashboard —');
check('dashboard : réglage carte de montée de niveau présent', dash.includes("🖼️ Carte de montée de niveau") && dash.includes("id=\"xp-card\""));
check('dashboard : libellé décrit l’avatar du membre', dash.includes('avatar du membre, nom et progression'));
check('dashboard : envoie « card » à la sauvegarde', dash.includes('card: c.querySelector(\'#xp-card\').checked,'));
check('dashboard : toggle des niveaux ciblé par id', dash.includes("c.querySelector('#xp-enabled').checked"));
check('dashboard : carte activée par défaut', dash.includes("s.xp_card === 0 || s.xp_card === false ? '' : 'checked'"));
check('dashboard : exemple de message correspond au nouveau rendu', dash.includes("placeholder=\"{user} vient d\\'atteindre le niveau {level} !\""));

// ---------- 5. Versions ----------
check('index : version courante v350', index.includes('?v=360'));
check('service worker : cache courant v350', sw.includes('botdev-v360'));

console.log(`\n✅ v210-test.js : ${n} vérifications OK`);
process.exit(0);
