// ============================================================
// Hoxera — 🎮 Événements & tournois (v189)
// Le staff crée un événement avec date/heure ; les membres
// s'inscrivent via un bouton « Participer » ; le bot rappelle
// automatiquement 24 h puis 1 h avant, avec le rôle ping choisi.
// Commandes : /event create · /event list · /event delete
// ============================================================
const {
  EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle,
  ApplicationCommandOptionType, PermissionsBitField,
} = require('discord.js');
const store = require('../db');
const tzUtil = require('../tz');
const ui = require('./ui');

const ADMIN = PermissionsBitField.Flags.Administrator.toString();

// ------------------------------------------------------------
// 🧭 Aide
// ------------------------------------------------------------
const HELP_EVENTS = {
  event: ['🎮 Événements & tournois', 'Crée des événements datés (tournois, events, soirées…). Les membres cliquent « Participer », le bot rappelle 24 h et 1 h avant.', '`/event create titre=… quand=…` · `/event list` · `/event delete`', '`/event create titre=Tournoi CODM quand=25/08 20:00` → message avec bouton 🎮 Participer'],
};

// ------------------------------------------------------------
// 📦 Définitions des commandes slash
// ------------------------------------------------------------
function buildEventPayloads() {
  return [
    {
      name: 'event',
      description: '🎮 Événements & tournois du serveur (créer, lister, supprimer)',
      default_member_permissions: ADMIN,
      options: [
        {
          name: 'action', description: 'Que faire ?', type: ApplicationCommandOptionType.String, required: true,
          choices: [
            { name: 'create — créer un événement', value: 'create' },
            { name: 'list — lister les événements', value: 'list' },
            { name: 'delete — supprimer un événement', value: 'delete' },
          ],
        },
        { name: 'titre', description: 'Le nom de l\'événement (ex : Tournoi CODM)', type: ApplicationCommandOptionType.String, required: false },
        { name: 'description', description: 'La description (règles, prix, lien…)', type: ApplicationCommandOptionType.String, required: false },
        { name: 'quand', description: 'Date/heure : JJ/MM HH:MM (ex : 25/08 20:00) — heure du serveur', type: ApplicationCommandOptionType.String, required: false },
        { name: 'salon', description: 'Salon où annoncer l\'événement (défaut : salon actuel)', type: ApplicationCommandOptionType.Channel, required: false },
        { name: 'role', description: 'Rôle à mentionner dans les rappels (nom du rôle)', type: ApplicationCommandOptionType.String, required: false },
      ],
    },
  ];
}

