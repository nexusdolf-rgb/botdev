// ============================================================
// BotDev - Moteur d'exécution : variables, blocs, déclencheurs
// ============================================================
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ApplicationCommandOptionType } = require('discord.js');
const store = require('../db');

// ---------------------- Variables ----------------------
function resolveVariables(template, ctx) {
  if (template === null || template === undefined) return template;
  if (typeof template !== 'string') return template;
  const v = ctx.vars || {};
  return template
    .replace(/\{user\.mention\}/g, v.userMention || '')
    .replace(/\{user\.tag\}/g, v.userTag || '')
    .replace(/\{user\.name\}/g, v.userName || '')
    .replace(/\{user\.id\}/g, v.userId || '')
    .replace(/\{user\}/g, v.userMention || '')
    .replace(/\{server\}/g, v.serverName || '')
    .replace(/\{server\.id\}/g, v.serverId || '')
    .replace(/\{channel\}/g, v.channelMention || '')
    .replace(/\{channel\.id\}/g, v.channelId || '')
    .replace(/\{prefix\}/g, v.prefix || '')
    .replace(/\{args\}/g, v.args || '')
    .replace(/\{arg1\}/g, v.arg1 || '')
    .replace(/\{arg2\}/g, v.arg2 || '')
    .replace(/\{arg3\}/g, v.arg3 || '')
    .replace(/\{arg4\}/g, v.arg4 || '')
    .replace(/\{arg5\}/g, v.arg5 || '')
    .replace(/\{count\}/g, String(v.count ?? ''))
    .replace(/\{coins\}/g, String(v.coins ?? 0))
    .replace(/\{channels\}/g, v.channelsMention || '')
    .replace(/\{random\.user\}/g, v.randomUser || '')
    .replace(/\{bot\}/g, v.botMention || '');
}

// ---------------------- Contexte ----------------------
// Construit le contexte commun (message OU interaction)
async function buildCtx(botRecord, source) {
  const guild = source.guild || null;
  const member = source.member || null;
  const user = source.member ? source.member.user : (source.user || null);
  const channel = source.channel || null;

  let coins = 0;
  if (guild && user) {
    const row = store.economy.get(botRecord.id, guild.id, user.id);
    coins = row ? row.coins : 0;
  }

  const vars = {
    userMention: user ? `<@${user.id}>` : '',
    userTag: user ? user.tag : '',
    userName: user ? user.username : '',
    userId: user ? user.id : '',
    serverName: guild ? guild.name : '',
    serverId: guild ? guild.id : '',
    channelMention: channel ? `<#${channel.id}>` : '',
    channelId: channel ? channel.id : '',
    prefix: (source.guild ? (effectivePrefix(botRecord.id, source.guild.id) || botRecord.prefix) : botRecord.prefix),
    args: '',
    arg1: '', arg2: '', arg3: '', arg4: '', arg5: '',
    count: guild ? (guild.memberCount || 0) : 0,
    coins,
    randomUser: '',
    botMention: source.client && source.client.user ? `<@${source.client.user.id}>` : '',
  };

  if (guild && guild.members && guild.members.cache.size) {
    const arr = [...guild.members.cache.values()].filter(m => !m.user.bot);
    if (arr.length) vars.randomUser = `<@${arr[Math.floor(Math.random() * arr.length)].user.id}>`;
  }

  return {
    bot: botRecord,
    client: source.client,
    guild, member, user, channel,
    vars,
    isInteraction: source.isCommand ? true : !!(source && source.type !== undefined && source.isCommand !== undefined) && !source.author,
  };
}

// ---------------------- Actions (blocs) ----------------------
async function runBlocks(blocks, ctx) {
  const list = Array.isArray(blocks) ? blocks : [];
  for (const block of list) {
    try { await runBlock(block, ctx); }
    catch (e) { console.error('[BotDev] block error:', e.message); }
  }
}

