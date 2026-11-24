// ============================================================
// Hoxera — Assistant /setup apply (v406, refonte)
// ------------------------------------------------------------
// Ce que le fondateur a demandé, mot pour mot :
//   « si il tape /setup apply il devrait afficher un menu déroulant avec
//     créer un nouveau apply, supprimer un apply. Quand la personne clique
//     sur créer un nouveau apply, une fenêtre s'ouvre, il met le titre du
//     panneau, le texte du panneau… après ça lui demande le salon de réponse
//     des candidats, un menu s'affiche, il sélectionne le salon. Ensuite un
//     menu s'affiche : créer une question ou supprimer une question. Il
//     clique dessus, une fenêtre s'ouvre, etc. Chaque menu doit avoir son
//     propre panneau, il doit être autonome. N'oublie pas les boutons
//     Suivant et Retour. Organise tout ça comme un pro. »
//
// Organisation retenue (un écran = un état, un écran = son propre message) :
//
//   accueil      → menu déroulant : créer / modifier / supprimer / lister
//   créer        → 4 étapes numérotées, avec ↩ Retour et Suivant →
//       ① identité  (fenêtre : titre + texte du panneau)
//       ② salon     (sélecteur natif de salon)
//       ③ questions (fenêtre d'ajout, liste, retrait)
//       ④ récapitulatif (Envoyer le panneau / Retour / Annuler)
//   modifier     → mêmes étapes, préremplies
//   supprimer    → choix du formulaire puis confirmation
//
// Chaque écran est autonome : son propre customId `apw:<écran>:<bot>:<user>`,
// son propre embed, ses propres rangées de boutons. Aucun état partagé à
// l'écran — l'état vit en mémoire côté bot et expire au bout de 20 minutes.
//
// Limites Discord respectées (ce ne sont pas des choix de produit) :
//   • une fenêtre = au plus 5 champs  → 2 champs à l'étape ①, 5 questions max
//   • un embed = au plus 25 champs    → on affiche 5 questions, pas plus
//   • un menu  = au plus 25 options   → au-delà, on pagine
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
const WIZARD_TTL = 20 * 60000;

const MAX_QUESTIONS = 5;    // une fenêtre Discord = 5 rangées maximum
const QUESTION_MAX = 200;
const TITLE_MAX = 100;
const DESC_MAX = 1900;

const COULEUR = '#e07a5f';
const COULEUR_OK = '#57F287';
const COULEUR_ERR = '#ED4245';

// ---------- Aides d'interaction ----------
async function ack(interaction) {
  try { if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate(); } catch {}
}

// ============================================================
// UN SEUL MESSAGE POUR TOUT L'ASSISTANT
// ------------------------------------------------------------
// Avant : chaque écran repartait d'un `interaction.reply()`, donc chaque
// clic créait un NOUVEAU message. Sur Discord, une interaction de composant
// ne peut pas être « reply » deux fois — le code partait alors en followUp,
// et l'assistant empilait jusqu'à 7 messages dans le salon.
//
// Désormais tout passe par `state.panneau.edit(...)` : le même message est
// réécrit à chaque étape. Le seul cas où un nouveau message est créé, c'est
// le tout premier (l'assistant n'existe pas encore) ou un message d'erreur
// éphémère qui ne doit pas remplacer l'écran en cours.
// ============================================================

// Affiche un écran en RÉÉCRIVANT le message de l'assistant.
async function afficherSur(state, payload) {
  // 1. Le message de l'assistant existe : on l'édite, point final.
  if (state.panneau) {
    try { await state.panneau.edit(payload); return true; } catch {}
  }
  // 2. Plus d'accès (message supprimé) : on ne peut plus rien éditer.
  state.panneau = null;
  return false;
}

// Réponse à une interaction qui n'a pas encore été acquittée (premier
// affichage, ou message d'erreur éphémère).
async function repondre(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

function modal(customId, titre, champs) {
  const m = new ModalBuilder()
    .setCustomId(String(customId).slice(0, 100))
    .setTitle(String(titre).slice(0, 45));
  for (const c of champs.slice(0, 5)) {
    m.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(c.id)
        .setLabel(String(c.label).slice(0, 45))
        .setPlaceholder(String(c.placeholder || '').slice(0, 100))
        .setStyle(c.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(!!c.required)
        .setMaxLength(c.max || 100)
        .setValue(String(c.value || '').slice(0, c.max || 100)),
    ));
  }
  return m;
}

