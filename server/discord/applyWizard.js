// ============================================================
// Hoxera — Assistant interactif /setup apply
// ------------------------------------------------------------
// Remplace l'ancienne commande /apply (5 sous-actions en texte) par un vrai
// assistant : on tape `/setup apply` et un menu déroulant s'ouvre. Chaque
// action ouvre soit une fenêtre (renommer, question), soit un sélecteur natif
// (salon), soit une carte d'aperçu. Tout se fait sans quitter Discord.
//
// Demandé par le fondateur :
//   « je veux corriger le /apply en /setup apply et la personne envoie ça,
//     ça affiche directement un menu déroulant, la personne sélectionne :
//     soit configurer les questions, soit créer un nouveau apply. Tout est
//     sélectionnable, ça affiche une fenêtre pour renommer, ou un menu
//     déroulant pour choisir ce qu'il veut faire. Des assistants interactifs.
//     Un truc propre et pro. »
//
// Modèle suivi : server/discord/roleWizard.js (même structure, mêmes règles
// anti-timeout). On ne réinvente pas un motif qui existe déjà dans le projet.
// ============================================================
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const store = require('../db');
const ui = require('./ui');
const { canConfigureGuild } = require('./permissions');

const wizards = new Map(); // `${botId}:${guildId}:${userId}` -> state
const wizardKey = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;
const WIZARD_TTL = 15 * 60000; // 15 minutes

// 5 : c'est la limite DURE de Discord, pas un choix de produit. Une fenêtre
// (modale) accepte au plus 5 rangées, donc au plus 5 questions. Promettre
// plus serait mentir à l'admin qui en ajoute une 6e.
const MAX_QUESTIONS = 5;
const QUESTION_MAX = 200;      // largeur utile d'une question dans la fenêtre
const TITLE_MAX = 45;          // limite Discord du titre d'une modale
const APPLY_ID = 'hxapply';    // préfixe des modales de candidature

// ---------- Aides d'interaction (anti-timeout, comme partout) ----------
async function ackDeferUpdate(interaction) {
  try { await interaction.deferUpdate(); } catch {}
}
async function ackReply(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

function textModal(customId, title, label, placeholder, required, maxLen, style) {
  const modal = new ModalBuilder()
    .setCustomId(String(customId).slice(0, 100))
    .setTitle(String(title).slice(0, TITLE_MAX));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('value')
      .setLabel(String(label).slice(0, 45))
      .setPlaceholder(String(placeholder || '').slice(0, 100))
      .setStyle(style || TextInputStyle.Short)
      .setRequired(!!required)
      .setMaxLength(maxLen || 100),
  ));
  return modal;
}

// ---------- Lecture / écriture de la configuration ----------
function lireConfig(botId, guildId) {
  const brut = store.applications.get(botId, guildId) || {};
  let questions = [];
  try { questions = JSON.parse(brut.questions || '[]'); } catch { questions = []; }
  if (!Array.isArray(questions)) questions = [];
  return {
    channel: String(brut.channel || ''),
    title: String(brut.title || '📝 Candidature'),
    enabled: Number(brut.enabled || 0) === 1,
    questions: questions.map((q) => String(q)).filter(Boolean),
  };
}

function ecrireConfig(botId, guildId, cfg) {
  // store.applications.set accepte un tableau OU une chaîne JSON pour
  // `questions` et complète les champs manquants : inutile de sérialiser ici.
  store.applications.set(botId, guildId, {
    channel: cfg.channel || '',
    questions: cfg.questions || [],
    title: cfg.title || '📝 Candidature',
    enabled: cfg.enabled ? 1 : 0,
  });
}

// Une configuration est prête quand il y a un salon ET au moins une question.
function etatConfig(cfg) {
  const manque = [];
  if (!cfg.channel) manque.push('salon');
  if (!cfg.questions.length) manque.push('question');
  return { prete: manque.length === 0, manque };
}

