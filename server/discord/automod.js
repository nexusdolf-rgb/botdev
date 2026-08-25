// ============================================================
// BotDev - Auto-modération (par serveur, v3.18 Control Center) :
//   - suppression des liens (invitations Discord, URL)
//   - suppression des messages trop en MAJUSCULES
//   - limite de mentions par message
//   - liste noire de mots (mot entier)
//   - anti-spam : X messages en 5 secondes → suppression + timeout
// Chaque infraction : suppression, avertissement public dans le même salon,
// MP (si possible), historique unifié et sanction aux paliers configurés.
// « Ignorer les admins » désactivable depuis le dashboard.
// ============================================================
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const store = require('../db');
const logging = require('./logging');
const i18n = require('../i18n');
const { autoModSanctionForWarning } = require('./community');
const ui = require('./ui');

const PUBLIC_WARNING_TTL_MS = 24 * 60 * 60 * 1000;

// botId:guildId:userId -> { times: [ms], messages: [Message] }
const spamTracker = new Map();
// Messages récemment supprimés par l'auto-mod (évite le double journal)
const recentlyDeleted = new Map(); // messageId -> ts

function wasAutomodded(messageId) {
  const ts = recentlyDeleted.get(String(messageId));
  if (!ts) return false;
  if (Date.now() - ts > 60000) { recentlyDeleted.delete(String(messageId)); return false; }
  return true;
}

function markAutomodded(messageId) {
  recentlyDeleted.set(String(messageId), Date.now());
}

const AUTOMOD_RULE_ACTIONS = ['inherit', 'log', 'delete', 'warn', 'timeout', 'kick', 'ban'];

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

function ruleActionFor(gs, rule) {
  let actions = gs && gs.am_rule_actions;
  if (typeof actions === 'string') {
    try { actions = JSON.parse(actions || '{}'); } catch { actions = {}; }
  }
  const action = actions && typeof actions === 'object' ? String(actions[rule] || 'inherit') : 'inherit';
  return AUTOMOD_RULE_ACTIONS.includes(action) && action !== 'inherit' ? action : null;
}

function isAutomodExempt(message, gs) {
  if (!message || !gs) return false;
  const userValues = parseList(gs.am_exempt_users).map(String);
  if (message.author && userValues.includes(String(message.author.id))) return true;

  const channel = message.channel;
  const channelValues = parseList(gs.am_exempt_channels).map(String).map((x) => x.toLowerCase());
  if (channel && channelValues.length) {
    const candidates = [String(channel.id || ''), String(channel.name || ''), channel.name ? `#${channel.name}` : '']
      .filter(Boolean).map((x) => x.toLowerCase());
    if (candidates.some((x) => channelValues.includes(x))) return true;
  }

  const roleValues = parseList(gs.am_exempt_roles).map(String).map((x) => x.toLowerCase());
  if (roleValues.length && message.member && message.member.roles && message.member.roles.cache) {
    let roles = [];
    try {
      const values = typeof message.member.roles.cache.values === 'function'
        ? [...message.member.roles.cache.values()]
        : [];
      roles = values.flatMap((role) => [String(role.id || ''), String(role.name || '')]);
    } catch {}
    if (roles.filter(Boolean).some((x) => roleValues.includes(x.toLowerCase()))) return true;
  }
  return false;
}

