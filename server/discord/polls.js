// ============================================================
// v362 — 🗳️ SONDAGES : le VRAI sondage natif de Discord.
// ------------------------------------------------------------
// Un sondage Discord n'est pas un embed : c'est un champ `poll` posé sur un
// message. Le widget est dessiné par Discord (barres de progression, coche,
// compte à rebours) et les votes ne sont PAS des réactions : ils vivent dans
// le système de votes de Discord. Conséquences vérifiées dans la doc et dans
// discord-api-types v10 + discord.js 14.27 :
//   • question : texte seul, 300 caractères maximum ;
//   • réponses : 10 maximum, 55 caractères chacune ;
//   • durée : en HEURES, de 1 à 768 (32 jours), 24 par défaut — aucun sondage
//     ne peut être « illimité » (expiry est nullable dans la doc, mais tous
//     les sondages ont une échéance aujourd'hui) ;
//   • allow_multiselect : vrai = plusieurs choix cochables ;
//   • un message portant un sondage ne peut pas être modifié après envoi
//     (et ne peut pas recevoir de boutons/embeds V2) : on clôture puis on
//     republie, jamais on n'édite ;
//   • clôture : POST /channels/{channel}/polls/{message}/expire, uniquement
//     sur un sondage créé par nous (« You cannot end polls from other users ») ;
//   • lecture des résultats : message.poll (voteCount par réponse,
//     resultsFinalized) ; la liste des votants passe par answer.voters.fetch().
// Rien ici n'est inventé : chaque limite vient de la doc Discord.
// ============================================================
const store = require('../db');
const ui = require('./ui');
const i18n = require('../i18n');
const logging = require('./logging');
const { PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;

// Limites Discord réelles (doc « Poll Resource », oct. 2026).
const QUESTION_MAX = 300;
const ANSWER_MAX = 55;
const ANSWER_MIN = 2;
const ANSWER_LIMIT = 10;
const DURATION_MIN_H = 1;
const DURATION_MAX_H = 768;      // 32 jours
const DURATION_DEFAULT_H = 24;   // défaut de l'API
const CONTENT_MAX = 2000;
const HISTORY_CAP = 60;

const DURATIONS = [1, 2, 4, 6, 12, 24, 48, 72, 168, 336, 768];

const DEFAULTS = {
  enabled: false,
  channel: '',
  duration: DURATION_DEFAULT_H,
  allow_multiselect: false,
  intro: '',
  announce_role: '',
  results_channel: '',
  auto_report: true,
  last_message: '',
  last_channel: '',
};

// ------------------------------------------------------------
// Réglages par serveur
// ------------------------------------------------------------
function clampDuration(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < DURATION_MIN_H) return DURATION_DEFAULT_H;
  return Math.min(n, DURATION_MAX_H);
}

function cfgOf(guildId) {
  let raw = {};
  try { raw = JSON.parse(store.settings.get(`polls_cfg:${guildId}`) || '{}') || {}; } catch {}
  const cfg = { ...DEFAULTS, ...raw };
  cfg.enabled = !!cfg.enabled;
  cfg.channel = String(cfg.channel || '').slice(0, 30);
  cfg.duration = clampDuration(cfg.duration);
  cfg.allow_multiselect = !!cfg.allow_multiselect;
  cfg.intro = String(cfg.intro || '').slice(0, CONTENT_MAX);
  cfg.announce_role = String(cfg.announce_role || '').slice(0, 30);
  cfg.results_channel = String(cfg.results_channel || '').slice(0, 30);
  cfg.auto_report = cfg.auto_report !== false;
  cfg.last_message = String(cfg.last_message || '').slice(0, 30);
  cfg.last_channel = String(cfg.last_channel || '').slice(0, 30);
  return cfg;
}

function saveCfg(guildId, patch) {
  const next = { ...cfgOf(guildId), ...(patch || {}) };
  store.settings.set(`polls_cfg:${guildId}`, JSON.stringify(next));
  return cfgOf(guildId);
}

