// ============================================================
// BotDev - Giveaways : réaction 🎉 → tirage au sort automatique
// /giveaway create durée prix gagnants | end | reroll
// ============================================================
const { EmbedBuilder } = require('discord.js');
const store = require('../db');
const ui = require('./ui');

function parseDuration(str) {
  const s = String(str || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|sec|m|min|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const mult = { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * mult;
}

function formatEnds(endsAt) {
  return `<t:${Math.floor(endsAt / 1000)}:R>`;
}

function buildEmbed(g) {
  return new EmbedBuilder()
    .setColor('#FEE75C')
    .setTitle('🎁 GIVEAWAY')
    .setDescription([
      `**${g.prize}**`,
      '',
      `Réagis avec 🎉 pour participer !`,
      `🏆 Gagnants : **${g.winners}**`,
      `⏰ Fin ${formatEnds(g.ends_at)}`,
    ].join('\n'))
    .setFooter({ text: 'Giveaway propulsé par Hoxera' })
    .setTimestamp();
}

// Démarre un giveaway : envoie l'embed + réaction, enregistre en base
async function startGiveaway(botId, interaction, durationMs, prize, winners) {
  const channel = interaction.channel;
  if (!channel || typeof channel.send !== 'function') {
    return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
  }
  const endsAt = Date.now() + Math.min(Math.max(durationMs, 15000), 30 * 86400000);
  const msg = await channel.send({ embeds: [buildEmbed({ prize, winners, ends_at: endsAt })] });
  await msg.react('🎉').catch(() => {});
  store.giveaways.create({
    bot_id: botId, guild_id: interaction.guild.id,
    channel_id: channel.id, message_id: msg.id,
    prize, winners, ends_at: endsAt,
  });
  return interaction.reply({
    content: `🎁 Giveaway lancé dans ${channel} ! Tirage ${formatEnds(endsAt)} (${winners} gagnant(s)).`,
    ephemeral: true,
  });
}

// Tire les gagnants parmi les réactions 🎉
async function drawWinners(client, g) {
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) return { winners: [], message: null };
  const message = await channel.messages.fetch(g.message_id).catch(() => null);
  if (!message) return { winners: [], message: null };
  const reaction = message.reactions.cache.get('🎉');
  const users = reaction ? [...reaction.users.cache.values()].filter((u) => !u.bot) : [];
  const shuffled = users.sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(g.winners, shuffled.length));
  return { winners, message, channel };
}

async function announceWinners(client, g, winners, reroll = false) {
  const { channel, message } = await drawWinnersRaw(client, g);
  if (message) {
    const embed = buildEmbed(g);
    embed.setTitle(reroll ? '🎁 GIVEAWAY (nouveau tirage)' : '🎁 GIVEAWAY TERMINÉ')
      .setColor(reroll ? '#FEE75C' : '#57F287')
      .setDescription([
        `**${g.prize}**`,
        '',
        winners.length
          ? `🏆 Gagnant(s) : ${winners.map((u) => u.toString()).join(' ')}`
          : '😢 Aucun participant — pas de gagnant.',
        '',
        'Merci à tous d\'avoir participé !',
      ].join('\n'));
    await message.edit({ embeds: [embed] }).catch(() => {});
  }
  if (channel) {
    const winnerMentions = winners.map((u) => u.toString()).join(' ');
    await channel.send({
      content: winnerMentions || undefined,
      embeds: [ui.embed({
        variant: winners.length ? 'success' : 'warning',
        title: winners.length ? '🎉 Giveaway terminé !' : '🎁 Giveaway sans gagnant',
        description: winners.length
          ? `Félicitations ${winnerMentions} ! Vous remportez **${g.prize}** !`
          : `Le giveaway « ${g.prize} » n'a eu aucun participant.`,
        fields: [{ name: '🏆 Résultat', value: winners.length ? `${winners.length} gagnant(s)` : 'Aucun participant', inline: true }],
        footer: 'Hoxera · Giveaways',
      })],
      allowedMentions: { users: winners.map((u) => String(u.id)) },
    }).catch(() => {});
  }
}

async function drawWinnersRaw(client, g) {
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) return { winners: [], message: null };
  const message = await channel.messages.fetch(g.message_id).catch(() => null);
  if (!message) return { winners: [], message: null };
  const reaction = message.reactions.cache.get('🎉');
  const users = reaction ? [...reaction.users.cache.values()].filter((u) => !u.bot) : [];
  const shuffled = users.sort(() => Math.random() - 0.5);
  return { winners: shuffled.slice(0, Math.min(g.winners, shuffled.length)), message, channel };
}

// Termine un giveaway (déclenche le tirage). fromSweep = sans interaction.
async function endGiveaway(botId, client, g, fromSweep = false) {
  if (g.drawn) return { ok: false, reason: 'déjà tiré' };
  store.giveaways.markDrawn(g.id);
  const { winners, channel } = await drawWinnersRaw(client, g);
  await announceWinners(client, g, winners, false);
  return { ok: true, winners: winners.map((u) => u.username) };
}

// Vérifie les giveaways arrivés à échéance (appelé toutes les 30 s)
async function sweep(botId, entry) {
  const due = store.giveaways.due().filter((g) => g.bot_id === botId);
  for (const g of due) {
    try {
      await endGiveaway(botId, entry.client, g, true);
    } catch (e) {
      console.error('[BotDev] giveaway sweep:', e.message);
      store.giveaways.markDrawn(g.id);
    }
  }
}

module.exports = { parseDuration, buildEmbed, startGiveaway, endGiveaway, sweep };