// Détection sans effet de bord : le simulateur et le traitement réel utilisent
// exactement les mêmes règles et le même ordre de priorité.
function detectContent(botId, guildId, content, gsOverride = null) {
  const gs = gsOverride || store.guildSettings.get(botId, guildId) || {};
  const lang = i18n.langForGuild(guildId);
  const text = String(content || '');
  if (gs.am_links === 1 && /(discord\.gg\/|discordapp\.com\/invite\/|discord\.com\/invite\/|https?:\/\/)/i.test(text)) {
    const reasonKey = 'am_reason_link';
    return { rule: 'links', reasonKey, reason: i18n.t(lang, reasonKey) };
  }
  if (gs.am_caps === 1) {
    const letters = text.match(/[a-zà-ÿ]/gi) || [];
    const caps = text.match(/[A-ZÀ-Ý]/g) || [];
    if (letters.length) {
      const ratio = caps.length / letters.length;
      const allCapsShort = letters.length >= 5 && caps.length === letters.length;
      const mostlyCapsLong = text.length > 12 && letters.length >= 8 && ratio > 0.7;
      if (allCapsShort || mostlyCapsLong) {
        const reasonKey = 'am_reason_caps';
        return { rule: 'caps', reasonKey, reason: i18n.t(lang, reasonKey) };
      }
    }
  }
  if (Number(gs.am_mentions) > 0) {
    const mentions = (text.match(/<@!?\d+>/g) || []).length;
    if (mentions > Number(gs.am_mentions)) {
      const reasonKey = 'am_reason_mentions';
      return { rule: 'mentions', reasonKey, reason: i18n.t(lang, reasonKey) };
    }
  }
  const words = store.blacklist.all(botId, guildId);
  if (words.length) {
    const hit = words.find((word) => blacklistWordMatch(text, word));
    if (hit) {
      const reasonKey = 'am_reason_word';
      return { rule: 'words', reasonKey, reason: i18n.t(lang, reasonKey, { word: hit }) };
    }
  }
  return null;
}

// Prépare la phrase d'avertissement (texte personnalisé ou modèle traduit)
function warnText(gs, lang, server, reason) {
  const custom = String(gs.am_warn_text || '').trim();
  if (custom) {
    return custom
      .split('{reason}').join(reason)
      .split('{server}').join(server);
  }
  return i18n.t(lang, 'am_dm_deleted', { server, reason });
}

// Envoie l'avertissement en MP. Si les MP sont fermés → journal serveur.
async function sendWarn(botId, message, gs, lang, text) {
  let dmOk = false;
  try {
    if (message.author && typeof message.author.send === 'function') {
      await message.author.send({
        content: text,
        embeds: [ui.embed({
          variant: 'danger',
          title: '🛡️ Avertissement Auto-Mod',
          description: 'Ton message a été pris en compte par la protection du serveur. Les détails sont indiqués dans le message ci-dessus.',
          fields: [{ name: '🧭 Conseil', value: 'Respecte les règles du serveur pour éviter une prochaine sanction.' }],
          footer: 'Hoxera · Protection du serveur',
        })],
      });
      dmOk = true;
    }
  } catch { /* MP fermés */ }
  if (!dmOk) {
    try {
      await logging.log(botId, message.guild, {
        title: '🛡️ Auto-modération',
        description: `<@${message.author.id}> : avertissement non distribué (messages privés fermés).\n${text}`,
        color: '#ED4245',
      });
    } catch { /* le journal ne doit jamais casser la modération */ }
  }
  // L'action détaillée est déjà enregistrée par recordAction() : un seul
  // événement doit apparaître dans l'historique, même si le MP échoue.
  return dmOk;
}

// Trace l'action de modération dans l'historique du dashboard
function recordAction(botId, message, reason, meta = {}) {
  try {
    store.automodLogs.add(botId, message.guild.id, {
      user_id: message.author.id,
      user_tag: message.author.tag || message.author.username || '',
      reason,
      content: (message.content || '').slice(0, 500),
      channel_id: message.channel ? message.channel.id : '',
      rule: meta.rule || '',
      action: meta.action || '',
      observed: meta.observed ? 1 : 0,
    });
  } catch { }
}

