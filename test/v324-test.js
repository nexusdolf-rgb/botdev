// v324 — Liens façon DraftBot : 1 embed + boutons 2 par ligne.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v324-'));
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const lp = require('../server/discord/linkPanels');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const dump = (p) => JSON.parse(JSON.stringify({
  content: p.content || '',
  embeds: (p.embeds || []).map((e) => (typeof e.toJSON === 'function' ? e.toJSON() : e)),
  components: (p.components || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r)),
}));

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const dash = racine('public/js/dashboard.js');

console.log('— 1. Pins de version v324 —');
check('index.html : ?v=331 ×7', (html.match(/\?v=331/g) || []).length === 7);
check('sw.js : cache botdev-v331', sw.includes("const CACHE = 'botdev-v331';"));
check('index.html : plus aucune ?v=323', !html.includes('?v=323'));

console.log('— 2. Dashboard calé sur l’exemple —');
check('titre « Boutons (2 par ligne) »', dash.includes('Boutons (2 par ligne)'));
check('aperçu en grille 2 colonnes', dash.includes('lp-btns') && racine('public/css/dashboard.css').includes('grid-template-columns: 1fr 1fr'));
check('plus d’encadré par lien', !dash.includes('chacun son embed') && !dash.includes('Titre de l’encadré (vide = nom du bouton)'));
check('placeholder façon Linktree', dash.includes('Voici le Linktree'));

console.log('— 3. Payload Discord —');
const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
lp.saveCfg(BOT, 'g1', {
  content: 'Les différents réseaux de {server}\n\nVoici le Linktree :\nhttps://linktr.ee/demo',
  title: 'Réseaux de Luna !',
  description: 'N’hésitez pas à me suivre de partout !',
  image: 'https://example.com/banner.png',
  links: [
    { label: 'Tiktok', emoji: '💙', url: 'https://tiktok.com/@a' },
    { label: 'Youtube', emoji: '💙', url: 'https://youtube.com/@a' },
    { label: 'Instagram', emoji: '💙', url: 'https://instagram.com/a' },
    { label: 'Twitch', emoji: '💙', url: 'https://twitch.tv/a' },
    { label: 'Twitter', emoji: '💙', url: 'https://twitter.com/a' },
  ],
});
const p = dump(lp.buildPayload(lp.cfgOf(BOT, 'g1'), 'fr', 'Luna'));
check('texte au-dessus + lien Linktree', p.content.includes('Luna') && p.content.includes('https://linktr.ee/demo'));
check('UN seul embed', p.embeds.length === 1);
check('titre + texte + image dans cet embed', p.embeds[0].title.includes('Réseaux') && p.embeds[0].image && String(p.embeds[0].image.url || p.embeds[0].image).includes('banner.png'));
check('5 boutons → 3 rangées (2+2+1)', p.components.length === 3
  && p.components[0].components.length === 2
  && p.components[1].components.length === 2
  && p.components[2].components.length === 1);
check('tous les boutons sont des liens (style 5)', p.components.every((r) => r.components.every((b) => b.style === 5)));
check('libellés Tiktok / Youtube…', p.components[0].components[0].label === 'Tiktok' && p.components[0].components[1].label === 'Youtube');
check('BUTTONS_PER_ROW = 2', lp.BUTTONS_PER_ROW === 2);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v324 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
