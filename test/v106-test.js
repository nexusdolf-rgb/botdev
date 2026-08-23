// Test v2.9 — Bienvenue réparée (le « # » fatal) + await XP + mise à jour auto
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v29test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const { resolveChannel } = require('../server/discord/events');

// Faux serveur avec salons aux noms exotiques (comme en vrai)
const mkGuild = (names) => ({
  channels: {
    fetch: async () => null,
    cache: {
      find: (fn) => names.map((n) => ({ name: n, isTextBased: () => true, send: async () => {} })).find(fn) || null,
    },
  },
});

(async () => {
  const guild = mkGuild(['『✈️』arrivant', '👋・bienvenue', 'general']);

  // 1. LE bug : valeur avec « # » (ce que le dashboard enregistre)
  const c1 = await resolveChannel(guild, '#『✈️』arrivant');
  assert.ok(c1 && c1.name === '『✈️』arrivant', 'salon avec émojis + # trouvé');
  const c2 = await resolveChannel(guild, '#👋・bienvenue');
  assert.ok(c2 && c2.name === '👋・bienvenue', 'deuxième salon spécial trouvé');
  console.log('✅ « #『✈️』arrivant » trouve bien le salon 『✈️』arrivant (le bug est mort)');

  // 2. Sans # : toujours OK ; casse ignorée ; inexistant → null
  assert.ok(await resolveChannel(guild, 'general'), 'sans # : OK');
  assert.ok(await resolveChannel(guild, 'GENERAL'), 'insensible à la casse');
  assert.strictEqual(await resolveChannel(guild, '#nexiste-pas'), null);
  assert.strictEqual(await resolveChannel(guild, ''), null);
  assert.strictEqual(await resolveChannel(guild, '#'), null);
  console.log('✅ sans #, majuscules, inexistant, vide : tous les cas propres');

  // 3. L'annonce XP attend désormais la résolution (await)
  const xp = fs.readFileSync(__dirname + '/../server/discord/xp.js', 'utf8');
  assert.ok(xp.includes('channel = await resolveChannel(message.guild, gs.xp_channel)'), 'await ajouté');
  console.log('✅ annonce XP : salon dédié réellement résolu (await)');

  // 4. Mise à jour automatique du site (PWA)
  const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');
  assert.ok(html.includes('controllerchange') && html.includes('reloadedOnce'), 'rechargement auto à la nouvelle version');
  console.log('✅ nouvelle version du site = rechargement automatique (fini le cache tenace)');

  console.log('\n🎉 Tous les tests v2.9 passent');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
