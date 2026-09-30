// ============================================================
// v290 — ✅ Vérification humaine + Join Gate (façon Wick).
// • Panneau avec bouton « Je suis humain » → rôle vérifié.
// • Join Gate : les comptes plus récents que N jours sont refusés
//   à l'arrivée (MP d'explication + kick), protection anti-raid.
// • Filtre anti-bots : tout bot non approuvé qui rejoint est expulsé.
// Rien n'est jamais bloquant : une erreur ici ne casse pas l'arrivée.
// ============================================================
const store = require('../db');
const ui = require('./ui');
const i18n = require('../i18n');
const logging = require('./logging');
const { canConfigureGuild } = require('./permissions');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField } = require('discord.js');

const DEFAULTS = {
  enabled: false, channel: '', role: '', gate_days: 0, bot_filter: false, approved_bots: [],
  isolate: false, isolated_channels: [],
  panel_title: '', panel_desc: '', button_label: '', panel_color: '#57F287',
  require_avatar: false, block_spammer: false,
  captcha: false, captcha_channel: '', captcha_role: '',
  captcha_title: '', captcha_desc: '', captcha_color: '#e07a5f',
};
const CAPTCHA_TIMEOUT_MS = 2 * 60 * 1000;
const CAPTCHA_MAX_ATTEMPTS = 2;
const CAPTCHA_LEN = 6;
const CAPTCHA_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GATE_CHOICES = [0, 1, 3, 7, 14, 30, 60];
const SPAMMER_FLAG = 1048576; // Discord UserFlags.Spammer

function cfgOf(guildId) {
  let raw = {};
  try { raw = JSON.parse(store.settings.get(`verification_cfg:${guildId}`) || '{}') || {}; } catch {}
  const cfg = { ...DEFAULTS, ...raw };
  cfg.enabled = !!cfg.enabled;
  cfg.channel = String(cfg.channel || '').slice(0, 30);
  cfg.role = String(cfg.role || '').slice(0, 30);
  cfg.bot_filter = !!cfg.bot_filter;
  cfg.gate_days = GATE_CHOICES.includes(Number(cfg.gate_days)) ? Number(cfg.gate_days) : 0;
  cfg.approved_bots = Array.isArray(cfg.approved_bots)
    ? cfg.approved_bots.map((x) => String(x).trim()).filter((x) => /^\d{5,25}$/.test(x)).slice(0, 50)
    : [];
  // v293 — isolation : les non-vérifiés ne voient que le salon de vérification
  cfg.isolate = !!cfg.isolate;
  cfg.isolated_channels = Array.isArray(cfg.isolated_channels)
    ? cfg.isolated_channels.map((x) => String(x)).filter(Boolean).slice(0, 3000)
    : [];
  cfg.panel_title = String(cfg.panel_title || '').slice(0, 120);
  cfg.panel_desc = String(cfg.panel_desc || '').slice(0, 1500);
  cfg.button_label = String(cfg.button_label || '').slice(0, 80);
  cfg.panel_color = /^#[0-9a-fA-F]{6}$/.test(String(cfg.panel_color || '')) ? String(cfg.panel_color) : '#57F287';
  cfg.require_avatar = !!cfg.require_avatar;
  cfg.block_spammer = !!cfg.block_spammer;
  cfg.captcha = !!cfg.captcha;
  cfg.captcha_channel = String(cfg.captcha_channel || '').slice(0, 30);
  cfg.captcha_role = String(cfg.captcha_role || '').slice(0, 30);
  cfg.captcha_title = String(cfg.captcha_title || '').slice(0, 120);
  cfg.captcha_desc = String(cfg.captcha_desc || '').slice(0, 1500);
  cfg.captcha_color = /^#[0-9a-fA-F]{6}$/.test(String(cfg.captcha_color || '')) ? String(cfg.captcha_color) : '#e07a5f';
  return cfg;
}

function captchaChannelId(cfg) {
  return String((cfg && (cfg.captcha_channel || cfg.channel)) || '');
}

function verifiedRoleId(cfg) {
  return String((cfg && (cfg.captcha_role || cfg.role)) || '');
}

function fillVars(text, vars) {
  let out = String(text || '');
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(String(v));
  return out;
}

