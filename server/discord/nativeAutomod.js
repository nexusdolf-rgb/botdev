// ============================================================
// Nexora — Miroir Auto-Mod officiel Discord
//
// Le moteur Nexora reste la source des sanctions avancées. Ce module crée
// uniquement des règles natives Discord en mode alerte : elles sont réelles,
// utiles et n'appliquent pas une deuxième sanction au même message.
// Les règles créées par un administrateur ou un autre bot ne sont jamais
// modifiées ni supprimées.
// ============================================================
const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
} = require('discord.js');
const store = require('../db');

const RULE_PREFIX = 'Nexora · Auto-Mod officiel · ';
const RULE_KEYS = ['links', 'words', 'spam', 'mentions'];
const NATIVE_ACTIONS = Object.freeze({
  alert: AutoModerationActionType.SendAlertMessage,
});

function parseList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function snowflakes(value, max = 50) {
  return [...new Set(parseList(value)
    .map((item) => String(item).replace(/[<@#&>]/g, '').trim())
    .filter((item) => /^\d{15,21}$/.test(item)))].slice(0, max);
}

function resolveTextChannel(guild, reference) {
  const raw = String(reference || '').trim();
  if (!raw || !guild || !guild.channels || !guild.channels.cache) return null;
  const cache = guild.channels.cache;
  const id = raw.match(/\d{15,21}/)?.[0] || raw;
  const direct = typeof cache.get === 'function' ? (cache.get(id) || cache.get(raw)) : null;
  if (direct && typeof direct.send === 'function') return direct;
  if (typeof cache.find !== 'function') return null;
  const name = raw.replace(/^#/, '').toLowerCase();
  return cache.find((channel) => channel && typeof channel.send === 'function'
    && String(channel.name || '').toLowerCase() === name) || null;
}

function alertChannelFor(guild, settings) {
  return resolveTextChannel(guild,
    settings.am_native_alert_channel || settings.log_channel || settings.am_blacklist_channel);
}

function nativeRuleName(key) {
  const labels = { links: 'Liens', words: 'Mots interdits', spam: 'Spam', mentions: 'Mentions' };
  return `${RULE_PREFIX}${labels[key] || key}`.slice(0, 100);
}

function keywordFilterFor(key, settings) {
  if (key === 'links') return ['http://', 'https://', 'discord.gg/', 'discord.com/invite/'];
  if (key === 'words') return [...new Set(store.blacklist.all(settings.bot_id, settings.guild_id)
    .map((word) => String(word || '').trim().slice(0, 60))
    .filter((word) => word.length >= 2))].slice(0, 100);
  return [];
}

function ruleSpecs(settings, alertChannel) {
  if (!settings || settings.am_enabled !== 1 || !alertChannel) return [];
  const exemptRoles = snowflakes(settings.am_exempt_roles, 20);
  const exemptChannels = snowflakes(settings.am_exempt_channels, 50);
  const common = {
    eventType: AutoModerationRuleEventType.MessageSend,
    actions: [{ type: NATIVE_ACTIONS.alert, metadata: { channel: alertChannel } }],
    enabled: true,
    exemptRoles,
    exemptChannels,
  };
  const specs = [];
  if (settings.am_links === 1) {
    specs.push({ key: 'links', name: nativeRuleName('links'), triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: keywordFilterFor('links', settings) }, ...common });
  }
  const words = keywordFilterFor('words', settings);
  if (words.length) {
    specs.push({ key: 'words', name: nativeRuleName('words'), triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: words }, ...common });
  }
  if (Number(settings.am_spam) > 0) {
    specs.push({ key: 'spam', name: nativeRuleName('spam'), triggerType: AutoModerationRuleTriggerType.Spam,
      triggerMetadata: {}, ...common });
  }
  if (Number(settings.am_mentions) > 0) {
    specs.push({ key: 'mentions', name: nativeRuleName('mentions'), triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: Math.min(Math.max(parseInt(settings.am_mentions, 10) || 5, 1), 50) }, ...common });
  }
  return specs;
}

function sameTrigger(rule, spec) {
  if (!rule || rule.triggerType !== spec.triggerType) return false;
  const actual = rule.triggerMetadata || {};
  const expected = spec.triggerMetadata || {};
  if (spec.key === 'links' || spec.key === 'words') {
    return JSON.stringify([...(actual.keywordFilter || [])].map(String).sort())
      === JSON.stringify([...(expected.keywordFilter || [])].map(String).sort());
  }
  if (spec.key === 'mentions') return Number(actual.mentionTotalLimit) === Number(expected.mentionTotalLimit);
  return true;
}

function ruleCreatedByBot(rule, client) {
  if (!rule) return false;
  if (!rule.creatorId || !client || !client.user) return true;
  return String(rule.creatorId) === String(client.user.id);
}

function findManagedRule(rules, mapping, spec, client) {
  const mapped = mapping && rules.get(String(mapping.discord_rule_id));
  if (mapped && ruleCreatedByBot(mapped, client)) return mapped;
  return rules.find((rule) => rule.name === spec.name && ruleCreatedByBot(rule, client)) || null;
}

function managedRows(botId, guildId) {
  return store.nativeAutomodRules.all(botId, guildId);
}

async function disableManaged(botId, guildId, rules, client, reason = 'Miroir officiel désactivé') {
  let disabled = 0;
  for (const row of managedRows(botId, guildId)) {
    const rule = rules && rules.get ? rules.get(String(row.discord_rule_id)) : null;
    if (rule && ruleCreatedByBot(rule, client) && rule.enabled) {
      try { await rule.edit({ enabled: false, reason }); } catch {}
    }
    try { store.nativeAutomodRules.setEnabled(botId, guildId, row.rule_key, false); } catch {}
    disabled++;
  }
  return disabled;
}

async function syncGuild(botId, guild, options = {}) {
  if (!guild || !guild.autoModerationRules || typeof guild.autoModerationRules.fetch !== 'function') {
    return { ok: false, error: 'API Auto-Mod officielle indisponible sur ce serveur.', nativeRules: 0, managed: 0, created: 0, updated: 0, disabled: 0 };
  }
  let rules;
  try {
    rules = await guild.autoModerationRules.fetch();
  } catch (e) {
    return { ok: false, error: `Lecture des règles Discord impossible : ${String(e.message || e).slice(0, 180)}`, nativeRules: 0, managed: 0, created: 0, updated: 0, disabled: 0 };
  }
  const current = store.guildSettings.get(botId, guild.id) || {};
  const settings = { ...current, bot_id: botId, guild_id: String(guild.id) };
  const alertChannel = alertChannelFor(guild, settings);
  const specs = settings.am_native_enabled !== 0 && settings.am_enabled === 1 && alertChannel
    ? ruleSpecs(settings, alertChannel)
    : [];
  const result = { ok: true, nativeRules: rules.size, managed: 0, created: 0, updated: 0, disabled: 0, skipped: [], errors: [] };
  if (settings.am_native_enabled === 0 || settings.am_enabled !== 1) {
    result.disabled = await disableManaged(botId, guild.id, rules, options.client, 'Miroir officiel désactivé dans Nexora');
    return { ...result, managed: managedRows(botId, guild.id).length, reason: 'disabled' };
  }
  if (!alertChannel) {
    result.skipped.push('Choisis un salon d’alerte officiel ou configure un salon de logs.');
    result.disabled = await disableManaged(botId, guild.id, rules, options.client, 'Aucun salon d’alerte configuré');
    return { ...result, ok: false, managed: managedRows(botId, guild.id).length, error: 'Aucun salon d’alerte envoyable pour les règles natives.' };
  }
  const desired = new Set(specs.map((spec) => spec.key));
  for (const row of managedRows(botId, guild.id)) {
    if (desired.has(row.rule_key)) continue;
    const oldRule = rules.get(String(row.discord_rule_id));
    if (oldRule && ruleCreatedByBot(oldRule, options.client) && oldRule.enabled) {
      try { await oldRule.edit({ enabled: false, reason: 'Règle Nexora non configurée' }); } catch {}
    }
    try { store.nativeAutomodRules.setEnabled(botId, guild.id, row.rule_key, false); } catch {}
    result.disabled++;
  }
  for (const spec of specs) {
    const mapping = store.nativeAutomodRules.get(botId, guild.id, spec.key);
    let rule = findManagedRule(rules, mapping, spec, options.client);
    try {
      if (rule && !sameTrigger(rule, spec)) {
        await rule.delete('Mise à jour de la règle Auto-Mod officielle Nexora');
        rule = null;
      }
      if (rule) {
        await rule.edit({
          name: spec.name,
          eventType: spec.eventType,
          triggerMetadata: spec.triggerMetadata,
          actions: spec.actions,
          enabled: true,
          exemptRoles: spec.exemptRoles,
          exemptChannels: spec.exemptChannels,
          reason: 'Synchronisation Auto-Mod officielle Nexora',
        });
        result.updated++;
      } else {
        rule = await guild.autoModerationRules.create({
          name: spec.name,
          eventType: spec.eventType,
          triggerType: spec.triggerType,
          triggerMetadata: spec.triggerMetadata,
          actions: spec.actions,
          enabled: true,
          exemptRoles: spec.exemptRoles,
          exemptChannels: spec.exemptChannels,
          reason: 'Création Auto-Mod officielle Nexora',
        });
        result.created++;
      }
      if (rule && rule.id) store.nativeAutomodRules.set(botId, guild.id, spec.key, rule.id, true);
    } catch (e) {
      result.errors.push(`${spec.key}: ${String(e.message || e).slice(0, 180)}`);
    }
  }
  result.nativeRules = rules.size + result.created;
  result.managed = managedRows(botId, guild.id).length;
  if (result.errors.length) result.ok = false;
  return result;
}

async function syncAll(botId, client) {
  const out = [];
  if (!client || !client.guilds || !client.guilds.cache) return out;
  for (const guild of client.guilds.cache.values()) {
    try { out.push({ guildId: guild.id, ...(await syncGuild(botId, guild, { client })) }); }
    catch (e) { out.push({ guildId: guild.id, ok: false, error: String(e.message || e).slice(0, 180) }); }
  }
  return out;
}

async function status(botId, guild, client) {
  if (!guild || !guild.autoModerationRules || typeof guild.autoModerationRules.fetch !== 'function') {
    return { ok: false, nativeRules: 0, managed: 0, badgeEligible: false, error: 'API Auto-Mod officielle indisponible.' };
  }
  try {
    const rules = await guild.autoModerationRules.fetch();
    const rows = managedRows(botId, guild.id);
    const settings = store.guildSettings.get(botId, guild.id) || {};
    return {
      ok: true,
      enabled: settings.am_native_enabled !== 0,
      nativeRules: rules.size,
      managed: rows.filter((row) => row.enabled).length,
      badgeEligible: rules.size >= 100,
      badgeGoal: 100,
      alertChannel: settings.am_native_alert_channel || settings.log_channel || settings.am_blacklist_channel || '',
      rules: rows.map((row) => ({ key: row.rule_key, id: row.discord_rule_id, enabled: !!row.enabled })),
    };
  } catch (e) {
    return { ok: false, nativeRules: 0, managed: 0, badgeEligible: false, error: String(e.message || e).slice(0, 180) };
  }
}

module.exports = { RULE_PREFIX, RULE_KEYS, parseList, resolveTextChannel, ruleSpecs, syncGuild, syncAll, status };
