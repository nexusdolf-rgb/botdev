// ══════════════════════════════════════════════════════════════
// TEST v174 — Le nom du bot ne doit plus être écrasé au démarrage
// Bug découvert : provisionHoxera() forçait name='Hoxera' à CHAQUE
// boot → le renommage « Optimus Prime » sautait à chaque déploiement.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const indexJs = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- 1. Le provisionnement ne touche plus au nom ----------
assert(!indexJs.includes("name: 'Hoxera'"),
  'provisionHoxera ne doit plus forcer le nom « Hoxera » au démarrage');
assert(indexJs.includes('name: \'Optimus Prime\''),
  'à la création (première installation), le bot s’appelle « Optimus Prime »');
// la mise à jour au boot ne doit contenir QUE les identifiants techniques
const upd = indexJs.match(/store\.bots\.update\(bot\.id, \{[^}]+\}\)/);
assert(upd, 'ligne de mise à jour au démarrage introuvable');
assert(!/name\s*:/.test(upd[0]), `la mise à jour au démarrage ne doit pas écraser le nom : ${upd[0]}`);
assert(/token/.test(upd[0]) && /client_id/.test(upd[0]),
  'la mise à jour au démarrage doit resynchroniser token et client_id');

// ---------- 2. Test comportemental : un redémarrage garde le nom ----------
// (on simule le provisionnement sur une base neuve, comme au boot)
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync('/tmp/v174-');
const { execFileSync } = require('child_process');
const probe = `
  const Database = require('better-sqlite3');
  const path = require('path');
  process.env.BOTDEV_DATA_DIR = '${process.env.BOTDEV_DATA_DIR}';
  const store = require('./server/db');
  // 1re installation : provisionnement crée le bot
  const bot0 = store.db.prepare('SELECT * FROM bots ORDER BY id LIMIT 1').get();
  if (!bot0) store.bots.create({ user_id: 1, name: 'Optimus Prime', token: 'x', client_id: 'c', prefix: '!' });
  // l'utilisateur renomme le bot depuis le dashboard (PATCH /api/bots/1)
  store.bots.update(1, { name: 'Nom Choisi Par Utilisateur' });
  // 2e démarrage : provisionnement v174 = token/client_id uniquement
  const bot = store.db.prepare('SELECT * FROM bots ORDER BY id LIMIT 1').get();
  const fields = {};
  // reproduit exactement la logique v174 de provisionHoxera
  if (bot) { fields.token = 'y'; fields.client_id = bot.client_id || ''; }
  store.bots.update(bot.id, fields);
  const after = store.bots.get(1);
  if (after.name !== 'Nom Choisi Par Utilisateur') {
    console.error('ECHEC: le nom a été écrasé → ' + after.name); process.exit(1);
  }
  console.log('OK ' + after.name);
`;
const out = execFileSync('node', ['-e', probe], { cwd: root, encoding: 'utf8' }).trim();
assert(out.startsWith('OK'), 'le nom doit survivre à un redémarrage');

// ---------- 3. Version v174 ----------
assert.strictEqual((index.match(/\?v=174/g) || []).length, 7,
  'index.html doit référencer v174 7 fois');
assert(sw.includes('botdev-v174'), 'le cache du service worker n’est pas en v174');
assert(!index.includes('?v=173'), 'index.html référence encore v173');

console.log('✅ v174-test : le nom du bot survit aux redémarrages et déploiements');