// ---------- État ----------
function nouvelEtat(botId, guild, userId) {
  return {
    botId, guildId: guild.id, userId,
    formId: null,            // null = création
    brouillon: { title: '', description: '', channel: '', questions: [], enabled: true },
    etape: 'identite',
    info: '',                // bandeau d'information (succès, erreur douce)
    panneau: null,           // LE message Discord que l'on réécrit à chaque étape
    startedAt: Date.now(),
  };
}

function chargerFormulaire(state, formId) {
  const f = store.applyForms.get(formId);
  if (!f || f.bot_id !== state.botId || String(f.guild_id) !== String(state.guildId)) return false;
  state.formId = f.id;
  state.brouillon = {
    title: f.title || 'Candidature',
    description: f.description || '',
    channel: f.channel || '',
    questions: (f.questions || []).slice(0, MAX_QUESTIONS),
    enabled: Number(f.enabled) === 1,
  };
  return true;
}

// Un formulaire est envoyable s'il a un titre, un salon et une question.
function manques(b) {
  const m = [];
  if (!String(b.title || '').trim()) m.push('titre');
  if (!b.channel) m.push('salon');
  if (!b.questions.length) m.push('au moins une question');
  return m;
}

// ============================================================
// ÉCRAN 1 — Accueil
// ============================================================
function ecranAccueil(state) {
  const forms = store.applyForms.all(state.botId, state.guildId);
  const lignes = forms.length
    ? forms.slice(0, 22).map((f, i) => {
      const etat = f.enabled ? '🟢' : '⚪';
      const salon = f.channel ? `<#${f.channel}>` : '*salon manquant*';
      return `${etat} **${i + 1}. ${f.title || 'Sans titre'}** · ${salon} · ${f.questions.length} question(s)`;
    }).join('\n')
    : '*Aucun formulaire pour l\'instant.*\n\nChoisissez **Créer un nouveau formulaire** ci-dessous : on vous guide étape par étape.';

  const embed = new EmbedBuilder()
    .setColor(forms.length ? COULEUR_OK : COULEUR)
    .setTitle('📝 Candidatures')
    .setDescription(
      (state.info ? `${state.info}\n\n` : '')
      + `**${forms.length} formulaire(s)** sur ce serveur.\n\n${lignes}`,
    )
    .setFooter({ text: 'Chaque formulaire a son propre panneau et ses propres questions.' });

  const actions = [{ label: 'Créer un nouveau formulaire', value: 'creer', emoji: '➕' }];
  if (forms.length) {
    actions.push({ label: 'Modifier un formulaire', value: 'modifier', emoji: '✏️' });
    actions.push({ label: 'Supprimer un formulaire', value: 'supprimer', emoji: '🗑️' });
    actions.push({ label: 'Envoyer un panneau', value: 'envoyer', emoji: '📤' });
  }

  const rangées = [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`apw:accueil:${state.botId}:${state.userId}`)
      .setPlaceholder('Que voulez-vous faire ?')
      .setMinValues(1).setMaxValues(1)
      .addOptions(actions.map((a) => new StringSelectMenuOptionBuilder()
        .setLabel(a.label.slice(0, 80)).setValue(a.value).setEmoji(a.emoji))),
  )];
  return { embeds: [embed], components: rangées };
}

// ============================================================
// ÉCRAN 2 — Création / modification (4 étapes)
// ============================================================
const NOMS_ETAPES = { identite: '① Identité', canal: '② Salon', questions: '③ Questions', recap: '④ Récapitulatif' };
const ORDRE = ['identite', 'canal', 'questions', 'recap'];

function barreProgression(etape) {
  return ORDRE.map((e) => (e === etape ? `**${NOMS_ETAPES[e]}**` : NOMS_ETAPES[e])).join(' › ');
}

