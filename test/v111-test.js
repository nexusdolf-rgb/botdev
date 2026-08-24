// Test v3.4 — Catégories fantômes ÉRADIQUÉES (résolution floue)
// Cas réel du serveur CODM : la config contenait « ────〔🎫・SUPPORT・〕──── »
// tapé à la main ; un tiret de différence avec le vrai nom → comparaison
// stricte échouée → catégorie CLONE créée en haut du serveur, à chaque ticket.
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v34test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const { normDecorName, findCategoryFuzzy } = require('../server/discord/panels');
const { ChannelType } = require('discord.js');

// 1. Normalisation : les décorations disparaissent, le cœur reste
assert.strictEqual(normDecorName('────〔🎫・SUPPORT・〕────'), 'support');
assert.strictEqual(normDecorName('───〔👋・BIENVENUE・〕────'), 'bienvenue');
assert.strictEqual(normDecorName('🎫 TICKETS'), 'tickets');
assert.strictEqual(normDecorName('  Tickets  '), 'tickets');
assert.strictEqual(normDecorName(''), '');
console.log('✅ normalisation : tirets, emojis, crochets et espaces neutralisés');

// 2. Recherche floue sur un faux serveur avec les VRAIS noms du serveur CODM
const mkGuild = (names) => {
  const arr = names.map((n) => ({ type: ChannelType.GuildCategory, name: n }));
  return { channels: { cache: { find: (fn) => arr.find(fn) || undefined } } };
};
const guild = mkGuild(['───〔👋・BIENVENUE・〕────', '────〔🎫・SUPPORT・〕────', '────〔👑・STAFF・〕────']);

// config avec 4 tirets vs réalité : match flou
assert.strictEqual(findCategoryFuzzy(guild, '────〔🎫・SUPPORT・〕────').name, '────〔🎫・SUPPORT・〕────');
// config avec 3 tirets seulement : match flou quand même !
assert.strictEqual(findCategoryFuzzy(guild, '───〔🎫・SUPPORT・〕───').name, '────〔🎫・SUPPORT・〕────');
// config toute simple « support » : match flou aussi
assert.strictEqual(findCategoryFuzzy(guild, 'SUPPORT').name, '────〔🎫・SUPPORT・〕────');
// « bienvenue » décoré différemment
assert.strictEqual(findCategoryFuzzy(guild, '〔👋 Bienvenue〕').name, '───〔👋・BIENVENUE・〕────');
// vraiment introuvable → null (et surtout pas de création)
assert.strictEqual(findCategoryFuzzy(guild, 'Recrutement'), null);
assert.strictEqual(findCategoryFuzzy(guild, ''), null);
console.log('✅ recherche floue : 3 ou 4 tirets, décoré ou pas — la VRAIE catégorie est toujours retrouvée');

// 3. La création de catégorie est désormais un DERNIER RECOURS ABSOLU
const src = fs.readFileSync(__dirname + '/../server/discord/panels.js', 'utf8');
assert.ok(src.includes('findCategoryFuzzy(guild, catName)'), 'résolution floue branchée');
// 🚫 v3.6 : ZÉRO création de catégorie dans TOUT le fichier
assert.ok(!src.includes('type: ChannelType.GuildCategory }'), 'le bot ne peut PLUS créer de catégorie — nulle part');
assert.ok(src.includes('placement du ticket'), 'règle de placement tracée dans les logs');
console.log('✅ création de catégorie SUPPRIMÉE du code : catégorie fantôme structurellement impossible');

console.log('\n🎉 Tous les tests v3.4 passent');
