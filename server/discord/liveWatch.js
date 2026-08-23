// ============================================================
// Hoxera — 🔴 Annonces de live (TikTok, Twitch, YouTube, Kick)
// On enregistre le lien social d'un membre ; dès qu'il passe EN LIVE,
// le bot l'annonce dans le salon dédié : embed soigné (pseudo + photo
// de profil + bouton « Regarder le live ») + ping réglable.
// Détection par sondage toutes les 3 min, tolérante aux pannes :
// une plateforme injoignable ne casse jamais rien.
// ============================================================
const store = require('../db');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const PLATFORMS = {
  tiktok:  { emoji: '🎵', label: 'TikTok',  color: 0xFE2C55, url: (h) => `https://www.tiktok.com/@${h}/live` },
  twitch:  { emoji: '🟣', label: 'Twitch',  color: 0x9146FF, url: (h) => `https://www.twitch.tv/${h}` },
  youtube: { emoji: '▶️', label: 'YouTube', color: 0xFF0000, url: (h) => `https://www.youtube.com/@${h}/live` },
  kick:    { emoji: '🟢', label: 'Kick',    color: 0x53FC18, url: (h) => `https://kick.com/${h}` },
};

// ------------------------------------------------------------
// 🧭 Extraction du pseudo depuis un lien ou un @pseudo (fonction PURE)
// Accepte : URL complète, @pseudo ou pseudo nu. Renvoie {platform, handle} ou null.
// ------------------------------------------------------------
function parseSocial(input, platformHint) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const pats = [
    [/tiktok\.com\/@([\w.\-]+)/i, 'tiktok'],
    [/twitch\.tv\/([\w\-]+)/i, 'twitch'],
    [/youtube\.com\/@([\w.\-]+)/i, 'youtube'],
    [/kick\.com\/([\w\-]+)/i, 'kick'],
  ];
  for (const [re, p] of pats) {
    const m = raw.match(re);
    if (m) return { platform: p, handle: m[1].toLowerCase() };
  }
  const handle = raw.replace(/^@/, '').replace(/[^\w.\-]/g, '').toLowerCase();
  if (!handle) return null;
  const platform = String(platformHint || '').toLowerCase();
  if (!PLATFORMS[platform]) return null;
  return { platform, handle };
}

// ------------------------------------------------------------
// 📣 Décision d'annonce (fonction PURE)
// On annonce UNIQUEMENT au passage hors-ligne → en-ligne, avec un
// garde-fou anti-doublon de 30 min (redémarrages, faux positifs).
// ------------------------------------------------------------
function liveDecision(prevStatus, isLiveNow, lastAnnounceTs, nowTs) {
  if (!isLiveNow) return 'none';
  if (prevStatus === 'live') return 'none'; // déjà annoncé, toujours en live
  if (lastAnnounceTs && nowTs - lastAnnounceTs < 30 * 60000) return 'none';
  return 'announce';
}

// ------------------------------------------------------------
// 🔎 Détecteurs par plateforme — renvoient { live, name, avatar } ou null
// ------------------------------------------------------------
async function checkTikTok(handle) {
  const r = await fetch(`https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(handle)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  const u = d && d.data && d.data.user;
  if (!u) return null;
  return { live: u.status === 2, name: u.nickname || handle, avatar: u.avatarThumb || '' };
}

async function checkTwitch(handle) {
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query: `query { user(login: "${handle.replace(/[^\w\-]/g, '')}") { displayName profileImageURL(width: 150) stream { id } } }` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  const u = d && d.data && d.data.user;
  if (!u) return null;
  return { live: !!u.stream, name: u.displayName || handle, avatar: u.profileImageURL || '' };
}

async function checkKick(handle) {
  const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(handle)}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || !d.user) return null;
  return { live: !!d.livestream, name: d.user.username || handle, avatar: d.user.profile_pic || '' };
}

async function checkYouTube(handle) {
  const r = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}/live`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const html = await r.text();
  const live = html.includes('"isLive":true') && !html.includes('"status":"LIVE_STREAM_OFFLINE"');
  const avatarMatch = html.match(/<link rel="image_src" href="([^"]+)"/) || html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
  const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  return { live, name: nameMatch ? nameMatch[1].replace(/ - YouTube.*$/, '') : handle, avatar: avatarMatch ? avatarMatch[1] : '' };
}

