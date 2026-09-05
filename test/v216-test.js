// Test v216 — Affichage XP « façon DraftBot » (carte de niveau /rank,
// annonce alignée, classement avec ta position) — hors panneaux de tickets.
// --------------------------------------------------
// Référence : maquette validée /home/user/apercu-panneau-xp-draftbot.html
// (./apercu-panneau-xp-draftbot.html hors dépôt) — ① carte de niveau :
// avatar + grand « Niveau N » + barre + ✨ XP actuel/requis + 🏆 Rang + 🎯
// Encore X XP + 🎁 prochain palier (si configuré) ; ② annonce : avatar en
// auteur, XP/rang/rôle débloqué, carte image conservée ; ③ /levels : lignes
// courtes + ta position « toi » si hors du top affiché. Tickets intacts.
const assert = require('assert');
const fs = require('fs');
const premade = fs.readFileSync('server/discord/premade.js', 'utf8');
const xp = fs.readFileSync('server/discord/xp.js', 'utf8');
const dash = fs.readFileSync('public/js/dashboard.js', 'utf8');
const ticketsFiles = ['server/discord/advancedTickets.js'];
const ticketsExists = ticketsFiles.filter((f) => fs.existsSync(f));

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v216-test.js');

  // ---------- 1. /rank : carte de niveau « façon DraftBot » ----------
  console.log('— /rank : carte de niveau —');
  check('rank : avatar en auteur (pseudo + icône)', premade.includes('.setAuthor({ name: target.username || target.tag || \'Membre\', iconURL: target.displayAvatarURL({ dynamic: true }) })'));
  check('rank : grand titre « Niveau N »', premade.includes('.setTitle(`Niveau ${level}`)'));
  check('rank : barre de progression + % en description', premade.includes('.setDescription(`${bar} ${Math.round(pct * 100)}%`)'));
  check('rank : champ ✨ XP actuel / requis', premade.includes("{ name: '✨ XP', value: `${within} / ${need}`"));
  check('rank : champ 🏆 Rang avec effectif « sur N »', premade.includes("name: '🏆 Rang'") && premade.includes('`#${pos}${xpMembers ? ` sur ${xpMembers}` : \'\'}`'));
  check('rank : champ 🎯 Encore X XP avant le niveau suivant', premade.includes("{ name: '🎯 Encore'") && premade.includes('avant le niveau ${level + 1}'));
  check('rank : 🎁 Prochain palier si rôle configuré au-dessus', premade.includes('name: \'🎁 Prochain palier\'') && premade.includes('Niveau ${nextReward.level} →'));
  check('rank : prochain palier utilise la même échelle XP', premade.includes('xpForLevel(Number(nextReward.level)) - row.xp'));

  // ---------- 2. Annonce de montée de niveau ----------
  console.log('— Annonce de niveau —');
  check('annonce : auteur avec pseudo du membre + avatar', xp.includes("const authorName = `${user.username || user.tag || 'Membre'} 🎉`") && xp.includes('if (avatarUrl) authorOpts.iconURL = avatarUrl'));
  check('annonce : champ ✨ XP (actuel max / requis)', xp.includes("{ name: '✨ XP', value: `${Math.max(row.xp || 0, cur)} / ${next}`"));
  check('annonce : champ 🏆 Rang', xp.includes("name: '🏆 Rang'"));
  check('annonce : 🎁 Rôle débloqué quand palier franchi', xp.includes("name: '🎁 Rôle débloqué'"));
  check('annonce : carte image (avatar + niveau) conservée', xp.includes('community.levelUpCard({') && xp.includes("name: 'levelup.png'") && xp.includes("embed.setImage('attachment://levelup.png')"));

  // ---------- 3. /levels : ta position « toi » ----------
  console.log('— /levels : classement + ta position —');
  check('levels : lignes courtes conservées', premade.includes('— **${r.level}** · ${r.xp} XP'));
  check('levels : ajoute « … » + « ⬅️ toi » si hors du top', premade.includes("own = `\\n…\\n**${myPos}.** <@${author.id}>") && premade.includes('⬅️ toi'));
  check('levels : ne marque « toi » que si hors du top', premade.includes('const inTop = top.some((r) => String(r.user_id) === String(author.id));'));

  // ---------- 4. /profile : chiffre compact conservé ----------
  console.log('— /profile —');
  check('profile : champ niveau compact (📈 3) intact', premade.includes("name: '📈', value: String(level), inline: true },"));

  // ---------- 5. Aide : exemple /rank mis à jour ----------
  console.log('— Aide —');
  check('aide : exemple /rank décrit la carte niveau', premade.includes('`/rank` → carte « Niveau 3 » · ✨ XP · 🏆 rang · 🎁 prochain palier'));

  // ---------- 6. Dashboard ----------
  console.log('— Dashboard (réglages XP) —');
  check('dash : libellés XP actuels inchangés (min/max/cooldown/carte)', dash.includes('id="xp-min"') && dash.includes('id="xp-card"'));
  check('dash : échelle « chiffre → rôle » intacte', dash.includes('<b>${r.level}</b> →'));

  // ---------- 7. Tickets NON touchés (aucun « Niveau » restylé là-bas) ----------
  console.log('— Panneaux de tickets intacts —');
  check('fichiers tickets présents pour contrôle', ticketsExists.length > 0);
  for (const f of ticketsExists) {
    const t = fs.readFileSync(f, 'utf8');
    check(`tickets (${f}) : garde ses formats/verrous (aucune signature v216 /rank)`, !t.includes('.setTitle(`Niveau ${level}`)') && !t.includes('🎁 Prochain palier'));
    check(`tickets (${f}) : pas d’avatar d’auteur « façon carte XP » ajouté`, !t.includes('iconURL: target.displayAvatarURL({ dynamic: true })'));
  }

  // ---------- 8. Version ----------
  console.log('— Bump de version —');
  check('index : bump v216', fs.readFileSync('public/index.html', 'utf8').includes('?v=230'));
  check('sw : bump botdev-v230', fs.readFileSync('public/sw.js', 'utf8').includes('botdev-v230'));

  console.log(`  ✅ v216 : ${n} vérifications`);
})().catch((e) => { console.error(e); process.exit(1); });
