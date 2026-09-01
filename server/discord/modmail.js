// ============================================================
// 💬 Modmail — messages privés → serveur (Phase 3, v196)
// Un membre MP le bot : le message arrive dans un fil privé du
// salon modmail configuré sur le serveur. Le staff répond dans le
// fil, l'utilisateur reçoit la réponse en MP. Tout se configure
// depuis le dashboard (module « Modmail »).
// 🛡️ Ne plante jamais : chaque étape est protégée (le modmail ne
// doit pas faire tomber la gestion des messages du bot).
// ============================================================
const store = require('../db');

// Choix en attente d'un serveur quand l'utilisateur est membre de
// plusieurs serveurs à modmail actif (mémorisé en mémoire, expire 60 s).
const pendingChoice = new Map(); // userId -> { guildIds: [], expires }

function cleanPending() {
  const now = Date.now();
  for (const [k, v] of pendingChoice) {
    if (v.expires < now) pendingChoice.delete(k);
  }
}

function modmailGuilds(botId, client, userId) {
  const out = [];
  if (!client || !client.guilds) return out;
  for (const guild of client.guilds.cache.values()) {
    if (!guild.members || !guild.members.cache.has(userId)) continue;
    const cfg = store.guildSettings.get(botId, guild.id);
    if (cfg && cfg.modmail_enabled && cfg.modmail_channel) out.push(guild);
  }
  return out;
}

// Message privé d'un membre → relais vers le fil du serveur choisi
async function relayUserToStaff(botId, m, guild) {
  const entry = require('./botManager').getEntry ? require('./botManager') : null;
  const client = (entry && entry.getClient(botId)) || null;
  if (!client) return;
  const cfg = store.guildSettings.get(botId, guild.id);
  if (!cfg || !cfg.modmail_enabled || !cfg.modmail_channel) return;

  const { resolveChannel } = require('./events');
  const channel = await resolveChannel(guild, cfg.modmail_channel);
  if (!channel) {
    return m.author.send('⚠️ Le salon modmail de ce serveur n\'est pas disponible pour le moment.').catch(() => {});
  }

  const userTag = (m.author.tag || m.author.username || 'Membre').slice(0, 60);
  let thread = store.modmail.openByUser(botId, guild.id, m.author.id);

  if (!thread) {
    // Nouvelle conversation : on crée le fil dans le salon modmail
    const cleanName = userTag.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 80) || 'membre';
    const created = await channel.threads.create({
      name: `modmail-${cleanName}`,
      autoArchiveDuration: 1440, // 24 h
      type: 12, // PrivateThread (visible par le staff uniquement)
    }).catch(async () => channel.threads.create({ name: `modmail-${cleanName}`, autoArchiveDuration: 1440 })); // repli : thread public
    store.modmail.create({
      bot_id: botId, guild_id: guild.id, user_id: m.author.id,
      user_tag: userTag, thread_id: created.id, channel_id: channel.id,
    });
    thread = store.modmail.openByUser(botId, guild.id, m.author.id);
    await created.send(`💬 **Nouvelle conversation** avec **${userTag}** — réponds ici, il recevra ta réponse en message privé.`).catch(() => {});
    store.activity.add(botId, guild.id, '💬', `Modmail : nouvelle conversation avec ${userTag}`);
  }

  const parent = (channel.threads && thread && channel.threads.cache.get(thread.thread_id)) || null;
  if (!parent) {
    // Fil introuvable (archivé/supprimé) : on en recrée un propre
    store.modmail.close(thread.id);
    return relayUserToStaff(botId, m, guild);
  }
  await parent.send(`**${userTag} :** ${m.content || '(message sans texte)'}`).catch(() => {});
  await m.author.send(`✅ Message envoyé à l'équipe de **${guild.name}**. Tu recevras sa réponse ici.`).catch(() => {});
}

// Réponse du staff dans le fil → relais en MP vers le membre
async function relayStaffToUser(botId, m) {
  const entry = require('./botManager');
  const client = entry.getClient(botId);
  if (!client) return;
  const rec = store.modmail.findByThread(botId, m.channel.id);
  if (!rec || rec.closed) return;
  const user = await client.users.fetch(rec.user_id).catch(() => null);
  if (!user) return;
  const authorName = (m.member && (m.member.displayName || m.author.username)) || m.author.username || 'Staff';
  const guildName = (m.guild && m.guild.name) || 'le serveur';
  const ok = await user.send(`📨 **Réponse de ${authorName} (${guildName})** :\n${m.content || '(message sans texte)'}`).catch(() => null);
  if (!ok) {
    await m.reply('⚠️ Impossible d\'envoyer la réponse en MP : le membre a fermé ses messages privés.').catch(() => {});
  }
}

// Point d'entrée appelé par botManager.messageCreate
async function onMessage(botId, m) {
  try {
    if (!m || m.author.bot) return;
    const record = store.bots.get(botId);
    const prefix = (record && record.prefix) || '!';

    // ── Message privé → vers le serveur ──
    if (!m.guild) {
      // Une commande préfixe reste une commande (DM_SAFE) : on n'intercepte pas
      if (String(m.content || '').startsWith(prefix)) return;

      cleanPending();
      const entry = require('./botManager');
      const client = entry.getClient(botId);
      if (!client) return;

      // Choix de serveur en attente ?
      const pending = pendingChoice.get(m.author.id);
      if (pending && pending.expires > Date.now()) {
        const guilds = pending.guildIds.map((gid) => client.guilds.cache.get(gid)).filter(Boolean);
        const choice = guilds.find((g) => String(g.id) === String(m.content || '').trim()
          || g.name.toLowerCase() === String(m.content || '').trim().toLowerCase());
        if (choice) {
          pendingChoice.delete(m.author.id);
          return relayUserToStaff(botId, m, choice);
        }
        if (/^\d+$/.test(String(m.content || '').trim())) {
          const idx = parseInt(String(m.content).trim(), 10) - 1;
          if (guilds[idx]) { pendingChoice.delete(m.author.id); return relayUserToStaff(botId, m, guilds[idx]); }
        }
        // Mauvaise réponse → on re-propose la liste
        const list = guilds.map((g, i) => `${i + 1}) ${g.name}`).join('\n');
        return m.author.send(`Je ne comprends pas. Écris le numéro du serveur auquel tu veux écrire :\n${list}`).catch(() => {});
      }

      const guilds = modmailGuilds(botId, client, m.author.id);
      if (!guilds.length) {
        // Pas de modmail actif pour ce membre : le bot reste muet (les DM
        // sans modmail ne doivent pas spammer). Sauf si un message précédent
        // de notre part a lancé une conversation.
        return;
      }
      if (guilds.length === 1) return relayUserToStaff(botId, m, guilds[0]);
      // Plusieurs serveurs → on demande le choix
      pendingChoice.set(m.author.id, { guildIds: guilds.map((g) => g.id), expires: Date.now() + 60000 });
      const list = guilds.map((g, i) => `${i + 1}) ${g.name}`).join('\n');
      return m.author.send(`Tu es membre de plusieurs serveurs avec un support par message privé. Écris le numéro du serveur auquel tu veux écrire :\n${list}`).catch(() => {});
    }

    // ── Message dans un fil modmail (staff) → vers le membre ──
    if (m.channel && typeof m.channel.isThread === 'function' && m.channel.isThread()) {
      if (String(m.content || '').startsWith(prefix)) return;
      return relayStaffToUser(botId, m);
    }
  } catch (e) {
    console.error('[BotDev] modmail:', (e && e.message) || e);
  }
}

module.exports = { onMessage, modmailGuilds };
