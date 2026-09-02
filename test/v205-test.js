// Test v205 — Pings salons fiables + sécurité renforcée
// -------------------------------------------------------
// 1. Normalisation des noms de salons copiés de Discord (U+2060, U+200B…)
// 2. Résolution par nom : exacte, décorée, partielle (fallback « contient »)
// 3. Auto-mention : seuls les vrais noms de salons deviennent des pings <#id>
// 4. channelMentions : salon trouvé → <#id>, introuvable → ligne ignorée
// 5. sanitizeEventConfig : caps, couleur, channelsmulti JSON propre
const assert = require('assert');
const events = require('../server/discord/events');
const { normalizeChannelName, findChannelByName, resolveChannel, autoMentionChannels, channelMentions, sanitizeEventConfig } = events;

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, `❌ ${label}`);
  console.log(`  ✅ ${label}`);
};

// ---------- Faux serveur réaliste (Collection Discord.js-like) ----------
const mkChan = (id, name) => ({ id, name, isTextBased: () => true, send: async () => {} });
function mkGuild(channelsList) {
  const cache = new Map();
  for (const c of channelsList) cache.set(c.id, c);
  return {
    channels: {
      cache,
      fetch: async () => cache, // guild.channels.fetch() renvoie la collection
    },
  };
}

(async () => {
  console.log('▶ v205-test.js');

  // ---------- 1. normalizeChannelName ----------
  console.log('— Normalisation des noms copiés de Discord —');
  check('retire # et U+2060', normalizeChannelName('#⁠『📨』ticket') === '『📨』ticket');
  check('retire U+200B et U+FEFF', normalizeChannelName('\u200Bregles\uFEFF') === 'regles');
  check('retire espaces idéographiques et multiples', normalizeChannelName('  chat   général\u3000') === 'chat général');
  check('insensible à la casse', normalizeChannelName('REGLES') === 'regles');

  // ---------- 2. findChannelByName ----------
  console.log('— Résolution par nom (exact, décoré, partiel) —');
  const guildA = mkGuild([
    mkChan('9000000000000000011', '『📨』ticket'),
    mkChan('9000000000000000012', '『⚔️』1v1'),
    mkChan('9000000000000000013', '『💬』chat-général'),
    mkChan('9000000000000000014', 'regles'),
    mkChan('9000000000000000015', 'général'),
  ]);
  const e1 = findChannelByName(guildA, normalizeChannelName('『📨』ticket'));
  check('nom exact décoré trouvé', e1 && e1.id === '9000000000000000011');
  const e2 = findChannelByName(guildA, normalizeChannelName('ticket'));
  check('nom partiel « ticket » → salon décoré (fallback contient)', e2 && e2.id === '9000000000000000011');
  const e3 = findChannelByName(guildA, normalizeChannelName('chat-général'));
  check('nom partiel « chat-général » → salon décoré', e3 && e3.id === '9000000000000000013');
  assert.strictEqual(findChannelByName(guildA, 'zzz'), null);
  check('nom inexistant → null', true);

  // ---------- 3. resolveChannel ----------
  console.log('— resolveChannel (U+2060, ID, cache incomplet) —');
  const r1 = await resolveChannel(guildA, '⁠『📨』ticket');
  check('U+2060 + décoré → salon trouvé', r1 && r1.id === '9000000000000000011');
  const r2 = await resolveChannel(guildA, '#regles');
  check('#regles → salon trouvé', r2 && r2.id === '9000000000000000014');
  // Cache incomplet : fetch() de secours renvoie la collection complète
  const partial = { channels: { cache: new Map(), fetch: async () => guildA.channels.cache } };
  const r3 = await resolveChannel(partial, 'général');
  check('cache vide → fetch de secours puis re-cherche', r3 && r3.id === '9000000000000000015');
  // ID 15-21 chiffres → fetch direct par ID
  let fetchedById = null;
  const guildId = {
    channels: {
      cache: new Map(),
      fetch: async (id) => { fetchedById = id; return mkChan(id, 'par-id'); },
    },
  };
  const r4 = await resolveChannel(guildId, '<#9000000000000000042>');
  check('ID 15-21 → fetch direct', r4 && fetchedById === '9000000000000000042');

  // ---------- 4. autoMentionChannels ----------
  console.log('— Auto-mention : seuls les vrais salons deviennent des pings —');
  const am = (t) => autoMentionChannels(guildA, t);
  check('« #ticket » copié → ping', am('Lis #ticket') === 'Lis <#9000000000000000011>');
  check('U+2060 « ⁠regles » → ping', am('Voir \u2060regles') === 'Voir <#9000000000000000014>');
  check('nom décoré « 『💬』chat-général » (non marqué) → ping', am('Salon : 『💬』chat-général') === 'Salon : <#9000000000000000013>');
  check('nom partiel décoré « chat-général » → ping', am('Dans chat-général') === 'Dans <#9000000000000000013>');
  check('« 1v1 » (chiffres, salon existant) → ping', am('Tournoi 1v1') === 'Tournoi <#9000000000000000012>');
  check('mot courant « général » (lettres, sans marque) → NON converti', am('coucou général') === 'coucou général');
  check('« générale » (lettres, sans marque) → NON converti', am('en générale') === 'en générale');
  check('nom inexistant non marqué → non converti', am('parle de zzz') === 'parle de zzz');
  check('**ticket** sans marque (lettres pures) → non converti', am('**ticket**') === '**ticket**');
  check('**⁠ticket** copié de Discord (U+2060) → ping (le gras reste)', am('**\u2060ticket**') === '**<#9000000000000000011>**');

  // ---------- 5. channelMentions ----------
  console.log('— channelMentions (trouvé → <#id>, introuvable → ignoré) —');
  const cm1 = await channelMentions(guildA, JSON.stringify([
    { channel: 'regles', label: 'Je vous invite à lire {salon} pour les règles' },
    { channel: 'zzz-inexistant', label: 'Cette ligne doit disparaître' },
  ]), resolveChannel);
  check('salon trouvé → phrase avec <#id>', cm1 === 'Je vous invite à lire <#9000000000000000014> pour les règles');
  check('salon introuvable → ligne ignorée', !cm1.includes('disparaître'));
  const cm2 = await channelMentions(guildA, JSON.stringify([{ channel: '『📨』ticket', label: '' }]), resolveChannel);
  check('sans phrase → mention seule', cm2 === '<#9000000000000000011>');
  const cm3 = await channelMentions(guildA, '{"channel":"regles"}', resolveChannel);
  check('JSON invalide (non-tableau) → chaîne vide', cm3 === '');

  // ---------- 6. sanitizeEventConfig ----------
  console.log('— sanitizeEventConfig (caps, couleur, channelsmulti) —');
  const s1 = sanitizeEventConfig('member_join', {
    message: 'x'.repeat(3000),
    channel: 'c'.repeat(300),
    color: 'rouge',
    image: 'https://exemple.com/img.png',
    card: 1,
    channels: JSON.stringify([
      { channel: '#\u2060regles', label: 'l'.repeat(800) },
      { channel: '  ' },
      { channel: '#bienvenue', label: 'ok' },
    ].concat(Array.from({ length: 60 }, (_, i) => ({ channel: `#salon-${i}`, label: `${i}` })))),
    champInconnu: 'ignoré',
  });
  check('message plafonné à 2000', s1.message.length === 2000);
  check('channel plafonné à 200', s1.channel.length === 200);
  check('couleur invalide → #5865F2', s1.color === '#5865F2');
  check('checkbox → booléen', s1.card === true);
  const s1Chans = JSON.parse(s1.channels);
  check('channelsmulti ≤ 50 lignes', s1Chans.length === 50);
  check('U+2060 retiré du nom de salon', s1Chans[0].channel === '#regles');
  check('label plafonné à 600', s1Chans[0].label.length === 600);
  check('ligne sans salon ignorée', !s1Chans.some((x) => x.channel === ''));
  check('champ inconnu ignoré', !('champInconnu' in s1));
  const s2 = sanitizeEventConfig('member_join', { color: '#12ABef' });
  check('couleur hex valide conservée (casse indifférente)', s2.color === '#12ABef');
  const s3 = sanitizeEventConfig('autorole', { roles: 'Membre, VIP' });
  check('autorole rolesmulti conservé', s3.roles === 'Membre, VIP');
  const s4 = sanitizeEventConfig('type-inconnu', { message: 'x' });
  check('type inconnu → {}', Object.keys(s4).length === 0);

  console.log(`\n✅ v205-test.js : ${n} vérifications OK`);
  process.exit(0);
})().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
