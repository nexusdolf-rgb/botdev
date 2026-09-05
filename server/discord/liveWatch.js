// ============================================================
// Hoxera — 🔴 Annonces de live (TikTok, Twitch, YouTube, Kick)
// On enregistre le lien social d'un membre ; dès qu'il passe EN LIVE,
// le bot l'annonce dans le salon dédié : embed soigné + bouton « Regarder ».
//
// Fiabilité v3.8 :
// - une annonce par SESSION (room/stream key), pas un cooldown arbitraire ;
// - deux contrôles hors ligne avant de considérer un live terminé ;
// - un faux négatif de plateforme ne peut plus provoquer de doublon ;
// - chaque échec de détection ou d'envoi est visible dans les logs/diagnostics ;
// - le salon est résolu par ID ou par nom, avec contrôle des permissions.
// ============================================================
const store = require('../db');
const health = require('../health');
const ui = require('./ui');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const OFFLINE_CONFIRMATIONS = 2;
const PLATFORM_DELAY_MS = 1500;

const PLATFORMS = {
  tiktok:  { emoji: '🎵', label: 'TikTok',  color: 0xFE2C55, url: (h) => `https://www.tiktok.com/@${h}/live` },
  twitch:  { emoji: '🟣', label: 'Twitch',  color: 0x9146FF, url: (h) => `https://www.twitch.tv/${h}` },
  youtube: { emoji: '▶️', label: 'YouTube', color: 0xFF0000, url: (h) => `https://www.youtube.com/@${h}/live` },
  kick:    { emoji: '🟢', label: 'Kick',    color: 0x53FC18, url: (h) => `https://kick.com/${h}` },
};

// ------------------------------------------------------------
// 🧭 Extraction du pseudo depuis un lien ou un @pseudo (fonction PURE)
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
// 📣 Décision de nouvelle session (fonction PURE)
// lastAnnounceTs/nowTs restent dans la signature pour compatibilité avec
// l'ancien appel ; la décision repose désormais sur le statut + la clé de
// session. Un redémarrage légitime est donc annoncé immédiatement.
// ------------------------------------------------------------
function liveDecision(prevStatus, isLiveNow, lastAnnounceTs, nowTs, previousKey = '', currentKey = '') {
  if (!isLiveNow) return 'none';
  if (String(prevStatus || '') !== 'live') return 'announce';
  if (previousKey && currentKey && String(previousKey) !== String(currentKey)) return 'announce';
  return 'none';
}

// Convertit une observation et l'état persistant en prochaine décision.
// Un seul résultat « off » ne suffit pas : les APIs publiques peuvent
// répondre faux pendant une transition ou une micro-coupure.
function liveTransition(previous = {}, observation = {}, nowTs = Date.now()) {
  const prevStatus = String(previous.last_status || '') === 'live' ? 'live' : 'off';
  const previousKey = String(previous.live_key || '').slice(0, 200);
  const previousTs = parseInt(previous.last_announce_ts, 10) || 0;
  const previousStreak = Math.max(parseInt(previous.offline_streak, 10) || 0, 0);
  const currentKey = String(observation.liveKey || '').slice(0, 200);

  if (observation.live === true) {
    const action = liveDecision(prevStatus, true, previousTs, nowTs, previousKey, currentKey);
    return {
      action,
      status: 'live',
      liveKey: currentKey || (prevStatus === 'live' ? previousKey : ''),
      offlineStreak: 0,
      announceTs: action === 'announce' ? nowTs : previousTs,
      lastError: '',
    };
  }

  if (prevStatus !== 'live') {
    return {
      action: 'none',
      status: 'off',
      liveKey: '',
      offlineStreak: 0,
      announceTs: previousTs,
      lastError: '',
    };
  }

  const streak = Math.min(previousStreak + 1, OFFLINE_CONFIRMATIONS);
  const confirmedOffline = streak >= OFFLINE_CONFIRMATIONS;
  return {
    action: 'none',
    status: confirmedOffline ? 'off' : 'live',
    liveKey: confirmedOffline ? '' : previousKey,
    offlineStreak: confirmedOffline ? 0 : streak,
    // On conserve la date de la dernière annonce pour l'audit ; elle ne
    // bloque plus un nouveau live après une vraie sortie.
    announceTs: previousTs,
    lastError: '',
  };
}

