// ============================================================
// v276 — Messages épinglés en bas (sticky)
// Un message important (règlement, annonce, lien…) qui remonte
// automatiquement en bas du salon après chaque paquet de
// nouveaux messages. Le bot ne supprime JAMAIS que SON propre
// message sticky. Désactivé par défaut, réglé au dashboard.
// ============================================================
const store = require('../db');

const DEFAULT_CFG = { enabled: false, channel: '', every: 10, content: '', embed: true };

function cfgOf(guildId) {
  let raw = {};
  try { raw = JSON.parse(store.settings.get(`sticky:${guildId}`) || '{}') || {}; } catch { raw = {}; }
  const cfg = { ...DEFAULT_CFG, ...raw };
  cfg.every = [5, 10, 20, 50].includes(Number(cfg.every)) ? Number(cfg.every) : 10;
  cfg.content = String(cfg.content || '').slice(0, 1900);
  return cfg;
}

function saveCfg(guildId, patch) {
  const next = { ...cfgOf(guildId), ...(patch || {}) };
  next.enabled = !!next.enabled;
  next.embed = !!next.embed;
  next.channel = String(next.channel || '');
  next.every = [5, 10, 20, 50].includes(Number(next.every)) ? Number(next.every) : 10;
  next.content = String(next.content || '').slice(0, 1900);
  store.settings.set(`sticky:${guildId}`, JSON.stringify(next));
  return next;
}

function lastIdOf(guildId) { return store.settings.get(`sticky_msg:${guildId}`) || ''; }
function setLastId(guildId, id) { store.settings.set(`sticky_msg:${guildId}`, String(id || '')); }

// Construit le message sticky (embed sobre aux couleurs Hoxera ou texte brut).
function buildPayload(cfg) {
  const text = cfg.content || '📌 Message épinglé du serveur.';
  if (!cfg.embed) return { content: `📌 ${text}` };
  return {
    embeds: [{
      title: '📌 Message épinglé',
      description: text,
      color: 0xe07a5f,
      footer: { text: 'Hoxera · message automatique' },
    }],
  };
}

// Après chaque message de membre dans le salon configuré : compteur,
// puis le sticky est supprimé et republié tout en bas.
async function onMessage(botId, m) {
  try {
    if (!m || !m.guild || m.author?.bot) return;
    const guildId = m.guild.id;
    const cfg = cfgOf(guildId);
    if (!cfg.enabled || !cfg.channel || m.channel.id !== cfg.channel) return;
    if (!cfg.content.trim()) return;
    let n = Number(store.settings.get(`sticky_count:${guildId}`) || 0) + 1;
    if (n < cfg.every) { store.settings.set(`sticky_count:${guildId}`, String(n)); return; }
    store.settings.set(`sticky_count:${guildId}`, '0');
    const me = m.client?.user?.id;
    const oldId = lastIdOf(guildId);
    if (oldId) {
      try {
        const old = await m.channel.messages.fetch(oldId);
        if (old && (!me || old.author?.id === me)) await old.delete();
      } catch { /* déjà supprimé : rien à faire */ }
    }
    const sent = await m.channel.send(buildPayload(cfg));
    setLastId(guildId, sent.id);
  } catch { /* le sticky ne doit JAMAIS casser la réception des messages */ }
}

// Si le sticky est supprimé à la main, on oublie son identifiant.
function onMessageDelete(botId, m) {
  try {
    if (!m || !m.guild) return;
    const guildId = m.guild.id;
    if (lastIdOf(guildId) && m.id === lastIdOf(guildId)) setLastId(guildId, '');
  } catch { /* silencieux */ }
}

module.exports = { cfgOf, saveCfg, onMessage, onMessageDelete, buildPayload, lastIdOf, setLastId, DEFAULT_CFG };
