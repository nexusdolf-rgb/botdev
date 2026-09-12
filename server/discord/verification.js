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
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const DEFAULTS = { enabled: false, channel: '', role: '', gate_days: 0, bot_filter: false, approved_bots: [] };
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

module.exports = { cfgOf, saveCfg, sendPanel, handleButton, onJoin, GATE_CHOICES, _test: { DEFAULTS } };