function ecranEtape(state) {
  const b = state.brouillon;
  const enCreation = state.formId === null;
  const titre = enCreation ? '➕ Nouveau formulaire' : `✏️ Modification — ${b.title || 'formulaire'}`;

  let corps = '';
  if (state.etape === 'identite') {
    corps = `**Ce que verront les membres**\n\n`
      + `**Titre du panneau**\n${b.title ? `> ${b.title}` : '> *non défini*'}\n\n`
      + `**Texte du panneau**\n${b.description ? `> ${b.description.replace(/\n/g, '\n> ')}` : '> *non défini*'}\n\n`
      + `Utilisez **✏️ Modifier ces informations** pour changer l'un ou l'autre.`;
  } else if (state.etape === 'canal') {
    corps = `**Salon où arriveront les candidatures**\n\n`
      + `${b.channel ? `> <#${b.channel}>` : '> *aucun salon choisi*'}\n\n`
      + `Choisissez le salon dans le menu ci-dessous. C'est là que le bot enverra chaque candidature reçue, avec les boutons ✅ Accepter et ❌ Refuser.`;
  } else if (state.etape === 'questions') {
    const liste = b.questions.length
      ? b.questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n')
      : '*Aucune question pour l\'instant.*\n\nUn formulaire sans question ne peut pas être envoyé.';
    corps = `**Questions posées au membre (${b.questions.length}/${MAX_QUESTIONS})**\n\n${liste}\n\n`
      + `Chaque question devient une case à remplir dans la fenêtre du candidat. `
      + `*${MAX_QUESTIONS} questions maximum : c'est la limite d'une fenêtre Discord.*`;
  } else if (state.etape === 'recap') {
    const manque = manques(b);
    corps = `**Récapitulatif**\n\n`
      + `**Titre** — ${b.title || '*non défini*'}\n`
      + `**Texte** — ${b.description ? b.description.slice(0, 300) : '*aucun texte*'}\n`
      + `**Salon des réponses** — ${b.channel ? `<#${b.channel}>` : '*non défini*'}\n`
      + `**Questions (${b.questions.length}/${MAX_QUESTIONS})**\n`
      + (b.questions.length ? b.questions.map((q, i) => `> ${i + 1}. ${q}`).join('\n') : '> *aucune*\n')
      + `\n${manque.length
        ? `⚠️ Il manque encore : **${manque.join(', ')}**. Revenez en arrière pour compléter.`
        : '✅ Tout est prêt. **Envoyer le panneau** publiera le message que les membres verront.'}`;
  }

  const embed = new EmbedBuilder()
    .setColor(manques(b).length ? COULEUR : COULEUR_OK)
    .setTitle(titre)
    .setDescription((state.info ? `${state.info}\n\n` : '') + corps)
    .setFooter({ text: `${barreProgression(state.etape)} — étape ${ORDRE.indexOf(state.etape) + 1}/4` });

  return { embeds: [embed], components: rangéesEtape(state) };
}

function rangéesEtape(state) {
  const b = state.brouillon;
  const uid = state.userId;
  const id = (ecran) => `apw:${ecran}:${state.botId}:${uid}`;
  const rangées = [];

  // Champs propres à l'étape
  if (state.etape === 'identite') {
    rangées.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${id('btn')}:identite`).setLabel('✏️ Modifier ces informations').setStyle(ButtonStyle.Primary),
    ));
  } else if (state.etape === 'canal') {
    rangées.push(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(id('canal'))
        .setPlaceholder('📨 Choisir le salon des réponses…')
        .setMinValues(1).setMaxValues(1)
        .setChannelTypes([ChannelType.GuildText]),
    ));
  } else if (state.etape === 'questions') {
    rangées.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${id('btn')}:ajouterquestion`)
        .setLabel(b.questions.length >= MAX_QUESTIONS ? `Maximum ${MAX_QUESTIONS} atteint` : '➕ Ajouter une question')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(b.questions.length >= MAX_QUESTIONS),
    ));
    if (b.questions.length) {
      rangées.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id('retrait'))
          .setPlaceholder('➖ Retirer une question…')
          .setMinValues(1).setMaxValues(1)
          .addOptions(b.questions.slice(0, 25).map((q, i) => new StringSelectMenuOptionBuilder()
            .setLabel(`${i + 1}. ${q}`.slice(0, 80)).setValue(String(i)))),
      ));
    }
  }

  // Navigation : ↩ Retour et Suivant → (ou Envoyer à la fin)
  const idx = ORDRE.indexOf(state.etape);
  const nav = [];
  if (idx > 0) {
    nav.push(new ButtonBuilder().setCustomId(`${id('btn')}:precedent`).setLabel('↩ Précédent').setStyle(ButtonStyle.Secondary));
  }
  if (state.etape === 'recap') {
    const pret = manques(b).length === 0;
    nav.push(new ButtonBuilder().setCustomId(`${id('btn')}:envoyer`)
      .setLabel('📤 Envoyer le panneau').setStyle(ButtonStyle.Success).setDisabled(!pret));
  } else {
    nav.push(new ButtonBuilder().setCustomId(`${id('btn')}:suivant`).setLabel('Suivant →').setStyle(ButtonStyle.Primary));
  }
  nav.push(new ButtonBuilder().setCustomId(`${id('btn')}:accueil`).setLabel('✖ Annuler').setStyle(ButtonStyle.Danger));
  rangées.push(new ActionRowBuilder().addComponents(...nav));
  return rangées;
}

