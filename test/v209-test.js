// Test v209 — Refonte de présentation des messages Discord
// ----------------------------------------------------------
// Règles v209 (décidées avec le propriétaire) :
// 1. « Hoxera » signe TOUS les messages Discord (footer/author) ; plus
//    aucune signature « Optimus Prime » dans les messages (seules restent
//    les données techniques : préfixe Auto-Mod officiel, noms de règles,
//    bio « À propos » et trivia — pas des signatures).
// 2. La couleur neutre/brand des embeds = terracotta de marque #e07a5f
//    (fini le blurple #5865F2 de Discord partout). Vert/jaune/rouge
//    sémantiques et or de l'économie inchangés.
// 3. Montée de niveau = embed soigné (progression, rang, récompense,
//    footer signé) au lieu d'un simple texte.
// 4. Giveaway structuré (champs) et sans titre en MAJUSCULES.
// 5. Plus d'avatar en double (author + thumbnail) sur /rank & /profile.
// 6. Aperçus Discord du dashboard unifiés (mêmes arrondis, même surface).
const assert = require('assert');
const fs = require('fs');

const read = (p) => fs.readFileSync(p, 'utf8');
const ui = require('../server/discord/ui');
const COLORS = ui.COLORS || {};

const files = {
  ui: read('server/discord/ui.js'),
  premade: read('server/discord/premade.js'),
  extra: read('server/discord/extra.js'),
  xp: read('server/discord/xp.js'),
  giveaway: read('server/discord/giveaway.js'),
  events: read('server/discord/events.js'),
  antiraid: read('server/discord/antiraid.js'),
  automod: read('server/discord/automod.js'),
  panels: read('server/discord/panels.js'),
  i18n: read('server/i18n.js'),
  css: read('public/css/dashboard.css'),
  dashJs: read('public/js/dashboard.js'),
  indexHtml: read('public/index.html'),
  sw: read('public/sw.js'),
};

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

console.log('▶ v209-test.js');

// ---------- 1. Identité : Hoxera signe les messages ----------
console.log('— Identité : Hoxera signe les messages Discord —');
check('design system : brand = terracotta #e07a5f', COLORS.brand === '#e07a5f');
check('design system : footer par défaut = Hoxera', (ui.DEFAULT_FOOTER || '').includes('Hoxera'));
check('premade /profile & /rank & /levels signés Hoxera', files.premade.includes(".setFooter({ text: `Hoxera · ${guild.name}` })"));
check('anti-raid signé Hoxera', files.antiraid.includes('Hoxera — anti-raid automatique'));
check('blacklist automod signée Hoxera', files.automod.includes('Blacklist du serveur · Hoxera'));
check('panels : repli du panneau = Hoxera', files.panels.includes("PANEL_DEFAULT_NAME = 'Hoxera'"));
check('i18n : message « très sollicité » signé Hoxera', files.i18n.includes('Hoxera est très sollicité'));
check('plus aucune signature « Optimus Prime · » dans les messages', !files.premade.includes('Optimus Prime · ${guild.name}'));

// ---------- 2. Palette : la marque suit sur Discord ----------
console.log('— Palette : terracotta #e07a5f = neutre, zéro blurple par défaut —');
check('xp (niveau) : couleur de marque', files.xp.includes(".setColor('#e07a5f')"));
check('events : couleur invalide → marque', files.events.includes(": '#e07a5f'"));
check('premade : /rank couleur de marque', files.premade.includes(".setColor('#e07a5f')"));
check('aucun blurple #5865F2 restant dans ui/events/premade/extra/xp',
  !files.ui.includes('5865F2') && !files.events.includes('5865F2') && !files.premade.includes('5865F2')
  && !files.extra.includes('5865F2') && !files.xp.includes('5865F2'));

// ---------- 3. Montée de niveau : embed soigné ----------
console.log('— Niveau : annonce en embed soigné —');
check('xp.js : importe EmbedBuilder', files.xp.includes("require('discord.js')"));
check('xp.js : annonce en embed', files.xp.includes('new EmbedBuilder()'));
check('xp.js : mention de la progression', files.xp.includes("name: 'Progression'"));
check('xp.js : champ XP', files.xp.includes("name: '✨ XP'"));
check('xp.js : footer signé Hoxera', files.xp.includes('Hoxera · ${message.guild.name}'));

// ---------- 4. Giveaway : structuré, sans MAJUSCULES ----------
console.log('— Giveaway : panneau structuré —');
check('giveaway : titre « Giveaway » (pas de MAJUSCULES)', !files.giveaway.includes('GIVEAWAY'));
check('giveaway : infos en champs', files.giveaway.includes("name: '🏆 Nombre de gagnants'"));
check('giveaway : footer signé Hoxera', /\.setFooter\(\{ text: 'Hoxera \u00B7 Giveaway' \}\)/.test(files.giveaway));
check('giveaway : état final sans MAJUSCULES', !files.giveaway.includes('GIVEAWAY TERMINÉ'));

// ---------- 5. Rank / profile : avatar unique ----------
console.log('— Rank / profile : plus d’avatar en double —');
check('premade /rank : pas d’auteur à avatar (thumbnail unique)', !files.premade.includes('.setAuthor({ name: `Niveau de ${target.username}`, iconURL'));
check('premade /profile : titre au lieu de l’auteur doublé', files.premade.includes('.setTitle(`🪪 Profil de ${target.username}`)'));

// ---------- 6. Aperçus du dashboard unifiés ----------
console.log('— Dashboard : surface Discord unique + textes —');
check('CSS : tokens d’arrondis v209', files.css.includes('--r-sm: 10px'));
check('CSS : toutes les surfaces Discord aux mêmes arrondis', files.css.includes('.ca-discord-preview, .eb-discord') && files.css.includes('border-radius: var(--r-sm)'));
check('dashboard : modèle d’accueil au tutoiement (plus de « je vous invite »)', !files.dashJs.includes('je vous invite à prendre connaissance'));
check('dashboard : modèle de départ au tutoiement', files.dashJs.includes('la porte reste ouverte si tu reviens'));
check('index : version v209', files.indexHtml.includes('?v=219'));
check('service worker : cache v209', files.sw.includes('botdev-v219'));
check('menu mobile : nom du bot dynamique', files.dashJs.includes('Dashboard.state.bot.name'));

// ---------- 7. Invitations (extra) : champ + footer ----------
console.log('— Invitations : rangées propres —');
check('extra /invites : top recruteurs en champ', files.extra.includes("name: '🏆 Top des recruteurs'"));
check('extra /invites : footer signé Hoxera', /Hoxera \u00B7 \$\{guild\.name\}/.test(files.extra));

console.log(`\n✅ v209-test.js : ${n} vérifications OK`);
process.exit(0);
