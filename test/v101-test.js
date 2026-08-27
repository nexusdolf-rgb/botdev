// Test v2.4 — 🗂️ Placement strict du salon de ticket + lien direct créateur
// Une catégorie Discord existante est obligatoire pour tous les nouveaux
// tickets. Aucune catégorie n'est créée et aucun ticket n'est placé au hasard.
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v24test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const src = fs.readFileSync(__dirname + '/../server/discord/panels.js', 'utf8');

// 1. La logique de placement est présente et stricte
const block = src.slice(src.indexOf('Placement du salon (v2.4)'), src.indexOf('const allow = [PermissionFlagsBits.ViewChannel'));
assert.ok(block.length > 100, 'bloc de placement présent avant les permissions');
assert.ok(block.includes('const catName = typeCategory || menuCategory'), 'catégorie du type prioritaire');
assert.ok(block.includes('!catName'), 'catégorie vérifiée');
assert.ok(block.includes('if (!parent && panelParent) { parent = panelParent;'), 'repli historique sûr vers la catégorie du panneau');
assert.ok(block.includes('sans catégorie (aucune catégorie valide configurée)'), 'aucune catégorie créée en dernier recours');
console.log('✅ placement : catégorie du type → panneau menu → globale, sans création automatique');

// 2. v3.6 : AUCUNE création de catégorie possible
assert.ok(!block.includes('guild.channels.create({ name: catName'), 'aucune création de catégorie dans le placement');
console.log('✅ création de catégorie totalement supprimée');

// 3. Ticket placé juste sous le salon du panneau (même catégorie)
assert.ok(src.includes('channel.setPosition(panelChannel.position + 1)'), 'ticket sous le salon du panneau');
assert.ok(src.includes('(channel.parentId || null) === (panelChannel.parentId || null)'), 'même catégorie OU tous deux hors catégorie');
console.log('✅ ticket placé juste sous le salon du panneau quand même catégorie');

// 4. Le placement ne casse jamais l'ouverture (try/catch autour du setPosition)
const posIdx = src.indexOf('channel.setPosition(panelChannel.position + 1)');
const around = src.slice(posIdx - 300, posIdx + 200);
assert.ok(around.includes('try {') && around.includes('catch'), 'setPosition protégé par try/catch');
console.log('✅ placement best-effort : jamais bloquant');

// 5. Créateur : bouton-lien direct + mention + MP conservé
assert.ok(src.includes("setLabel('🎫 Ouvrir mon ticket')"), 'bouton-lien direct dans la confirmation');
assert.ok(src.includes('https://discord.com/channels/${guild.id}/${channel.id}'), 'URL directe du salon');
assert.ok(src.includes('Rejoins-le ici : ${channel}'), 'MP au créateur avec le lien conservé');
assert.ok(src.includes('ephemeral: true'), 'confirmation privée (éphémère)');
console.log('✅ créateur : bouton « Ouvrir mon ticket » + mention éphémère + MP avec lien');

console.log('\n🎉 Tous les tests v2.4 passent');