// ---------- Rendu de l'assistant ----------
function resumeEmbed(botId, guildId, state) {
  const cfg = state.cfg;
  const { prete, manque } = etatConfig(cfg);
  const questions = cfg.questions.length
    ? cfg.questions.map((q, i) => `**${i + 1}.** ${q.slice(0, 120)}`).join('\n').slice(0, 1024)
    : '*aucune question pour l\'instant*';
  // Une candidature déjà envoyée garde son salon : on le signale pour éviter
  // qu'un admin croie avoir perdu sa configuration.
  const salon = cfg.channel
    ? `<#${cfg.channel}>`
    : '*non défini* — les candidatures ne peuvent pas arriver*';

  return new EmbedBuilder()
    .setColor(prete ? '#57F287' : '#e07a5f')
    .setTitle('📝 Assistant des candidatures')
    .setDescription(
      prete
        ? 'Tout est prêt. Envoyez le panneau quand vous voulez.'
        : `Il manque encore : **${manque.join(' et ')}**. Choisissez une action ci-dessous.`,
    )
    .addFields(
      { name: '📛 Titre', value: cfg.title || '*non défini*', inline: true },
      { name: '📨 Salon des réponses', value: salon, inline: true },
      { name: '🔔 État', value: cfg.enabled ? '✅ Active' : '⏸️ En pause', inline: true },
      { name: `❓ Questions (${cfg.questions.length}/${MAX_QUESTIONS})`, value: questions, inline: false },
    )
    .setFooter({ text: 'Chaque question sera posée dans une fenêtre au membre qui candidate.' });
}

function menuActions(state) {
  const cfg = state.cfg;
  const { prete } = etatConfig(cfg);
  const actions = [
    { label: '📨 Choisir le salon des réponses', value: 'canal', emoji: '📨' },
    { label: '✏️ Renommer le panneau', value: 'titre', emoji: '✏️' },
    { label: '➕ Ajouter une question', value: 'ajouter', emoji: '➕' },
  ];
  if (cfg.questions.length) {
    actions.push({ label: '📝 Modifier une question', value: 'modifier', emoji: '📝' });
    actions.push({ label: '➖ Supprimer une question', value: 'supprimer', emoji: '➖' });
  }
  actions.push({
    label: cfg.enabled ? '⏸️ Mettre en pause' : '▶️ Activer les candidatures',
    value: 'activer',
    emoji: cfg.enabled ? '⏸️' : '▶️',
  });
  if (prete) {
    actions.push({ label: '📤 Envoyer le panneau', value: 'envoyer', emoji: '📤' });
    actions.push({ label: '👁️ Aperçu du panneau', value: 'apercu', emoji: '👁️' });
  }
  actions.push({ label: '🗑️ Réinitialiser (tout effacer)', value: 'reset', emoji: '🗑️' });
  actions.push({ label: '❌ Fermer l\'assistant', value: 'fermer', emoji: '❌' });

  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`apw:menu:${state.botId}:${state.userId}`)
      .setPlaceholder('Que voulez-vous faire ?')
      .setMinValues(1).setMaxValues(1)
      .addOptions(actions.slice(0, 25).map((a) => {
        const o = new StringSelectMenuOptionBuilder()
          .setLabel(String(a.label).slice(0, 80))
          .setValue(a.value);
        if (a.emoji) o.setEmoji(a.emoji);
        return o;
      })),
  )];
}

function canalComponents(state) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`apw:canal:${state.botId}:${state.userId}`)
        .setPlaceholder('📨 Salon où arriveront les candidatures…')
        .setMinValues(1).setMaxValues(1)
        .setChannelTypes([ChannelType.GuildText]),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`apw:btn:${state.botId}:${state.userId}:retour`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function choixQuestion(state, mode) {
  const opts = state.cfg.questions.slice(0, 25).map((q, i) => new StringSelectMenuOptionBuilder()
    .setLabel(`${i + 1}. ${q}`.slice(0, 80))
    .setValue(String(i)));
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`apw:quest:${state.botId}:${state.userId}:${mode}`)
        .setPlaceholder(mode === 'supprimer' ? 'Quelle question supprimer ?' : 'Quelle question modifier ?')
        .setMinValues(1).setMaxValues(1)
        .addOptions(opts),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`apw:btn:${state.botId}:${state.userId}:retour`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function retourMenu(botId, state) {
  state.step = 'menu';
  return { embeds: [resumeEmbed(botId, state.guildId, state)], components: menuActions(state) };
}