// Ajoute une entrée à l'historique unifié des avertissements. Les tests
// forcés du dashboard ne créent volontairement aucun avertissement réel.
function registerAutomodWarning(botId, message, reason, opts = {}, gs = null) {
  if (opts.force) return { count: 0, sanction: null, saved: false };
  let count = store.warnings.count(botId, message.guild.id, message.author.id) + 1;
  let saved = false;
  let id = 0;
  try {
    const inserted = store.warnings.add(botId, message.guild.id, message.author.id, reason, 'auto-mod', {
      source: 'automod',
      channel_id: message.channel ? message.channel.id : '',
      message_id: message.id || '',
      action: 'warn',
    });
    id = Number(inserted && inserted.lastInsertRowid) || 0;
    count = Number(inserted && inserted.warningNo) || count;
    saved = true;
  } catch (e) {
    console.error('[Hoxera] avertissement auto-mod non enregistré :', e.message);
  }
  return { id, count, sanction: saved ? autoModSanctionForWarning(count, gs || store.guildSettings.get(botId, message.guild.id) || {}) : null, saved };
}

// Applique la sanction du palier atteint, en respectant la hiérarchie Discord.
async function applyAutoSanction(message, sanction, reason, warningCount) {
  if (!sanction) return { applied: false, action: '', minutes: 0, error: '' };
  const member = message.member;
  const why = `Auto-modération : ${warningCount} avertissements — ${String(reason || '').slice(0, 300)}`;
  if (!member) return { applied: false, action: sanction.action, minutes: sanction.minutes || 0, error: 'membre introuvable' };
  try {
    if (sanction.action === 'timeout') {
      if (!member.moderatable || typeof member.timeout !== 'function') return { applied: false, action: 'timeout', minutes: sanction.minutes, error: 'timeout impossible (hiérarchie ou permission)' };
      await member.timeout(sanction.minutes * 60000, why);
      return { applied: true, action: 'timeout', minutes: sanction.minutes, error: '' };
    }
    if (sanction.action === 'kick') {
      if (!member.kickable || typeof member.kick !== 'function') return { applied: false, action: 'kick', minutes: 0, error: 'expulsion impossible (hiérarchie ou permission)' };
      await member.kick(why);
      return { applied: true, action: 'kick', minutes: 0, error: '' };
    }
    if (sanction.action === 'ban') {
      if (!member.bannable || typeof member.ban !== 'function') return { applied: false, action: 'ban', minutes: 0, error: 'bannissement impossible (hiérarchie ou permission)' };
      await member.ban({ reason: why });
      return { applied: true, action: 'ban', minutes: 0, error: '' };
    }
  } catch (e) {
    return { applied: false, action: sanction.action, minutes: sanction.minutes || 0, error: String(e.message || e).slice(0, 180) };
  }
  return { applied: false, action: sanction.action, minutes: sanction.minutes || 0, error: 'action inconnue' };
}

function sanctionPublicText(lang, sanction, result) {
  if (!result || !result.applied) return i18n.t(lang, 'am_public_sanction_failed');
  if (sanction.action === 'timeout') return i18n.t(lang, 'am_public_timeout', { minutes: result.minutes });
  if (sanction.action === 'kick') return i18n.t(lang, 'am_public_kick');
  if (sanction.action === 'ban') return i18n.t(lang, 'am_public_ban');
  return i18n.t(lang, 'am_public_sanction_failed');
}