// ============================================================
// ÉCRAN 3 — Choisir un formulaire (modifier / supprimer / envoyer)
// ============================================================
function ecranChoix(state, but) {
  const forms = store.applyForms.all(state.botId, state.guildId);
  const libelle = but === 'supprimer' ? 'supprimer' : but === 'envoyer' ? 'envoyer' : 'modifier';
  const embed = new EmbedBuilder()
    .setColor(COULEUR)
    .setTitle(but === 'supprimer' ? '🗑️ Supprimer un formulaire'
      : but === 'envoyer' ? '📤 Envoyer un panneau' : '✏️ Modifier un formulaire')
    .setDescription(`Choisissez le formulaire à ${libelle}.\n\n`
      + forms.map((f, i) => `**${i + 1}. ${f.title || 'Sans titre'}** — ${f.questions.length} question(s)`
        + `${f.channel ? ` · <#${f.channel}>` : ' · ⚠️ salon manquant'}`).join('\n'))
    .setFooter({ text: 'Seuls les formulaires de ce serveur sont affichés.' });
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`apw:choix:${state.botId}:${state.userId}:${but}`)
          .setPlaceholder('Choisir un formulaire…')
          .setMinValues(1).setMaxValues(1)
          .addOptions(forms.slice(0, 25).map((f) => new StringSelectMenuOptionBuilder()
            .setLabel(String(f.title || 'Sans titre').slice(0, 80))
            .setDescription(`${f.questions.length} question(s)${f.enabled ? ' · actif' : ' · inactif'}`.slice(0, 100))
            .setValue(String(f.id)))),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apw:btn:${state.botId}:${state.userId}:accueil`).setLabel('↩ Retour').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function ecranConfirmationSuppression(state, form) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COULEUR_ERR)
      .setTitle('🗑️ Supprimer ce formulaire ?')
      .setDescription(`**${form.title || 'Sans titre'}**\n\n`
        + `• Salon : ${form.channel ? `<#${form.channel}>` : '*non défini*'}\n`
        + `• Questions : ${form.questions.length}\n\n`
        + 'Le panneau déjà envoyé dans le salon **restera visible**, mais le bouton ne fonctionnera plus.\n\n'
        + '**Cette action est irréversible.**')],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apw:btn:${state.botId}:${state.userId}:confirmersuppression`).setLabel('🗑️ Oui, supprimer').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`apw:btn:${state.botId}:${state.userId}:accueil`).setLabel('↩ Annuler').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ============================================================