// ------------------------------------------------------------
// 🔎 Détecteurs par plateforme — renvoient { live, name, avatar, liveKey }
// ------------------------------------------------------------
function parseTikTokResponse(payload, handle) {
  const data = payload && payload.data ? payload.data : {};
  const u = data.user || {};
  const room = data.liveRoom || {};
  const statuses = [Number(u.status), Number(room.status)];
  // Sur l'endpoint public TikTok, le statut actif historique est 2.
  // Le statut 4 est souvent renvoyé avec une ancienne liveRoom même hors
  // ligne : il ne doit PAS être pris seul comme preuve d'un live actuel.
  const explicitLive = u.isLive === true || room.isLive === true || room.live === true || data.isLive === true;
  const live = explicitLive || statuses.includes(2);
  const roomId = u.roomId || room.roomId || room.roomIdStr || room.id || '';
  const startTime = room.startTime || room.start_time || '';
  const liveKey = live
    ? [roomId ? `room:${roomId}` : '', startTime ? `start:${startTime}` : ''].filter(Boolean).join('|')
    : '';
  return {
    live,
    name: u.nickname || handle,
    avatar: u.avatarThumb || u.avatarMedium || u.avatarLarger || '',
    liveKey,
  };
}

async function checkTikTok(handle) {
  const r = await fetch(`https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(handle)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  const u = d && d.data && d.data.user;
  if (!u) return null;
  return parseTikTokResponse(d, handle);
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
  return { live: !!u.stream, name: u.displayName || handle, avatar: u.profileImageURL || '', liveKey: u.stream && u.stream.id ? `stream:${u.stream.id}` : '' };
}

async function checkKick(handle) {
  const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(handle)}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || !d.user) return null;
  const stream = d.livestream;
  const liveKey = stream && (stream.id || stream.stream_id || stream.session_id || stream.slug || stream.created_at || stream.start_time);
  return { live: !!stream, name: d.user.username || handle, avatar: d.user.profile_pic || '', liveKey: liveKey ? `stream:${liveKey}` : '' };
}

async function checkYouTube(handle) {
  const r = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}/live`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const html = await r.text();
  const live = /"isLive"\s*:\s*true/.test(html) && !/"status"\s*:\s*"LIVE_STREAM_OFFLINE"/.test(html);
  const videoMatch = html.match(/"videoId"\s*:\s*"([\w-]{6,})"/);
  const avatarMatch = html.match(/<link rel="image_src" href="([^"]+)"/) || html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
  const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  return {
    live,
    name: nameMatch ? nameMatch[1].replace(/ - YouTube.*$/, '') : handle,
    avatar: avatarMatch ? avatarMatch[1] : '',
    liveKey: live && videoMatch ? `video:${videoMatch[1]}` : '',
  };
}

const CHECKERS = { tiktok: checkTikTok, twitch: checkTwitch, kick: checkKick, youtube: checkYouTube };

// ------------------------------------------------------------
// 🧭 Résolution du salon dédié
// Accepte une valeur historique « #nom » et également un ID Discord.
// ------------------------------------------------------------
function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  return channel.type === 0 || channel.type === 5 || channel.type === 'text' || channel.type === 'announcement';
}