// Avertissement visible dans le MÊME salon que le message supprimé.
// Le message est retiré après 24 heures ; la suppression est persistante
// grâce à la table dédiée, même après un redémarrage Render.
async function sendPublicWarning(botId, message, lang, reason, warningCount, gs, sanction, sanctionResult, deleted) {
  if (!message.channel || typeof message.channel.send !== 'function') return { sent: false, error: 'salon non envoyable' };
  const limit = Math.max(parseInt(gs.am_warn_limit, 10) || 0, 0);
  const limitText = limit > 0 ? `/${limit}` : '';
  const title = sanction
    ? `🛡️ ${i18n.t(lang, 'am_public_warn_title')} · ${warningCount}${limitText}`
    : `${i18n.t(lang, 'am_public_warn_title')} · ${warningCount}${limitText}`;
  const embed = new EmbedBuilder()
    .setColor(sanction ? '#ED4245' : '#FEE75C')
    .setTitle(title.slice(0, 256))
    .setDescription(i18n.t(lang, deleted ? 'am_public_warn_desc' : 'am_public_detected_desc', {
      userId: message.author.id,
      channelId: message.channel.id,
    }))
    .addFields(
      { name: i18n.t(lang, 'am_public_reason'), value: String(reason || '—').slice(0, 1024) },
      { name: i18n.t(lang, 'am_public_level'), value: i18n.t(lang, 'am_public_level_value', { count: warningCount, limit: limitText }), inline: true },
    )
    .setFooter({ text: i18n.t(lang, 'am_public_footer', { channel: message.channel.name || 'salon' }) })
    .setTimestamp();
  if (sanction) {
    embed.addFields({ name: i18n.t(lang, 'am_public_sanction'), value: sanctionPublicText(lang, sanction, sanctionResult) });
  } else if (limit > 0) {
    embed.addFields({ name: 'ℹ️', value: i18n.t(lang, 'am_public_next') });
  }
  const sent = await message.channel.send({
    content: message.author.id ? `<@${message.author.id}>` : undefined,
    embeds: [embed],
    allowedMentions: { users: message.author.id ? [String(message.author.id)] : [] },
  });
  if (sent && sent.id) {
    const deleteAt = Date.now() + PUBLIC_WARNING_TTL_MS;
    try {
      store.automodWarningMessages.add(botId, message.guild.id, message.channel.id, sent.id, deleteAt);
    } catch (e) {
      console.error('[Hoxera] expiration de l\'avertissement non enregistrée :', e.message);
    }
    const removePublicWarning = async () => {
      try { if (typeof sent.delete === 'function') { markAutomodded(sent.id); await sent.delete(); } }
      catch { /* message déjà supprimé ou permission perdue */ }
      try { store.automodWarningMessages.removeByMessage(botId, message.guild.id, message.channel.id, sent.id); } catch {}
    };
    // Le timer accélère la suppression sur une instance stable. La table
    // persistante est le filet de sécurité lors d'un redémarrage Render.
    const timer = setTimeout(removePublicWarning, PUBLIC_WARNING_TTL_MS);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  return { sent: true, deleteAt: Date.now() + PUBLIC_WARNING_TTL_MS };
}

// Vérifie qu'un mot interdit apparaît comme MOT ENTIER dans le message :
// « salut » matche, « salutations » non ; insensible à la casse, accents OK.
function blacklistWordMatch(content, word) {
  const w = String(word).toLowerCase();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const letter = 'A-Za-zÀ-ÿ0-9_';
  const re = new RegExp('(^|[^' + letter + '])(' + esc + ')($|[^' + letter + '])', 'i');
  return re.test(content || '');
}

function analyzeContent(botId, guildId, content, opts = {}) {
  const gs = store.guildSettings.get(botId, guildId) || {};
  const result = { enabled: gs.am_enabled === 1, mode: gs.am_mode === 'observe' ? 'observe' : 'enforce', matched: false, exempt: false };
  if (!result.enabled) return result;
  const fakeMessage = {
    author: { id: String(opts.userId || '') },
    channel: { id: String(opts.channelId || ''), name: String(opts.channelName || '') },
    member: null,
  };
  if (isAutomodExempt(fakeMessage, gs)) return { ...result, exempt: true };
  let detection = detectContent(botId, guildId, content, gs);
  // Le spam nécessite un nombre de messages : le simulateur peut fournir ce
  // compteur sans envoyer de rafale réelle sur Discord.
  if (!detection && Number(opts.spamCount) > 0 && Number(gs.am_spam) > 0 && Number(opts.spamCount) >= Number(gs.am_spam)) {
    detection = { rule: 'spam', reasonKey: 'am_reason_spam', reason: i18n.t(i18n.langForGuild(guildId), 'am_reason_spam') };
  }
  if (!detection) return result;
  const configuredAction = ruleActionFor(gs, detection.rule);
  const action = result.mode === 'observe' ? 'observe' : (configuredAction || 'legacy');
  return {
    ...result,
    matched: true,
    rule: detection.rule,
    reason: detection.reason,
    reasonKey: detection.reasonKey,
    action,
    wouldDelete: result.mode !== 'observe' && action !== 'log',
    wouldWarn: result.mode !== 'observe' && ['legacy', 'warn', 'timeout', 'kick', 'ban'].includes(action),
  };
}

// Applique une action choisie dans le Control Center. Quand aucune action
// personnalisée n'est enregistrée, runAutomod conserve son chemin historique.
async function applyConfiguredAction(botId, message, detection, opts, gs, lang, serverName, messages = [message]) {
  const action = ruleActionFor(gs, detection.rule);
  if (!action) return null;
  if (gs.am_mode === 'observe') {
    recordAction(botId, message, detection.reason, { rule: detection.rule, action: 'observe', observed: 1 });
    try {
      await logging.log(botId, message.guild, {
        title: '👀 Auto-modération · observation',
        description: `Règle détectée sans action : ${detection.reason}`,
        color: '#FEE75C', type: 'automod',
        fields: [{ name: '📋 Règle', value: detection.rule, inline: true }, { name: '💬 Message', value: String(message.content || '').slice(0, 500) || '—' }],
      });
    } catch {}
    return { acted: true, observed: true, rule: detection.rule, action: 'observe', reason: detection.reason, deleted: false, deletedCount: 0, warningCount: 0, publicWarning: false, sanction: { applied: false, action: '', minutes: 0, error: '' } };
  }

  const deleteMessages = action !== 'log';
  let deletedCount = 0;
  if (deleteMessages) {
    for (const current of messages) {
      try {
        if (current && current.deletable && typeof current.delete === 'function') {
          markAutomodded(current.id);
          await current.delete();
          deletedCount++;
        }
      } catch {}
    }
  }

  const needsWarning = ['warn', 'timeout', 'kick', 'ban'].includes(action);
  let warning = { count: 0, sanction: null, saved: false, id: 0 };
  if (needsWarning && !opts.force) {
    // Une action par règle est prioritaire : elle ne doit pas déclencher en
    // plus le palier global, sinon une règle « avertir » pourrait bannir.
    warning = registerAutomodWarning(botId, message, detection.reason, opts, {
      ...gs, warn_limit: 0, warn_timeout_limit: 0, am_warn_limit: 0,
    });
  }

  let sanction = null;
  if (['timeout', 'kick', 'ban'].includes(action)) {
    sanction = { action, minutes: action === 'timeout' ? Math.min(Math.max(parseInt(gs.am_timeout_min, 10) || 5, 1), 1440) : 0 };
    warning.sanction = opts.force ? null : sanction;
  }
  let sanctionResult = { applied: false, action: '', minutes: 0, error: '' };
  if (sanction && !opts.force) {
    sanctionResult = await applyAutoSanction(message, sanction, detection.reason, warning.count);
    if (warning.id && sanctionResult.applied) {
      try {
        store.warnings.setAction(warning.id, sanctionResult.action);
        store.warnings.resetActive(botId, message.guild.id, message.author.id);
      } catch {}
    }
  }

  recordAction(botId, message, detection.reason, { rule: detection.rule, action, observed: 0 });
  try {
    await logging.log(botId, message.guild, {
      title: `🛡️ Auto-modération · ${detection.rule}`,
      description: `${action === 'log' ? 'Message détecté' : 'Message traité'} (${detection.reason})`,
      color: action === 'log' ? '#FEE75C' : '#ED4245', type: 'automod',
      fields: [
        { name: '👤 Auteur', value: `<@${message.author.id}>`, inline: true },
        { name: '📋 Action', value: action, inline: true },
        { name: '💬 Message', value: String(message.content || '').slice(0, 500) || '—' },
      ],
    });
  } catch {}

  let publicWarning = { sent: false, error: '' };
  if (!opts.force && warning.count) {
    try { publicWarning = await sendPublicWarning(botId, message, lang, detection.reason, warning.count, gs, warning.sanction, sanctionResult, deletedCount > 0); }
    catch (e) { publicWarning = { sent: false, error: String(e.message || e).slice(0, 180) }; }
  }
  if (!opts.noDm && needsWarning) {
    let text = deletedCount > 0
      ? warnText(gs, lang, serverName, detection.reason)
      : i18n.t(lang, 'am_dm_no_perm', { server: serverName, reason: detection.reason });
    if (warning.count) text += `\\n${i18n.t(lang, 'am_dm_warning_count', { server: serverName, count: warning.count, limit: gs.am_warn_limit > 0 ? '/' + gs.am_warn_limit : '' })}`;
    if (warning.sanction) text += `\\n${sanctionPublicText(lang, warning.sanction, sanctionResult)}`;
    await sendWarn(botId, message, gs, lang, text);
  }
  return {
    acted: true, observed: false, rule: detection.rule, action, reason: detection.reason,
    deleted: deletedCount > 0, deletedCount, warningCount: warning.count,
    publicWarning: publicWarning.sent, sanction: sanctionResult,
  };
}

async function runAutomod(botId, message, opts = {}) {
  if (!message || !message.guild) return { acted: false };
  if (message.author.bot && !opts.force) return { acted: false };
  const gs = store.guildSettings.get(botId, message.guild.id) || {};
  if (gs.am_enabled !== 1) return { acted: false };
  const lang = i18n.langForGuild(message.guild.id);
  const serverName = message.guild.name || 'ce serveur';

  // « Ignorer les admins/modérateurs » : activé par défaut (standard).
  const ignoreStaff = gs.am_ignore_staff === undefined || gs.am_ignore_staff === 1;
  const member = message.member;
  if (!opts.force && ignoreStaff && member && member.permissions && typeof member.permissions.has === 'function') {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)
      || member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return { acted: false, exempt: true, exemption: 'staff' };
    }
  }
  if (!opts.force && isAutomodExempt(message, gs)) return { acted: false, exempt: true, exemption: 'custom' };

  const content = message.content || '';
  const detection = detectContent(botId, message.guild.id, content, gs);
  const reason = detection && detection.reason;

  if (reason) {
    const configuredResult = await applyConfiguredAction(botId, message, detection, opts, gs, lang, serverName);
    if (configuredResult) return configuredResult;
    if (gs.am_mode === 'observe') {
      recordAction(botId, message, reason, { rule: detection.rule, action: 'observe', observed: 1 });
      try {
        await logging.log(botId, message.guild, {
          title: '👀 Auto-modération · observation',
          description: `Règle détectée sans action : ${reason}`,
          color: '#FEE75C', type: 'automod',
          fields: [{ name: '📋 Règle', value: detection.rule, inline: true }, { name: '💬 Message', value: String(content).slice(0, 500) || '—' }],
        });
      } catch {}
      return { acted: true, observed: true, rule: detection.rule, action: 'observe', reason, deleted: false, warningCount: 0, publicWarning: false, sanction: { applied: false, action: '', minutes: 0, error: '' } };
    }
  }

  if (reason) {
    let deleted = false;
    try { if (message.deletable) { markAutomodded(message.id); await message.delete(); deleted = true; } } catch { }

    // Chaque infraction supprimée devient un avertissement traçable. Le
    // premier reste un avertissement public ; le deuxième atteint par défaut
    // le palier « timeout 10 min » (réglable dans le dashboard).
    const warning = registerAutomodWarning(botId, message, reason, opts, gs);
    let sanctionResult = { applied: false, action: '', minutes: 0, error: '' };
    if (!opts.force && warning.sanction) {
      sanctionResult = await applyAutoSanction(message, warning.sanction, reason, warning.count);
      if (warning.id && sanctionResult.applied) {
        try {
          store.warnings.setAction(warning.id, sanctionResult.action);
          store.warnings.resetActive(botId, message.guild.id, message.author.id);
        } catch { }
      }
    }

    recordAction(botId, message, reason, { rule: detection.rule, action: 'legacy' });
    try {
      await logging.log(botId, message.guild, {
        title: '🛡️ Auto-modération',
        description: `Message ${deleted ? 'supprimé' : 'détecté'} (${reason})`,
        color: '#ED4245',
        type: 'automod',
        fields: [
          { name: '👤 Auteur', value: `<@${message.author.id}>`, inline: true },
          { name: '📨 Salon', value: message.channel ? `<#${message.channel.id}>` : '—', inline: true },
          { name: '⚠️ Avertissement', value: warning.count ? `${warning.count}` : 'test', inline: true },
          { name: '💬 Message', value: content.slice(0, 500) || '—' },
        ],
      });
    } catch { }

    let publicWarning = { sent: false, error: '' };
    if (!opts.force && warning.count) {
      try {
        publicWarning = await sendPublicWarning(botId, message, lang, reason, warning.count, gs, warning.sanction, sanctionResult, deleted);
      } catch (e) {
        publicWarning = { sent: false, error: String(e.message || e).slice(0, 180) };
        console.error('[Hoxera] avertissement public impossible :', publicWarning.error);
      }
    }

    // Avertissement MP (jamais silencieux) — sauf en mode test forcé.
    if (!opts.noDm) {
      let text = deleted
        ? warnText(gs, lang, serverName, reason)
        : i18n.t(lang, 'am_dm_no_perm', { server: serverName, reason });
      if (warning.count) text += `\n${i18n.t(lang, 'am_dm_warning_count', { server: serverName, count: warning.count, limit: gs.am_warn_limit > 0 ? '/' + gs.am_warn_limit : '' })}`;
      if (warning.sanction) text += `\n${sanctionPublicText(lang, warning.sanction, sanctionResult)}`;
      await sendWarn(botId, message, gs, lang, text);
    }
    return {
      acted: true,
      reason,
      deleted,
      dmSent: !opts.noDm,
      warningCount: warning.count,
      publicWarning: publicWarning.sent,
      sanction: sanctionResult,
    };
  }

  // Anti-spam : X messages en 5 s → suppression des messages + timeout + MP
  const limit = Number(gs.am_spam ?? 0);
  if (limit > 0) {
    const key = `${botId}:${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const entry = spamTracker.get(key) || { times: [], messages: [] };
    entry.times = entry.times.filter((t) => now - t < 5000);
    entry.messages = entry.messages.slice(-(limit - 1));
    entry.times.push(now);
    entry.messages.push(message);
    spamTracker.set(key, entry);
    if (entry.times.length >= limit) {
      const burstCount = entry.times.length;
      const reasonLabel = i18n.t(lang, 'am_reason_spam');
      const detection = { rule: 'spam', reasonKey: 'am_reason_spam', reason: reasonLabel };
      // Une rafale est consommée dès qu'elle est traitée, y compris en mode
      // observation ou avec une action personnalisée.
      spamTracker.set(key, { times: [], messages: [] });
      const configuredResult = await applyConfiguredAction(botId, message, detection, opts, gs, lang, serverName, entry.messages);
      if (configuredResult) return configuredResult;
      if (gs.am_mode === 'observe') {
        recordAction(botId, message, reasonLabel, { rule: 'spam', action: 'observe', observed: 1 });
        try {
          await logging.log(botId, message.guild, {
            title: '👀 Auto-modération · observation',
            description: `Rafale détectée sans action : ${burstCount} message(s) en 5 s`,
            color: '#FEE75C', type: 'automod',
          });
        } catch {}
        return { acted: true, observed: true, rule: 'spam', action: 'observe', reason: reasonLabel, deleted: false, deletedCount: 0, warningCount: 0, publicWarning: false, sanction: { applied: false, action: '', minutes: 0, error: '' } };
      }
      spamTracker.set(key, { times: [], messages: [] });
      // 1) Supprime les messages du spammeur
      let deletedCount = 0;
      for (const m of entry.messages) {
        try { if (m.deletable) { markAutomodded(m.id); await m.delete(); deletedCount++; } } catch { }
      }

      // 2) Le spam est lui-même un avertissement. S'il atteint un palier,
      // la sanction progressive prime ; sinon on conserve le timeout
      // anti-spam historique configuré dans « Timeout spam ».
      const warning = registerAutomodWarning(botId, message, reasonLabel, opts, gs);
      let sanctionResult = { applied: false, action: '', minutes: 0, error: '' };
      let spamSanction = null;
      if (!opts.force && warning.sanction) {
        sanctionResult = await applyAutoSanction(message, warning.sanction, reasonLabel, warning.count);
        spamSanction = warning.sanction;
      } else if (!opts.force) {
        const minutes = Math.min(Math.max(parseInt(gs.am_timeout_min, 10) || 5, 1), 1440);
        try {
          if (message.member && message.member.moderatable && typeof message.member.timeout === 'function') {
            await message.member.timeout(minutes * 60000, 'Spam détecté');
            sanctionResult = { applied: true, action: 'timeout', minutes, error: '' };
            spamSanction = { action: 'timeout', minutes };
          }
        } catch (e) {
          sanctionResult = { applied: false, action: 'timeout', minutes, error: String(e.message || e).slice(0, 180) };
          spamSanction = { action: 'timeout', minutes };
        }
      }
      if (warning.id && sanctionResult.applied) {
        try {
          store.warnings.setAction(warning.id, sanctionResult.action);
          if (warning.sanction) store.warnings.resetActive(botId, message.guild.id, message.author.id);
        } catch { }
      }
      const actionText = sanctionResult.applied
        ? `, ${sanctionResult.action}${sanctionResult.minutes ? ' ' + sanctionResult.minutes + ' min' : ''}`
        : '';
      recordAction(botId, message, `${reasonLabel} (${deletedCount} message(s) supprimé(s)${actionText})`, { rule: 'spam', action: 'legacy' });
      try {
        await logging.log(botId, message.guild, {
          title: '🛡️ Anti-spam',
          description: `<@${message.author.id}> a envoyé ${burstCount} messages en 5 s → ${deletedCount} supprimé(s)${actionText}`,
          color: '#ED4245',
          type: 'automod',
        });
      } catch { }

      let publicWarning = { sent: false, error: '' };
      if (!opts.force && warning.count) {
        try {
          publicWarning = await sendPublicWarning(botId, message, lang, reasonLabel, warning.count, gs, spamSanction, sanctionResult, deletedCount > 0);
        } catch (e) {
          publicWarning = { sent: false, error: String(e.message || e).slice(0, 180) };
          console.error('[Hoxera] avertissement public anti-spam impossible :', publicWarning.error);
        }
      }
      if (!opts.noDm) {
        let text = i18n.t(lang, 'am_dm_spam', { server: serverName, minutes: sanctionResult.minutes || parseInt(gs.am_timeout_min, 10) || 5 });
        if (warning.count) text += `\n${i18n.t(lang, 'am_dm_warning_count', { server: serverName, count: warning.count, limit: gs.am_warn_limit > 0 ? '/' + gs.am_warn_limit : '' })}`;
        if (spamSanction && warning.sanction) text += `\n${sanctionPublicText(lang, spamSanction, sanctionResult)}`;
        await sendWarn(botId, message, gs, lang, text);
      }
      return {
        acted: true,
        reason: 'spam',
        deleted: deletedCount > 0,
        dmSent: !opts.noDm,
        warningCount: warning.count,
        publicWarning: publicWarning.sent,
        sanction: sanctionResult,
      };
    }
  }

  return { acted: false };
}

module.exports = {
  runAutomod,
  analyzeContent,
  detectContent,
  ruleActionFor,
  isAutomodExempt,
  blacklistWordMatch,
  wasAutomodded,
  markAutomodded,
  _test: { spamTracker, registerAutomodWarning, applyAutoSanction, sendPublicWarning },
};
