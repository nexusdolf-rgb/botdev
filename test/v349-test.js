// Test v349 — nouvelle carte de niveau, avatar du membre et vrai ping Discord.
// Vérifie la carte dynamique, l'annonce réellement envoyée et la conservation
// de l'XP (sans afficher XP/rang dans le message de montée de niveau).
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v349-${process.pid}-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const xp = require('../server/discord/xp');
const community = require('../server/discord/community');
const identity = require('../server/discord/identity');
const sharp = require('sharp');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, `❌ ${label}`);
  console.log(`  ✅ ${label}`);
};

const BOT = 1;
const GUILD = '900000000000000349';
const USER = '900000000000000011';
const USER2 = '900000000000000012';

function faireMessage(userId, displayName) {
  const guild = {
    id: GUILD,
    name: 'Serveur test',
    channels: { cache: new Map() },
  };
  const channel = { id: '900000000000000099', send: async () => true };
  return {
    author: {
      id: userId, username: displayName.toLowerCase(), globalName: displayName, bot: false,
      displayAvatarURL: () => `https://cdn.example/user/${userId}.png`,
    },
    member: {
      id: userId, displayName, guild,
      displayAvatarURL: () => `https://cdn.example/member/${userId}.png`,
    },
    guild,
    channel,
    client: { user: { id: '900000000000000001' } },
  };
}

(async () => {
  console.log('▶ v349-test.js');

  // Réponse locale fictive : aucune connexion réseau pendant le test.
  const avatarPng = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 52, g: 110, b: 190 } },
  }).png().toBuffer();
  const avatarRequests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    avatarRequests.push(String(url));
    return { ok: true, arrayBuffer: async () => avatarPng };
  };

  try {
    // ---------- 1. Carte dynamique ----------
    console.log('— Carte fournie —');
    const svg = community.levelUpCardSvg({ name: 'Alex', level: 12, pct: 0.42 });
    check('le visuel affiche NIVEAU et le niveau reçu en paramètre', svg.includes('NIVEAU') && svg.includes('>12</text>'));
    check('le nom du membre est injecté dans la carte', svg.includes('Alex'));
    check('42 % produit une barre de 227 px sur 540', svg.includes('width="227"') && svg.includes('width="540"'));
    check('la progression est bornée entre 0 et 100 %',
      community.levelUpCardSvg({ level: 2, pct: -1 }).includes('width="0"')
      && community.levelUpCardSvg({ level: 2, pct: 2 }).includes('width="540"'));
    check('le nom est échappé avant insertion dans le SVG',
      community.levelUpCardSvg({ name: 'A&B<C>', level: 2 }).includes('A&amp;B&lt;C&gt;'));

    const avatarUrl = 'https://cdn.example/alex-avatar.png';
    const png = await community.levelUpCard({ avatarUrl, name: 'Alex', level: 12, pct: 0.42 });
    const meta = await sharp(png).metadata();
    const svgOnly = await sharp(Buffer.from(svg)).png().toBuffer();
    check('le générateur produit une vraie image PNG 880 × 280', meta.format === 'png' && meta.width === 880 && meta.height === 280);
    check('la carte charge et compose l’avatar de la personne', avatarRequests.includes(avatarUrl) && !png.equals(svgOnly));

    // ---------- 2. Annonce : le vrai payload envoyé à Discord ----------
    console.log('— Ping réel + avatar du membre, sans statistiques —');
    let sent = [];
    const originalSend = identity.sendAsProfile;
    identity.sendAsProfile = async (...args) => { sent.push(args[4]); return true; };

    try {
      store.guildSettings.set(BOT, GUILD, {
        xp_enabled: 1, xp_min: 10, xp_max: 10, xp_cooldown: 0,
        xp_message: '', xp_channel: '', xp_card: 1,
      });
      store.xp.add(BOT, GUILD, USER, 95, Date.now() - 120000);
      const message = faireMessage(USER, 'Alex');
      await xp.onMessage(BOT, message);

      const payload = sent[0];
      check('le message par défaut annonce « Alex vient d’atteindre le niveau 1 ! »',
        payload && payload.content === `<@${USER}> vient d'atteindre le niveau 1 !`);
      check('le ping est autorisé uniquement pour ce membre',
        payload && payload.allowedMentions.parse.length === 0
        && payload.allowedMentions.users.length === 1
        && payload.allowedMentions.users[0] === USER);
      check('la carte est envoyée en pièce jointe levelup.png',
        payload && payload.files && payload.files.length === 1 && payload.files[0].name === 'levelup.png'
        && Buffer.isBuffer(payload.files[0].attachment));
      const embed = payload && payload.embeds && payload.embeds[0] && payload.embeds[0].toJSON();
      check('l’embed ne contient que la carte cyan, sans champ XP ou rang',
        embed && embed.color === 0x30d5ff && embed.image.url === 'attachment://levelup.png'
        && (!embed.fields || embed.fields.length === 0));
      check('la carte de l’annonce utilise l’avatar Discord du membre',
        avatarRequests.includes(`https://cdn.example/member/${USER}.png`));
      check('la progression XP continue bien d’atteindre le niveau 1',
        (store.xp.get(BOT, GUILD, USER) || {}).level === 1);

      sent = [];
      store.guildSettings.set(BOT, GUILD, {
        xp_enabled: 1, xp_min: 10, xp_max: 10, xp_cooldown: 0,
        xp_message: 'Nouveau niveau atteint !', xp_channel: '', xp_card: 0,
      });
      store.xp.add(BOT, GUILD, USER2, 95, Date.now() - 120000);
      await xp.onMessage(BOT, faireMessage(USER2, 'Sam'));
      const custom = sent[0];
      check('un ancien modèle sans {user} garde malgré tout un vrai ping',
        custom && custom.content === `<@${USER2}> Nouveau niveau atteint !`
        && custom.allowedMentions.users[0] === USER2);
      check('désactiver la carte garde le ping et ne charge pas l’avatar',
        custom && !custom.embeds && !custom.files
        && !avatarRequests.includes(`https://cdn.example/member/${USER2}.png`));
    } finally {
      identity.sendAsProfile = originalSend;
    }
  } finally {
    global.fetch = originalFetch;
  }

  console.log('— Cache frontend —');
  check('index.html : les 7 ressources pointent vers v349', (indexHtml.match(/\?v=349/g) || []).length === 7);
  check('service worker : cache botdev-v349', serviceWorker.includes("const CACHE = 'botdev-v349';"));

  console.log(`\n✅ v349-test.js : ${n} vérifications OK`);
})().catch((err) => { console.error(err); process.exit(1); });