async function runBlock(block, ctx) {
  const p = block.params || {};
  switch (block.type) {

    case 'send_message': {
      const text = resolveVariables(p.text || '', ctx);
      const reply = p.reply === true || p.reply === 'true';
      if (ctx.isInteraction && !ctx.replied) {
        await ctx.source.reply({ content: text, allowedMentions: { repliedUser: false } });
        ctx.replied = true;
      } else if (ctx.source.channel) {
        if (reply && ctx.source.reply && !ctx.isInteraction) {
          await ctx.source.reply({ content: text, allowedMentions: { repliedUser: false } });
        } else {
          await ctx.source.channel.send(text);
        }
      } else if (ctx.source.followUp && ctx.replied) {
        await ctx.source.followUp(text);
      }
      break;
    }

    case 'send_embed': {
      const embed = new EmbedBuilder()
        .setTitle(resolveVariables(p.title || '', ctx) || null)
        .setDescription(resolveVariables(p.description || '', ctx) || null)
        .setColor(p.color || '#5865F2');
      if (p.footer) embed.setFooter({ text: resolveVariables(p.footer, ctx) });
      if (p.image) embed.setImage(p.image.trim());
      if (p.thumbnail) embed.setThumbnail(p.thumbnail.trim());
      (p.fields || []).forEach(f => {
        embed.addFields({ name: resolveVariables(f.name || '\u200b', ctx), value: resolveVariables(f.value || '\u200b', ctx), inline: !!f.inline });
      });
      if (ctx.isInteraction && !ctx.replied) {
        await ctx.source.reply({ embeds: [embed] });
        ctx.replied = true;
      } else if (ctx.source.channel) {
        await ctx.source.channel.send({ embeds: [embed] });
      } else if (ctx.source.followUp && ctx.replied) {
        await ctx.source.followUp({ embeds: [embed] });
      }
      break;
    }

    case 'send_buttons': {
      const content = resolveVariables(p.content || '', ctx);
      const row = new ActionRowBuilder();
      (p.buttons || []).slice(0, 5).forEach((b) => {
        if (b.kind === 'url' && b.url) {
          row.addComponents(new ButtonBuilder().setLabel(b.label || 'Lien').setStyle(ButtonStyle.Link).setURL(b.url));
        } else if (b.commandId) {
          row.addComponents(new ButtonBuilder()
            .setCustomId(`bd:${ctx.bot.id}:${b.commandId}`)
            .setLabel(b.label || 'Bouton')
            .setStyle(Number(b.style) || ButtonStyle.Primary));
        }
      });
      const payload = { content: content || null, components: row.components.length ? [row] : [] };
      if (ctx.isInteraction && !ctx.replied) {
        await ctx.source.reply(payload);
        ctx.replied = true;
      } else if (ctx.source.channel) {
        await ctx.source.channel.send(payload);
      } else if (ctx.source.followUp && ctx.replied) {
        await ctx.source.followUp(payload);
      }
      break;
    }

    case 'add_role':
    case 'remove_role': {
      if (!ctx.guild || !ctx.member) break;
      const roleName = resolveVariables(p.role || '', ctx);
      const role = await findRole(ctx.guild, roleName, ctx);
      if (!role) break;
      const target = pickTarget(ctx, p.target);
      if (!target) break;
      const me = ctx.guild.members.me;
      if (me && role.position >= me.roles.highest.position) break;
      if (block.type === 'add_role') await target.roles.add(role).catch(() => {});
      else await target.roles.remove(role).catch(() => {});
      break;
    }

    case 'kick_user': {
      if (!ctx.guild) break;
      const target = pickTarget(ctx, p.target);
      if (!target || !target.kickable) break;
      await target.kick(resolveVariables(p.reason || '', ctx)).catch(() => {});
      break;
    }

    case 'ban_user': {
      if (!ctx.guild) break;
      const target = pickTarget(ctx, p.target);
      if (!target || !target.bannable) break;
      await target.ban({ reason: resolveVariables(p.reason || '', ctx) }).catch(() => {});
      break;
    }

    case 'timeout_user': {
      if (!ctx.guild) break;
      const target = pickTarget(ctx, p.target);
      if (!target || !target.moderatable) break;
      const minutes = Math.min(Math.max(parseInt(p.minutes, 10) || 5, 1), 40320);
      await target.timeout(minutes * 60000, resolveVariables(p.reason || '', ctx)).catch(() => {});
      break;
    }

    case 'give_coins': {
      if (!ctx.guild || !ctx.user) break;
      let targetUser = ctx.user;
      const t = pickTarget(ctx, p.target);
      if (t && t.user) targetUser = t.user;
      else if (p.target === 'args' && ctx.vars.arg1User) targetUser = ctx.vars.arg1User;
      const amount = parseInt(p.amount, 10) || 0;
      store.economy.add(ctx.bot.id, ctx.guild.id, targetUser.id, amount);
      break;
    }

    case 'random': {
      const options = (p.options || []).map(o => resolveVariables(o, ctx)).filter(o => String(o).trim());
      if (options.length) {
        const pick = options[Math.floor(Math.random() * options.length)];
        if (ctx.isInteraction && !ctx.replied) { await ctx.source.reply(pick); ctx.replied = true; }
        else if (ctx.source.channel) await ctx.source.channel.send(pick);
      }
      break;
    }

    case 'if': {
      const cond = evaluateCondition(p, ctx);
      if (cond) await runBlocks(block.thenBlocks || [], ctx);
      else await runBlocks(block.elseBlocks || [], ctx);
      break;
    }

    case 'delete_message': {
      if (!ctx.isInteraction && ctx.source && ctx.source.deletable) await ctx.source.delete().catch(() => {});
      break;
    }

    case 'dm_user': {
      if (ctx.user) await ctx.user.send(resolveVariables(p.text || '', ctx)).catch(() => {});
      break;
    }
  }
}