// Le panneau public
// ============================================================
function panneauPublic(form) {
  const description = form.description
    ? `${form.description}\n\nRépondez à **${form.questions.length} question(s)** dans une fenêtre privée.`
    : `Cliquez sur le bouton pour candidater : vous répondrez à **${form.questions.length} question(s)** dans une fenêtre privée.`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hx:apply:${form.id}`)
      .setLabel('📝 Faire une candidature')
      .setStyle(ButtonStyle.Primary),
  );
  return ui.v2panel({
    variant: 'brand',
    title: form.title || 'Candidature',
    description,
    fields: [{ name: '🔒 Confidentialité', value: 'Seul le staff verra vos réponses.' }],
    footer: false,
  }, [row]);
}

// ============================================================
// Enregistrement + envoi
// ============================================================
function enregistrer(state) {
  const b = state.brouillon;
  const donnees = {
    title: b.title.trim() || 'Candidature',
    description: b.description.trim(),
    channel: b.channel,
    questions: b.questions.slice(0, MAX_QUESTIONS),
    enabled: true,
  };
  if (state.formId) {
    store.applyForms.update(state.formId, donnees);
    return state.formId;
  }
  return store.applyForms.create({
    bot_id: state.botId, guild_id: state.guildId, ...donnees,
  });
}

async function envoyerPanneau(interaction, state) {
  const b = state.brouillon;
  const guild = interaction.guild;
  const salon = guild.channels.cache.get(String(b.channel));
  if (!salon) {
    state.info = `❌ Le salon <#${b.channel}> n'existe plus. Choisissez-en un autre à l'étape **② Salon**.`;
    state.etape = 'canal';
    return afficher(interaction, state);
  }
  const formId = enregistrer(state);
  const form = store.applyForms.get(formId);
  try {
    await salon.send(panneauPublic(form));
  } catch (e) {
    state.info = `❌ Impossible d'envoyer dans <#${b.channel}> : ${String(e.message || e).slice(0, 140)}\n`
      + 'Vérifiez que le bot peut écrire dans ce salon (permission « Envoyer des messages »).';
    return afficher(interaction, state);
  }
  store.applyForms.update(formId, { enabled: true });
  wizards.delete(wizardKey(state.botId, state.guildId, state.userId));
  return conclure(interaction, state, {
    embeds: [new EmbedBuilder()
      .setColor(COULEUR_OK)
      .setTitle('✅ Formulaire publié')
      .setDescription(`Le panneau **${form.title}** est en ligne dans <#${form.channel}>.\n\n`
        + `Les membres peuvent candidater dès maintenant. Leurs réponses arriveront dans le même salon.\n\n`
        + 'Vous pourrez le modifier à tout moment avec `/setup apply`.')],
    components: [],
  });
}

function payloadEcran(state) {
  if (state.etape === 'accueil') return ecranAccueil(state);
  if (state.etape === 'choix') return ecranChoix(state, state.but);
  if (state.etape === 'confirmersuppression') {
    const form = store.applyForms.get(state.formId);
    if (!form) { state.etape = 'accueil'; state.info = '⚠️ Ce formulaire n\'existe plus.'; return ecranAccueil(state); }
    return ecranConfirmationSuppression(state, form);
  }
  return ecranEtape(state);
}

// Dernier écran (publié / fermé / supprimé) : on réécrit le panneau, on
// n'empile pas un message de plus sous lui. Si le panneau n'existe plus,
// on répond normalement pour que l'utilisateur ait quand même le résultat.
async function conclure(interaction, state, payload) {
  if (state && state.panneau) {
    if (await afficherSur(state, payload)) return true;
  }
  return repondre(interaction, payload);
}

async function afficher(interaction, state) {
  // 1. Le message de l'assistant existe : on le réécrit. C'est le cas normal.
  if (state.panneau) {
    if (await afficherSur(state, payloadEcran(state))) return true;

    // 2. Le message a été supprimé entre-temps (ou le bot n'y a plus accès).
    // On ne recrée PAS une pile : on prévient une seule fois, en éphémère,
    // et on ferme l'assistant. L'utilisateur relance /setup apply.
    wizards.delete(wizardKey(state.botId, state.guildId, state.userId));
    return repondre(interaction, {
      content: '⚠️ Le panneau de l\'assistant a été supprimé. Relancez `/setup apply` pour en rouvrir un.',
      ephemeral: true,
    });
  }
  // 3. Premier affichage (l'assistant vient de s'ouvrir) : on crée le message
  // et on le garde en mémoire pour toutes les étapes suivantes.
  const m = await repondre(interaction, { ...payloadEcran(state), fetchReply: true });
  if (m && typeof m.edit === 'function') state.panneau = m;
  return true;
}

// ============================================================
// Démarrage
// ============================================================
async function start(botId, interaction) {
  const uid = interaction.user.id;
  const guild = interaction.guild;
  if (!canConfigureGuild(guild, interaction.member, uid)) {
    return interaction.reply({
      content: '⛔ Seul le propriétaire du serveur ou un membre ayant la permission Discord « Administrateur » peut configurer les candidatures.',
      ephemeral: true,
    });
  }
  const state = nouvelEtat(botId, guild, uid);
  state.etape = 'accueil';
  wizards.set(wizardKey(botId, guild.id, uid), state);
  const msg = await repondre(interaction, { ...ecranAccueil(state), fetchReply: true });
  if (msg && typeof msg.edit === 'function') state.panneau = msg;
  return true;
}

