// ============================================================
// BotDev - Commandes pré-faites (modules activables en 1 clic)
// ============================================================
const { EmbedBuilder, ApplicationCommandOptionType, PermissionsBitField } = require('discord.js');
const store = require('../db');

const MODULES = {
  moderation: {
    label: 'Modération', emoji: '🛡️', description: 'Kick, ban, warn, timeout, clear…',
    commands: ['kick', 'ban', 'unban', 'timeout', 'warn', 'warns', 'clear'],
  },
  utility: {
    label: 'Utilitaires', emoji: '🔧', description: 'Ping, avatar, infos serveur et utilisateur…',
    commands: ['ping', 'avatar', 'userinfo', 'serverinfo', 'botinfo', 'help'],
  },
  fun: {
    label: 'Fun', emoji: '🎉', description: '8ball, meme, pile ou face, dés, say…',
    commands: ['8ball', 'meme', 'coinflip', 'roll', 'say', 'reverse'],
  },
  economy: {
    label: 'Économie', emoji: '💰', description: 'Coins, daily, classement…',
    commands: ['daily', 'balance', 'leaderboard'],
  },
};

const CMD_DEFS = {
  ping: { label: 'ping', desc: 'Latence du bot' },
  avatar: { label: 'avatar', desc: 'Affiche l\'avatar d\'un utilisateur' },
  userinfo: { label: 'userinfo', desc: 'Informations sur un utilisateur' },
  serverinfo: { label: 'serverinfo', desc: 'Informations sur le serveur' },
  botinfo: { label: 'botinfo', desc: 'Informations sur le bot' },
  help: { label: 'help', desc: 'Liste des commandes activées' },
  '8ball': { label: '8ball', desc: 'La boule magique répond à ta question' },
  meme: { label: 'meme', desc: 'Un meme aléatoire' },
  coinflip: { label: 'coinflip', desc: 'Pile ou face' },
  roll: { label: 'roll', desc: 'Lance un dé' },
  say: { label: 'say', desc: 'Répète ton message' },
  reverse: { label: 'reverse', desc: 'Inverse ton texte' },
  kick: { label: 'kick', desc: 'Expulse un membre', perms: [PermissionsBitField.Flags.KickMembers] },
  ban: { label: 'ban', desc: 'Bannit un membre', perms: [PermissionsBitField.Flags.BanMembers] },
  unban: { label: 'unban', desc: 'Débannit un utilisateur', perms: [PermissionsBitField.Flags.BanMembers] },
  timeout: { label: 'timeout', desc: 'Met un membre en timeout', perms: [PermissionsBitField.Flags.ModerateMembers] },
  warn: { label: 'warn', desc: 'Avertit un membre', perms: [PermissionsBitField.Flags.ModerateMembers] },
  warns: { label: 'warns', desc: 'Liste les avertissements d\'un membre' },
  clear: { label: 'clear', desc: 'Supprime des messages', perms: [PermissionsBitField.Flags.ManageMessages] },
  daily: { label: 'daily', desc: 'Récupère tes coins quotidiens' },
  balance: { label: 'balance', desc: 'Affiche ton solde de coins' },
  leaderboard: { label: 'leaderboard', desc: 'Classement des coins' },
};

function enabledModules(botId) {
  const m = store.modules.all(botId);
  return Object.keys(MODULES).filter(k => m[k]);
}

function enabledCommandNames(botId) {
  const names = [];
  for (const key of enabledModules(botId)) names.push(...MODULES[key].commands);
  return names;
}

