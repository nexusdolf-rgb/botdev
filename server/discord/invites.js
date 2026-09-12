// v291 — 📨 Récompenses d'invitations + anti fausses invitations.
// Le suivi des invitations existe déjà (v1.98 : invite_joins, qui a invité qui).
// v291 ajoute : rôles par paliers d'invitations VALIDES, annonce du palier
// atteint, et invalidation d'une invite si l'invité part avant le délai choisi.
const store = require('../db');
const i18n = require('../i18n');
const logging = require('./logging');

const KEY = (guildId) => `invite_rewards:${guildId}`;
const MIN_HOURS_OK = [0, 6, 24, 72, 168];
const MAX_TIERS = 10;

function cfgOf(guildId) {
  const raw = store.settings.get(KEY(String(guildId)));
  const cfg = { enabled: false, min_hours: 24, channel: '', rewards: [] };
  try {
    if (raw) Object.assign(cfg, JSON.parse(raw));
  } catch { /* config corrompue : défauts */ }
  cfg.enabled = !!cfg.enabled;
  if (!MIN_HOURS_OK.includes(parseInt(cfg.min_hours, 10))) cfg.min_hours = 24;
  else cfg.min_hours = parseInt(cfg.min_hours, 10);
  cfg.channel = String(cfg.channel || '');
  cfg.rewards = (Array.isArray(cfg.rewards) ? cfg.rewards : [])
    .map((r) => ({ invites: parseInt(r && r.invites, 10) || 0, role: String((r && r.role) || '') }))
    .filter((r) => r.invites > 0 && r.role)
    .slice(0, MAX_TIERS);
  return cfg;
}

async function saveCfg(botId, guildId, body = {}) {
  const cfg = {
    enabled: !!body.enabled,
    min_hours: parseInt(body.min_hours, 10),
    channel: String(body.channel || ''),
    rewards: [],
  };
  if (!MIN_HOURS_OK.includes(cfg.min_hours)) throw new Error('Délai anti fausses invitations invalide.');
  const seen = new Set();
  for (const r of (Array.isArray(body.rewards) ? body.rewards : [])) {
    const invites = parseInt(r && r.invites, 10) || 0;
    const role = String((r && r.role) || '').trim();
    if (invites < 1 || invites > 100000) throw new Error('Nombre d\'invitations invalide (1 à 100000).');
    if (!role) throw new Error('Chaque palier doit avoir un rôle.');
    if (seen.has(invites)) throw new Error('Deux paliers ne peuvent pas avoir le même nombre d\'invitations.');
    seen.add(invites);
    cfg.rewards.push({ invites, role });
    if (cfg.rewards.length >= MAX_TIERS) break;
  }
  cfg.rewards.sort((a, b) => a.invites - b.invites);
  store.settings.set(KEY(String(guildId)), JSON.stringify(cfg));
  return cfg;
}

// Un invité vient d'être attribué à un inviteur : palier atteint ?
async function onInviteCounted(botId, guild, inviterId) {
  const cfg = cfgOf(guild.id);
  if (!cfg.enabled) return;
  const count = store.inviteJoins.countBy(botId, guild.id, inviterId);
  const tier = cfg.rewards.find((r) => r.invites === count);
  if (!tier) return;
  const member = await guild.members.fetch(String(inviterId)).catch(() => null);
  if (!member) return;
  let roleName = tier.role;
  try {
    const role = guild.roles.cache.get(tier.role);
    if (role) roleName = role.name;
    if (!member.roles.cache.has(tier.role)) {
      await member.roles.add(tier.role, 'v291 : récompense d\'invitation');
    }
  } catch { return; } // rôle supprimé ou hiérarchie trop haute : silencieux
  const lang = i18n.langForGuild(guild.id);
  if (cfg.channel) {
    const ch = guild.channels.cache.get(cfg.channel);
    if (ch && typeof ch.send === 'function') {
      const inviterName = (member.user && (member.user.username || member.user.tag)) || member.displayName || inviterId;
      try { await ch.send(i18n.t(lang, 'invite_reward_msg', { inviter: inviterName, count: String(count), role: roleName })); } catch (e) {}
    }
  }
  try { logging.log(botId, guild, { title: '📨 Récompense d\'invitation', description: `Palier ${count} invitations atteint par ${inviterId} → rôle ${roleName}`, color: '#57F287' }).catch(() => {}); } catch (e) {}
}

// Un membre part : son invite compte-t-elle encore ?
async function onMemberLeave(botId, guild, member) {
  const cfg = cfgOf(guild.id);
  if (!cfg.enabled || !cfg.min_hours) return;
  const n = store.inviteJoins.invalidateRecent(botId, guild.id, member.id, cfg.min_hours);
  if (n) {
    try { logging.log(botId, guild, { title: '🕵️ Invite invalidée', description: `${member.id} est parti avant ${cfg.min_hours} h — son invitation ne compte plus`, color: '#FEE75C' }).catch(() => {}); } catch (e) {}
  }
  return n;
}

module.exports = { cfgOf, saveCfg, onInviteCounted, onMemberLeave };