// ------------------------------------------------------------
// Historique des sondages publiés (clé = message Discord)
// ------------------------------------------------------------
function listAll(guildId) {
  try {
    const rows = JSON.parse(store.settings.get(`polls_list:${guildId}`) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

function writeList(guildId, rows) {
  const trimmed = Array.isArray(rows) ? rows.slice(0, HISTORY_CAP) : [];
  store.settings.set(`polls_list:${guildId}`, JSON.stringify(trimmed));
  return trimmed;
}

function listOf(guildId, { limit = 20 } = {}) {
  return listAll(guildId)
    .slice()
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
    .slice(0, Math.max(1, Math.min(Number(limit) || 20, HISTORY_CAP)));
}

function find(guildId, messageId) {
  const id = String(messageId || '');
  if (!/^\d{15,25}$/.test(id)) return null;
  return listAll(guildId).find((row) => String(row.message_id) === id) || null;
}

function remember(guildId, entry) {
  const rows = listAll(guildId).filter((r) => String(r.message_id) !== String(entry.message_id));
  rows.unshift(entry);
  return writeList(guildId, rows);
}

function patchEntry(guildId, messageId, patch) {
  const rows = listAll(guildId);
  let touched = null;
  const next = rows.map((row) => {
    if (String(row.message_id) !== String(messageId)) return row;
    touched = { ...row, ...(patch || {}) };
    return touched;
  });
  if (touched) writeList(guildId, next);
  return touched;
}

function forget(guildId, messageId) {
  const rows = listAll(guildId).filter((r) => String(r.message_id) !== String(messageId));
  writeList(guildId, rows);
  return rows.length;
}

// ------------------------------------------------------------
// Validation : c'est ici que le dashboard cesse d'envoyer n'importe quoi
// ------------------------------------------------------------
function normOptions(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
  const out = [];
  for (const item of raw) {
    const text = String(item == null ? '' : item).replace(/\r?\n/g, ' ').trim().slice(0, ANSWER_MAX);
    if (!text) continue;
    if (out.some((o) => o.toLowerCase() === text.toLowerCase())) continue; // doublons ignorés
    out.push(text);
    if (out.length >= ANSWER_LIMIT) break;
  }
  return out;
}

// Retourne { ok, errors: {champ: message}, value } — errors vide = prêt à envoyer.
function validate(input = {}, cfg = DEFAULTS) {
  const errors = {};
  const question = String(input.question == null ? '' : input.question).replace(/\r?\n/g, ' ').trim().slice(0, QUESTION_MAX);
  const options = normOptions(input.options);
  const duration = clampDuration(input.duration != null ? input.duration : cfg.duration);
  const allowMultiselect = input.allow_multiselect != null ? !!input.allow_multiselect : !!cfg.allow_multiselect;
  const intro = String(input.intro == null ? (cfg.intro || '') : input.intro).slice(0, CONTENT_MAX);

  if (!question) errors.question = 'La question est vide.';
  else if (question.length > QUESTION_MAX) errors.question = `Question trop longue : ${question.length}/${QUESTION_MAX} caractères.`;

  if (options.length < ANSWER_MIN) errors.options = `Il faut au moins ${ANSWER_MIN} choix.`;
  else if (options.length > ANSWER_LIMIT) errors.options = `Discord refuse plus de ${ANSWER_LIMIT} choix.`;
  else if (options.some((o) => o.length > ANSWER_MAX)) errors.options = `Chaque choix doit faire ${ANSWER_MAX} caractères maximum.`;

  const channel = String(input.channel || cfg.channel || '').trim();
  if (!channel) errors.channel = 'Choisissez le salon du sondage.';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { question, options, duration, allowMultiselect, intro, channel },
  };
}

// Payload EXACT envoyé à Discord. Séparé de l'envoi pour être testé sans bot.
function buildPayload(value) {
  const parts = [];
  const intro = String(value.intro || '').trim();
  if (intro) parts.push(intro);
  parts.push(`**${value.question}**`);
  const hours = clampDuration(value.duration);
  parts.push(hours >= 24
    ? `⏳ _Le vote est ouvert pendant ${Math.round(hours / 24)} jour(s)._`
    : `⏳ _Le vote est ouvert pendant ${hours} heure(s)._`);
  if (value.allowMultiselect) parts.push('☑️ Vous pouvez cocher plusieurs réponses.');
  const deadline = pollDeadlineLine(Date.now() + hours * 3600000);
  if (deadline) parts.push(deadline);
  let content = parts.join('\n');
  if (content.length > CONTENT_MAX) {
    // Le widget porte déjà la question : on rogne l'intro plutôt que de
    // couper la ligne d'échéance en plein milieu.
    content = `**${value.question}**\n${deadline || ''}`.trim().slice(0, CONTENT_MAX);
  }
  return {
    content,
    poll: {
      question: { text: value.question },
      answers: value.options.map((text) => ({ text })),
      duration: clampDuration(value.duration),
      allowMultiselect: !!value.allowMultiselect,
    },
  };
}

// ------------------------------------------------------------
// Envoi réel
// ------------------------------------------------------------
function channelFor(guild, ref) {
  const id = String(ref || '').trim();
  if (!id) return null;
  const direct = guild.channels && guild.channels.cache ? guild.channels.cache.get(id.replace(/^#/, '')) : null;
  if (direct) return direct;
  const name = id.replace(/^#/, '').toLowerCase();
  const list = (guild.channels && guild.channels.cache ? [...guild.channels.cache.values()] : []);
  return list.find((c) => c && c.name && c.name.toLowerCase() === name && typeof c.send === 'function') || null;
}

// Diagnostic avant envoi : le bot doit voir le salon, pouvoir écrire ET
// pouvoir créer des sondages (permission « Créer des sondages »).
function pollDeadlineLine(timestamp) {
  const d = new Date(Number(timestamp) || 0);
  if (!Number.isFinite(d.getTime()) || !timestamp) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `🗳️ Vote ouvert jusqu'au ${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}:${pad(d.getMinutes())}.`;
}

function missingPerms(channel) {
  const guild = channel && channel.guild;
  const me = guild && guild.members && guild.members.me;
  if (!me || !channel.permissionsFor || typeof channel.permissionsFor !== 'function') return [];
  const perms = channel.permissionsFor(me);
  if (!perms || typeof perms.has !== 'function') return [];
  const need = [['ViewChannel', 'voir ce salon'], ['SendMessages', 'y écrire'], ['SendPolls', 'y créer des sondages']];
  const missing = [];
  for (const [flag, label] of need) {
    const bit = F[flag];
    if (bit === undefined) continue; // API plus ancienne : on ne bloque pas
    let ok = false;
    try { ok = perms.has(bit); } catch { ok = false; }
    if (!ok) missing.push(label);
  }
  return missing;
}

function fail(message, code) {
  const e = new Error(message);
  e.code = code || 'POLL_ERROR';
  return e;
}

async function sendPoll(botId, guild, input = {}) {
  const cfg = cfgOf(guild.id);
  const lang = i18n.langForGuild(guild.id);
  if (!cfg.enabled) throw fail(i18n.t(lang, 'polls_off'), 'MODULE_OFF');
  const check = validate({ ...input, channel: input.channel || cfg.channel }, cfg);
  if (!check.ok) {
    throw fail(Object.values(check.errors)[0], Object.keys(check.errors)[0].toUpperCase());
  }
  const channel = channelFor(guild, check.value.channel);
  if (!channel || typeof channel.send !== 'function') throw fail(i18n.t(lang, 'polls_no_channel'), 'NO_CHANNEL');
  const missing = missingPerms(channel);
  if (missing.length) throw fail(`Mes permissions ne me permettent pas de ${missing.join(', ')}.`, 'NO_PERMS');

  const payload = buildPayload(check.value);
  const sent = await channel.send(payload);
  const endsAt = Date.now() + clampDuration(check.value.duration) * 3600000;
  remember(guild.id, {
    message_id: sent.id,
    channel_id: channel.id,
    channel_name: channel.name || '',
    question: check.value.question,
    options: check.value.options,
    duration: clampDuration(check.value.duration),
    allow_multiselect: !!check.value.allowMultiselect,
    created_at: Date.now(),
    ends_at: endsAt,
    closed: false,
    total: 0,
    counts: check.value.options.map(() => 0),
  });
  saveCfg(guild.id, { last_message: sent.id, last_channel: channel.id });
  indexOpen(guild.id, { message_id: sent.id, ends_at: endsAt });
  logging.log(botId, guild, {
    title: '🗳️ Sondage publié', color: '#5865F2', type: 'other',
    fields: [
      { name: '❓ Question', value: check.value.question.slice(0, 300), inline: false },
      { name: '📣 Salon', value: `#${channel.name || channel.id}`, inline: true },
      { name: '⏳ Durée', value: `${check.value.duration} h`, inline: true },
    ],
  });
  return { message: sent, poll: check.value };
}

// ------------------------------------------------------------
// Lecture des résultats
// ------------------------------------------------------------
function readLive(poll) {
  const counts = [];
  let total = 0;
  try {
    const answers = poll && poll.answers ? [...poll.answers.values()].sort((a, b) => a.id - b.id) : [];
    for (const answer of answers) {
      const n = Number(answer && answer.voteCount) || 0;
      counts.push(n);
      total += n;
    }
  } catch { /* sondage partiel : on renvoie ce qu'on a */ }
  return { counts, total };
}

async function messageOf(botId, guild, messageId) {
  const row = find(guild.id, messageId);
  if (!row) throw fail('Sondage introuvable dans l’historique de ce serveur.', 'NOT_FOUND');
  const channel = channelFor(guild, row.channel_id);
  if (!channel || typeof channel.messages === 'undefined') throw fail('Le salon du sondage est introuvable.', 'NO_CHANNEL');
  const message = await channel.messages.fetch(row.message_id).catch(() => null);
  if (!message) throw fail('Le message du sondage a été supprimé.', 'NO_MESSAGE');
  if (!message.poll) throw fail('Ce message ne porte pas de sondage.', 'NO_POLL');
  return { message, row, channel };
}

async function results(botId, guild, messageId) {
  const { message, row } = await messageOf(botId, guild, messageId);
  const live = readLive(message.poll);
  const endedAt = Number(message.poll.expiresTimestamp) || Number(row.ends_at) || 0;
  const expired = endedAt ? endedAt <= Date.now() : false;
  const closed = !!row.closed || expired || !!message.poll.resultsFinalized;
  patchEntry(guild.id, message.id, {
    counts: live.counts, total: live.total,
    closed, finalized: !!message.poll.resultsFinalized,
  });
  return {
    message_id: message.id,
    question: row.question || (message.poll.question && message.poll.question.text) || '',
    options: row.options || [],
    counts: live.counts,
    total: live.total,
    closed,
    finalized: !!message.poll.resultsFinalized,
    ends_at: endedAt,
    allow_multiselect: !!message.poll.allowMultiselect,
    link: `https://discord.com/channels/${guild.id}/${row.channel_id}/${message.id}`,
  };
}

// Liste des votants d'un choix (100 par appel, tri parsnowflake).
async function voters(botId, guild, messageId, answerId, limit = 100) {
  const { message } = await messageOf(botId, guild, messageId);
  const id = Number(answerId);
  const answer = message.poll.answers && message.poll.answers.get ? message.poll.answers.get(id) : null;
  if (!answer || !answer.voters || typeof answer.voters.fetch !== 'function') return [];
  const cap = Math.max(1, Math.min(Number(limit) || 100, 100)); // limite API : 1-100
  const users = await answer.voters.fetch({ limit: cap }).catch(() => null);
  if (!users) return [];
  return [...users.values()].map((u) => ({
    id: u.id,
    tag: u.tag || u.username || u.id,
    avatar: typeof u.displayAvatarURL === 'function' ? u.displayAvatarURL({ size: 64 }) : '',
    bot: !!u.bot,
  }));
}

function resultsMarkdown(entry, res) {
  const counts = (res && res.counts) || entry.counts || [];
  const total = Number(res && res.total) || Number(entry.total) || counts.reduce((a, b) => a + b, 0);
  const lines = [`**🗳️ ${entry.question}**`];
  const ranked = (entry.options || []).map((text, index) => ({ text, n: Number(counts[index]) || 0 }))
    .sort((a, b) => b.n - a.n);
  for (const item of ranked) {
    const pct = total ? Math.round((item.n / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '░');
    lines.push(`${bar} \`${String(pct).padStart(2, ' ')} %\` · ${item.n} — ${item.text}`);
  }
  const statut = res && res.closed
    ? (res.finalized ? '🏁 Clôturé — décompte définitif.' : '⏹️ Clôturé.')
    : '🔵 Vote encore ouvert.';
  lines.push(`_${total} vote(s) au total_ · ${statut}`);
  return lines.join('\n').slice(0, CONTENT_MAX);
}

// Clôture immédiate (possible uniquement sur nos sondages).
async function endPoll(botId, guild, messageId) {
  const { message } = await messageOf(botId, guild, messageId);
  if (message.poll.resultsFinalized) throw fail('Ce sondage est déjà clôturé.', 'ALREADY_CLOSED');
  const before = readLive(message.poll);
  const ended = await message.poll.end().catch(() => null);
  const target = ended || message;
  const after = readLive(target.poll || message.poll);
  const counts = after.counts.length ? after.counts : before.counts;
  const total = after.total || before.total;
  patchEntry(guild.id, message.id, { closed: true, counts, total });
  deindexOpen(message.id);
  const entry = find(guild.id, message.id);
  await reportIfNeeded(botId, guild, entry, { counts, total, closed: true });
  return { ok: true, counts, total };
}

// Envoie le bilan dans le salon choisi (ou dans le journal du serveur).
async function reportIfNeeded(botId, guild, entry, res) {
  if (!entry) return false;
  const cfg = cfgOf(guild.id);
  if (!cfg.auto_report) return false;
  const target = channelFor(guild, cfg.results_channel) || logging.logChannel(botId, guild);
  if (!target || typeof target.send !== 'function') return false;
  await target.send({ content: resultsMarkdown(entry, res).slice(0, CONTENT_MAX) }).catch(() => null);
  return true;
}

// ------------------------------------------------------------
// Index des sondages encore ouverts (une seule clé lue par le scheduler,
// jamais 100 parses JSON par tour quand le bot est sur beaucoup de serveurs).
// ------------------------------------------------------------
function openIndex() {
  try {
    const rows = JSON.parse(store.settings.get('polls_open') || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

function writeOpenIndex(rows) {
  store.settings.set('polls_open', JSON.stringify(rows.slice(0, 500)));
  return rows;
}

function indexOpen(guildId, row) {
  const rows = openIndex().filter((r) => String(r.message_id) !== String(row.message_id));
  rows.push({ guild_id: String(guildId), message_id: String(row.message_id), ends_at: Number(row.ends_at) || 0 });
  return writeOpenIndex(rows);
}

function deindexOpen(messageId) {
  return writeOpenIndex(openIndex().filter((r) => String(r.message_id) !== String(messageId)));
}

// Tâche périodique : les sondages arrivés à échéance voient leur bilan publié.
async function sweepExpired(botId, guild) {
  const cfg = cfgOf(guild.id);
  if (!cfg.enabled || !cfg.auto_report) return 0;
  const now = Date.now();
  const due = listAll(guild.id).filter((row) => !row.closed && Number(row.ends_at) > 0 && Number(row.ends_at) <= now);
  let done = 0;
  for (const row of due.slice(0, 5)) { // petit plafond par tour, jamais bloquant
    try {
      const res = await results(botId, guild, row.message_id);
      if (!res.closed) continue;
      const entry = find(guild.id, row.message_id);
      await reportIfNeeded(botId, guild, entry, res);
      deindexOpen(row.message_id);
      done += 1;
    } catch { /* message supprimé, bot éjecté : on passe au suivant */ }
  }
  return done;
}

// Balayage du scheduler (30 s) : uniquement les sondages pointés par l'index.
async function sweepDue(botId, entry) {
  const client = entry && entry.client;
  if (!client || typeof client.isReady !== 'function' || !client.isReady()) return 0;
  const now = Date.now();
  const due = openIndex().filter((row) => Number(row.ends_at) > 0 && Number(row.ends_at) <= now);
  let done = 0;
  for (const row of due.slice(0, 5)) {
    try {
      const guild = client.guilds && client.guilds.cache ? client.guilds.cache.get(String(row.guild_id)) : null;
      if (!guild) { deindexOpen(row.message_id); continue; }
      const res = await results(botId, guild, row.message_id);
      if (res.closed) {
        await reportIfNeeded(botId, guild, find(guild.id, row.message_id), res);
        deindexOpen(row.message_id);
        done += 1;
      }
    } catch {
      // Message effacé, bot éjecté du serveur, salon supprimé : on sort de
      // l'index pour ne pas tourner dans le vide à chaque tour.
      deindexOpen(row.message_id);
    }
  }
  return done;
}

module.exports = {
  QUESTION_MAX, ANSWER_MAX, ANSWER_MIN, ANSWER_LIMIT, DURATION_MIN_H, DURATION_MAX_H,
  DURATIONS, HISTORY_CAP, DEFAULTS,
  cfgOf, saveCfg, validate, normOptions, buildPayload, clampDuration,
  listOf, find, remember, patchEntry, forget,
  sendPoll, results, voters, endPoll, resultsMarkdown, sweepExpired,
  channelFor, missingPerms, openIndex, indexOpen, deindexOpen, sweepDue, pollDeadlineLine,
};