function captchaTexts(cfg, lang, extra = {}) {
  const roleId = verifiedRoleId(cfg);
  const role = roleId ? `<@&${roleId}>` : '—';
  const vars = { server: extra.server || '', user: extra.user || '', role, ...extra };
  const title = fillVars(String((cfg && cfg.captcha_title) || '').trim() || i18n.t(lang, 'verif_captcha_title', vars), vars);
  const desc = fillVars(String((cfg && cfg.captcha_desc) || '').trim() || i18n.t(lang, 'verif_captcha_desc', vars), vars);
  const color = /^#[0-9a-fA-F]{6}$/.test(String((cfg && cfg.captcha_color) || '')) ? String(cfg.captcha_color) : '#e07a5f';
  return { title: title.slice(0, 120), desc: desc.slice(0, 1500), color };
}

function saveCfg(guildId, patch) {
  const next = { ...cfgOf(guildId), ...(patch || {}) };
  store.settings.set(`verification_cfg:${guildId}`, JSON.stringify(next));
  return cfgOf(guildId);
}

function hasCustomAvatar(user) {
  return !!(user && user.avatar);
}

function isSpammer(user) {
  if (!user) return false;
  const f = user.flags;
  if (f && typeof f.has === 'function') {
    try { if (f.has(SPAMMER_FLAG) || f.has('Spammer')) return true; } catch {}
  }
  const bit = Number(f && f.bitfield != null ? f.bitfield : (f || 0));
  return Number.isFinite(bit) && (bit & SPAMMER_FLAG) !== 0;
}

function panelTexts(cfg, lang) {
  const role = cfg.role ? `<@&${cfg.role}>` : '—';
  const title = String(cfg.panel_title || '').trim() || i18n.t(lang, 'verif_panel_title');
  const raw = String(cfg.panel_desc || '').trim();
  const desc = (raw || i18n.t(lang, 'verif_panel_desc', { role })).split('{role}').join(role);
  const button = String(cfg.button_label || '').trim() || i18n.t(lang, 'verif_button');
  const color = /^#[0-9a-fA-F]{6}$/.test(String(cfg.panel_color || '')) ? String(cfg.panel_color) : '#57F287';
  return { title: title.slice(0, 120), desc: desc.slice(0, 1500), button: button.slice(0, 80), color };
}

function pendingKey(guildId, userId) {
  return `captcha_pending:${guildId}:${userId}`;
}

