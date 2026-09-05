// Test v217 — Grammaire des couleurs & signatures (suite de l'audit §15)
// --------------------------------------------------
// Famille Économie = or #F1C40F ; échec/perte = rouge ; XP classements =
// terracotta brand (cohérence /levels) ; vie sociale chartée (social).
// Toute commande est signée Hoxera + timestamp ; un seul avatar par embed.
const assert = require('assert');
const fs = require('fs');
const premade = fs.readFileSync('server/discord/premade.js', 'utf8');
const extra = fs.readFileSync('server/discord/extra.js', 'utf8');
const events = fs.readFileSync('server/discord/events.js', 'utf8');
const ui = fs.readFileSync('server/discord/ui.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v217-test.js');

  // ---------- 1. Charte ui.js ----------
  console.log('— Charte COLORS —');
  check('ui.js : social charté (#EB459E) documenté', ui.includes("social: '#EB459E'"));
  check('ui.js : economy = or #F1C40F documenté', ui.includes("economy: '#F1C40F'"));

  // ---------- 2. Économie (premade) = or + signature ----------
  console.log('— Économie (premade) —');
  check('daily : récompense en or (economy)', premade.includes("variant: 'economy',\n        title: '🎁 Récompense quotidienne'"));
  check('balance : solde en or (economy)', premade.includes("variant: 'economy',\n        title: '💰 Solde de coins'"));
  check('leaderboard : or #F1C40F + footer signé + timestamp',
    premade.includes("setColor('#F1C40F')") && premade.includes(".setTitle('🏆 Classement des coins')") && premade.includes('.setFooter({ text: `Hoxera · ${guild.name} · Économie` })') && premade.includes(".setTimestamp();\n      await replyEmbed(embed);\n      break;\n    }\n  }"));
  check('shop : or + footer « Boutique » + timestamp + solde en description',
    premade.includes(".setColor('#F1C40F')") && premade.includes('`Hoxera · ${guild.name} · Boutique`') && premade.includes('Ton solde : ${solde} coins'));
  check('buy : achat en or (economy)', premade.includes("variant: 'economy',\n        title: '🛒 Achat réussi !'"));
  check('pay : transfert en or (economy)', premade.includes("variant: 'economy',\n        title: '💸 Transfert effectué'"));
  check('plus de jaune warning sur le classement des coins', !premade.includes("setColor('#FEE75C')\n        .setTitle('🏆 Classement des coins')"));

  // ---------- 3. Économie (extra) = or pour gains, rouge pour pertes ----------
  console.log('— Économie (extra) —');
  check('work : gain en or', extra.includes("variant: 'economy',\n        title: '💼 Travail terminé'"));
  check('gamble gagné : or', extra.includes("variant: 'economy',\n          title: '🎰 JACKPOT !'"));
  check('rob réussi : or', extra.includes("variant: 'economy',\n          title: '🦹 Vol réussi !'"));
  check('rob échoué : rouge (perte/amende)', extra.includes("variant: 'danger',\n        title: '🚓 Vol échoué'"));
  check('gamble perdu garde le rouge', extra.includes("variant: 'danger',\n        title: '🎰 Pari perdu'"));

  // ---------- 4. Classements XP/coins cohérents ----------
  console.log('— Classements cohérents —');
  check('/top : XP = terracotta brand, coins = or', extra.includes("type === 'coins' ? 0xf1c40f : 0xe07a5f"));
  check('/levels reste en terracotta (v216)', premade.includes(".setColor('#e07a5f')") && premade.includes("setTitle('📈 Classement des niveaux')"));

  // ---------- 5. Commandes utilitaires : signées + un seul avatar ----------
  console.log('— Utilitaires —');
  check('avatar : footer signé + timestamp', premade.includes("name: `Avatar de ${target.tag || target.username}`") && premade.includes('.setFooter({ text: `Hoxera · ${guild.name}` })'));
  check('userinfo : un seul avatar (author) + footer signé',
    premade.includes("setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })\n        .addFields(")
    && !premade.includes("setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })\n        .setThumbnail(target.displayAvatarURL({ dynamic: true }))")
    && premade.includes("if (tMember) embed.addFields({ name: '🚪 A rejoint le'")
    && premade.includes('embed.setFooter({ text: `Hoxera · ${guild.name}` }).setTimestamp();'));
  check('serverinfo : un seul visuel (author) + footer signé',
    premade.includes("setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })\n        .addFields(")
    && !premade.includes('.setThumbnail(guild.iconURL({ dynamic: true }))')
    && premade.includes('.setFooter({ text: `Hoxera · ${guild.name}` })\n        .setTimestamp();'));
  check('avatar : image pleine + footer signé (pas d’auteur avatar)',
    premade.includes('.setAuthor({ name: `Avatar de ${target.tag || target.username}` })')
    && premade.includes('.setImage(target.displayAvatarURL({ size: 512, dynamic: true }))\n        .setFooter({ text: `Hoxera · ${guild.name}` })'));
  check('botinfo : author bot + footer signé', premade.includes("name: '🤖 Créé avec amour'") && premade.includes('.setFooter({ text: `Hoxera · ${guild.name}` })\n        .setTimestamp();'));

  // ---------- 6. Bienvenue / départ : un seul avatar par embed ----------
  console.log('— Bienvenue / départ premium —');
  check('events : author bienvenue sans icône (avatar porté par le visuel)', events.includes(".setAuthor({ name: `${user.tag || user.username || 'Nouveau membre'} vient d'arriver !` })") && !events.includes("iconURL: avatarUrl || undefined })\n          .setTitle(`👋 Bienvenue"));
  check('events : author départ sans icône', events.includes(".setAuthor({ name: `${user.tag || user.username || 'Un membre'} s'en va…` })"));
  check('events : thumbnail seulement quand ni carte ni image (bienvenue)', events.includes("} else if (avatarUrl) {\n          embed.setThumbnail(avatarUrl);"));
  check('events : départ — image OU thumbnail, pas les deux', events.includes("if (cfg.image) {\n      // 🖼️ L'image configurée est le visuel ; pas de thumbnail en double.\n      embed.setImage(String(cfg.image).trim());\n    } else if (avatarUrl) {\n      embed.setThumbnail(avatarUrl);\n    }"));

  // ---------- 7. Charte « social » ----------
  console.log('— Vie sociale chartée —');
  check('couple : passe par la charte (variant social)', extra.includes("variant: 'social',\n        title: `💍 Couple de ${target.username}`"));
  check('plus de rose littéral hors charte dans extra', !extra.includes("color: '#EB459E'"));

  // ---------- 8. Version ----------
  check('index : bump v217', fs.readFileSync('public/index.html', 'utf8').includes('?v=229'));
  check('sw : bump botdev-v229', fs.readFileSync('public/sw.js', 'utf8').includes('botdev-v229'));

  console.log(`  ✅ v217 : ${n} vérifications`);
})().catch((e) => { console.error(e); process.exit(1); });