// ------------------------------------------------------------
// ⏱️ Conversion « JJ/MM HH:MM » (ou « JJ/MM/AAAA HH:MM ») → instant
// dans le fuseau du serveur. Retourne null si invalide.
// ------------------------------------------------------------
function parseWhen(str, tz) {
  const s = String(str || '').trim();
  const m = s.match(/^(\d{1,2})[\/.](\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2})[:h](\d{2})$/i);
  if (!m) return null;
  let day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10), minute = parseInt(m[5], 10);
  if (day < 1 || day > 31 || month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const now = tzUtil.nowParts(tz);
  if (!year || year < 100) {
    year = now.year;
    // Si la date est déjà passée cette année, on passe à l'année suivante.
    const probe = tzUtil.zonedInstant(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, hour, minute, tz);
    if (probe < Date.now()) year = now.year + 1;
  }
  const ymd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const ts = tzUtil.zonedInstant(ymd, hour, minute, tz);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

function formatWhen(ts, tz) {
  const p = tzUtil.parts(new Date(ts), tz);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year} à ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} (heure du serveur)`;
}

function resolveRoleName(guild, configured) {
  const raw = String(configured || '').trim().replace(/^@/, '');
  if (!raw || !guild || !guild.roles || !guild.roles.cache) return null;
  return guild.roles.cache.find((r) => r.name.toLowerCase() === raw.toLowerCase()) || null;
}

function roleMention(guild, configured) {
  const raw = String(configured || '').trim().toLowerCase();
  if (!raw || raw === 'none') return '';
  if (raw === '@everyone' || raw === 'everyone') return '@everyone';
  if (raw === '@here' || raw === 'here') return '@here';
  const role = resolveRoleName(guild, configured);
  return role ? `<@&${role.id}>` : '';
}

// ------------------------------------------------------------
// 📣 Panneau d'un événement (annonce + rappels)
// ------------------------------------------------------------
function eventPanel(entry, guildId, ev) {
  const guild = entry.client.guilds.cache.get(guildId);
  const tz = (store.guildSettings.get(ev.bot_id, guildId) || {}).timezone || tzUtil.DEFAULT_TZ;
  const participants = store.guildEvents.participants(ev.id);
  const names = participants.slice(0, 25).map((uid) => {
    const m = guild && guild.members && guild.members.cache.get(uid);
    return m ? m.displayName || m.user.username : `<@${uid}>`;
  });
  const fields = [
    { name: '🕒 Quand', value: formatWhen(ev.starts_at, tz), inline: true },
    { name: '👥 Participants', value: `${participants.length} inscrit(s)`, inline: true },
  ];
  if (ev.description) fields.push({ name: '📝 Détails', value: String(ev.description).slice(0, 1024), inline: false });
  if (names.length) fields.push({ name: '📋 Liste', value: names.join(', ').slice(0, 1024), inline: false });
  return ui.panel({
    variant: 'brand',
    title: `🎮 ${ev.title}`,
    description: participants.length ? undefined : 'Personne n\'est inscrit pour le moment — sois le premier !',
    fields,
    footer: `Hoxera · Événements · ID ${ev.id}`,
  });
}

function eventButtons(ev) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hxev:join:${ev.id}`).setLabel('🎮 Participer').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hxev:leave:${ev.id}`).setLabel('❌ Se désister').setStyle(ButtonStyle.Danger),
  );
  return [row];
}

// ------------------------------------------------------------
// 🤖 Gestion des interactions (slash + boutons)
// ------------------------------------------------------------
async function handleInteraction(botId, entry, interaction) {
  // Boutons Participer / Se désister
  if (interaction.isButton && interaction.isButton() && String(interaction.customId || '').startsWith('hxev:')) {
    const parts = String(interaction.customId).split(':');
    const evId = parseInt(parts[2], 10);
    const ev = store.guildEvents.get(evId);
    if (!ev || String(ev.guild_id) !== interaction.guild.id) {
      return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true }).catch(() => {});
    }
    const { joined, participants } = store.guildEvents.toggleParticipant(evId, interaction.user.id);
    store.guildEvents.update(evId, { participants: JSON.stringify(participants) });
    const payload = { embeds: eventPanel(entry, ev.guild_id, { ...ev, participants }).embeds, components: eventButtons(ev) };
    await interaction.update(payload).catch(async () => {
      await interaction.reply({ content: joined ? '🎮 Tu es inscrit !' : '❌ Tu t\'es désinscrit.', ephemeral: true }).catch(() => {});
    });
    return true;
  }

  if (!interaction.isChatInputCommand || !interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== 'event') return false;
  if (!interaction.guild) {
    return interaction.reply({ content: '🌍 Cette commande fonctionne sur un **serveur Discord**.', ephemeral: true }).catch(() => {});
  }
  const guild = interaction.guild;
  const action = interaction.options.getString('action') || 'list';
  const tz = (store.guildSettings.get(botId, guild.id) || {}).timezone || tzUtil.DEFAULT_TZ;

  if (action === 'create') {
    const titre = (interaction.options.getString('titre') || '').trim().slice(0, 100);
    if (!titre) return interaction.reply({ content: '❓ Utilisation : `/event create titre=Mon tournoi quand=25/08 20:00` (+ description, salon, role en option).', ephemeral: true }).catch(() => {});
    const description = (interaction.options.getString('description') || '').trim().slice(0, 1000);
    const quand = interaction.options.getString('quand') || '';
    const startsAt = parseWhen(quand, tz);
    if (!startsAt) return interaction.reply({ content: '❓ Date invalide. Format : `JJ/MM HH:MM` (ex : `25/08 20:00`), heure du serveur.', ephemeral: true }).catch(() => {});
    if (startsAt < Date.now()) return interaction.reply({ content: '⏰ La date est déjà passée — choisis une date future.', ephemeral: true }).catch(() => {});
    const salonOpt = interaction.options.getChannel('salon');
    const channelId = salonOpt ? salonOpt.id : interaction.channel.id;
    const role = (interaction.options.getString('role') || 'none').trim();
    const id = store.guildEvents.add(botId, guild.id, { title: titre, description, starts_at: startsAt, channel_id: channelId, ping_role: role, created_by: interaction.user.id });
    const ev = store.guildEvents.get(id);
    const channel = guild.channels.cache.get(channelId);
    if (channel && typeof channel.send === 'function') {
      await channel.send({ embeds: eventPanel(entry, guild.id, ev).embeds, components: eventButtons(ev) }).catch(() => {});
    }
    return interaction.reply({ content: `✅ Événement **${titre}** créé (ID ${id}) — **${formatWhen(startsAt, tz)}**. Les rappels automatiques partiront 24 h et 1 h avant.`, ephemeral: true }).catch(() => {});
  }

  if (action === 'list') {
    const upcoming = store.guildEvents.upcoming(botId, guild.id, 20);
    if (!upcoming.length) return interaction.reply({ content: '📭 Aucun événement à venir. Crée-en un avec `/event create` !', ephemeral: true }).catch(() => {});
    const lines = upcoming.map((ev) => {
      const n = store.guildEvents.participants(ev.id).length;
      return `**#${ev.id}** · ${ev.title} — 🕒 ${formatWhen(ev.starts_at, tz)} · 👥 ${n} inscrit(s)`;
    }).join('\n');
    return interaction.reply({
      ...ui.panel({ variant: 'brand', title: '🎮 Événements à venir', description: lines, footer: `Hoxera · ${guild.name} · Événements` }),
      ephemeral: true,
    }).catch(() => {});
  }

  if (action === 'delete') {
    const all = store.guildEvents.all(botId, guild.id);
    if (!all.length) return interaction.reply({ content: '📭 Aucun événement à supprimer.', ephemeral: true }).catch(() => {});
    const lines = all.map((ev) => `**#${ev.id}** · ${ev.title} — ${formatWhen(ev.starts_at, tz)}`).join('\n');
    const prompt = ui.panel({
      variant: 'danger',
      title: '🗑️ Supprimer un événement',
      description: `Voici les événements du serveur — pour en supprimer un, note son **ID**.\n\n${lines}\n\n*(La suppression se fait depuis le dashboard → Événements, ou par un admin via l\'interface.)*`,
      footer: `Hoxera · ${guild.name} · Événements`,
    });
    return interaction.reply({ ...prompt, ephemeral: true }).catch(() => {});
  }

  return false;
}