function getPending(guildId, userId) {
  try {
    const raw = store.settings.get(pendingKey(guildId, userId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.code ? data : null;
  } catch { return null; }
}

function setPending(guildId, userId, data) {
  store.settings.set(pendingKey(guildId, userId), JSON.stringify(data || {}));
}

function clearPending(guildId, userId) {
  try { store.db.prepare('DELETE FROM settings WHERE key = ?').run(pendingKey(guildId, userId)); }
  catch { try { store.settings.set(pendingKey(guildId, userId), ''); } catch {} }
}

function randInt(n) {
  const max = Math.max(1, Number(n) || 1);
  try { return require('crypto').randomInt(max); } catch { return Math.floor(Math.random() * max); }
}

function generateCode(len = CAPTCHA_LEN) {
  const n = Math.max(4, Math.min(8, Number(len) || CAPTCHA_LEN));
  let s = '';
  for (let i = 0; i < n; i++) s += CAPTCHA_CHARS[randInt(CAPTCHA_CHARS.length)];
  return s;
}

function normalizeGuess(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function captchaSvg(code) {
  const letters = String(code || '').split('');
  const w = 420;
  const h = 130;
  const pal = ['#c45c3e', '#d4764e', '#b85a3a', '#e07a5f', '#f2cc8f'];
  const rnd = () => {
    try { return require('crypto').randomInt(10000) / 10000; } catch { return Math.random(); }
  };
  let noise = '';
  for (let i = 0; i < 12; i++) {
    noise += `<line x1="${(rnd() * w).toFixed(1)}" y1="${(rnd() * h).toFixed(1)}" x2="${(rnd() * w).toFixed(1)}" y2="${(rnd() * h).toFixed(1)}" stroke="${pal[i % pal.length]}" stroke-opacity="${(0.12 + rnd() * 0.28).toFixed(2)}" stroke-width="${(1 + rnd() * 2).toFixed(1)}"/>`;
  }
  for (let i = 0; i < 16; i++) {
    noise += `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h).toFixed(1)}" r="${(0.7 + rnd() * 1.8).toFixed(1)}" fill="${pal[i % pal.length]}" fill-opacity="0.35"/>`;
  }
  const drawn = letters.map((ch, i) => {
    const x = 24 + i * 64 + (rnd() * 14 - 7);
    const rot = rnd() * 28 - 14;
    const y = 76 + rnd() * 22;
    const size = 50 + rnd() * 14;
    const safe = /[A-Z0-9]/.test(ch) ? ch : '?';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Times New Roman, Georgia, serif" font-size="${size.toFixed(0)}" font-style="italic" font-weight="700" fill="${pal[randInt(pal.length)]}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${safe}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="8" fill="#1e1f22"/>${noise}${drawn}</svg>`;
}

async function captchaPng(code) {
  const sharp = require('sharp');
  return sharp(Buffer.from(captchaSvg(code))).png().toBuffer();
}

function holdsArrival(guildId, member) {
  if (!member || !member.id) return false;
  return !!getPending(guildId, member.id);
}

async function deleteCaptchaMessage(guild, pending) {
  try {
    if (!guild || !pending || !pending.channelId || !pending.messageId) return;
    const ch = guild.channels && guild.channels.cache ? guild.channels.cache.get(String(pending.channelId)) : null;
    if (!ch || !ch.messages || typeof ch.messages.fetch !== 'function') return;
    const msg = await ch.messages.fetch(String(pending.messageId)).catch(() => null);
    if (msg && typeof msg.delete === 'function') await msg.delete().catch(() => {});
  } catch {}
}

async function clearMemberOverwrite(guild, channelId, userId) {
  try {
    const ch = guild && guild.channels && guild.channels.cache ? guild.channels.cache.get(String(channelId)) : null;
    if (!ch || !ch.permissionOverwrites) return;
    if (typeof ch.permissionOverwrites.delete === 'function') {
      await ch.permissionOverwrites.delete(String(userId)).catch(() => {});
    }
  } catch {}
}

async function startCaptcha(botId, member) {
  const guild = member && member.guild;
  if (!guild) return false;
  const cfg = cfgOf(guild.id);
  const channelId = captchaChannelId(cfg);
  const channel = guild.channels && guild.channels.cache ? guild.channels.cache.get(channelId) : null;
  if (!channel || typeof channel.send !== 'function') return false;
  const already = verifiedRoleId(cfg);
  if (already && member.roles && member.roles.cache && member.roles.cache.has(already)) return false;
  const old = getPending(guild.id, member.id);
  if (old) await deleteCaptchaMessage(guild, old);
  const code = generateCode();
  let buf;
  try { buf = await captchaPng(code); }
  catch (e) { console.error('[Hoxera] captcha image :', e && e.message); return false; }
  const lang = i18n.langForGuild(guild.id);
  const who = (member.user && (member.user.globalName || member.user.username)) || 'Membre';
  const texts = captchaTexts(cfg, lang, { server: guild.name || 'ce serveur', user: `${member}` });
  let avatarUrl = '';
  try {
    if (member.user && typeof member.user.displayAvatarURL === 'function') {
      avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
    }
  } catch {}
  const payload = ui.v2panel({
    color: texts.color,
    content: `${member}`,
    author: {
      name: who,
      iconURL: avatarUrl,
    },
    title: texts.title,
    description: texts.desc,
    image: 'attachment://captcha.png',
    footer: false,
  });
  let sent;
  try {
    sent = await channel.send({
      ...payload,
      files: [{ attachment: buf, name: 'captcha.png' }],
      allowedMentions: { users: [String(member.id)] },
    });
  } catch (e) {
    console.error('[Hoxera] captcha envoi :', e && e.message);
    return false;
  }
  try {
    if (channel.permissionOverwrites && typeof channel.permissionOverwrites.edit === 'function') {
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      }).catch(() => {});
      const everyone = guild.roles && guild.roles.everyone && guild.roles.everyone.id;
      if (everyone) {
        await channel.permissionOverwrites.edit(everyone, { ViewChannel: true, SendMessages: false }).catch(() => {});
      }
    }
  } catch {}
  setPending(guild.id, member.id, {
    botId,
    guildId: String(guild.id),
    userId: String(member.id),
    code,
    attempts: 0,
    expiresAt: Date.now() + CAPTCHA_TIMEOUT_MS,
    messageId: sent && sent.id ? String(sent.id) : '',
    channelId,
  });
  return true;
}

async function succeedCaptcha(botId, guild, member, pending) {
  const userId = String((member && member.id) || (pending && pending.userId) || '');
  clearPending(guild.id, userId);
  await deleteCaptchaMessage(guild, pending);
  await clearMemberOverwrite(guild, pending && pending.channelId, userId);
  const cfg = cfgOf(guild.id);
  const roleId = verifiedRoleId(cfg);
  const role = roleId && guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
  if (role && member && member.roles && typeof member.roles.add === 'function') {
    await member.roles.add(role.id, 'Captcha réussi').catch(() => {});
  }
  logging.log(botId, guild, {
    title: '✅ Captcha réussi',
    description: `${(member && member.user) || userId}`,
    color: '#57F287',
  }).catch(() => {});
  try {
    const { runJoinEvent } = require('./events');
    await runJoinEvent(botId, member, { afterVerify: true });
  } catch (e) { console.error('[Hoxera] bienvenue après captcha :', e && e.message); }
}

async function failCaptcha(botId, guild, member, pending, reason) {
  const userId = String((member && member.id) || (pending && pending.userId) || '');
  const lang = i18n.langForGuild(guild.id);
  clearPending(guild.id, userId);
  await deleteCaptchaMessage(guild, pending);
  await clearMemberOverwrite(guild, pending && pending.channelId, userId);
  const user = member && member.user;
  try {
    if (user && typeof user.send === 'function') {
      await user.send(i18n.t(lang, 'verif_captcha_kick_dm', { serveur: guild.name || 'ce serveur' }));
    }
  } catch { /* MP fermés */ }
  if (member && typeof member.kick === 'function') {
    await member.kick(`Captcha : ${reason || 'échec'}`).catch(() => {});
  }
  logging.log(botId, guild, {
    title: '🚫 Captcha : expulsion',
    description: `${(user && (user.tag || user.username)) || userId} — ${reason || 'échec'}`,
    color: '#ED4245',
  }).catch(() => {});
}

async function onMessage(botId, message) {
  try {
    if (!message || (message.author && message.author.bot)) return false;
    const guild = message.guild;
    if (!guild) return false;
    const cfg = cfgOf(guild.id);
    if (!cfg.enabled || !cfg.captcha) return false;
    const capCh = captchaChannelId(cfg);
    const chId = String(message.channelId || (message.channel && message.channel.id) || '');
    if (!capCh || chId !== capCh) return false;
    const userId = String(message.author && message.author.id || '');
    if (!userId) return false;
    const pending = getPending(guild.id, userId);
    const member = message.member;
    if (!pending) {
      let staff = false;
      try { staff = canConfigureGuild(guild, member, userId); } catch {}
      if (staff) return false;
      await Promise.resolve(message.delete && message.delete()).catch(() => {});
      return true;
    }
    await Promise.resolve(message.delete && message.delete()).catch(() => {});
    const guess = normalizeGuess(message.content);
    if (guess && guess === normalizeGuess(pending.code)) {
      await succeedCaptcha(botId, guild, member, pending);
      return true;
    }
    const attempts = Number(pending.attempts || 0) + 1;
    if (attempts >= CAPTCHA_MAX_ATTEMPTS) {
      await failCaptcha(botId, guild, member, pending, '2 essais incorrects');
      return true;
    }
    pending.attempts = attempts;
    setPending(guild.id, userId, pending);
    const lang = i18n.langForGuild(guild.id);
    const ch = message.channel;
    if (ch && typeof ch.send === 'function') {
      await ch.send({
        content: `${message.author} ${i18n.t(lang, 'verif_captcha_wrong', { left: CAPTCHA_MAX_ATTEMPTS - attempts })}`,
        allowedMentions: { users: [userId] },
      }).catch(() => {});
    }
    return true;
  } catch { return false; }
}

async function onMemberLeave(botId, member) {
  try {
    if (!member || !member.guild) return;
    const pending = getPending(member.guild.id, member.id);
    if (!pending) return;
    clearPending(member.guild.id, member.id);
    await deleteCaptchaMessage(member.guild, pending);
  } catch {}
}

async function sweepCaptchas(botId, entry) {
  try {
    const keys = store.settings.keysLike('captcha_pending:%');
    const now = Date.now();
    for (const key of keys) {
      let data = null;
      try { data = JSON.parse(store.settings.get(key) || ''); } catch { data = null; }
      if (!data || !data.code) {
        try { store.db.prepare('DELETE FROM settings WHERE key = ?').run(key); } catch {}
        continue;
      }
      if (String(data.botId) !== String(botId)) continue;
      if (Number(data.expiresAt || 0) > now) continue;
      const guild = entry && entry.client && entry.client.guilds && entry.client.guilds.cache
        ? entry.client.guilds.cache.get(String(data.guildId))
        : null;
      if (!guild) { try { store.db.prepare('DELETE FROM settings WHERE key = ?').run(key); } catch {} continue; }
      const member = await guild.members.fetch(String(data.userId)).catch(() => null);
      await failCaptcha(botId, guild, member || { id: data.userId, user: null, kick: async () => {} }, data, 'temps écoulé');
    }
  } catch (e) { console.error('[Hoxera] captcha sweep :', e && e.message); }
}

// Envoie (ou renvoie) le panneau de vérification dans le salon choisi.
async function sendPanel(botId, guild, channelId) {
  const cfg = cfgOf(guild.id);
  const channel = guild.channels && guild.channels.cache ? guild.channels.cache.get(String(channelId || cfg.channel)) : null;
  if (!channel || typeof channel.send !== 'function') { const e = new Error('Salon du panneau introuvable.'); e.code = 'NO_CHANNEL'; throw e; }
  const lang = i18n.langForGuild(guild.id);
  const texts = panelTexts(cfg, lang);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hxver:${botId}:human`)
      .setLabel(texts.button)
      .setStyle(ButtonStyle.Success)
      .setEmoji('👋'),
  );
  const payload = ui.v2panel({
    color: texts.color,
    title: texts.title,
    description: texts.desc,
    footer: false,
  }, [row]);
  return channel.send(payload);
}

// Clic sur le bouton « Je suis humain ».
async function handleButton(botId, interaction) {
  const cid = String(interaction.customId || '');
  if (!cid.startsWith('hxver:')) return false;
  const guild = interaction.guild;
  const member = interaction.member;
  const lang = guild ? i18n.langForGuild(guild.id) : 'fr';
  if (!guild || !member) {
    await interaction.reply({ content: i18n.t(lang, 'verif_off'), ephemeral: true }).catch(() => {});
    return true;
  }
  const cfg = cfgOf(guild.id);
  if (!cfg.enabled) { await interaction.reply({ content: i18n.t(lang, 'verif_off'), ephemeral: true }).catch(() => {}); return true; }
  const roleId = String(cfg.role || cfg.captcha_role || '');
  const role = roleId && guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
  if (!role) { await interaction.reply({ content: i18n.t(lang, 'verif_no_role'), ephemeral: true }).catch(() => {}); return true; }
  if (member.roles && member.roles.cache && member.roles.cache.has(role.id)) {
    await interaction.reply({ content: i18n.t(lang, 'verif_already'), ephemeral: true }).catch(() => {});
    return true;
  }
  const days = Number(cfg.gate_days) || 0;
  const created = interaction.user && interaction.user.createdAt ? new Date(interaction.user.createdAt).getTime() : 0;
  if (days > 0 && created && Date.now() - created < days * 86400000) {
    await interaction.reply({ content: i18n.t(lang, 'verif_too_young', { days }), ephemeral: true }).catch(() => {});
    return true;
  }
  if (cfg.require_avatar && !hasCustomAvatar(interaction.user)) {
    await interaction.reply({ content: i18n.t(lang, 'verif_need_avatar'), ephemeral: true }).catch(() => {});
    return true;
  }
  if (cfg.block_spammer && isSpammer(interaction.user)) {
    await interaction.reply({ content: i18n.t(lang, 'verif_spammer'), ephemeral: true }).catch(() => {});
    return true;
  }
  try {
    await member.roles.add(role.id, 'Vérification humaine (bouton)');
    await interaction.reply({ content: i18n.t(lang, 'verif_ok'), ephemeral: true }).catch(() => {});
    logging.log(botId, guild, { title: '✅ Membre vérifié', description: `${interaction.user || ''}`, color: '#57F287' }).catch(() => {});
  } catch {
    await interaction.reply({ content: i18n.t(lang, 'verif_fail'), ephemeral: true }).catch(() => {});
  }
  return true;
}

// Arrivée d'un membre : Join Gate + filtre anti-bots.
async function onJoin(botId, member) {
  try {
    const guild = member.guild;
    const cfg = cfgOf(guild.id);
    if (!cfg.enabled || !guild) return;
    if (member.user && member.user.bot) {
      if (cfg.bot_filter && !cfg.approved_bots.includes(String(member.id))) {
        await member.kick('Filtre anti-bots : bot non approuvé (module Vérification)').catch(() => {});
        logging.log(botId, guild, { title: '🤖 Bot non approuvé expulsé', description: `${(member.user && (member.user.tag || member.user.username)) || member.id}`, color: '#ED4245' }).catch(() => {});
      }
      return;
    }
    if (cfg.block_spammer && isSpammer(member.user)) {
      try { await member.user.send(i18n.t(i18n.langForGuild(guild.id), 'verif_spammer')); } catch {}
      await member.kick('Vérification : compte signalé spammeur par Discord').catch(() => {});
      logging.log(botId, guild, { title: '🚫 Spammeur Discord refusé', description: `${(member.user && (member.user.tag || member.user.username)) || member.id}`, color: '#ED4245' }).catch(() => {});
      return;
    }
    const days = Number(cfg.gate_days) || 0;
    if (days > 0) {
      const created = member.user && member.user.createdAt ? new Date(member.user.createdAt).getTime() : 0;
      if (created && Date.now() - created < days * 86400000) {
        const lang = i18n.langForGuild(guild.id);
        try { await member.user.send(i18n.t(lang, 'verif_kick_dm', { days, serveur: guild.name || 'ce serveur' })); } catch { /* MP fermés */ }
        await member.kick(`Join Gate : compte de moins de ${days} jour(s)`).catch(() => {});
        logging.log(botId, guild, { title: '🚧 Join Gate : arrivée refusée', description: `${(member.user && (member.user.tag || member.user.username)) || member.id} — compte plus récent que ${days} jour(s)`, color: '#FEE75C' }).catch(() => {});
        return;
      }
    }
    if (cfg.captcha) await startCaptcha(botId, member);
  } catch { /* la vérification ne doit jamais casser l'arrivée d'un membre */ }
}

// ============================================================
// 🔒 v293 — Isolation automatique des non-vérifiés
// Principe : @everyone perd « Voir le salon » partout SAUF le salon de
// vérification ; le rôle vérifié le retrouve partout. Résultat : un nouveau
// membre ne voit QUE le salon de vérification, et voit tout le serveur dès
// qu'il a cliqué sur « Je suis humain ». Chaque salon touché est enregistré
// pour que « Tout rendre visible » remette exactement l'état d'avant
// (seuls les salons déjà privés avant sont ignorés, jamais modifiés).
// ============================================================

// Vérifications rapides (salon, rôle, permission) — avant le long travail.
function assertIsolationReady(guild) {
  const cfg = cfgOf(guild.id);
  if (!cfg.channel && !captchaChannelId(cfg)) { const e = new Error('Choisissez d\'abord le salon de vérification.'); e.code = 'NO_CHANNEL'; throw e; }
  if (!verifiedRoleId(cfg)) { const e = new Error('Choisissez d\'abord le rôle vérifié.'); e.code = 'NO_ROLE'; throw e; }
  const me = guild.members && guild.members.me;
  if (!me || !me.permissions || typeof me.permissions.has !== 'function' || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    const e = new Error('Le bot n\'a pas la permission « Gérer les salons » sur ce serveur.'); e.code = 'NO_PERM'; throw e;
  }
  return cfg;
}

async function applyIsolation(botId, guild) {
  const cfg = assertIsolationReady(guild);
  const everyone = guild.roles.everyone.id;
  const roleId = verifiedRoleId(cfg);
  const skipIds = new Set([String(cfg.channel || ''), captchaChannelId(cfg)].filter(Boolean));
  const recorded = new Set(cfg.isolated_channels);
  let done = 0, skipped = 0, errors = 0;
  for (const ch of guild.channels.cache.values()) {
    if (!ch || ch.type === 4) continue; // catégories : jamais touchées
    if (skipIds.has(String(ch.id))) continue; // salon de vérification / captcha : traité à part
    try {
      const ow = ch.permissionOverwrites && ch.permissionOverwrites.cache ? ch.permissionOverwrites.cache.get(everyone) : null;
      const alreadyHidden = !!(ow && ow.deny && typeof ow.deny.has === 'function' && ow.deny.has(PermissionsBitField.Flags.ViewChannel));
      if (alreadyHidden) { skipped++; continue; } // déjà privé : on ne touche pas, on ne note pas
      await ch.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: 'v293 vérification : masqué aux non-vérifiés' });
      await ch.permissionOverwrites.edit(roleId, { ViewChannel: true }, { reason: 'v293 vérification : visible pour les vérifiés' });
      recorded.add(String(ch.id));
      done++;
    } catch (e) { errors++; }
  }
  // Le salon de vérification / captcha reste visible. Personne n'y discute :
  // @everyone voit, mais n'écrit pas (le nouveau membre reçoit un écrasement).
  try {
    const vch = guild.channels.cache.get(captchaChannelId(cfg) || cfg.channel);
    if (vch && vch.permissionOverwrites) {
      const vis = { ViewChannel: true };
      if (cfg.captcha) vis.SendMessages = false;
      await vch.permissionOverwrites.edit(everyone, vis, { reason: 'v293 vérification : salon visible des nouveaux arrivants' });
    }
  } catch (e) { /* best effort */ }
  saveCfg(guild.id, { isolate: true, isolated_channels: [...recorded] });
  try { logging.log(botId, guild, { title: '🔒 Isolation des non-vérifiés appliquée', description: `${done} salon(s) masqué(s) · ${skipped} déjà privé(s) ignoré(s)`, color: '#57F287' }).catch(() => {}); } catch (e) {}
  return { done, skipped, errors, total: recorded.size };
}

async function removeIsolation(botId, guild) {
  const cfg = cfgOf(guild.id);
  const everyone = (guild.roles && guild.roles.everyone && guild.roles.everyone.id) || '@everyone';
  let done = 0;
  for (const id of cfg.isolated_channels) {
    const ch = guild.channels && guild.channels.cache ? guild.channels.cache.get(String(id)) : null;
    if (!ch || !ch.permissionOverwrites) continue; // salon supprimé depuis
    try {
      // ViewChannel: null retire UNIQUEMENT cette permission de l'écrasement
      // (les autres réglages du salon sont conservés).
      await ch.permissionOverwrites.edit(everyone, { ViewChannel: null }, { reason: 'v293 vérification : fin de l\'isolation' });
      const rid = verifiedRoleId(cfg);
      if (rid) await ch.permissionOverwrites.edit(rid, { ViewChannel: null }, { reason: 'v293 vérification : fin de l\'isolation' });
      done++;
    } catch (e) { /* best effort */ }
  }
  saveCfg(guild.id, { isolate: false, isolated_channels: [] });
  try { logging.log(botId, guild, { title: '🔓 Isolation des non-vérifiés retirée', description: `${done} salon(s) rendus visibles`, color: '#FEE75C' }).catch(() => {}); } catch (e) {}
  return { done };
}

// Salon créé pendant l'isolation → masqué automatiquement lui aussi
async function onChannelCreate(botId, channel) {
  try {
    const guild = channel && channel.guild;
    if (!guild || channel.type === 4) return;
    const cfg = cfgOf(guild.id);
    if (!cfg.enabled || !cfg.isolate || !verifiedRoleId(cfg)) return;
    if (String(channel.id) === String(cfg.channel)) return;
    const everyone = guild.roles.everyone.id;
    // 🛡️ v301 — un salon créé avec « @everyone : voir le salon = refusé »
    // (tickets, salons staff, modmail…) est VOLONTAIREMENT privé : lui ajouter
    // le rôle vérifié en autorisation le dévoilait à tout le serveur. C'était
    // le bug « tous les membres voient le salon du ticket ». Privé = on n'y
    // touche pas du tout.
    const ow = channel.permissionOverwrites && channel.permissionOverwrites.cache ? channel.permissionOverwrites.cache.get(everyone) : null;
    const alreadyHidden = !!(ow && ow.deny && typeof ow.deny.has === 'function' && ow.deny.has(PermissionsBitField.Flags.ViewChannel));
    if (alreadyHidden) return;
    await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: 'v293 vérification : nouveau salon masqué aux non-vérifiés' });
    await channel.permissionOverwrites.edit(verifiedRoleId(cfg), { ViewChannel: true }, { reason: 'v293 vérification : nouveau salon visible pour les vérifiés' });
    const set = new Set(cfg.isolated_channels);
    set.add(String(channel.id));
    saveCfg(guild.id, { isolated_channels: [...set] });
  } catch (e) { /* jamais bloquant */ }
}

