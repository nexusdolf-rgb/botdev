// v329 — Rôles par réaction : titre + emoji du message Discord modifiables.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v329');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const dash = racine('public/js/dashboard.js');
const src = racine('server/discord/reactionroles.js');

console.log('— 1. Pins de version v329 —');
check('index.html : ?v=329 ×7', (html.match(/\?v=329/g) || []).length === 7);
check('sw.js : cache botdev-v329', sw.includes("const CACHE = 'botdev-v329';"));
check('index.html : plus aucune ?v=328', !html.includes('?v=328'));

console.log('— 2. Champs dashboard + envoi —');
check('champs rr-title et rr-title-emoji', dash.includes('id="rr-title"') && dash.includes('id="rr-title-emoji"'));
check('l’envoi envoie title + title_emoji', dash.includes('title: cRR.querySelector(\'#rr-title\')') && dash.includes('title_emoji: cRR.querySelector(\'#rr-title-emoji\')'));
check('plus de titre Discord figé « Choisissez vos rôles »', !src.includes("title: '🎭 Choisissez vos rôles'"));
check('sendSetup utilise panelTitle', src.includes('title: panelTitle(setup)'));

console.log('— 3. Comportement —');
const rr = require('../server/discord/reactionroles');
check('défaut : 🎭 Rôles par réaction emoji', rr.panelTitle({}) === '🎭 Rôles par réaction emoji');
check('titre + emoji perso', rr.panelTitle({ title: 'Choisis tes grades', title_emoji: '⭐' }) === '⭐ Choisis tes grades');
check('emoji vide → titre seul', rr.panelTitle({ title: 'Grades', title_emoji: '' }) === 'Grades');

const saved = rr.saveAll('g329', [{
  id: 'rr1', channel: 'c1', mode: 'toggle',
  title: 'Choisis tes grades', title_emoji: '⭐',
  mappings: [{ emoji: '🎮', role: 'r1' }],
}]);
check('title persisté', saved[0].title === 'Choisis tes grades' && saved[0].title_emoji === '⭐');

(async () => {
  let sent;
  const guild = {
    channels: { cache: { get: () => ({ send: async (p) => { sent = p; return { id: 'm1', react: async () => {} }; } }) } },
  };
  await rr.sendSetup(1, guild, saved[0]);
  check('message Discord : titre personnalisé', sent && sent.embeds && sent.embeds[0].title === '⭐ Choisis tes grades');

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v329 : ' + ok + ' vérifications passed.');
})().catch((e) => { console.error(e); process.exit(1); });
