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
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField } = require('discord.js');

const DEFAULTS = { enabled: false, channel: '', role: '', gate_days: 0, bot_filter: false, approved_bots: [], isolate: false, isolated_channels: [] };
const GATE_CHOICES = [0, 1, 7, 30];

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
  return cfg;
}

function saveCfg(guildId, patch) {
  const next = { ...cfgOf(guildId), ...(patch || {}) };
  store.settings.set(`verification_cfg:${guildId}`, JSON.stringify(next));
  return cfgOf(guildId);
}

// Envoie (ou renvoie) le panneau de vérification dans le salon choisi.
async function sendPanel(botId, guild, channelId) {
  const cfg = cfgOf(guild.id);
  const channel = guild.channels && guild.channels.cache ? guild.channels.cache.get(String(channelId || cfg.channel)) : null;
  if (!channel || typeof channel.send !== 'function') { const e = new Error('Salon du panneau introuvable.'); e.code = 'NO_CHANNEL'; throw e; }
  const lang = i18n.langForGuild(guild.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hxver:${botId}:human`)
      .setLabel(i18n.t(lang, 'verif_button'))
      .setStyle(ButtonStyle.Success)
      .setEmoji('👋'),
  );
  const payload = ui.v2panel({
    color: '#57F287',
    title: i18n.t(lang, 'verif_panel_title'),
    description: i18n.t(lang, 'verif_panel_desc', { role: cfg.role ? `<@&${cfg.role}>` : '—' }),
    footer: 'Hoxera · Vérification',
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
  const role = cfg.role && guild.roles && guild.roles.cache ? guild.roles.cache.get(cfg.role) : null;
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
    const days = Number(cfg.gate_days) || 0;
    if (days <= 0) return;
    const created = member.user && member.user.createdAt ? new Date(member.user.createdAt).getTime() : 0;
    if (!created || Date.now() - created >= days * 86400000) return;
    const lang = i18n.langForGuild(guild.id);
    try { await member.user.send(i18n.t(lang, 'verif_kick_dm', { days, serveur: guild.name || 'ce serveur' })); } catch { /* MP fermés */ }
    await member.kick(`Join Gate : compte de moins de ${days} jour(s)`).catch(() => {});
    logging.log(botId, guild, { title: '🚧 Join Gate : arrivée refusée', description: `${(member.user && (member.user.tag || member.user.username)) || member.id} — compte plus récent que ${days} jour(s)`, color: '#FEE75C' }).catch(() => {});
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
  if (!cfg.channel) { const e = new Error('Choisissez d\'abord le salon de vérification.'); e.code = 'NO_CHANNEL'; throw e; }
  if (!cfg.role) { const e = new Error('Choisissez d\'abord le rôle vérifié.'); e.code = 'NO_ROLE'; throw e; }
  const me = guild.members && guild.members.me;
  if (!me || !me.permissions || typeof me.permissions.has !== 'function' || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    const e = new Error('Le bot n\'a pas la permission « Gérer les salons » sur ce serveur.'); e.code = 'NO_PERM'; throw e;
  }
  return cfg;
}

async function applyIsolation(botId, guild) {
  const cfg = assertIsolationReady(guild);
  const everyone = guild.roles.everyone.id;
  const recorded = new Set(cfg.isolated_channels);
  let done = 0, skipped = 0, errors = 0;
  for (const ch of guild.channels.cache.values()) {
    if (!ch || ch.type === 4) continue; // catégories : jamais touchées
    if (String(ch.id) === String(cfg.channel)) continue; // salon de vérification : traité à part
    try {
      const ow = ch.permissionOverwrites && ch.permissionOverwrites.cache ? ch.permissionOverwrites.cache.get(everyone) : null;
      const alreadyHidden = !!(ow && ow.deny && typeof ow.deny.has === 'function' && ow.deny.has(PermissionsBitField.Flags.ViewChannel));
      if (alreadyHidden) { skipped++; continue; } // déjà privé : on ne touche pas, on ne note pas
      await ch.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: 'v293 vérification : masqué aux non-vérifiés' });
      await ch.permissionOverwrites.edit(cfg.role, { ViewChannel: true }, { reason: 'v293 vérification : visible pour les vérifiés' });
      recorded.add(String(ch.id));
      done++;
    } catch (e) { errors++; }
  }
  // Le salon de vérification reste visible par tout le monde (nouveaux inclus)
  try {
    const vch = guild.channels.cache.get(cfg.channel);
    if (vch && vch.permissionOverwrites) await vch.permissionOverwrites.edit(everyone, { ViewChannel: true }, { reason: 'v293 vérification : salon visible des nouveaux arrivants' });
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
      if (cfg.role) await ch.permissionOverwrites.edit(cfg.role, { ViewChannel: null }, { reason: 'v293 vérification : fin de l\'isolation' });
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
    if (!cfg.enabled || !cfg.isolate || !cfg.role) return;
    if (String(channel.id) === String(cfg.channel)) return;
    const everyone = guild.roles.everyone.id;
    await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: 'v293 vérification : nouveau salon masqué aux non-vérifiés' });
    await channel.permissionOverwrites.edit(cfg.role, { ViewChannel: true }, { reason: 'v293 vérification : nouveau salon visible pour les vérifiés' });
    const set = new Set(cfg.isolated_channels);
    set.add(String(channel.id));
    saveCfg(guild.id, { isolated_channels: [...set] });
  } catch (e) { /* jamais bloquant */ }
}

// Distribue le rôle vérifié à tous les membres actuels (évite de bloquer
// les membres présents quand on active l'isolation sur un serveur existant).
function assertGrantReady(guild) {
  const cfg = cfgOf(guild.id);
  if (!cfg.role) { const e = new Error('Choisissez d\'abord le rôle vérifié.'); e.code = 'NO_ROLE'; throw e; }
  const role = guild.roles.cache.get(cfg.role);
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

module.exports = { cfgOf, saveCfg, sendPanel, handleButton, onJoin, GATE_CHOICES, assertIsolationReady, applyIsolation, removeIsolation, onChannelCreate, assertGrantReady, grantRoleToAll, _test: { DEFAULTS } };