function evaluateCondition(p, ctx) {
  const left = resolveVariables(p.left || '', ctx);
  const right = resolveVariables(p.right || '', ctx);
  switch (p.operator) {
    case '==': return String(left).toLowerCase() === String(right).toLowerCase();
    case '!=': return String(left).toLowerCase() !== String(right).toLowerCase();
    case 'contains': return String(left).toLowerCase().includes(String(right).toLowerCase());
    case 'startswith': return String(left).toLowerCase().startsWith(String(right).toLowerCase());
    case 'endswith': return String(left).toLowerCase().endsWith(String(right).toLowerCase());
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    default: return false;
  }
}

async function findRole(guild, nameOrId, ctx) {
  const q = resolveVariables(nameOrId, ctx);
  if (!q) return null;
  const byId = guild.roles.cache.get(q.replace(/[<@&>]/g, ''));
  if (byId) return byId;
  const byName = guild.roles.cache.find(r => r.name.toLowerCase() === q.toLowerCase());
  return byName || null;
}

function pickTarget(ctx, mode) {
  if (!ctx.guild) return null;
  if (mode === 'author' || !mode) return ctx.member;
  if (mode === 'args') {
    const arg = ctx.vars.arg1User;
    if (arg) return ctx.guild.members.cache.get(arg.id);
    return null;
  }
  return ctx.member;
}

// ---------------------- Déclencheurs ----------------------
const cooldowns = new Map();
function checkCooldown(botId, commandId, userId, seconds) {
  if (!seconds) return true;
  const key = `${botId}:${commandId}:${userId}`;
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < seconds * 1000) return false;
  cooldowns.set(key, now);
  return true;
}

// ---------------------- Messages (préfixe / mot-clé) ----------------------
function effectivePrefix(botId, guildId) {
  const gs = store.guildSettings.get(botId, guildId);
  return (gs && gs.prefix) || '';
}

