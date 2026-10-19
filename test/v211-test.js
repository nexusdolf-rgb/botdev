// Test v211 — Profils d'envoi multiples par serveur (RETIRÉS en v374)
// --------------------------------------------------------------------
// Cette banque vérifiait les alias d'identité (nom, avatar par serveur) et
// la résolution du profil qui signe les messages. Le système entier a été
// retiré en v374 : on vérifie ici qu'il ne reste ni table, ni route, ni
// morceau d'interface, et que les envois du bot ne passent plus par un
// webhook d'identité.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v211-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const routes = fs.readFileSync('server/routes.js', 'utf8');
const dash = fs.readFileSync('public/js/dashboard.js', 'utf8');
const db = fs.readFileSync('server/db.js', 'utf8');
const premade = fs.readFileSync('server/discord/premade.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

console.log('▶ v211-test.js');

// ---------- 1. Stockage ----------
console.log('— Stockage : plus aucune table d’identité —');
check('db : table bot_profiles absente', !db.includes('CREATE TABLE IF NOT EXISTS bot_profiles'));
check('db : table bot_profile_aliases absente', !db.includes('bot_profile_aliases'));
check('db : table bot_profile_state absente', !db.includes('bot_profile_state'));
check('db : API profileAliases / profileState non exportées', !/profileAliases, profileState/.test(db));
check('store : plus de botProfiles', !('botProfiles' in store));
check('store : plus de profileAliases', !('profileAliases' in store));
check('store : plus de profileState', !('profileState' in store));

// ---------- 2. Moteur ----------
console.log('— Moteur : fichier d’identité supprimé —');
check('identity.js supprimé', !fs.existsSync('server/discord/identity.js'));
check('profileWizard.js supprimé', !fs.existsSync('server/discord/profileWizard.js'));
check('premade.js ne déclare plus /botprofile', !premade.includes("name: 'botprofile'"));
check('plus aucune commande botprofile visible', !routes.includes('botprofile'));

// ---------- 3. Serveur ----------
console.log('— Routes —');
check('route /profiles retirée', !routes.includes("/guilds/:guildId/profiles'"));
check('route /profile-active retirée', !routes.includes('/profile-active'));
check('payload : plus de profiles_extra', !routes.includes('profiles_extra:'));
check('payload : plus de profile_active', !routes.includes('profile_active:'));

// ---------- 4. Dashboard ----------
console.log('— Dashboard —');
check('plus de panneau « Profils d’envoi »', !dash.includes('Profils d’envoi (qui signe les messages)'));
check('plus de radio bp-active', !dash.includes('name="bp-active"'));
check('plus de bouton supprimer d’alias', !dash.includes('[data-del-alias]'));
check('plus d’appel /profile-active', !dash.includes('/profile-active'));
check('plus de section Identité du bot', !dash.includes("data-go=\"botprofile\""));

// ---------- 5. Versions ----------
check('index : version v373', index.includes('?v=375'));
check('service worker : cache v373', sw.includes('botdev-v375'));

console.log(`\n✅ v211-test.js : ${n} vérifications OK`);
process.exit(0);
