// Test v215 — Affichage niveau « chiffre seul » (style court & pro, hors tickets)
// --------------------------------------------------
// Partout où le niveau est affiché (hors panneaux de tickets), on n'écrit plus
// le mot « Niveau » en répétition : le chiffre suffit (📈 3 · rang · XP).
const assert = require('assert');
const fs = require('fs');
const premade = fs.readFileSync('server/discord/premade.js', 'utf8');
const xp = fs.readFileSync('server/discord/xp.js', 'utf8');
const dash = fs.readFileSync('public/js/dashboard.js', 'utf8');
const community = fs.readFileSync('server/discord/community.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v215-test.js');

  // ---------- 1. /levels : lignes « chiffre seul » ----------
  console.log('— Classement /levels —');
  check('levels : chaque ligne « — **3** · 950 XP » (plus de mot « niveau »)',
    premade.includes('— **${r.level}** · ${r.xp} XP'));
  check('levels : plus d’occurrence « — niveau ** »', !premade.includes('— niveau **${r.level}**'));

  // ---------- 2. /rank ----------
  console.log('— Commande /rank —');
  check('rank : titre sans le mot « Niveau de »', premade.includes('.setTitle(`📈 ${target.username}`)'));
  check('rank : champ niveau = emoji + chiffre (📈 3)', premade.includes("{ name: '📈', value: String(level), inline: true },"));
  check('rank : garde rang & XP lisibles', premade.includes("name: '🏆 Rang'") && premade.includes("name: '✨ XP'"));

  // ---------- 3. /profile ----------
  console.log('— Commande /profile —');
  check('profile : champ niveau compact (📈 3)', premade.includes("name: '📈', value: String(level), inline: true },"));
  check('profile : conserve les autres stats', premade.includes("name: '🏆 Rang'") && premade.includes("name: '💰 Coins'"));

  // ---------- 4. Annonce de montée de niveau ----------
  console.log('— Annonce de niveau (embed) —');
  check('annonce : auteur sans « — niveau X » en double', !xp.includes("} — niveau ${level} 🎉"));
  check('annonce : champ niveau compact (📈 + chiffre)', xp.includes("{ name: '📈', value: `**${level}**`, inline: true },"));
  check('annonce : progression/XP conservées', xp.includes("name: 'Progression'") && xp.includes("name: '✨ XP'"));

  // ---------- 5. Dashboard (échelle des rôles) ----------
  console.log('— Dashboard : échelle des rôles compacte —');
  check('dash : lignes « chiffre → rôle » (plus de « Niveau X → »)', dash.includes('<b>${r.level}</b> →'));
  check('dash : légende « Le chiffre = le niveau »', dash.includes('Le chiffre = le niveau'));
  check('dash : plus de parenthèse longue « (retire le rôle du niveau X) » par ligne', !dash.includes('(retire le rôle du niveau ${prev.level})'));

  // ---------- 6. Ce qui reste volontairement avec le mot (carte image + message) ----------
  console.log('— Conservé intentionnellement —');
  check('carte image : grand titre « Niveau X » conservé (visuel principal)', community.includes('Niveau ${lvl}'));
  check('message personnalisable : variable {level} conservée', xp.includes('{level}'));
  check('le mot reste dans les phrases/descriptions (clarté)', premade.includes('Ton niveau, ton XP et ton rang'));

  // ---------- 7. Version ----------
  check('site : bump v215 (index)', index.includes('?v=215'));
  check('site : bump v215 (sw)', sw.includes('botdev-v215'));

  console.log(`  ✅ v215 : ${n} vérifications`);
})().catch((e) => { console.error(e); process.exit(1); });
