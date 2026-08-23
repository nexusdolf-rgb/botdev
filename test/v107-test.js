// Test v3.0 — Départ réparé (partials) + panneaux premium + audit anti-#
const assert = require('assert');
const fs = require('fs');

const bm = fs.readFileSync(__dirname + '/../server/discord/botManager.js', 'utf8');
const ev = fs.readFileSync(__dirname + '/../server/discord/events.js', 'utf8');

// 1. Partials GuildMember + User : les départs arrivent TOUJOURS
assert.ok(bm.includes('Partials.GuildMember') && bm.includes('Partials.User'),
  'partials GuildMember/User présents (sans eux, discord.js JETTE les départs non mis en cache)');
console.log('✅ départs : partials GuildMember + User (événement plus jamais jeté)');

// 2. Le rendu tolère un membre partiel (user absent/incomplet)
assert.ok(ev.includes('const u = member.user || {}'), 'render tolère un membre partiel');
assert.ok(ev.includes("u.tag || u.username || 'un membre'"), 'repli de pseudo propre');
console.log('✅ membre partiel au départ : aucun crash possible');

// 3. Panneau de bienvenue PREMIUM : tous les éléments pro
for (const marker of ['setAuthor', 'Bienvenue sur ${member.guild.name}', '👥 Tu es le membre', '📅 Compte créé', '🎟️ Invité par', 'setThumbnail(avatarUrl)', 'setFooter', 'setTimestamp']) {
  assert.ok(ev.includes(marker), `bienvenue premium : ${marker}`);
}
console.log('✅ panneau bienvenue : avatar, n° membre, âge du compte, recruteur, pied de page, horodatage');

// 4. Panneau de départ assorti
for (const marker of ["s'en va", '👥 Membres restants', '🕐 Était membre depuis']) {
  assert.ok(ev.includes(marker), `départ premium : ${marker}`);
}
console.log('✅ panneau de départ assorti (membres restants + ancienneté)');

// 5. 🛡️ AUDIT ANTI-# : toute résolution de salon par nom doit retirer le «#»
//    (c'est ce bug qui a rendu la bienvenue muette — il ne doit JAMAIS revenir)
const files = ['events.js', 'logging.js', 'panels.js', 'community.js', 'liveWatch.js', 'extra.js'];
const offenders = [];
for (const f of files) {
  const src = fs.readFileSync(__dirname + '/../server/discord/' + f, 'utf8');
  // chaque comparaison de nom de salon doit être précédée d'un strip du #
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (/channels\.cache\.find/.test(l) && /\.name/.test(l) && !/GuildCategory/.test(l) && !/channelName/.test(l)) {
      // la variable comparée doit avoir été nettoyée du # quelque part au-dessus (fenêtre de 15 lignes)
      const windowSrc = lines.slice(Math.max(0, i - 15), i + 1).join('\n');
      if (!/replace\(\/\^#/.test(windowSrc)) offenders.push(`${f}:${i + 1}`);
    }
  });
}
assert.deepStrictEqual(offenders, [], `résolutions sans strip du # : ${offenders.join(', ')}`);
console.log('✅ audit : TOUTES les résolutions de salons retirent le # (bienvenue, logs, panels, starboard, live, anniversaires)');

console.log('\n🎉 Tous les tests v3.0 passent');