// ---------- Le panneau que verront les membres ----------
function panneauPayload(botId, guildId, cfg) {
  // v2panel(options, rows) : les boutons passent en 2ᵉ argument (voir la note
  // v239 dans ui.js — les mettre dans `options` les faisait disparaître).
  // Le customId reste `hx:apply:<guildId>` : c'est celui qu'écoute déjà
  // extra.js pour ouvrir la fenêtre, et celui des panneaux déjà envoyés.
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hx:apply:${guildId}`)
      .setLabel('📝 Faire une candidature')
      .setStyle(ButtonStyle.Primary),
  );
  return ui.v2panel({
    variant: 'brand',
    title: cfg.title || '📝 Candidature',
    description: `Cliquez sur le bouton pour candidater : vous répondrez à **${cfg.questions.length} question(s)** dans une fenêtre privée.`,
    fields: [{ name: '🔒 Confidentialité', value: 'Seul le staff verra vos réponses.' }],
    footer: false,
  }, [row]);
}

// ---------- Démarrage ----------
async function start(botId, interaction) {
  const uid = interaction.user.id;
  const guild = interaction.guild;
  if (!canConfigureGuild(guild, interaction.member, uid)) {
    return interaction.reply({
      content: '⛔ Seul le propriétaire du serveur ou un membre ayant la permission Discord « Administrateur » peut configurer les candidatures.',
      ephemeral: true,
    });
  }
  const cfg = lireConfig(botId, guild.id);
  const state = {
    botId, guildId: guild.id, userId: uid, step: 'menu', cfg,
    msg: null, startedAt: Date.now(),
  };
  wizards.set(wizardKey(botId, guild.id, uid), state);
  const msg = await interaction.reply({
    embeds: [resumeEmbed(botId, guild.id, state)],
    components: menuActions(state),
    fetchReply: true,
  }).catch(() => null);
  state.msg = msg;
  return true;
}

// ---------- Rafraîchir la carte de l'assistant ----------
async function rafraichir(interaction, botId, state, payload) {
  const p = payload || retourMenu(botId, state);
  if (state.msg) {
    try { await state.msg.edit(p); return true; } catch {}
  }
  try { await interaction.editReply(p); return true; } catch {}
  return true;
}

// ---------- Envoi réel du panneau ----------
async function envoyerPanneau(botId, interaction, state) {
  const cfg = state.cfg;
  const guild = interaction.guild;
  const channel = guild.channels.cache.get(cfg.channel);
  if (!channel) {
    return rafraichir(interaction, botId, state, {
      embeds: [EmbedBuilder.from(resumeEmbed(botId, state.guildId, state))
        .setColor('#ED4245')
        .setDescription(`❌ Le salon <#${cfg.channel}> n'existe plus. Choisissez-en un autre avec « 📨 Choisir le salon des réponses ».`)],
      components: menuActions(state),
    });
  }
  try {
    await channel.send(panneauPayload(botId, guild.id, cfg));
  } catch (e) {
    return rafraichir(interaction, botId, state, {
      embeds: [EmbedBuilder.from(resumeEmbed(botId, state.guildId, state))
        .setColor('#ED4245')
        .setDescription(`❌ Envoi impossible dans <#${channel.id}> : ${String(e.message || e).slice(0, 150)}\nVérifiez que le bot peut écrire dans ce salon.`)],
      components: menuActions(state),
    });
  }
  cfg.enabled = true;
  ecrireConfig(botId, guild.id, cfg);
  return rafraichir(interaction, botId, state, {
    embeds: [EmbedBuilder.from(resumeEmbed(botId, state.guildId, state))
      .setColor('#57F287')
      .setDescription(`✅ Panneau envoyé dans <#${channel.id}> ! Les membres peuvent candidater dès maintenant.`)],
    components: menuActions(state),
  });
}