// 🛡️ v301 — Répare les fuites déjà installées par l'ancien onChannelCreate :
// les salons de tickets ouverts (système classique + système personnalisé) où
// le rôle vérifié a reçu « voir le salon » retrouvent leur confidentialité.
// Appelé par le balayage de 30 s : ne fait des appels Discord que s'il y a
// réellement une fuite à corriger.
async function repairPrivateChannels(botId, entry) {
  const client = entry && entry.client;
  if (!client || !client.guilds || !client.guilds.cache) return;
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = cfgOf(guild.id);
      if (!cfg.enabled || !cfg.isolate || !verifiedRoleId(cfg)) continue;
      const privateIds = new Set();
      try { for (const t of store.openTickets.allForGuild(botId, guild.id)) privateIds.add(String(t.channel_id)); } catch {}
      try {
        const rows = store.db.prepare('SELECT channel_id FROM advanced_ticket_channels WHERE bot_id = ? AND guild_id = ?').all(botId, guild.id);
        for (const r of rows) privateIds.add(String(r.channel_id));
      } catch {}
      // 🛡️ v302 — Repli qui ne dépend PAS de la base : si les fiches des
      // tickets ont été perdues (base restaurée vide après une panne du token
      // de sauvegarde, incident du 14/09), les salons de ticket restent
      // reconnaissables à leur sujet « Ticket #N de … » posé à la création.
      // Sans ce repli, les salons déjà fuités ne seraient JAMAIS réparés.
      try {
        for (const ch of guild.channels.cache.values()) {
          if (!ch || ch.type === 4) continue;
          if (String(ch.topic || '').startsWith('Ticket #')) privateIds.add(String(ch.id));
        }
      } catch {}
      if (!privateIds.size) continue;
      let fixed = 0;
      for (const id of privateIds) {
        const ch = guild.channels.cache.get(id);
        if (!ch || !ch.permissionOverwrites || !ch.permissionOverwrites.cache) continue;
        const rid = verifiedRoleId(cfg);
        const owRole = ch.permissionOverwrites.cache.get(String(rid));
        const leaks = !!(owRole && owRole.allow && typeof owRole.allow.has === 'function' && owRole.allow.has(PermissionsBitField.Flags.ViewChannel));
        if (!leaks) continue;
        const done = await ch.permissionOverwrites
          .edit(String(rid), { ViewChannel: null }, { reason: 'v301 vérification : salon de ticket privé — visibilité du rôle vérifié retirée' })
          .then(() => true).catch(() => false);
        if (!done) continue;
        fixed++;
        // Le salon n'aurait jamais dû être noté « isolé » : on le retire de la
        // liste pour que la désactivation de l'isolation ne le touche pas.
        const set = new Set(cfg.isolated_channels);
        if (set.delete(id)) saveCfg(guild.id, { isolated_channels: [...set] });
      }
      if (fixed) {
        console.log(`[Hoxera] 🛡️ vérification : ${fixed} salon(s) de ticket re-privatisé(s) sur ${guild.id}`);
        try { logging.log(botId, guild, { title: '🛡️ Confidentialité des tickets réparée', description: `${fixed} salon(s) privé(s) n'étaient plus masqués au rôle vérifié — c'est corrigé.`, color: '#57F287' }).catch(() => {}); } catch {}
      }
    } catch {}
  }
}