// ============================================================
// Interactions
// ============================================================
async function handleWizardInteraction(botId, interaction) {
  const cid = String(interaction.customId || '');
  if (!cid.startsWith('apw:')) return false;

  if (!canConfigureGuild(interaction.guild, interaction.member, interaction.user && interaction.user.id)) {
    return interaction.reply({
      content: '⛔ Votre accès de configuration a été retiré. Seul le propriétaire ou un membre ayant la permission « Administrateur » peut continuer.',
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
  if (!state || Date.now() - state.startedAt > WIZARD_TTL) {
    wizards.delete(key);
    return interaction.reply({ content: '⏰ Assistant expiré. Relancez `/setup apply`.', ephemeral: true });
  }

  // ---------- Fenêtres ----------
  if (interaction.isModalSubmit()) {
    // Une soumission de fenêtre DOIT être acquittée : sans ça Discord affiche
    // « L'application ne répond pas ». On acquitte en éditant le panneau,
    // ce qui est justement l'affichage voulu.
    await ack(interaction);
    const v = (id) => String((interaction.fields.getTextInputValue(id) || '')).trim();
    const mode = state.modal || '';
    state.modal = '';

    if (mode === 'identite') {
      const titre = v('titre');
      if (!titre) {
        state.info = '⚠️ Le titre ne peut pas être vide — rouvrez la fenêtre.';
      } else {
        state.brouillon.title = titre.slice(0, TITLE_MAX);
        state.brouillon.description = v('texte').slice(0, DESC_MAX);
        state.info = '✅ Informations enregistrées.';
      }
    } else if (mode === 'ajouterquestion') {
      const q = v('question');
      if (!q) {
        state.info = '⚠️ La question ne peut pas être vide.';
      } else if (state.brouillon.questions.length >= MAX_QUESTIONS) {
        state.info = `⚠️ Maximum ${MAX_QUESTIONS} questions.`;
      } else {
        state.brouillon.questions.push(q.slice(0, QUESTION_MAX));
        state.info = `✅ Question ${state.brouillon.questions.length}/${MAX_QUESTIONS} ajoutée.`;
      }
    }
    return afficher(interaction, state);
  }

  // ---------- Sélecteur de salon ----------
  if (interaction.isChannelSelectMenu()) {
    await ack(interaction);
    state.brouillon.channel = interaction.values[0];
    state.info = '✅ Salon enregistré.';
    // On avance automatiquement : l'étape ② n'a qu'un seul champ.
    if (state.etape === 'canal') state.etape = 'questions';
    return afficher(interaction, state);
  }

  // ---------- Menus ----------
  if (interaction.isStringSelectMenu()) {
    const valeur = interaction.values[0];

    if (parts[1] === 'accueil') {
      if (valeur === 'creer') {
        state.formId = null;
        state.brouillon = { title: '', description: '', channel: '', questions: [], enabled: true };
        state.etape = 'identite';
        state.info = '';
        state.modal = 'identite';
        return interaction.showModal(modal(
          `apw:modal:${state.botId}:${uid}`,
          '➕ Nouveau formulaire',
          [
            { id: 'titre', label: 'Titre du panneau', placeholder: 'Candidature staff', required: true, max: TITLE_MAX, value: '', },
            { id: 'texte', label: 'Texte du panneau', placeholder: 'Pourquoi nous rejoindre ? Décrivez ici votre serveur…', paragraph: true, required: false, max: DESC_MAX },
          ],
        ));
      }
      if (valeur === 'modifier' || valeur === 'supprimer' || valeur === 'envoyer') {
        if (!store.applyForms.count(state.botId, state.guildId)) {
          state.info = '⚠️ Aucun formulaire à sélectionner.';
          return afficher(interaction, state);
        }
        state.but = valeur;
        state.etape = 'choix';
        state.info = '';
        return afficher(interaction, state);
      }
      return afficher(interaction, state);
    }

    if (parts[1] === 'choix') {
      const but = parts[4];
      const formId = Number(valeur);
      if (!chargerFormulaire(state, formId)) {
        state.info = '❌ Formulaire introuvable.';
        state.etape = 'accueil';
        return afficher(interaction, state);
      }
      if (but === 'supprimer') {
        state.etape = 'confirmersuppression';
        state.info = '';
        return afficher(interaction, state);
      }
      if (but === 'envoyer') {
        return envoyerPanneau(interaction, state);
      }
      state.etape = 'identite';
      state.info = '✏️ Vous modifiez ce formulaire. Rien n\'est enregistré avant **Envoyer le panneau**.';
      return afficher(interaction, state);
    }

    // Retrait d'une question
    if (parts[1] === 'retrait') {
      const idx = Number(valeur);
      if (Number.isFinite(idx) && state.brouillon.questions[idx] !== undefined) {
        const retiree = state.brouillon.questions.splice(idx, 1)[0];
        state.info = `🗑️ Question retirée : « ${String(retiree).slice(0, 70)} »`;
      }
      return afficher(interaction, state);
    }
    return afficher(interaction, state);
  }

  // ---------- Boutons ----------
  if (interaction.isButton()) {
    const action = parts[4];
    // Tout bouton est acquitté, sauf ceux qui ouvrent une fenêtre : Discord
    // interdit showModal après un accusé de réception.
    if (action !== 'identite' && action !== 'ajouterquestion') await ack(interaction);
    const idx = ORDRE.indexOf(state.etape);

    if (action === 'accueil') {
      wizards.delete(key);
      return conclure(interaction, state, {
        embeds: [new EmbedBuilder().setColor(COULEUR_OK).setTitle('✅ Assistant fermé')
          .setDescription('Rouvrez-le avec `/setup apply`.')],
        components: [],
      });
    }
    if (action === 'suivant') {
      // On ne laisse pas avancer sans le minimum : on dit quoi corriger.
      if (state.etape === 'identite' && !state.brouillon.title.trim()) {
        state.info = '⚠️ Donnez d\'abord un titre au panneau.';
        return afficher(interaction, state);
      }
      if (state.etape === 'canal' && !state.brouillon.channel) {
        state.info = '⚠️ Choisissez le salon des réponses avant de continuer.';
        return afficher(interaction, state);
      }
      if (idx >= 0 && idx < ORDRE.length - 1) {
        state.etape = ORDRE[idx + 1];
        state.info = '';
      }
      return afficher(interaction, state);
    }
    if (action === 'precedent') {
      if (idx > 0) {
        state.etape = ORDRE[idx - 1];
        state.info = '';
      }
      return afficher(interaction, state);
    }
    if (action === 'identite') {
      state.modal = 'identite';
      return interaction.showModal(modal(
        `apw:modal:${state.botId}:${uid}`,
        '✏️ Informations du panneau',
        [
          { id: 'titre', label: 'Titre du panneau', placeholder: 'Candidature staff', required: true, max: TITLE_MAX, value: state.brouillon.title },
          { id: 'texte', label: 'Texte du panneau', placeholder: 'Expliquez aux membres pourquoi candidater…', paragraph: true, required: false, max: DESC_MAX, value: state.brouillon.description },
        ],
      ));
    }
    if (action === 'ajouterquestion') {
      state.modal = 'ajouterquestion';
      return interaction.showModal(modal(
        `apw:modal:${state.botId}:${uid}`,
        `➕ Question ${state.brouillon.questions.length + 1}/${MAX_QUESTIONS}`,
        [{ id: 'question', label: 'Question posée au membre', placeholder: 'Qu\'est-ce qui vous intéresse dans ce serveur ?', paragraph: true, required: true, max: QUESTION_MAX }],
      ));
    }
    if (action === 'envoyer') {
      return envoyerPanneau(interaction, state);
    }
    if (action === 'confirmersuppression') {
      if (state.formId) {
        store.applyForms.remove(state.formId);
        wizards.delete(key);
        return conclure(interaction, state, {
          embeds: [new EmbedBuilder().setColor(COULEUR_OK).setTitle('🗑️ Formulaire supprimé')
            .setDescription('Il n\'apparaît plus dans la liste. Le panneau déjà publié reste visible mais son bouton ne répondra plus.')],
          components: [],
        });
      }
    }
  }
  return true;
}

module.exports = {
  start, handleWizardInteraction, wizards,
  MAX_QUESTIONS, QUESTION_MAX,
  _interne: { ecranAccueil, ecranEtape, ecranChoix, ecranConfirmationSuppression, panneauPublic, manques, nouvelEtat },
};