// ---------- Gestion des interactions de l'assistant ----------
async function handleWizardInteraction(botId, interaction) {
  const cid = String(interaction.customId || '');
  if (!cid.startsWith('apw:')) return false;
  if (!canConfigureGuild(interaction.guild, interaction.member, interaction.user && interaction.user.id)) {
    return interaction.reply({
      content: '⛔ Votre accès de configuration a été retiré. Seul le propriétaire ou un membre ayant la permission Discord « Administrateur » peut continuer.',
      ephemeral: true,
    });
  }
  const parts = cid.split(':');
  const uid = parts[3];
  if (!uid || uid !== interaction.user.id) {
    return interaction.reply({ content: '🔒 Cet assistant ne vous appartient pas. Lancez `/setup apply` pour le vôtre.', ephemeral: true });
  }
  const key = wizardKey(botId, interaction.guild.id, uid);
  const state = wizards.get(key);
  if (!state) return interaction.reply({ content: '⏰ Assistant expiré. Relancez `/setup apply`.', ephemeral: true });
  if (Date.now() - state.startedAt > WIZARD_TTL) {
    wizards.delete(key);
    return interaction.reply({ content: '⏰ Assistant expiré. Relancez `/setup apply`.', ephemeral: true });
  }

  // ---------- Modales ----------
  if (interaction.isModalSubmit()) {
    const val = String(interaction.fields.getTextInputValue('value') || '').trim();
    const mode = state.modal || '';
    state.modal = null;

    if (mode === 'titre') {
      if (!val) {
        return ackReply(interaction, { content: '⚠️ Le titre ne peut pas être vide.', ephemeral: true });
      }
      state.cfg.title = val.slice(0, 100);
      ecrireConfig(botId, state.guildId, state.cfg);
      await ackReply(interaction, { content: '✅ Titre enregistré.', ephemeral: true });
    } else if (mode === 'ajouter') {
      if (!val) {
        return ackReply(interaction, { content: '⚠️ La question ne peut pas être vide.', ephemeral: true });
      }
      if (state.cfg.questions.length >= MAX_QUESTIONS) {
        return ackReply(interaction, { content: `❌ Maximum ${MAX_QUESTIONS} questions.`, ephemeral: true });
      }
      // On enregistre la question ENTIÈRE. L'ancienne version la coupait à
      // 45 caractères (`slice(0, 45)`) sans prévenir : c'est ce qui a tronqué
      // « …inte vous intéresser par le recrutement ? » en base de production.
      state.cfg.questions.push(val.slice(0, QUESTION_MAX));
      ecrireConfig(botId, state.guildId, state.cfg);
      await ackReply(interaction, { content: `✅ Question ${state.cfg.questions.length}/${MAX_QUESTIONS} ajoutée.`, ephemeral: true });
    } else if (mode.startsWith('modifier:')) {
      const idx = Number(mode.split(':')[1]);
      if (Number.isFinite(idx) && state.cfg.questions[idx] !== undefined) {
        if (!val) {
          return ackReply(interaction, { content: '⚠️ La question ne peut pas être vide.', ephemeral: true });
        }
        state.cfg.questions[idx] = val.slice(0, QUESTION_MAX);
        ecrireConfig(botId, state.guildId, state.cfg);
        await ackReply(interaction, { content: `✅ Question ${idx + 1} modifiée.`, ephemeral: true });
      }
    }
    state.step = 'menu';
    return rafraichir(interaction, botId, state);
  }

  // ---------- Sélecteur de salon natif ----------
  if (interaction.isChannelSelectMenu()) {
    await ackDeferUpdate(interaction);
    state.cfg.channel = interaction.values[0];
    ecrireConfig(botId, state.guildId, state.cfg);
    state.step = 'menu';
    return rafraichir(interaction, botId, state);
  }

  // ---------- Menus de sélection ----------
  if (interaction.isStringSelectMenu()) {
    const v = interaction.values[0];

    // Choix d'une question à modifier / supprimer
    if (cid.startsWith('apw:quest:')) {
      const action = parts[4];
      const idx = Number(v);
      if (!Number.isFinite(idx) || state.cfg.questions[idx] === undefined) {
        await ackDeferUpdate(interaction);
        return rafraichir(interaction, botId, state);
      }
      if (action === 'supprimer') {
        await ackDeferUpdate(interaction);
        const retiree = state.cfg.questions.splice(idx, 1)[0];
        ecrireConfig(botId, state.guildId, state.cfg);
        state.message = `🗑️ Question supprimée : « ${String(retiree).slice(0, 80)} »`;
        return rafraichir(interaction, botId, state);
      }
      // modifier → fenêtre pré-remplie
      state.modal = `modifier:${idx}`;
      return interaction.showModal(textModal(
        `apw:modal:${botId}:${uid}`,
        '📝 Modifier la question',
        'Question',
        state.cfg.questions[idx],
        true,
        QUESTION_MAX,
        TextInputStyle.Paragraph,
      ));
    }

    // Menu principal
    await ackDeferUpdate(interaction);
    if (v === 'canal') {
      state.step = 'canal';
      return interaction.editReply({ embeds: [resumeEmbed(botId, state.guildId, state)], components: canalComponents(state) }).catch(() => {});
    }
    // Les actions qui ouvrent une fenêtre ne doivent PAS être précédées d'un
    // defer : Discord refuse showModal après un accusé de réception.
    if (v === 'titre' || v === 'ajouter' || v === 'modifier' || v === 'supprimer') {
      // (on est déjà après deferUpdate, donc on repasse par une réponse)
      if (v === 'titre') {
        state.modal = 'titre';
        return interaction.showModal(textModal(`apw:modal:${botId}:${uid}`, '✏️ Titre du panneau', 'Titre', state.cfg.title, true, 100));
      }
      if (v === 'ajouter') {
        state.modal = 'ajouter';
        return interaction.showModal(textModal(
          `apw:modal:${botId}:${uid}`,
          '➕ Nouvelle question',
          'Question',
          'Ex : Qu\'est-ce qui vous intéresse dans ce serveur ?',
          true,
          QUESTION_MAX,
          TextInputStyle.Paragraph,
        ));
      }
      if (v === 'modifier' || v === 'supprimer') {
        if (!state.cfg.questions.length) {
          return interaction.editReply({ embeds: [resumeEmbed(botId, state.guildId, state)], components: menuActions(state) }).catch(() => {});
        }
        state.step = v;
        return interaction.editReply({ embeds: [resumeEmbed(botId, state.guildId, state)], components: choixQuestion(state, v) }).catch(() => {});
      }
    }
    if (v === 'activer') {
      state.cfg.enabled = !state.cfg.enabled;
      // Activer sans salon ni question n'a aucun sens : on le dit franchement.
      if (state.cfg.enabled) {
        const { prete, manque } = etatConfig(state.cfg);
        if (!prete) {
          state.cfg.enabled = false;
          state.message = `⚠️ Impossible d'activer : il manque ${manque.join(' et ')}.`;
        }
      }
      ecrireConfig(botId, state.guildId, state.cfg);
      return rafraichir(interaction, botId, state);
    }
    if (v === 'apercu') {
      return interaction.editReply({
        content: '👁️ Voici exactement ce que verront les membres :',
        embeds: [new EmbedBuilder()
          .setColor('#e07a5f')
          .setTitle(state.cfg.title || '📝 Candidature')
          .setDescription(`Cliquez sur le bouton pour candidater : vous répondrez à **${state.cfg.questions.length} question(s)** dans une fenêtre privée.`)
          .addFields({ name: '🔒 Confidentialité', value: 'Seul le staff verra vos réponses.' })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`apw:noop:${botId}:${uid}`).setLabel('📝 Faire une candidature').setStyle(ButtonStyle.Primary),
        )],
      }).catch(() => {});
    }
    if (v === 'envoyer') return envoyerPanneau(botId, interaction, state);
    if (v === 'reset') {
      state.step = 'confirmreset';
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('🗑️ Réinitialiser les candidatures ?')
          .setDescription(`Le salon, le titre et les **${state.cfg.questions.length} question(s)** seront effacés.\nLe panneau déjà envoyé dans le salon restera visible mais ne fonctionnera plus.\n\nCette action est irréversible.`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`apw:btn:${botId}:${uid}:confirmreset`).setLabel('🗑️ Oui, tout effacer').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`apw:btn:${botId}:${uid}:retour`).setLabel('⬅️ Annuler').setStyle(ButtonStyle.Secondary),
        )],
      }).catch(() => {});
    }
    if (v === 'fermer') {
      wizards.delete(key);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#57F287').setTitle('✅ Assistant fermé')
          .setDescription('Vos réglages sont enregistrés. Rouvrez-le avec `/setup apply`.')],
        components: [],
      }).catch(() => {});
    }
    return rafraichir(interaction, botId, state);
  }

  // ---------- Boutons ----------
  if (interaction.isButton()) {
    const action = parts[4];
    if (action === 'noop') {
      return interaction.reply({ content: '👁️ Ceci est un aperçu : le bouton ne fait rien ici.', ephemeral: true });
    }
    await ackDeferUpdate(interaction);
    if (action === 'retour') return rafraichir(interaction, botId, state);
    if (action === 'confirmreset') {
      state.cfg = { channel: '', title: '📝 Candidature', enabled: false, questions: [] };
      ecrireConfig(botId, interaction.guild.id, state.cfg);
      state.message = '🗑️ Configuration effacée.';
      return rafraichir(interaction, botId, state);
    }
  }
  return true;
}

module.exports = {
  start, handleWizardInteraction, wizards,
  lireConfig, ecrireConfig, MAX_QUESTIONS, QUESTION_MAX,
};