// ---------------------- Payloads slash ----------------------
function buildSlashPayloads(botId) {
  const payloads = [];
  for (const name of enabledCommandNames(botId)) {
    const def = CMD_DEFS[name];
    const options = [];
    if (['avatar', 'userinfo', 'kick', 'ban', 'timeout', 'warn', 'warns', 'balance'].includes(name)) {
      options.push({ name: 'utilisateur', description: 'L\'utilisateur ciblé', type: ApplicationCommandOptionType.User, required: ['kick', 'ban', 'timeout', 'warn'].includes(name) });
    }
    // IMPORTANT : Discord exige que les options requises soient placées avant les optionnelles
    if (['timeout'].includes(name)) {
      options.push({ name: 'minutes', description: 'Durée en minutes', type: ApplicationCommandOptionType.Integer, required: true });
    }
    if (['kick', 'ban', 'timeout', 'warn'].includes(name)) {
      options.push({ name: 'raison', description: 'La raison', type: ApplicationCommandOptionType.String, required: false });
    }
    if (['8ball', 'say', 'reverse'].includes(name)) {
      options.push({ name: 'texte', description: 'Ton texte / question', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['clear'].includes(name)) {
      options.push({ name: 'nombre', description: 'Nombre de messages (1-100)', type: ApplicationCommandOptionType.Integer, required: true });
    }
    if (['roll'].includes(name)) {
      options.push({ name: 'max', description: 'Valeur max (défaut 6)', type: ApplicationCommandOptionType.Integer, required: false });
    }
    if (['unban'].includes(name)) {
      options.push({ name: 'identifiant', description: 'ID de l\'utilisateur à débannir', type: ApplicationCommandOptionType.String, required: true });
    }
    // Commandes personnalisées du bot (slash)
    const custom = store.commands.all(botId).filter(c => c.enabled && c.trigger_type === 'slash');
    for (const c of custom) {
      payloads.push({
        name: c.name.toLowerCase().replace(/[^a-z0-9\-_]/g, '-').slice(0, 32),
        description: (c.description || 'Commande BotDev').slice(0, 100),
        options: JSON.parse(c.options || '[]')
          .slice(0, 25)
          .map(o => ({
            name: (o.name || 'option').toLowerCase().slice(0, 32),
            description: (o.description || '').slice(0, 100),
            type: optionType(o.type),
            required: !!o.required,
          }))
          .sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0)),
      });
    }
    payloads.push({
      name,
      description: def.desc,
      options,
    });
  }
  return payloads;
}

function optionType(t) {
  switch (t) {
    case 'user': return ApplicationCommandOptionType.User;
    case 'channel': return ApplicationCommandOptionType.Channel;
    case 'role': return ApplicationCommandOptionType.Role;
    case 'number': return ApplicationCommandOptionType.Number;
    case 'boolean': return ApplicationCommandOptionType.Boolean;
    default: return ApplicationCommandOptionType.String;
  }
}

// ---------------------- Gestion préfixe ----------------------
async function handlePremadePrefix(botId, entry, message, cmdName, args) {
  const enabled = enabledCommandNames(botId);
  const cmd = cmdName.toLowerCase();
  if (!enabled.includes(cmd)) return false;
  const def = CMD_DEFS[cmd];

  if (def.perms && !message.member.permissions.has(def.perms)) {
    await message.channel.send('⛔ Tu n\'as pas la permission d\'utiliser cette commande.');
    return true;
  }

  await execute(botId, entry, cmd, { message, args });
  return true;
}

async function handlePremadeSlash(botId, entry, interaction) {
  const enabled = enabledCommandNames(botId);
  const cmd = interaction.commandName.toLowerCase();
  if (!enabled.includes(cmd)) return;
  const def = CMD_DEFS[cmd];
  if (def.perms && !interaction.member.permissions.has(def.perms)) {
    return interaction.reply({ content: '⛔ Tu n\'as pas la permission d\'utiliser cette commande.', ephemeral: true });
  }
  await execute(botId, entry, cmd, { interaction, args: '' });
}

