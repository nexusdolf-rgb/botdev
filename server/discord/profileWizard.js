// ============================================================
// BotDev - Assistant interactif de personnalisation du bot
// /botprofile setup → pas à pas avec boutons (comme /ticket setup) :
//   📛 Nom → 📝 Bio → 🎨 Couleur (sélecteur) → 🖼️ Avatar (galerie/URL) → 🎴 Bannière
// → ✅ Enregistrer : l'identité s'applique sur CE serveur uniquement.
// ============================================================
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const store = require('../db');
const assets = require('../assets');
const identity = require('./identity');

const WIZARD_TTL = 10 * 60000;
const wizards = new Map();
const wKey = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;

const STEPS = [
  { key: 'name', emoji: '📛', label: 'Nom du bot', q: 'Comment veux-tu que le bot s\'appelle sur **ce serveur** ?' },
  { key: 'bio', emoji: '📝', label: 'Bio du bot', q: 'Écris la **bio** affichée sur le profil du bot.' },
  { key: 'color', emoji: '🎨', label: 'Couleur', q: 'Choisis la **couleur** du profil dans le sélecteur.' },
  { key: 'avatar', emoji: '🖼️', label: 'Avatar', q: '**Ouvre ta galerie** :\n📱 **Option 1** : tape `/botprofile avatar` — l\'option « image » **ouvre ta galerie automatiquement**.\n📎 **Option 2** : touche le bouton ➕ de la barre de message et envoie la photo ici (récupérée automatiquement, 60 s).' },
  { key: 'banner', emoji: '🎴', label: 'Bannière', q: '**Ouvre ta galerie** :\n📱 **Option 1** : tape `/botprofile banner` — l\'option « image » **ouvre ta galerie automatiquement**.\n📎 **Option 2** : touche le bouton ➕ et envoie la photo ici (récupérée automatiquement, 60 s).' },
];

const COLORS = [
  { label: 'Bleu (défaut)', emoji: '🔵', hex: '#5865F2' },
  { label: 'Violet', emoji: '🟣', hex: '#8B5CF6' },
  { label: 'Rouge', emoji: '🔴', hex: '#ED4245' },
  { label: 'Vert', emoji: '🟢', hex: '#57F287' },
  { label: 'Jaune', emoji: '🟡', hex: '#FEE75C' },
  { label: 'Orange', emoji: '🟠', hex: '#F47B67' },
  { label: 'Rose', emoji: '🌸', hex: '#EB459E' },
  { label: 'Cyan', emoji: '🌊', hex: '#00B0F4' },
  { label: 'Gris', emoji: '⚪', hex: '#95A5A6' },
  { label: 'Noir', emoji: '⚫', hex: '#2C2F33' },
  { label: 'Personnalisée (hex)', emoji: '🎨', hex: '__custom__' },
];

function extFromUrl(url) {
  try {
    const p = String(url).split('?')[0].toLowerCase();
    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
    if (p.endsWith('.gif')) return 'image/gif';
    if (p.endsWith('.webp')) return 'image/webp';
  } catch {}
  return 'image/png';
}

function embedFor(state) {
  const step = STEPS[state.step];
  const v = state.values;
  const recap = STEPS.map((s, i) => {
    let shown = '*non défini*';
    if (s.key === 'name' && v.name) shown = v.name;
    else if (s.key === 'bio' && v.bio) shown = 'définie';
    else if (s.key === 'color' && v.color) shown = v.color;
    else if (s.key === 'avatar' && v.avatar) shown = '✅ image';
    else if (s.key === 'banner' && v.banner) shown = '✅ image';
    return `${i < state.step ? '✅' : i === state.step ? '➡️' : '⏳'} **${s.emoji} ${s.label}** : ${shown}`;
  });
  const embed = new EmbedBuilder()
    .setColor(v.color && /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : '#5865F2')
    .setTitle(`🤖 Personnalisation du bot — Étape ${state.step + 1}/${STEPS.length}`)
    .setDescription(`**${step.emoji} ${step.label}**\n${step.q}`);
  embed.addFields({ name: '📋 Récapitulatif', value: recap.join('\n') });
  embed.setFooter({ text: 'L\'identité s\'applique sur CE serveur uniquement (le bot global n\'est pas modifié).' });
  return embed;
}