function findLiveChannel(guild, configured) {
  const raw = String(configured || '').trim().replace(/^#/, '');
  if (!raw || !guild || !guild.channels || !guild.channels.cache) return null;
  const cache = guild.channels.cache;
  const values = typeof cache.values === 'function' ? [...cache.values()] : (Array.isArray(cache) ? cache : []);
  const find = (predicate) => {
    if (typeof cache.find === 'function') return cache.find(predicate) || null;
    return values.find(predicate) || null;
  };
  if (typeof cache.get === 'function') {
    const byId = cache.get(raw);
    if (isTextBasedChannel(byId)) return byId;
  }
  return find((c) => isTextBasedChannel(c) && String(c.id || '') === raw)
    || find((c) => isTextBasedChannel(c) && String(c.name || '') === raw)
    || find((c) => isTextBasedChannel(c) && String(c.name || '').toLowerCase() === raw.toLowerCase());
}

function channelPermissionIssue(guild, channel) {
  try {
    const me = guild && guild.members && guild.members.me;
    const perms = me && channel && typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null;
    if (!perms || typeof perms.has !== 'function') return '';
    const { PermissionFlagsBits } = require('discord.js');
    if (!perms.has(PermissionFlagsBits.SendMessages)) return `le bot ne peut pas écrire dans #${channel.name}`;
    if (!perms.has(PermissionFlagsBits.EmbedLinks)) return `le bot ne peut pas intégrer des liens dans #${channel.name}`;
  } catch (e) {
    return `permissions du salon #${channel && channel.name ? channel.name : 'live'} impossibles à vérifier (${e.message})`;
  }
  return '';
}

// Un même problème ne doit pas remplir les logs toutes les minutes.
const diagnostics = new Map();
function reportDiagnostic(key, message, level = 'warn') {
  if (diagnostics.get(key) === message) return;
  diagnostics.set(key, message);
  try { health.recordError('live', message); } catch {}
  const fn = level === 'error' ? console.error : console.warn;
  fn(`[Hoxera] 🔴 ${message}`);
}

function clearDiagnostic(key) {
  diagnostics.delete(key);
}

function stateFromRow(row) {
  return {
    status: String(row.last_status || '') === 'live' ? 'live' : 'off',
    liveKey: String(row.live_key || '').slice(0, 200),
    offlineStreak: Math.max(parseInt(row.offline_streak, 10) || 0, 0),
    announceTs: parseInt(row.last_announce_ts, 10) || 0,
  };
}

function saveErrorState(botId, guildId, row, checkedAt, message) {
  try {
    store.liveSocials.saveState(botId, guildId, row.id, {
      status: stateFromRow(row).status,
      liveKey: row.live_key || '',
      offlineStreak: row.offline_streak || 0,
      announceTs: row.last_announce_ts || 0,
      lastCheckedAt: checkedAt,
      lastError: message,
    });
  } catch (e) {
    console.error(`[Hoxera] 🔴 impossible d'enregistrer le diagnostic live : ${e.message}`);
  }
}

// ------------------------------------------------------------
// 🧹 Balayage : vérifie les comptes et annonce les nouvelles sessions.
// ------------------------------------------------------------
let sweeping = false;
async function sweep(botManager) {
  if (sweeping) return;
  sweeping = true;
  try {
    for (const [botId, entry] of botManager.clients) {
      if (!entry || !entry.client || typeof entry.client.isReady !== 'function' || !entry.client.isReady()) continue;
      const guilds = entry.client.guilds && entry.client.guilds.cache;
      if (!guilds || typeof guilds.values !== 'function') continue;
      for (const guild of guilds.values()) {
        const gs = store.guildSettings.get(botId, guild.id) || {};
        const configured = String(gs.live_channel || '').trim();
        if (!configured) continue;
        const channel = findLiveChannel(guild, configured);
        const channelDiagnosticKey = `${botId}:${guild.id}:channel`;
        if (!channel) {
          reportDiagnostic(channelDiagnosticKey, `salon des annonces introuvable pour ${guild.name || guild.id} : « ${configured} »`);
          continue;
        }
        const permissionIssue = channelPermissionIssue(guild, channel);
        if (permissionIssue) {
          reportDiagnostic(channelDiagnosticKey, permissionIssue);
          continue;
        }
        clearDiagnostic(channelDiagnosticKey);

        const socials = store.liveSocials.all(botId, guild.id).slice(0, 20);
        for (const row of socials) {
          const checker = CHECKERS[row.platform];
          if (!checker) {
            reportDiagnostic(`${botId}:${guild.id}:${row.id}:checker`, `détecteur inconnu pour ${row.platform}@${row.handle}`);
            continue;
          }
          const checkedAt = Date.now();
          let result;
          try {
            result = await checker(row.handle);
          } catch (e) {
            const message = `détection impossible pour ${row.platform}@${row.handle} : ${String(e.message || e).slice(0, 220)}`;
            saveErrorState(botId, guild.id, row, checkedAt, message);
            reportDiagnostic(`${botId}:${guild.id}:${row.id}:check`, message, 'error');
            await new Promise((resolve) => setTimeout(resolve, PLATFORM_DELAY_MS));
            continue;
          }

          if (!result) {
            const message = `plateforme injoignable pour ${row.platform}@${row.handle} — état précédent conservé`;
            saveErrorState(botId, guild.id, row, checkedAt, message);
            reportDiagnostic(`${botId}:${guild.id}:${row.id}:check`, message, 'warn');
            await new Promise((resolve) => setTimeout(resolve, PLATFORM_DELAY_MS));
            continue;
          }

          clearDiagnostic(`${botId}:${guild.id}:${row.id}:check`);
          const transition = liveTransition(row, { live: result.live === true, liveKey: result.liveKey }, checkedAt);
          if (transition.action === 'announce') {
            try {
              await announce(botId, guild, channel, row, result, gs);
              store.liveSocials.saveState(botId, guild.id, row.id, {
                status: transition.status,
                liveKey: transition.liveKey,
                offlineStreak: transition.offlineStreak,
                announceTs: transition.announceTs,
                lastCheckedAt: checkedAt,
                lastError: '',
              });
              console.log(`[Hoxera] 🔴 nouvelle session ${row.platform}@${row.handle} annoncée dans #${channel.name}`);
            } catch (e) {
              const message = `envoi impossible dans #${channel.name} pour ${row.platform}@${row.handle} : ${String(e.message || e).slice(0, 220)}`;
              saveErrorState(botId, guild.id, row, checkedAt, message);
              reportDiagnostic(`${botId}:${guild.id}:${row.id}:send`, message, 'error');
            }
          } else {
            try {
              store.liveSocials.saveState(botId, guild.id, row.id, {
                status: transition.status,
                liveKey: transition.liveKey,
                offlineStreak: transition.offlineStreak,
                announceTs: transition.announceTs,
                lastCheckedAt: checkedAt,
                lastError: '',
              });
            } catch (e) {
              const message = `état live impossible à enregistrer pour ${row.platform}@${row.handle} : ${e.message}`;
              reportDiagnostic(`${botId}:${guild.id}:${row.id}:state`, message, 'error');
            }
          }
          await new Promise((resolve) => setTimeout(resolve, PLATFORM_DELAY_MS));
        }
      }
    }
  } finally {
    sweeping = false;
  }
}

async function announce(botId, guild, channel, social, result, gs) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const permissionIssue = channelPermissionIssue(guild, channel);
  if (permissionIssue) throw new Error(permissionIssue);
  if (!channel || typeof channel.send !== 'function') throw new Error('salon non envoyable');
  const p = PLATFORMS[social.platform];
  if (!p) throw new Error(`plateforme inconnue : ${social.platform}`);
  const url = p.url(social.handle);
  const ping = gs.live_ping === 'none' ? '' : gs.live_ping === 'here' ? '@here' : '@everyone';

  const embed = new EmbedBuilder()
    .setColor(p.color)
    .setAuthor({ name: `${result.name} est en live !`, iconURL: result.avatar || undefined, url })
    .setTitle(`${p.emoji} 🔴 LIVE sur ${p.label}`)
    .setDescription(ui.sectionize(`**${result.name}** vient de lancer un live sur **${p.label}** !\n\n✨ Rejoins-le maintenant, il t'attend :`))
    .addFields(
      { name: `${p.emoji} Pseudo`, value: `[@${social.handle}](${url})`, inline: true },
      { name: '👤 Membre', value: social.user_id ? `<@${social.user_id}>` : '—', inline: true },
    )
    .setFooter({ text: `${guild.name} · Annonces de live`, iconURL: guild.iconURL ? (guild.iconURL({ size: 64 }) || undefined) : undefined })
    .setTimestamp();
  if (result.avatar) embed.setThumbnail(result.avatar);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(`▶️ Regarder le live ${p.label}`).setURL(url)
  );

  await channel.send({
    content: ping || undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: ping ? ['everyone'] : [] },
  });
  store.activity.add(botId, guild.id, '🔴', `${result.name} (@${social.handle}) en live sur ${p.label} — annoncé dans #${channel.name}`);
  try {
    const logging = require('./logging');
    await logging.log(botId, guild, { title: '🔴 Annonce de live', description: `${result.name} (@${social.handle} · ${p.label}) annoncé dans #${channel.name}`, color: '#FE2C55' });
  } catch {}
}

module.exports = {
  PLATFORMS,
  OFFLINE_CONFIRMATIONS,
  parseSocial,
  liveDecision,
  liveTransition,
  parseTikTokResponse,
  CHECKERS,
  findLiveChannel,
  channelPermissionIssue,
  sweep,
  announce,
};
