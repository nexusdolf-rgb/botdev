// Test v3.12 — migration vers le domaine canonique hoxera.is-a.dev
const assert = require('assert');
const fs = require('fs');

const index = fs.readFileSync(__dirname + '/../server/index.js', 'utf8');
const botManager = fs.readFileSync(__dirname + '/../server/discord/botManager.js', 'utf8');
const panels = fs.readFileSync(__dirname + '/../server/discord/panels.js', 'utf8');
const publicJs = fs.readFileSync(__dirname + '/../public/js/public.js', 'utf8');
const readme = fs.readFileSync(__dirname + '/../README.md', 'utf8');

assert.ok(index.includes("const officialUrl = 'https://hoxera.is-a.dev'"));
assert.ok(index.includes('oldOfficialUrls') && index.includes('const selfUrl = officialUrl'));
assert.ok(botManager.includes("const OFFICIAL_URL = 'https://hoxera.is-a.dev'"));
assert.ok(panels.includes("|| 'https://hoxera.is-a.dev'"));
assert.ok(publicJs.includes('hoxera.is-a.dev'));
assert.ok(readme.includes('https://hoxera.is-a.dev/api/auth/discord/callback'));
console.log('✅ URLs canoniques : bot, panneaux, garde-éveil, landing et OAuth');

console.log('\n🎉 Tous les tests v3.12 passent');