function navRow(state) {
  const uid = state.userId;
  const isFirst = state.step === 0;
  const isLast = state.step >= STEPS.length - 1;
  const row = new ActionRowBuilder();
  if (!isFirst) {
    row.addComponents(new ButtonBuilder().setCustomId(`bpw:${state.botId}:${uid}:back`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary));
  }
  row.addComponents(new ButtonBuilder().setCustomId(`bpw:${state.botId}:${uid}:next`)
    .setLabel(isLast ? '✅ Enregistrer' : 'Suivant ➡️').setStyle(ButtonStyle.Success));
  row.addComponents(new ButtonBuilder().setCustomId(`bpw:${state.botId}:${uid}:cancel`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger));
  return row;
}

function componentsFor(state) {
  const uid = state.userId;
  const rows = [];
  const step = STEPS[state.step];
  if (step.key === 'color') {
    const sel = new StringSelectMenuBuilder()
      .setCustomId(`bpw-sel:${state.botId}:${uid}`)
      .setPlaceholder('🎨 Choisis une couleur…')
      .setMinValues(1).setMaxValues(1);
    for (const c of COLORS) {
      const opt = new StringSelectMenuOptionBuilder().setLabel(c.label.slice(0, 100)).setValue(c.hex);
      if (c.emoji) opt.setEmoji(c.emoji);
      sel.addOptions(opt);
    }
    rows.push(new ActionRowBuilder().addComponents(sel));
  }
  if (step.key === 'avatar' || step.key === 'banner') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bpw:${state.botId}:${uid}:import`).setLabel('📷 Importer la photo').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bpw:${state.botId}:${uid}:skip`).setLabel('⏭ Passer (sans image)').setStyle(ButtonStyle.Secondary),
    ));
  }
  rows.push(navRow(state));
  return rows;
}

function renderPayload(state) {
  return { embeds: [embedFor(state)], components: componentsFor(state) };
}

