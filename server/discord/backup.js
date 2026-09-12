// ============================================================
// v280 — Sauvegarde de la structure du serveur
// Instantanés (rôles + catégories + salons) stockés par serveur,
// restauration SÛRE : ne recrée que ce qui manque (jamais de
// suppression). Export JSON téléchargeable. 5 instantanés max.
// ============================================================
const store = require('../db');

const MAX_SNAPSHOTS = 5;

function listOf(guildId) {
  let list = [];
  try { list = JSON.parse(store.settings.get(`backups:${guildId}`) || '[]') || []; } catch { list = []; }
  return (Array.isArray(list) ? list : []).slice(0, MAX_SNAPSHOTS);
}

function saveList(guildId, list) {
  store.settings.set(`backups:${guildId}`, JSON.stringify((Array.isArray(list) ? list : []).slice(0, MAX_SNAPSHOTS)));
}

function get(guildId, id) {
  return listOf(guildId).find((b) => b.id === id) || null;
}

// Photographie la structure : rôles, catégories, salons (pas de messages).
function snapshot(guild) {
  const roles = (guild.roles && guild.roles.cache ? [...guild.roles.cache.values()] : [])
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .slice(0, 250)
    .map((r) => ({ name: r.name, color: r.color || 0, hoist: !!r.hoist, mentionable: !!r.mentionable, permissions: String(r.permissions?.bitfield ?? '0'), position: r.position || 0 }));
  const channels = (guild.channels && guild.channels.cache ? [...guild.channels.cache.values()] : [])
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .slice(0, 500)
    .map((c) => ({
      type: c.type,                 // 0 texte, 2 vocal, 4 catégorie…
      name: c.name,
      topic: c.topic || '',
      position: c.position || 0,
      parent: c.parent ? c.parent.name : '',   // nom de la catégorie (stable entre serveurs)
      bitrate: c.bitrate || 0,
      userLimit: c.userLimit || 0,
      slowmode: c.rateLimitPerUser || 0,
      nsfw: !!c.nsfw,
    }));
  return {
    v: 1,
    name: guild.name || '',
    roles,
    channels,
    counts: { roles: roles.length, channels: channels.length },
  };
}

function create(guildId, guild) {
  const data = snapshot(guild);
  const list = listOf(guildId);
  list.unshift({ id: 'bk' + Date.now(), t: Date.now(), data });
  saveList(guildId, list);
  return list[0];
}

function remove(guildId, id) {
  saveList(guildId, listOf(guildId).filter((b) => b.id !== id));
}

// Restauration SÛRE : recrée uniquement rôles/salons ABSENTS (par nom).
// Ne supprime et ne modifie JAMAIS rien d'existant.
async function restore(guild, backup) {
  const made = { roles: 0, channels: 0 };
  const data = backup && backup.data;
  if (!data) { const e = new Error('Sauvegarde vide.'); e.code = 'BK_EMPTY'; throw e; }
  const existingRoles = new Set((guild.roles?.cache ? [...guild.roles.cache.values()] : []).map((r) => r.name));
  for (const r of (data.roles || []).slice().reverse()) {   // position croissante
    if (existingRoles.has(r.name)) continue;
    try {
      await guild.roles.create({ name: r.name, color: r.color || 0, hoist: !!r.hoist, mentionable: !!r.mentionable, permissions: BigInt(r.permissions || '0'), reason: 'Hoxera — restauration de sauvegarde' });
      made.roles++;
    } catch { /* permission manquante : on continue */ }
  }
  const cats = (data.channels || []).filter((c) => c.type === 4);
  const others = (data.channels || []).filter((c) => c.type !== 4);
  const catByName = new Map((guild.channels?.cache ? [...guild.channels.cache.values()] : []).filter((c) => c.type === 4).map((c) => [c.name, c]));
  for (const c of cats) {
    if (catByName.has(c.name)) continue;
    try {
      const created = await guild.channels.create({ name: c.name, type: 4, reason: 'Hoxera — restauration de sauvegarde' });
      catByName.set(c.name, created);
      made.channels++;
    } catch {}
  }
  const existingChannels = new Set((guild.channels?.cache ? [...guild.channels.cache.values()] : []).map((c) => c.name));
  for (const c of others) {
    if (existingChannels.has(c.name)) continue;
    const parent = c.parent ? catByName.get(c.parent) : null;
    try {
      await guild.channels.create({
        name: c.name,
        type: c.type,
        topic: c.topic || undefined,
        parent: parent || undefined,
        bitrate: c.bitrate || undefined,
        userLimit: c.userLimit || undefined,
        rateLimitPerUser: c.slowmode || undefined,
        nsfw: !!c.nsfw,
        reason: 'Hoxera — restauration de sauvegarde',
      });
      made.channels++;
    } catch {}
  }
  return made;
}

module.exports = { listOf, get, create, remove, restore, snapshot, MAX_SNAPSHOTS };
