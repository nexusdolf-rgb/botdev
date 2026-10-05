// Test v350 — ping et carte réunis dans un panneau Components V2.
// Vérifie le vrai ping ciblé, l'ordre texte → Media Gallery, le cache public
// temporaire et la conservation du calcul XP et du réglage xp_card.
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v350-${process.pid}-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const xp = require('../server/discord/xp');
const community = require('../server/discord/community');
const identity = require('../server/discord/identity');
const cardCache = require('../server/levelUpCardCache');
const { MessageFlags } = require('discord.js');
const sharp = require('sharp');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
const serverIndex = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, `❌ ${label}`);
  console.log(`  ✅ ${label}`);
};

const BOT = 1;
const GUILD = '900000000000000350';
const USER = '900000000000000011';
const USER2 = '900000000000000012';

function faireMessage(userId, displayName) {
  const guild = {
    id: GUILD,
    name: 'Serveur test',
    channels: { cache: new Map() },
    roles: { cache: new Map() },
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

function fakeResponse() {
  const state = { statusCode: 200, headers: {}, body: undefined };
  const res = {
    status(code) { state.statusCode = code; return res; },
    set(name, value) { state.headers[name] = value; return res; },
    end(body) { state.body = body; return res; },
    state,
  };
  return res;
}

(async () => {
  console.log('▶ v350-test.js');

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
    // ---------- 1. Carte dynamique v349 conservée ----------
    console.log('— Carte dynamique —');
    const svg = community.levelUpCardSvg({ name: 'Alex', level: 12, pct: 0.42 });
    check('la carte affiche NIVEAU et le niveau reçu en paramètre', svg.includes('NIVEAU') && svg.includes('>12</text>'));
    check('le nom du membre est injecté dans la carte', svg.includes('Alex'));
    check('42 % produit une barre de 227 px sur 540', svg.includes('width="227"') && svg.includes('width="540"'));
    check('la progression reste bornée entre 0 et 100 %',
      community.levelUpCardSvg({ level: 2, pct: -1 }).includes('width="0"')
      && community.levelUpCardSvg({ level: 2, pct: 2 }).includes('width="540"'));
    check('le nom est échappé avant insertion dans le SVG',
      community.levelUpCardSvg({ name: 'A&B<C>', level: 2 }).includes('A&amp;B&lt;C&gt;'));

    const avatarUrl = 'https://cdn.example/alex-avatar.png';
    const png = await community.levelUpCard({ avatarUrl, name: 'Alex', level: 12, pct: 0.42 });
    const meta = await sharp(png).metadata();
    const svgOnly = await sharp(Buffer.from(svg)).png().toBuffer();
    check('le générateur produit un PNG 880 × 280', meta.format === 'png' && meta.width === 880 && meta.height === 280);
    check('la carte charge et compose l’avatar reçu', avatarRequests.includes(avatarUrl) && !png.equals(svgOnly));

    // ---------- 2. Cache image public : borné, expirant, non devinable ----------
    console.log('— Cache public de la Media Gallery —');
    const cachedKey = cardCache.put(Buffer.from('image test'));
    check('la clé publique est aléatoire (48 caractères hexadécimaux)', /^[a-f0-9]{48}$/.test(cachedKey || ''));
    check('le cache renvoie les octets PNG par clé', cardCache.get(cachedKey).equals(Buffer.from('image test')));
    check('les clés mal formées ne révèlent aucune image', cardCache.get('../invalide') === null);

    const routeResponse = fakeResponse();
    cardCache.route({ params: { key: cachedKey } }, routeResponse);
    check('la route sert le PNG en image/png avec cache HTTP',
      routeResponse.state.statusCode === 200
      && routeResponse.state.headers['Content-Type'] === 'image/png'
      && routeResponse.state.headers['Cache-Control'].includes('max-age=3600')
      && routeResponse.state.body.equals(Buffer.from('image test')));
    const missingResponse = fakeResponse();
    cardCache.route({ params: { key: '0'.repeat(48) } }, missingResponse);
    check('une clé inconnue renvoie 404', missingResponse.state.statusCode === 404);

    const fixedNow = 1000000;
    const expiringKey = cardCache.put(Buffer.from('temporaire'), fixedNow);
    check('le cache conserve l’image jusqu’à son expiration',
      cardCache.get(expiringKey, fixedNow + cardCache.TTL_MS - 1) !== null);
    check('le cache retire l’image après 24 heures',
      cardCache.get(expiringKey, fixedNow + cardCache.TTL_MS) === null);
    for (let i = 0; i < cardCache.MAX_ENTRIES + 4; i++) cardCache.put(Buffer.from([i % 255]));
    check('le nombre d’images en mémoire reste plafonné', cardCache.stats().size <= cardCache.MAX_ENTRIES);
    check('server/index.js expose la route image avant le fallback SPA',
      serverIndex.includes("app.get('/levelup-card/:key.png'") && serverIndex.includes("require('./levelUpCardCache').route"));

    // ---------- 3. Annonce : vrai payload transmis à Discord ----------
    console.log('— Ping avant le texte, carte dans le même panneau —');
    let sent = [];
    const originalSend = identity.sendAsProfile;
    identity.sendAsProfile = async (...args) => { sent.push(args[4]); return true; };

    try {
      store.settings.set('public_url', 'https://hoxera.is-a.dev');
      store.guildSettings.set(BOT, GUILD, {
        xp_enabled: 1, xp_min: 10, xp_max: 10, xp_cooldown: 0,
        xp_message: '', xp_channel: '', xp_card: 1,
      });
      store.xp.add(BOT, GUILD, USER, 95, Date.now() - 120000);
      const message = faireMessage(USER, 'Alex');
      await xp.onMessage(BOT, message);

      const payload = sent[0];
      const panel = payload && payload.components && payload.components[0] && payload.components[0].toJSON();
      const blocks = panel && panel.components || [];
      const textDisplay = blocks.find((item) => item.type === 10);
      const gallery = blocks.find((item) => item.type === 12);
      const firstMedia = gallery && gallery.items && gallery.items[0];
      const imageUrl = firstMedia && ((firstMedia.media && firstMedia.media.url) || firstMedia.url);
      const visibleText = String((textDisplay && textDisplay.content) || '');

      check('le message est un panneau Discord Components V2',
        payload && (payload.flags & MessageFlags.IsComponentsV2) !== 0 && panel && panel.type === 17);
      check('le vrai ping précède la phrase dans le même Text Display agrandi',
        visibleText.startsWith('## ') && visibleText.indexOf(`<@${USER}>`) >= 0
        && visibleText.indexOf(`<@${USER}>`) < visibleText.indexOf("vient d'atteindre le niveau 1 !"));
      check('la carte est la Media Gallery du même conteneur',
        !!imageUrl && imageUrl.startsWith('https://hoxera.is-a.dev/levelup-card/'));
      check('le ping est autorisé uniquement pour le membre ciblé',
        payload && payload.allowedMentions && payload.allowedMentions.parse.length === 0
        && payload.allowedMentions.users.length === 1 && payload.allowedMentions.users[0] === USER);
      check('le webhook ne reçoit ni content séparé, ni embed, ni fichier',
        payload && payload.content === undefined && payload.embeds === undefined && payload.files === undefined);
      check('la carte de l’annonce utilise l’avatar Discord du membre',
        avatarRequests.includes(`https://cdn.example/member/${USER}.png`));
      check('le niveau atteint et le calcul XP sont conservés',
        (store.xp.get(BOT, GUILD, USER) || {}).level === 1);

      const tokenMatch = String(imageUrl || '').match(/\/levelup-card\/([a-f0-9]{48})\.png$/);
      check('l’URL de la galerie correspond à une image encore servie par le cache',
        !!tokenMatch && Buffer.isBuffer(cardCache.get(tokenMatch[1])));

      sent = [];
      store.guildSettings.set(BOT, GUILD, {
        xp_enabled: 1, xp_min: 10, xp_max: 10, xp_cooldown: 0,
        xp_message: 'Nouveau niveau atteint !', xp_channel: '', xp_card: 0,
      });
      store.xp.add(BOT, GUILD, USER2, 95, Date.now() - 120000);
      await xp.onMessage(BOT, faireMessage(USER2, 'Sam'));
      const custom = sent[0];
      check('xp_card désactivé : ancien modèle sans {user} garde le vrai ping',
        custom && custom.content === `<@${USER2}> Nouveau niveau atteint !`
        && custom.allowedMentions.users[0] === USER2);
      check('xp_card désactivé : pas de panneau, de carte ni de chargement d’avatar',
        custom && !custom.components && !custom.embeds && !custom.files
        && !avatarRequests.includes(`https://cdn.example/member/${USER2}.png`));
    } finally {
      identity.sendAsProfile = originalSend;
    }
  } finally {
    global.fetch = originalFetch;
  }

  console.log('— Cache frontend —');
  check('index.html : les 7 ressources pointent vers v350', (indexHtml.match(/\?v=353/g) || []).length === 7);
  check('service worker : cache botdev-v353', serviceWorker.includes("const CACHE = 'botdev-v353';"));

  console.log(`\n✅ v350-test.js : ${n} vérifications OK`);
})().catch((err) => { console.error(err); process.exit(1); });