// ------------------------------------------------------------
// ⏰ Balayage : rappels 24 h / 1 h avant + nettoyage du passé
// ------------------------------------------------------------
async function sweepGuildEvents(botId, entry) {
  if (!entry || !entry.client || !entry.client.isReady()) return;
  const now = Date.now();
  const upcoming = store.guildEvents.allUpcoming().filter((e) => e.bot_id === botId);
  for (const ev of upcoming) {
    const guild = entry.client.guilds.cache.get(ev.guild_id);
    if (!guild) continue;
    const channel = guild.channels.cache.get(ev.channel_id || '');
    if (!channel || typeof channel.send !== 'function') continue;
    const delta = ev.starts_at - now;
    const mention = roleMention(guild, ev.ping_role);
    // Rappel 24 h
    if (!ev.reminded_24h && delta > 0 && delta <= 24 * 3600000) {
      store.guildEvents.update(ev.id, { reminded_24h: 1 });
      const n = store.guildEvents.participants(ev.id).length;
      const content = `${mention || '📣'} **${ev.title}** commence dans **24 h**${mention ? '' : ' !'} ${n ? `— ${n} inscrit(s).` : ''}`.trim();
      await channel.send({ content, embeds: eventPanel(entry, ev.guild_id, ev).embeds, components: eventButtons(ev) }).catch(() => {});
    }
    // Rappel 1 h
    if (!ev.reminded_1h && delta > 0 && delta <= 3600000) {
      store.guildEvents.update(ev.id, { reminded_1h: 1 });
      const n = store.guildEvents.participants(ev.id).length;
      const content = `${mention || '🚨'} **${ev.title}** commence dans **1 heure**${mention ? '' : ' !'} ${n ? `— ${n} inscrit(s).` : ''}`.trim();
      await channel.send({ content, embeds: eventPanel(entry, ev.guild_id, ev).embeds, components: eventButtons(ev) }).catch(() => {});
    }
    // Démarrage
    if (delta <= 0) {
      const content = `${mention || '🎉'} C\'est parti pour **${ev.title}** ! Bonne chance à tous 🍀`;
      await channel.send({ content }).catch(() => {});
      store.guildEvents.remove(ev.id);
    }
  }
  // Nettoyage des événements passés restants (filet de sécurité)
  try {
    const past = store.db.prepare('SELECT id FROM guild_events WHERE bot_id = ? AND starts_at < ?').all(botId, Date.now() - 24 * 3600000);
    for (const p of past) store.guildEvents.remove(p.id);
  } catch (e) { console.error('[Hoxera] guild events cleanup:', e.message); }
}

module.exports = { buildEventPayloads, handleInteraction, sweepGuildEvents, parseWhen, formatWhen, eventPanel, eventButtons, HELP_EVENTS };
