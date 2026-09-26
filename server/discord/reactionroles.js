// ============================================================
// v277 — Rôles par réaction emoji (comme les grands bots)
// Réagir à un message donne le rôle associé ; retirer la
// réaction retire le rôle (mode « toggle ») ou le garde
// (mode « add-only »). Réglable au dashboard (module Rôles).
// Coexiste avec le starboard : on ne traite QUE les messages
// déclarés dans la config, tout le reste est ignoré ici.
// ============================================================
const store = require('../db');

// Discord : 20 réactions maximum par message. On n’enregistre PAS plus :
// avant, un plafond à 10 coupait la liste en silence (« la moitié a disparu »).
const MAX_SETUPS = 20;
const MAX_MAPPINGS = 20;

function allOf(guildId) {
  let list = [];
  try { list = JSON.parse(store.settings.get(`rr:${guildId}`) || '[]') || []; } catch { list = []; }
  return Array.isArray(list) ? list.slice(0, MAX_SETUPS) : [];
}

// Un émoji personnalisé peut arriver en « name:id » ou « <:name:id> » :
// on garde l'identifiant brut, seul format reconnu par Discord au react.
function normEmoji(raw) {
  const str = String(raw || '').trim();
  let m = str.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
  if (m) return m[2];
  m = str.match(/^([A-Za-z0-9_]+):(\d+)$/);
  if (m) return m[2];
  if (/^\d{15,20}$/.test(str)) return str;
  return str;
}

function tooManyMappings(n) {
  const e = new Error(`Discord n'accepte que ${MAX_MAPPINGS} réactions par message (vous en avez ${n}). Créez un second message pour les autres rôles.`);
  e.code = 'RR_TOO_MANY';
  return e;
}

function saveAll(guildId, list) {
  const incoming = Array.isArray(list) ? list : [];
  for (const s of incoming) {
    const n = (Array.isArray(s.mappings) ? s.mappings : []).filter((m) => normEmoji(m.emoji) && m.role).length;
    if (n > MAX_MAPPINGS) throw tooManyMappings(n);
  }
  const clean = incoming.slice(0, MAX_SETUPS).map((s) => ({
    id: String(s.id || ''),
    channel: String(s.channel || ''),
    message_id: String(s.message_id || ''),
    mode: s.mode === 'add-only' ? 'add-only' : 'toggle',
    content: String(s.content || '').slice(0, 1900),
    mappings: (Array.isArray(s.mappings) ? s.mappings : []).slice(0, MAX_MAPPINGS).map((m) => ({
      emoji: normEmoji(m.emoji).slice(0, 64),
      role: String(m.role || ''),
      label: String(m.label || '').slice(0, 80),
    })).filter((m) => m.emoji && m.role),
  })).filter((s) => s.mappings.length);
  store.settings.set(`rr:${guildId}`, JSON.stringify(clean));
  return clean;
}

function setupOfMessage(guildId, messageId) {
  return allOf(guildId).find((s) => s.message_id && s.message_id === messageId) || null;
}

// Réaction ajoutée / retirée : donne ou retire le rôle associé.
async function onReaction(botId, reaction, user, type) {
  try {
    if (!reaction || !user || user.bot) return;
    let msg = reaction.message;
    if (!msg || !msg.guild) return;
    if (msg.partial) { try { msg = await msg.fetch(); } catch { return; } }
    const setup = setupOfMessage(msg.guild.id, msg.id);
    if (!setup) return; // starboard & autres : pas concerné
    const key = reaction.emoji?.id || reaction.emoji?.name || '';
    const map = setup.mappings.find((m) => m.emoji === key || m.emoji === reaction.emoji?.name);
    if (!map) return;
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const role = msg.guild.roles.cache.get ? msg.guild.roles.cache.get(map.role) : null;
    if (!role) return;
    if (type === 'add') {
      await member.roles.add(role, 'Hoxera — rôle par réaction').catch(() => {});
    } else if (setup.mode === 'toggle') {
      await member.roles.remove(role, 'Hoxera — rôle par réaction').catch(() => {});
    }
  } catch { /* une réaction ne doit JAMAIS casser le bot */ }
}

// Envoie le message de rôles dans le salon et pose les réactions.
async function sendSetup(botId, guild, setup) {
  const channel = guild.channels.cache.get ? guild.channels.cache.get(setup.channel) : null;
  if (!channel) { const e = new Error('Salon introuvable.'); e.code = 'RR_NO_CHANNEL'; throw e; }
  const lines = setup.mappings.map((m) => `${m.emoji}  →  <@&${m.role}>${m.label ? ` — ${m.label}` : ''}`).join('\n');
  const msg = await channel.send({
    embeds: [{
      title: '🎭 Choisissez vos rôles',
      description: `${setup.content ? setup.content + '\n\n' : ''}Réagissez pour recevoir ou retirer un rôle :\n${lines}`,
      color: 0xe07a5f,
    }],
  });
  for (const m of setup.mappings) {
    try { await msg.react(m.emoji); } catch { /* emoji inconnu : on continue */ }
  }
  return msg.id;
}

module.exports = { allOf, saveAll, setupOfMessage, onReaction, sendSetup, normEmoji, MAX_MAPPINGS, MAX_SETUPS };
