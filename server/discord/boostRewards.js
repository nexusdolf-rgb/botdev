// ============================================================
// Hoxera — 🚀 v265 — Récompenses boosters Nitro
// Avant : le nombre de boosts était seulement AFFICHÉ (stats, serverinfo).
// Maintenant : chaque membre qui booste le serveur reçoit automatiquement
// un rôle de remerciement, et un message de remerciement part dans le salon
// choisi. Quand le boost s'arrête (expiration Nitro, retrait…), le rôle est
// retiré automatiquement.
//
// Détection : Discord expose `member.premiumSince` (date du boost). Un
// événement guildMemberUpdate où premiumSince passe de « rien » à « date »
// = nouveau boost ; de « date » à « rien » = boost terminé. Un balayage
// rattrape les fins de boost survenues pendant que le bot était éteint.
// ============================================================
const store = require('../db');

const DEFAULT_THANKS = '🚀 Merci {membre} pour le boost Nitro ! Grâce à vous, le serveur monte en niveau et débloque des avantages pour tout le monde. 💜';

// ------------------------------------------------------------
// 🧭 Décision (fonction PURE) : comparaison des premiumSince
// ------------------------------------------------------------
function boostDecision(oldSince, newSince) {
  const had = !!oldSince;
  const has = !!newSince;
  if (!had && has) return 'started';
  if (had && !has) return 'ended';
  return 'none';
}

function thanksMessage(gs, member) {
  const tpl = String((gs && gs.boost_message) || '').trim() || DEFAULT_THANKS;
  return tpl.replace(/\{membre\}/g, `<@${member.id}>`).slice(0, 1900);
}

async function giveRole(guild, member, roleId) {
  try {
    const role = guild.roles.cache.get ? guild.roles.cache.get(roleId) : null;
    if (!role) return false;
    await member.roles.add(role, 'Récompense boost Nitro (Hoxera)');
    return true;
  } catch (e) {
    console.warn(`[Hoxera] 🚀 rôle boost impossible à donner : ${e.message}`);
    return false;
  }
}

// ------------------------------------------------------------
// 🎁 Nouveau boost : rôle + remerciement + journal
// ------------------------------------------------------------
async function applyStart(botId, guild, member, gs) {
  const roleId = String(gs.boost_role || '');
  const given = roleId ? await giveRole(guild, member, roleId) : false;
  const channelId = String(gs.boost_channel || '');
  let sent = false;
  if (channelId) {
    const channel = guild.channels.cache.get ? guild.channels.cache.get(channelId) : null;
    if (channel && typeof channel.send === 'function') {
      try {
        await channel.send({ content: thanksMessage(gs, member), allowedMentions: { users: [member.id] } });
        sent = true;
      } catch (e) {
        console.warn(`[Hoxera] 🚀 remerciement impossible dans #${channel.name || channelId} : ${e.message}`);
      }
    }
  }
  const who = (member.user && member.user.username) || member.id;
  try { store.activity.add(botId, guild.id, '🚀', `${who} a boosté le serveur : rôle ${given ? 'donné' : 'non donné'}${sent ? ', remerciement envoyé' : ''}`); } catch {}
  try {
    const logging = require('./logging');
    await logging.log(botId, guild, { title: '🚀 Nouveau boost Nitro', description: `${who} booste le serveur : rôle de récompense ${given ? 'donné' : 'introuvable'}${sent ? ', message de remerciement envoyé' : ''}.`, color: '#FF73FA' });
  } catch {}
  return { given, sent };
}

// ------------------------------------------------------------
//  Fin de boost : retrait du rôle
// ------------------------------------------------------------
async function applyEnd(botId, guild, member, gs) {
  const roleId = String(gs.boost_role || '');
  let removed = false;
  if (roleId) {
    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Boost Nitro terminé (Hoxera)');
        removed = true;
      }
    } catch (e) {
      console.warn(`[Hoxera] 🚀 rôle boost impossible à retirer : ${e.message}`);
    }
  }
  const who = (member.user && member.user.username) || member.id;
  try { store.activity.add(botId, guild.id, '🚀', `Boost de ${who} terminé : rôle ${removed ? 'retiré' : 'non retiré'}`); } catch {}
  try {
    const logging = require('./logging');
    await logging.log(botId, guild, { title: '🚀 Boost Nitro terminé', description: `${who} ne booste plus le serveur : rôle de récompense ${removed ? 'retiré' : 'absent'}.`, color: '#808080' });
  } catch {}
  return { removed };
}

// ------------------------------------------------------------
// 🔔 Événement guildMemberUpdate (branché dans botManager)
// ------------------------------------------------------------
async function onMemberUpdate(botId, oldMember, newMember) {
  try {
    const guild = newMember.guild;
    const gs = store.guildSettings.get(botId, guild.id) || {};
    if (!String(gs.boost_role || '') && !String(gs.boost_channel || '')) return false;
    const decision = boostDecision(oldMember && oldMember.premiumSince, newMember.premiumSince);
    if (decision === 'started') { await applyStart(botId, guild, newMember, gs); return true; }
    if (decision === 'ended') { await applyEnd(botId, guild, newMember, gs); return true; }
    return false;
  } catch (e) {
    console.error('[Hoxera] 🚀 boost update :', (e && e.message) || e);
    return false;
  }
}

// ------------------------------------------------------------
// 🔁 Rattrapage : boost fini pendant que le bot était éteint
// ------------------------------------------------------------
async function sweep(botManager) {
  for (const [botId, entry] of botManager.clients) {
    if (!entry || !entry.client || typeof entry.client.isReady !== 'function' || !entry.client.isReady()) continue;
    const guilds = entry.client.guilds && entry.client.guilds.cache;
    if (!guilds || typeof guilds.values !== 'function') continue;
    for (const guild of guilds.values()) {
      const gs = store.guildSettings.get(botId, guild.id) || {};
      const roleId = String(gs.boost_role || '');
      if (!roleId) continue;
      const members = guild.members && guild.members.cache;
      if (!members || typeof members.values !== 'function') continue;
      for (const member of members.values()) {
        if (!member.roles.cache.has(roleId)) continue;
        if (member.premiumSince) continue; // booste toujours : rien à faire
        try {
          await member.roles.remove(roleId, 'Boost Nitro terminé — rattrapage (Hoxera)');
          console.log(`[Hoxera] 🚀 rattrapage : rôle boost retiré à ${(member.user && member.user.username) || member.id} (${guild.name || guild.id})`);
        } catch (e) {
          console.warn(`[Hoxera] 🚀 rattrapage impossible : ${e.message}`);
        }
      }
    }
  }
}

// ------------------------------------------------------------
// 🎁 Rôle offert aux boosteurs ACTUELS (action sync de la commande)
// ------------------------------------------------------------
async function syncCurrentBoosters(botId, guild, gs) {
  const roleId = String(gs.boost_role || '');
  if (!roleId) return 0;
  const members = guild.members && guild.members.cache;
  if (!members || typeof members.values !== 'function') return 0;
  let n = 0;
  for (const member of members.values()) {
    if (!member.premiumSince) continue;
    if (member.roles.cache.has(roleId)) continue;
    if (await giveRole(guild, member, roleId)) n += 1;
  }
  return n;
}

module.exports = { DEFAULT_THANKS, boostDecision, thanksMessage, applyStart, applyEnd, onMemberUpdate, sweep, syncCurrentBoosters };
