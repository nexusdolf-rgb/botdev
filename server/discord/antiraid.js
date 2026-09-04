// ============================================================
// Hoxera — Bouclier anti-raid AUTOMATIQUE
// Détecte un afflux anormal de nouveaux membres (ex : 10 arrivées
// en 30 secondes) et réagit selon le réglage du serveur :
//   - « lockdown »  : verrouille les salons (réouverture auto possible)
//   - « alert »     : alerte le staff sans verrouiller
// Réglable depuis le dashboard (module Modération → Anti-raid).
// ============================================================
const store = require('../db');
const logging = require('./logging');
const lockdown = require('./lockdown');
const i18n = require('../i18n');

// botId:guildId -> [{ ts, memberId }]  (mémoire uniquement, fenêtre courte)
const joinTracker = new Map();

const DEFAULT_THRESHOLD = 10;   // arrivées…
const DEFAULT_WINDOW = 30;      // …en X secondes
const DEFAULT_ACTION = 'lockdown';
const DEFAULT_UNLOCK_MIN = 0;   // 0 = réouverture manuelle

function config(botId, guildId) {
  const gs = store.guildSettings.get(botId, guildId) || {};
  return {
    enabled: gs.antiraid_enabled === 1,
    threshold: Math.max(2, parseInt(gs.antiraid_threshold, 10) || DEFAULT_THRESHOLD),
    window: Math.max(5, parseInt(gs.antiraid_window, 10) || DEFAULT_WINDOW),
    action: ['lockdown', 'alert'].includes(gs.antiraid_action) ? gs.antiraid_action : DEFAULT_ACTION,
    unlockMin: Math.max(0, parseInt(gs.antiraid_unlock_min, 10) || 0),
  };
}

// État du verrouillage automatique (affiché dans le dashboard)
function raidState(guildId) {
  try {
    const raw = store.settings.get(`raid_state_${guildId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setRaidState(guildId, state) {
  if (!state) store.settings.set(`raid_state_${guildId}`, '');
  else store.settings.set(`raid_state_${guildId}`, JSON.stringify(state));
}

// Déclenchement réel (utilisé par la détection ET par le bouton « Tester »)
async function trigger(botId, guild, { count, window, action, unlockMin, byTag }) {
  const lang = i18n.langForGuild(guild.id);
  const cfg = config(botId, guild.id);
  const act = action || cfg.action || DEFAULT_ACTION;
  let locked = 0;
  if (act === 'lockdown') {
    const r = await lockdown.on(botId, guild, byTag || '🛡️ Hoxera — anti-raid automatique');
    locked = r.channels || 0;
  }
  const unlockAt = (unlockMin ?? cfg.unlockMin ?? DEFAULT_UNLOCK_MIN) > 0
    ? Date.now() + ((unlockMin ?? cfg.unlockMin) * 60000)
    : 0;
  setRaidState(guild.id, {
    triggeredAt: Date.now(),
    count: count || 0,
    window: window || cfg.window,
    action: act,
    locked,
    unlockAt,
  });
  try {
    await logging.log(botId, guild, {
      title: i18n.t(lang, 'raid_alert_title', { server: guild.name }),
      description: (act === 'lockdown'
        ? i18n.t(lang, 'raid_alert_desc', { count: count || 0, window: window || cfg.window })
        : i18n.t(lang, 'raid_alert_only', { count: count || 0, window: window || cfg.window }))
        + (unlockAt ? i18n.t(lang, 'raid_auto_unlock', { minutes: unlockMin ?? cfg.unlockMin }) : ''),
      color: '#ED4245',
      fields: [
        { name: '🛡️ Action', value: act === 'lockdown' ? `${locked} salon(s) verrouillé(s)` : 'alerte seulement', inline: true },
        { name: '👥 Arrivées', value: `${count || 0} en ${window || cfg.window}s`, inline: true },
      ],
    });
  } catch { /* le journal ne casse jamais la protection */ }
  return { triggered: true, action: act, locked, unlockAt };
}

// À CHAQUE arrivée de membre : met à jour le compteur et déclenche si besoin.
async function onJoin(botId, member) {
  try {
    const guild = member.guild;
    if (!guild) return;
    const cfg = config(botId, guild.id);
    if (!cfg.enabled) return;
    const key = `${botId}:${guild.id}`;
    const now = Date.now();
    let list = (joinTracker.get(key) || []).filter((e) => now - e.ts < cfg.window * 1000);
    list.push({ ts: now, memberId: member.id });
    joinTracker.set(key, list);
    if (list.length >= cfg.threshold) {
      joinTracker.set(key, []); // on repart de zéro après le déclenchement
      await trigger(botId, guild, { count: list.length, window: cfg.window });
    }
  } catch (e) {
    console.error('[Hoxera] anti-raid onJoin:', e.message);
  }
}

// Balayage périodique : purge des arrivées anciennes + réouverture auto.
async function sweep(botId, entry, now = new Date()) {
  try {
    const nowMs = now.getTime();
    for (const [key, list] of joinTracker) {
      if (!key.startsWith(`${botId}:`)) continue;
      const kept = list.filter((e) => nowMs - e.ts < 300000);
      if (kept.length) joinTracker.set(key, kept);
      else joinTracker.delete(key);
    }
    // Réouverture automatique après X minutes
    const allKeys = [];
    for (const k of store.settings.keysLike('raid_state_%')) allKeys.push(k);
    for (const key of allKeys) {
      const guildId = key.replace('raid_state_', '');
      const st = raidState(guildId);
      if (!st || !st.unlockAt || nowMs < st.unlockAt) continue;
      const guild = entry.client.guilds.cache.get(guildId);
      if (!guild) { setRaidState(guildId, null); continue; }
      const lang = i18n.langForGuild(guildId);
      const minutes = Math.round((nowMs - st.triggeredAt) / 60000);
      await lockdown.off(botId, guild, '🛡️ Hoxera — fin du verrouillage automatique');
      setRaidState(guildId, null);
      try {
        await logging.log(botId, guild, {
          title: '🔓 Fin du verrouillage automatique', color: '#57F287',
          description: i18n.t(lang, 'raid_unlocked', { minutes }),
        });
      } catch {}
    }
  } catch (e) {
    console.error('[Hoxera] anti-raid sweep:', e.message);
  }
}

// Réouverture manuelle (bouton du dashboard)
async function unlockNow(botId, guild) {
  await lockdown.off(botId, guild, '🛡️ Hoxera — réouverture manuelle');
  setRaidState(guild.id, null);
  return { reopened: true };
}

module.exports = { onJoin, sweep, trigger, unlockNow, raidState, config, _test: { joinTracker, setRaidState } };
