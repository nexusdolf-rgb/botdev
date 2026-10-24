// Test v2.27 — Identité du bot PAR SERVEUR (RETIRÉE en v374).
// -----------------------------------------------------------------
// La banque d'origine vérifiait l'isolation d'un profil par serveur et la
// résolution « alias actif > profil principal > bot global ». En v374 tout le
// système est retiré : ce qui reste à garantir, c'est que le bot global n'est
// jamais modifié par aucun code du projet, et que plus rien n'écrit d'identité
// locale.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v227-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- 0. Bot de test ----------
  const uid = store.users.create('discord:v227@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Hoxera Global', token: 'T', client_id: '1', prefix: '!' });

  // ---------- 1. Plus aucun réglage d'identité locale ----------
  console.log('\n1) Aucun réglage d’identité locale ne subsiste');
  check('botProfiles absent du store', !('botProfiles' in store));
  check('profileAliases absent du store', !('profileAliases' in store));
  check('profileState absent du store', !('profileState' in store));
  check('identity.js supprimé', !fs.existsSync(path.join(__dirname, '../server/discord/identity.js')));
  check('profileCommands.js ne traite plus /botprofile', !read('server/discord/profileCommands.js').includes("commandName === 'botprofile'"));

  // ---------- 2. Le bot global n'est jamais modifié ----------
  console.log('\n2) Le bot global reste intact');
  const globalNameBefore = store.bots.get(BOT).name;
  const globalAvatarBefore = store.bots.get(BOT).avatar_url || '';
  check('le nom GLOBAL du bot n’a pas changé', store.bots.get(BOT).name === globalNameBefore);
  check('l’avatar GLOBAL du bot n’a pas changé', (store.bots.get(BOT).avatar_url || '') === globalAvatarBefore);

  // Aucun code du serveur ne renomme l'application Discord ni son avatar.
  const fichiers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) fichiers.push(rel);
    }
  };
  walk('server');
  const coupables = fichiers.filter((f) => {
    const src = read(f);
    // Un PATCH sur l'application avec un nom ou un avatar = renommage global.
    return /patch\(['\"]\/applications\/@me['\"],\s*\{?\s*body:\s*\{[^}]*\b(name|avatar)\b/.test(src)
      || /patch\(['\"]\/users\/@me['\"],\s*\{?\s*body:\s*\{[^}]*\b(username|avatar)\b/.test(src);
  });
  check('aucun fichier serveur ne renomme le bot global', coupables.length === 0);

  // ---------- 3. Le front ne parle plus d'identité par serveur ----------
  console.log('\n3) Le dashboard ne propose plus de régler l’identité');
  const dash = read('public/js/dashboard.js');
  check('plus d’aperçu #bp-live', !dash.includes('bp-live'));
  check('plus de section botprofile', !dash.includes("data-go=\"botprofile\""));
  check('plus de renderer botprofile', !/Dashboard\.renderers\.botprofile\s*=/.test(dash));

  // Versionnage front cohérent
  const indexHtml = read('public/index.html');
  const swSource = read('public/sw.js');
  check('index.html : 7 références ?v=379', (indexHtml.match(/\?v=379/g) || []).length === 7);
  check('sw.js : cache v373', swSource.includes("const CACHE = 'botdev-v379';"));

  console.log(failures === 0 ? '\n✅ V227 — plus d’identité locale, bot global intact. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