async function execute(botId, entry, cmd, src) {
  const { client } = entry;
  const record = store.bots.get(botId);
  const isInt = !!src.interaction;
  const guild = src.message ? src.message.guild : src.interaction.guild;
  const channel = src.message ? src.message.channel : src.interaction.channel;
  const author = src.message ? src.message.author : src.interaction.user;
  const member = src.message ? src.message.member : src.interaction.member;

  const send = async (payload) => {
    if (isInt) {
      if (!src._replied) { await src.interaction.reply(payload); src._replied = true; }
      else await src.interaction.followUp(payload);
    } else {
      await channel.send(payload);
    }
  };
  const reply = async (content) => send({ content });
  const replyEmbed = async (embed) => send({ embeds: [embed] });

  const getUserArg = (name = 'utilisateur') => {
    if (isInt) {
      const opt = src.interaction.options.get(name);
      if (!opt) return null;
      const m = src.interaction.options.getMember(name);
      if (m) return m.user;
      return src.interaction.options.getUser(name);
    }
    const mention = argsMatch(src.args || '', /^<@!?(\d+)>/);
    if (mention) {
      const m = guild.members.cache.get(mention[1]);
      if (m) return m.user;
      return client.users.cache.get(mention[1]) || null;
    }
    return null;
  };

  switch (cmd) {
    case 'ping': {
      const m = await reply('🏓 Ping…');
      const latency = client.ws.ping;
      if (isInt) await src.interaction.editReply(`🏓 Pong ! Latence : **${latency} ms**`);
      else if (m) await m.edit(`🏓 Pong ! Latence : **${latency} ms**`);
      break;
    }
    case 'avatar': {
      const target = getUserArg() || author;
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: `Avatar de ${target.tag || target.username}` })
        .setImage(target.displayAvatarURL({ size: 512, dynamic: true }));
      await replyEmbed(embed);
      break;
    }
    case 'userinfo': {
      const target = getUserArg() || author;
      const tMember = target.id ? guild.members.cache.get(target.id) : null;
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🆔 ID', value: target.id, inline: true },
          { name: '📅 Compte créé le', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:d>`, inline: true },
        );
      if (tMember) embed.addFields({ name: '🚪 A rejoint le', value: `<t:${Math.floor(tMember.joinedTimestamp / 1000)}:d>`, inline: true });
      await replyEmbed(embed);
      break;
    }
    case 'serverinfo': {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: '👑 Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
          { name: '👥 Membres', value: String(guild.memberCount), inline: true },
          { name: '💬 Salons', value: String(guild.channels.cache.size), inline: true },
          { name: '🔐 Rôles', value: String(guild.roles.cache.size), inline: true },
          { name: '📅 Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:d>`, inline: true },
          { name: '🆔 ID', value: guild.id, inline: true },
        );
      await replyEmbed(embed);
      break;
    }
    case 'botinfo': {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
        .addFields(
          { name: '🌍 Serveurs', value: String(client.guilds.cache.size), inline: true },
          { name: '👥 Utilisateurs', value: String(client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)), inline: true },
          { name: '⚡ Latence', value: `${client.ws.ping} ms`, inline: true },
          { name: '🤖 Hébergé par', value: 'BotDev', inline: true },
        );
      await replyEmbed(embed);
      break;
    }
    case 'help': {
      const enabled = enabledCommandNames(botId);
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📚 Commandes disponibles')
        .setDescription(enabled.length ? enabled.map(c => `\`${record.prefix}${c}\``).join(' · ') : 'Aucun module activé.')
        .setFooter({ text: `Préfixe : ${record.prefix}` });
      await replyEmbed(embed);
      break;
    }
    case '8ball': {
      const answers = ['Oui, absolument.', 'C\'est certain.', 'Sans aucun doute.', 'Oui, définitivement.', 'Tu peux compter dessus.', 'Essaie encore plus tard.', 'Ne compte pas dessus.', 'Ma réponse est non.', 'Mes sources disent non.', 'Très incertain.'];
      const q = isInt ? (src.interaction.options.getString('texte') || '') : (src.args || '');
      await reply(`🎱 **${q || '...'}**\n${answers[Math.floor(Math.random() * answers.length)]}`);
      break;
    }
    case 'meme': {
      try {
        const res = await fetch('https://meme-api.com/gimme');
        const data = await res.json();
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(data.title).setImage(data.url).setFooter({ text: `r/${data.subreddit}` });
        await replyEmbed(embed);
      } catch {
        await reply('😢 Impossible de récupérer un meme pour le moment.');
      }
      break;
    }
    case 'coinflip': {
      await reply(Math.random() < 0.5 ? '🪙 **Pile !**' : '🪙 **Face !**');
      break;
    }
    case 'roll': {
      let max = 6;
      if (isInt) max = src.interaction.options.getInteger('max') || 6;
      else { const n = parseInt(src.args, 10); if (n) max = n; }
      max = Math.min(Math.max(max, 2), 1000000);
      await reply(`🎲 Tu as lancé un dé et obtenu : **${Math.floor(Math.random() * max) + 1}** (1-${max})`);
      break;
    }
    case 'say': {
      const text = isInt ? src.interaction.options.getString('texte') : src.args;
      await send({ content: text });
      break;
    }
    case 'reverse': {
      const text = isInt ? src.interaction.options.getString('texte') : src.args;
      await reply(text.split('').reverse().join(''));
      break;
    }
    case 'kick': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const tMember = guild.members.cache.get(target.id);
      if (!tMember || !tMember.kickable) return reply('⛔ Je ne peux pas expulser cet utilisateur.');
      const reason = isInt ? (src.interaction.options.getString('raison') || '') : '';
      await tMember.kick(reason || 'Aucune raison').catch(() => {});
      await reply(`✅ **${target.tag || target.username}** a été expulsé.`);
      break;
    }
    case 'ban': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const tMember = guild.members.cache.get(target.id);
      if (!tMember || !tMember.bannable) return reply('⛔ Je ne peux pas bannir cet utilisateur.');
      const reason = isInt ? (src.interaction.options.getString('raison') || '') : '';
      await tMember.ban({ reason: reason || 'Aucune raison' }).catch(() => {});
      await reply(`🔨 **${target.tag || target.username}** a été banni.`);
      break;
    }
    case 'unban': {
      const id = isInt ? src.interaction.options.getString('identifiant') : (src.args || '').trim();
      if (!/^\d{15,21}$/.test(id)) return reply('❓ Identifiant invalide.');
      await guild.bans.remove(id).catch(() => reply('❓ Utilisateur non banni ou introuvable.'));
      await reply(`✅ L\'utilisateur \`${id}\` a été débanni.`);
      break;
    }
    case 'timeout': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const tMember = guild.members.cache.get(target.id);
      const minutes = isInt ? (src.interaction.options.getInteger('minutes') || 5) : (parseInt(src.args, 10) || 5);
      if (!tMember || !tMember.moderatable) return reply('⛔ Je ne peux pas mettre cet utilisateur en timeout.');
      await tMember.timeout(Math.min(Math.max(minutes, 1), 40320) * 60000).catch(() => {});
      await reply(`⏳ **${target.tag || target.username}** est en timeout pour ${minutes} minute(s).`);
      break;
    }
    case 'warn': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const reason = isInt ? (src.interaction.options.getString('raison') || '') : '';
      store.warnings.add(botId, guild.id, target.id, reason || 'Aucune raison', author.id);
      const n = store.warnings.count(botId, guild.id, target.id);
      await reply(`⚠️ **${target.tag || target.username}** a été averti (raison : ${reason || 'aucune'}). Total : **${n}** avertissement(s).`);
      break;
    }
    case 'warns': {
      const target = getUserArg() || author;
      const list = store.warnings.list(botId, guild.id, target.id);
      if (!list.length) return reply(`✅ **${target.tag || target.username}** n'a aucun avertissement.`);
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle(`⚠️ Avertissements de ${target.tag || target.username}`)
        .setDescription(list.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(new Date(w.created_at + 'Z').getTime() / 1000)}:R>`).join('\n').slice(0, 1900));
      await replyEmbed(embed);
      break;
    }
    case 'clear': {
      let n = isInt ? src.interaction.options.getInteger('nombre') : parseInt(src.args, 10);
      n = Math.min(Math.max(n || 0, 1), 100);
      const deleted = await channel.bulkDelete(n, true).catch(() => null);
      const count = deleted ? deleted.size : 0;
      await reply(`🧹 **${count}** message(s) supprimé(s).`);
      break;
    }
    case 'daily': {
      if (!guild) return;
      const row = store.economy.get(botId, guild.id, author.id);
      const today = new Date().toISOString().slice(0, 10);
      if (row && row.last_daily === today) {
        return reply(`⏳ Tu as déjà récupéré tes coins aujourd'hui. Reviens demain !`);
      }
      store.economy.ensure(botId, guild.id, author.id);
      store.economy.add(botId, guild.id, author.id, 100);
      store.economy.setDaily(botId, guild.id, author.id, today);
      const after = store.economy.get(botId, guild.id, author.id);
      await reply(`🎁 **+100 coins** ! Ton solde : **${after.coins}** coins.`);
      break;
    }
    case 'balance': {
      if (!guild) return;
      const target = getUserArg() || author;
      const row = store.economy.get(botId, guild.id, target.id);
      await reply(`💰 **${target.tag || target.username}** possède **${row ? row.coins : 0}** coins.`);
      break;
    }
    case 'leaderboard': {
      if (!guild) return;
      const top = store.economy.top(botId, guild.id, 10);
      if (!top.length) return reply('🏆 Le classement est vide pour le moment.');
      const medal = ['🥇', '🥈', '🥉'];
      const embed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle('🏆 Classement des coins')
        .setDescription(top.map((r, i) => `${medal[i] || `**${i + 1}.**`} <@${r.user_id}> — **${r.coins}** coins`).join('\n'));
      await replyEmbed(embed);
      break;
    }
  }
}

function argsMatch(str, regex) {
  const m = String(str).match(regex);
  return m ? m : null;
}

module.exports = { MODULES, CMD_DEFS, enabledModules, enabledCommandNames, buildSlashPayloads, handlePremadePrefix, handlePremadeSlash };