// Distribue le rôle vérifié à tous les membres actuels (évite de bloquer
// les membres présents quand on active l'isolation sur un serveur existant).
function assertGrantReady(guild) {
  const cfg = cfgOf(guild.id);
  const rid = verifiedRoleId(cfg);
  if (!rid) { const e = new Error('Choisissez d\'abord le rôle vérifié.'); e.code = 'NO_ROLE'; throw e; }
  const role = guild.roles.cache.get(rid);
  if (!role) { const e = new Error('Rôle vérifié introuvable sur ce serveur.'); e.code = 'NO_ROLE'; throw e; }
  const me = guild.members && guild.members.me;
  if (!me || !me.permissions || typeof me.permissions.has !== 'function' || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    const e = new Error('Le bot n\'a pas la permission « Gérer les rôles » sur ce serveur.'); e.code = 'NO_PERM'; throw e;
  }
  if (me.roles && me.roles.highest && role.position >= me.roles.highest.position) {
    const e = new Error('Le rôle vérifié est placé plus haut que le rôle du bot : descendez-le dans la liste des rôles.'); e.code = 'ROLE_TOO_HIGH'; throw e;
  }
  return { cfg, role };
}

async function grantRoleToAll(botId, guild) {
  const { role } = assertGrantReady(guild);
  let members;
  try { members = await guild.members.fetch(); } catch (e) { members = guild.members.cache; }
  let added = 0, errors = 0;
  for (const m of members.values()) {
    if (!m || (m.user && m.user.bot)) continue;
    if (m.roles && m.roles.cache && m.roles.cache.has(role.id)) continue;
    try { await m.roles.add(role.id, 'v293 vérification : rôle donné aux membres existants'); added++; } catch (e) { errors++; }
  }
  try { logging.log(botId, guild, { title: '👥 Rôle vérifié distribué', description: `${added} membre(s) ont reçu le rôle vérifié`, color: '#57F287' }).catch(() => {}); } catch (e) {}
  return { added, errors };
}

module.exports = {
  cfgOf, saveCfg, sendPanel, handleButton, onJoin, GATE_CHOICES, panelTexts,
  hasCustomAvatar, isSpammer, assertIsolationReady, applyIsolation, removeIsolation,
  onChannelCreate, repairPrivateChannels, assertGrantReady, grantRoleToAll,
  captchaChannelId, verifiedRoleId, captchaTexts, generateCode, normalizeGuess, captchaSvg, captchaPng,
  getPending, setPending, clearPending, holdsArrival, startCaptcha, onMessage,
  onMemberLeave, sweepCaptchas, CAPTCHA_TIMEOUT_MS, CAPTCHA_MAX_ATTEMPTS,
  _test: { DEFAULTS, CAPTCHA_CHARS, CAPTCHA_LEN },
};