function textModal(botId, uid, title, label, placeholder, paragraph, required, value) {
  const modal = new ModalBuilder().setCustomId(`bpw-modal:${botId}:${uid}`).setTitle(String(title).slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(String(label).slice(0, 45))
    .setPlaceholder(String(placeholder).slice(0, 100))
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(!!required)
    .setMaxLength(paragraph ? 1900 : 100);
  if (value) input.setValue(String(value).slice(0, paragraph ? 1900 : 100));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function stopCollector(state) {
  if (state.collector) {
    try { state.collector.stop(); } catch {}
    state.collector = null;
  }
}

function startCollector(state) {
  stopCollector(state);
  const channel = state.channel;
  if (!channel || typeof channel.createMessageCollector !== 'function') return;
  const uid = state.userId;
  const filter = (m) => m.author && m.author.id === uid && m.attachments && m.attachments.size > 0;
  state.collector = channel.createMessageCollector({ filter, max: 1, time: 60000 });
  state.collector.on('collect', async (m) => {
    const att = m.attachments.first();
    if (!att) return;
    try {
      await collectAttachment(state, att.url, att.contentType || extFromUrl(att.url), att.size || 0);
    } catch (e) {
      try { await m.reply({ content: `⚠️ ${e.message.slice(0, 120)}` }); } catch {}
    }
  });
  state.collector.on('end', () => { state.collector = null; });
}

// Récupère l'image (galerie/URL), l'enregistre et avance
async function collectAttachment(state, url, contentType, size) {
  const step = STEPS[state.step];
  if (step.key !== 'avatar' && step.key !== 'banner') return;
  if (size && size > 3 * 1024 * 1024) throw new Error('Image trop lourde (3 Mo max)');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossible de télécharger l'image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw new Error('Image trop lourde (3 Mo max)');
  const key = await assets.put(buf, contentType || extFromUrl(url));
  state.values[step.key] = `/assets/${key}`;
  stopCollector(state);
  await advance(state);
}

async function advance(state) {
  state.startedAt = Date.now();
  state.step += 1;
  if (state.step >= STEPS.length) return finalize(state);
  await safeEdit(state, renderPayload(state));
  const step = STEPS[state.step];
  if (step.key === 'avatar' || step.key === 'banner') startCollector(state);
  return null;
}

// Met à jour le message de l'assistant ; si l'édition échoue (message supprimé…),
// on renvoie un nouveau message pour ne jamais laisser l'utilisateur bloqué.
async function safeEdit(state, payload) {
  try { await state.msg.edit(payload); return; } catch {}
  try {
    if (state.channel && typeof state.channel.send === 'function') {
      const sent = await state.channel.send(payload);
      state.msg = sent;
    }
  } catch {}
}

async function finalize(state) {
  stopCollector(state);
  const existing = store.botProfiles.get(state.botId, state.guildId) || {};
  const botRecord = store.bots.get(state.botId);
  store.botProfiles.set(state.botId, state.guildId, {
    name: state.values.name || existing.name || (botRecord ? botRecord.name : ''),
    bio: state.values.bio || existing.bio || '',
    color: state.values.color || existing.color || '#5865F2',
    avatar_url: state.values.avatar || existing.avatar_url,
    banner_url: state.values.banner || existing.banner_url,
  });
  const embed = identity.buildProfileEmbed(state.botId, state.guildId, botRecord || { name: state.values.name });
  embed.setTitle('✅ Identité mise à jour !')
    .setDescription('Le bot utilise maintenant cette identité sur **ce serveur uniquement** (messages, bienvenue, niveaux, tickets…).\nLe bot global n\'a pas été modifié.');
  const payload = { embeds: [embed], components: [] };
  await safeEdit(state, payload);
  wizards.delete(wKey(state.botId, state.guildId, state.userId));
  return payload;
}

// Démarrage : modale du nom (première réponse de l'interaction)
async function startProfileWizard(botId, interaction) {
  if (interaction.guild.ownerId !== interaction.user.id) {
    return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** peut personnaliser le bot.', ephemeral: true });
  }
  const existing = store.botProfiles.get(botId, interaction.guild.id) || {};
  const botRecord = store.bots.get(botId);
  const state = {
    botId, guildId: interaction.guild.id, userId: interaction.user.id,
    step: 0, modal: 'name', startedAt: Date.now(),
    channel: interaction.channel || null, msg: null, collector: null,
    values: {
      name: existing.name || (botRecord ? botRecord.name : ''),
      bio: existing.bio || '',
      color: existing.color || '#5865F2',
      avatar: existing.avatar_url || '',
      banner: existing.banner_url || '',
    },
  };
  wizards.set(wKey(botId, interaction.guild.id, interaction.user.id), state);
  return interaction.showModal(textModal(botId, interaction.user.id, '📛 Nom du bot', 'Nom sur ce serveur', 'Hoxera du CHEAT', false, true, state.values.name));
}

async function handleProfileWizardInteraction(botId, interaction) {
  const parts = String(interaction.customId || '').split(':');
  const uid = parts[2];
  if (!uid || uid !== interaction.user.id) return;
  const state = wizards.get(wKey(botId, interaction.guild.id, uid));
  if (!state) return interaction.reply({ content: '⏰ Assistant expiré. Relance `/botprofile setup`.', ephemeral: true });
  if (interaction.guild.ownerId !== interaction.user.id) {
    return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** peut personnaliser le bot.', ephemeral: true });
  }
  if (Date.now() - state.startedAt > WIZARD_TTL) {
    wizards.delete(wKey(botId, interaction.guild.id, uid));
    return interaction.update({ content: '⏰ Assistant expiré. Relance `/botprofile setup`.', embeds: [], components: [] });
  }
  state.channel = interaction.channel || state.channel;

  // ---- Sélecteur de couleur ----
  if (interaction.isStringSelectMenu()) {
    const v = interaction.values[0];
    if (v === '__custom__') {
      state.modal = 'hex';
      return interaction.showModal(textModal(botId, uid, '🎨 Couleur personnalisée', 'Code hexadécimal', '#5865F2', false, true, ''));
    }
    state.values.color = v;
    return interaction.update(renderPayload(state));
  }

  // ---- Modales ----
  if (interaction.isModalSubmit()) {
    const val = (interaction.fields.getTextInputValue('value') || '').trim();
    const mode = state.modal;
    state.modal = null;

    const showState = async (okMsg) => {
      if (state.msg) {
        await safeEdit(state, renderPayload(state));
        return interaction.reply({ content: okMsg, ephemeral: true });
      }
      // Première création du message (après la modale du nom)
      const msg = await interaction.reply({ ...renderPayload(state), fetchReply: true });
      state.msg = msg;
      return msg;
    };

    if (mode === 'name') {
      if (val) state.values.name = val.slice(0, 80);
      await showState('✅ Nom enregistré ! Clique sur « Suivant ➡️ » pour la bio.');
      return;
    }
    if (mode === 'bio') {
      if (val) state.values.bio = val.slice(0, 1900);
      await showState('✅ Bio enregistrée ! Clique sur « Suivant ➡️ » pour la couleur.');
      return;
    }
    if (mode === 'hex') {
      if (!/^#[0-9a-fA-F]{6}$/.test(val)) return interaction.reply({ content: '❌ Format attendu : #5865F2', ephemeral: true });
      state.values.color = val;
      await showState(`✅ Couleur ${val} enregistrée !`);
      return;
    }
    return interaction.reply({ content: '✅ Enregistré !', ephemeral: true });
  }

  // ---- Boutons ----
  if (interaction.isButton()) {
    const action = parts[3];
    if (action === 'cancel') {
      stopCollector(state);
      wizards.delete(wKey(botId, interaction.guild.id, uid));
      return interaction.update({ content: '❌ Personnalisation annulée.', embeds: [], components: [] });
    }
    if (action === 'back') {
      stopCollector(state);
      state.step = Math.max(0, state.step - 1);
      return interaction.update(renderPayload(state));
    }
    if (action === 'import') {
      const step = STEPS[state.step];
      const cmdName = step.key === 'banner' ? 'banner' : 'avatar';
      return interaction.reply({
        content: `📱 **Pour ouvrir ta galerie :**\n\n1️⃣ Tape \`/botprofile ${cmdName}\` puis touche l\'option « image » → **ta galerie s\'ouvre automatiquement** (la photo s\'appliquera directement à cette étape).\n\n2️⃣ Ou touche le **bouton ➕** de la barre de message, choisis ta photo et envoie-la ici — je la récupère automatiquement.`,
        ephemeral: true,
      });
    }
    if (action === 'skip') {
      const fin = await advance(state);
      if (fin) return interaction.update(fin);
      return interaction.update(renderPayload(state));
    }
    // À l'étape avatar/bannière, « Suivant » équivaut à passer sans image
    if (['avatar', 'banner'].includes(STEPS[state.step] && STEPS[state.step].key) && action === 'next') {
      const fin = await advance(state);
      if (fin) return interaction.update(fin);
      return interaction.update(renderPayload(state));
    }
    if (action === 'next') {
      const step = STEPS[state.step];
      if (step.key === 'name') {
        // nom déjà saisi → on passe à la bio (modale directe)
        state.step = 1;
        state.modal = 'bio';
        return interaction.showModal(textModal(botId, uid, '📝 Bio du bot', 'Bio affichée sur le profil', 'Le bot officiel du serveur !', true, true, state.values.bio));
      }
      const fin = await advance(state);
      if (fin) return interaction.update(fin);
      return interaction.update(renderPayload(state));
    }
    return null;
  }
  return null;
}

// Applique une photo (venant de /botprofile avatar|banner) à l'assistant en cours.
// Si l'assistant est à l'étape correspondante, on avance automatiquement.
async function applyAttachmentToWizard(botId, guildId, userId, kind, url, contentType, size) {
  const state = wizards.get(wKey(botId, guildId, userId));
  if (!state) return false;
  if (size && size > 3 * 1024 * 1024) throw new Error('Image trop lourde (3 Mo max)');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossible de télécharger l'image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw new Error('Image trop lourde (3 Mo max)');
  const key = await assets.put(buf, contentType || extFromUrl(url));
  state.values[kind] = `/assets/${key}`;
  const step = STEPS[state.step];
  if (step && step.key === kind) {
    stopCollector(state);
    await advance(state);
  } else {
    await safeEdit(state, renderPayload(state));
  }
  return true;
}

module.exports = { startProfileWizard, handleProfileWizardInteraction, collectAttachment, applyAttachmentToWizard };