async function runMessageHandler(botId, entry, message) {
  if (!message || message.author.bot || !message.guild) return;
  const record = store.bots.get(botId);
  if (!record) return;
  // 🎫 Activité dans un salon de ticket → repousse l'échéance de fermeture auto
  try {
    if (message.channel && message.channel.id) {
      store.openTickets.touch(message.channel.id, new Date().toISOString());
    }
  } catch {}
  // 🛡️ Auto-modération puis 📈 XP (avant l'analyse des commandes)
  const { runAutomod } = require('./automod');
  const xpEngine = require('./xp');
  const am = await runAutomod(botId, message).catch(() => ({ acted: false }));
  if (am.acted) return;
  await xpEngine.onMessage(botId, message).catch(() => {});
  // Préfixe par serveur (réglable depuis le dashboard), sinon préfixe du bot
  const prefix = effectivePrefix(botId, message.guild.id) || record.prefix || '!';
  const content = message.content || '';

  const cmds = store.commands.all(botId).filter(c => c.enabled);

  // Commandes préfixe
  if (content.startsWith(prefix)) {
    const body = content.slice(prefix.length).trim();
    if (!body) return;
    const [cmdName, ...rest] = body.split(/\s+/);
    const args = rest.join(' ');

    // Commandes personnalisées
    const custom = cmds.find(c => c.trigger_type === 'prefix' && c.trigger_value.toLowerCase() === cmdName.toLowerCase());
    if (custom) {
      if (!checkCooldown(botId, custom.id, message.author.id, custom.cooldown)) return;
      await runCommandBlocks(entry, custom, { message, args });
      return;
    }

    // Modules pré-faits
    const { handlePremadePrefix } = require('./premade');
    const handled = await handlePremadePrefix(botId, entry, message, cmdName, args);
    if (handled) return;
  }

  // Commandes mot-clé
  for (const c of cmds.filter(c => c.trigger_type === 'keyword')) {
    if (content.toLowerCase() === (c.trigger_value || '').toLowerCase()) {
      if (!checkCooldown(botId, c.id, message.author.id, c.cooldown)) return;
      await runCommandBlocks(entry, c, { message, args: '' });
      return;
    }
  }
}

// ---------------------- Interactions (slash / boutons) ----------------------
async function runInteractionHandler(botId, entry, interaction) {
  const record = store.bots.get(botId);
  if (!record) return;

  if (interaction.isChatInputCommand()) {
    const cmds = store.commands.all(botId).filter(c => c.enabled && c.trigger_type === 'slash');
    const custom = cmds.find(c => c.name.toLowerCase() === interaction.commandName.toLowerCase());
    if (custom) {
      if (!checkCooldown(botId, custom.id, interaction.user.id, custom.cooldown)) {
        return interaction.reply({ content: '⏳ Attends un peu avant de réutiliser cette commande.', ephemeral: true });
      }
      const args = interaction.options?.data?.map(o => (o.member || o.user) ? `<@${(o.member || o.user).id}>` : String(o.value)).join(' ') || '';
      await runCommandBlocks(entry, custom, { interaction, args });
      return;
    }
    const { handlePremadeSlash } = require('./premade');
    await handlePremadeSlash(botId, entry, interaction);
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId || '';
    if (!id.startsWith(`bd:${botId}:`)) return;
    const commandId = parseInt(id.split(':')[2], 10);
    const command = store.commands.get(commandId);
    if (!command || command.bot_id !== botId || !command.enabled) {
      return interaction.reply({ content: 'Cette commande n\'existe plus.', ephemeral: true });
    }
    if (!checkCooldown(botId, command.id, interaction.user.id, command.cooldown)) {
      return interaction.reply({ content: '⏳ Attends un peu avant de réutiliser cette commande.', ephemeral: true });
    }
    await runCommandBlocks(entry, command, { interaction, args: '' });
  }
}

// ---------------------- Exécution d'une commande ----------------------
async function runCommandBlocks(entry, command, source) {
  const { client } = entry;
  const ctx = await buildCtx(store.bots.get(command.bot_id), source.message || source.interaction);
  ctx.replied = false;

  if (source.interaction) {
    ctx.source = source.interaction;
    ctx.isInteraction = true;
  }

  // Découpage des arguments
  const argsStr = source.args || '';
  const parts = argsStr.split(/\s+/).filter(Boolean);
  ctx.vars.args = argsStr;
  parts.forEach((part, i) => {
    ctx.vars[`arg${i + 1}`] = part;
    if (i === 0) {
      const mention = part.match(/^<@!?(\d+)>$/);
      if (mention) ctx.vars.arg1User = { id: mention[1] };
    }
  });

  await runBlocks(JSON.parse(command.blocks || '[]'), ctx);

  // Si aucune action n'a répondu (commande slash ou bouton), on évite l'erreur Discord
  if (ctx.isInteraction && !ctx.replied && ctx.source && !ctx.source.deferred) {
    try { await ctx.source.reply({ content: '✅ Terminé !', ephemeral: true }); } catch {}
  }
}

module.exports = { runMessageHandler, runInteractionHandler, runBlocks, resolveVariables, buildCtx, runCommandBlocks };