const CHECKERS = { tiktok: checkTikTok, twitch: checkTwitch, kick: checkKick, youtube: checkYouTube };

// ------------------------------------------------------------
// 🧹 Balayage : pour chaque serveur configuré, vérifie chaque membre
// enregistré et annonce les nouveaux lives.
// ------------------------------------------------------------
let sweeping = false;
async function sweep(botManager) {
  if (sweeping) return; // jamais deux balayages en même temps
  sweeping = true;
  try {
    for (const [botId, entry] of botManager.clients) {
      if (!entry.client.isReady()) continue;
      for (const guild of entry.client.guilds.cache.values()) {
        const gs = store.guildSettings.get(botId, guild.id) || {};
        const chanName = String(gs.live_channel || '').replace(/^#/, '').trim();
        if (!chanName) continue;
        const channel = guild.channels.cache.find((c) => c.name === chanName && c.isTextBased && c.isTextBased());
        if (!channel) continue;
        const socials = store.liveSocials.all(botId, guild.id).slice(0, 20);
        for (const s of socials) {
          try {
            const checker = CHECKERS[s.platform];
            if (!checker) continue;
            const res = await checker(s.handle);
            if (!res) continue; // plateforme injoignable : on garde l'état précédent
            const decision = liveDecision(s.last_status, res.live, s.last_announce_ts, Date.now());
            if (decision === 'announce') {
              await announce(botId, guild, channel, s, res, gs);
              store.liveSocials.setStatus(botId, guild.id, s.id, 'live', Date.now());
            } else {
              store.liveSocials.setStatus(botId, guild.id, s.id, res.live ? 'live' : 'off', res.live ? s.last_announce_ts : 0);
            }
          } catch { /* un échec n'arrête jamais la boucle */ }
          await new Promise((r) => setTimeout(r, 1500)); // douceur avec les plateformes
        }
      }
    }
  } finally { sweeping = false; }
}

async function announce(botId, guild, channel, social, res, gs) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const p = PLATFORMS[social.platform];
  const url = p.url(social.handle);
  const ping = gs.live_ping === 'none' ? '' : gs.live_ping === 'here' ? '@here' : '@everyone';

  const embed = new EmbedBuilder()
    .setColor(p.color)
    .setAuthor({ name: `${res.name} est en live !`, iconURL: res.avatar || undefined, url })
    .setTitle(`${p.emoji} 🔴 LIVE sur ${p.label}`)
    .setDescription(`**${res.name}** vient de lancer un live sur **${p.label}** !\n\n✨ Rejoins-le maintenant, il t'attend :`)
    .addFields(
      { name: `${p.emoji} Pseudo`, value: `[@${social.handle}](${url})`, inline: true },
      { name: '👤 Membre', value: social.user_id ? `<@${social.user_id}>` : '—', inline: true },
    )
    .setFooter({ text: `${guild.name} · Annonces de live`, iconURL: guild.iconURL ? (guild.iconURL({ size: 64 }) || undefined) : undefined })
    .setTimestamp();
  if (res.avatar) embed.setThumbnail(res.avatar);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(`▶️ Regarder le live ${p.label}`).setURL(url)
  );

  await channel.send({
    content: ping || undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: ping ? ['everyone'] : [] },
  });
  try {
    const logging = require('./logging');
    await logging.log(botId, guild, { title: '🔴 Annonce de live', description: `${res.name} (@${social.handle} · ${p.label}) annoncé dans #${channel.name}`, color: '#FE2C55' });
  } catch {}
}

module.exports = { PLATFORMS, parseSocial, liveDecision, CHECKERS, sweep, announce };
