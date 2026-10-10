// ============================================================
// v362 — 📜 RÈGLES : panneau de règles + bouton d'acceptation + rôle.
// ------------------------------------------------------------
// Le module fait trois choses, dans l'ordre :
//   1. il envoie (ou met à jour) un panneau de règles soigné dans le salon
//      choisi — panneau en Components V2, comme le reste d'Hoxera, avec un
//      séparateur pleine largeur entre chaque partie ;
//   2. il pose dessous un bouton « J'accepte les règles » ;
//   3. au clic, il donne le rôle choisi, note l'acceptation en base et la
//      journalise.
// Le texte des règles est du MARKDOWN DISCORD réel : **gras**, *italique*,
// __souligné__, ~~barré~~, `code`, ```bloc```, > citation, - liste,
// ||spoiler||, <a:nom:id> et <:nom:id>. Les quatre modèles livrés ici
// (classique, gaming, roleplay, essentiel) respectent ces balises et les
// plafonds de l'API (voir server/discord/ui.js : V2_TEXT_BUDGET = 4000).
// Le panneau publié est SUIVI : cfg.panel_message permet de le mettre à jour
// au lieu d'en empiler un deuxième.
// ============================================================
const store = require('../db');
const ui = require('./ui');
const i18n = require('../i18n');
const logging = require('./logging');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;

const TITLE_MAX = 120;
const BODY_MAX = 3000;      // marge sous le budget V2 (4000) titre + pied inclus
const BUTTON_MAX = 80;
const FOOTER_MAX = 300;
const HISTORY_CAP = 400;    // acceptations conservées pour le tableau de bord

const COLOR_DEFAULT = '#5865F2';

const RULES_STYLES = {
  vert: ButtonStyle.Success,
  gris: ButtonStyle.Secondary,
  rouge: ButtonStyle.Danger,
  bleu: ButtonStyle.Primary,
};

// ------------------------------------------------------------
// Modèles livrés : complets, pro, écrits avec les balises Discord.
// ------------------------------------------------------------
const PRESETS = {
  classique: {
    label: 'Classique — communauté générale',
    text: [
      '> **Bienvenue sur {serveur}.** Ces règles sont là pour que tout le monde puisse discuter tranquillement. En restant ici, vous les acceptez.',
      '━',
      '**1. Respect avant tout**',
      'Aucune insulte, moquerie, harcèlement ou provocation. Un désaccord se règle en **MP avec le staff**, jamais en public. __Les remarques racistes, sexistes, homophobes ou transphobes entraînent un bannissement immédiat.__',
      '**2. Pas de spam ni de pub**',
      'Pas de flood, de messages en MAJUSCULES, de @everyone non autorisé, ni de publicité pour un autre serveur sans accord du staff. Les liens raccourcis sont interdits.',
      '**3. Contenu réservé aux adultes**',
      'Est interdit : contenu pornographique, gore, violent ou choquant, apologie du crime ou de la drogue, ainsi que toute information personnelle (adresse, téléphone, nom complet) publiée sur quelqu\'un.',
      '**4. Un salon pour chaque sujet**',
      'Écrivez dans le bon salon. Les demandes de support passent par les **tickets** ; les bugs et suggestions ont leur salon dédié.',
      '**5. Pseudos et identités**',
      'Pseudo lisible, sans lien ni characteres exotiques rendant la modération impossible. Interdiction d\'usurper l\'identité d\'un membre ou d\'un membre du staff.',
      '**6. Mineurs**',
      'Ce serveur est ouvert aux 13 ans et plus, conformément à l\'âge minimum de Discord. Un compte doit rester sous la seule responsabilité de son titulaire.',
      '**7. Décisions du staff**',
      'Le staff peut supprimer un message, masquer un membre ou exclure **sans préavis** quand la situation l\'exige. Contester une sanction se fait en ticket, en privé.',
      '━',
      '*En cas de doute sur une règle, demandez : une question posée n\'a jamais été sanctionnée. Bonne visite !*',
    ].join('\n\n'),
  },
  gaming: {
    label: 'Gaming — équipe & tournois',
    text: [
      '> **{serveur} — salle d\'attente, puis terrain.** Ici on joue sérieusement sans être lourd.',
      '━',
      '**1. Esport mindset**',
      'Le tilt se garde pour la partie. On n\'insulte ni un coéquipier, ni un adversaire, ni un arbitre. Le ramassage de place se fait en vocal, calmement.',
      '**2. Triche & exploit**',
      'Tout logiciel tiers, script, macro matérielle ou abus de bug est **interdit** : exclusion définitive du serveur et des tournois, sans appel si la preuve est là.',
      '**3. Vocal et micro**',
      'Pas de musique, de cris permanents ni de microphone qui sert de réveil. Un **push-to-talk** est conseillé en partie classée.',
      '**4. Inscriptions aux tournois**',
      'Pseudo du joueur = pseudo du formulaire. Tout retrait après le début de la poule bloque l\'accès à la prochaine édition.',
      '**5. Recherche de coéquipiers**',
      'Un seul poste de recrutement à la fois, dans le salon dédié, avec le niveau indiqué. Le harcèlement par MP après une refus se signale en ticket.',
      '**6. Contenu et language**',
      'Aucun contenu haineux, aucun doxxing, aucune capture d\'écran personnelle publiée sans accord. Le spoil d\'un match se place derrière un ||spoiler||.',
      '━',
      '*Le staff peut changer une règle de tournoi jusqu\'à 24 h avant le début ; la version affichée ici fait foi.*',
    ].join('\n\n'),
  },
  roleplay: {
    label: 'Roleplay — serveur RP',
    text: [
      '> **{serveur} — l\'histoire passe avant le joueur.** Le hors-RP se dit en parenthèses, jamais dans la scène.',
      '━',
      '**1. Séparation joueur / personnage**',
      'Ce qui arrive en jeu reste en jeu. Une frustration de personnage ne devient jamais une attaque contre le joueur. Le staff arbitre, il ne joue pas contre vous.',
      '**2. No RDM / no VDM**',
      'Aucun meurtre ni vol sans scène préparée, aucun véhicule utilisé comme arme. Une interaction commence par un signal clair (salut, regard, appel).',
      '**3. Fear RP et cohérence**',
      'Votre personnage tient à sa vie : il recule face à une arme, il négocie, il fuit. Un personnage suicidaire ou invincible se voit retirer la scène.',
      '**4. Métagaming & powergaming**',
      'N\'utilisez aucune information obtenue hors-jeu (stream, Discord, vocal). Une action impossible en une seconde ne se joue pas.',
      '**5. New Life Rule**',
      'Après une mort, votre personnage oublie la scène qui l\'a tué et ne revient pas sur les lieux avant le temps indiqué par le règlement de la ville.',
      '**6. Prénoms, tenues, véhicules**',
      'Aucun nom de marque réel, aucune tenue parodiant une marque, aucun véhicule non validé dans le salon de réception.',
      '**7. Scènes sensibles**',
      'Tout contenu sexuel ou autodestructeur est interdit. Les thèmes lourds se concertent **avant** la scène et s\'arrêtent au premier refus.',
      '**8. Staff en scène**',
      'Un membre du staff qui intervient porte l\'épaulette. Son arbitrage est définitif pour la scène en cours ; le recours se fait en ticket.',
      '━',
      '*Le règlement complet de la ville est épinglé dans le salon des annonces. Cette page reste la version courte qui fait foi côté Discord.*',
    ].join('\n\n'),
  },
  essentiel: {
    label: 'Essentiel — cinq lignes',
    text: [
      '> **{serveur} — le minimum pour que ça reste agréable.**',
      '━',
      '**1.** Restez courtois : pas d\'insulte, pas de harcèlement, pas de propos haineux.',
      '**2.** Gardez le serveur propre : pas de spam, pas de pub, pas de liens douteux.',
      '**3.** Rien de choquant : pas de contenu adulte, violent ou personnel exposé.',
      '**4.** Écrivez dans le bon salon, et passez par un ticket pour toute demande sérieuse.',
      '**5.** Les décisions du staff sont appliquées avec bon sens et se discutent en privé.',
      '━',
      '*Refuser ces règles, c\'est quitter le serveur. En acceptant, vous vous engagez à les lire vraiment.*',
    ].join('\n\n'),
  },
};

const DEFAULT_PRESET = 'essentiel';

function presets() {
  return Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, text: p.text, length: p.text.length }));
}

// ------------------------------------------------------------
// Réglages
// ------------------------------------------------------------
function colorOf(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : COLOR_DEFAULT;
}

function styleOf(value) {
  const key = String(value || 'vert').toLowerCase();
  return RULES_STYLES[key] ? key : 'vert';
}

function fill(text, vars) {
  let out = String(text == null ? '' : text);
  for (const [key, value] of Object.entries(vars || {})) {
    out = out.split(`{${key}}`).join(String(value == null ? '' : value));
  }
  return out;
}

function cfgOf(guildId) {
  let raw = {};
  try { raw = JSON.parse(store.settings.get(`rules_cfg:${guildId}`) || '{}') || {}; } catch {}
  const cfg = { ...raw };
  cfg.enabled = !!cfg.enabled;
  cfg.channel = String(cfg.channel || '').slice(0, 30);
  cfg.role = String(cfg.role || '').slice(0, 30);
  cfg.title = String(cfg.title || '').slice(0, TITLE_MAX);
  cfg.body = String(cfg.body || '').slice(0, BODY_MAX);
  cfg.color = colorOf(cfg.color);
  cfg.button_label = String(cfg.button_label || '').slice(0, BUTTON_MAX);
  cfg.button_style = styleOf(cfg.button_style);
  cfg.footer = String(cfg.footer || '').slice(0, FOOTER_MAX);
  cfg.thanks = String(cfg.thanks || '').slice(0, 500);
  cfg.log_channel = String(cfg.log_channel || '').slice(0, 30);
  cfg.panel_message = String(cfg.panel_message || '').slice(0, 30);
  cfg.panel_channel = String(cfg.panel_channel || '').slice(0, 30);
  cfg.using_default = !cfg.body; // le panneau s'appuie sur un modèle livré
  return cfg;
}

function saveCfg(guildId, patch) {
  const current = cfgOf(guildId);
  const next = { ...current };
  const allowed = ['enabled', 'channel', 'role', 'title', 'body', 'color', 'button_label',
    'button_style', 'footer', 'thanks', 'log_channel', 'panel_message', 'panel_channel'];
  for (const key of allowed) {
    if (patch && patch[key] !== undefined) next[key] = patch[key];
  }
  // Un corps qui redevient vide doit sortir du mode « modèle par défaut ».
  store.settings.set(`rules_cfg:${guildId}`, JSON.stringify(next));
  return cfgOf(guildId);
}

function texts(cfg, lang, vars = {}) {
  const preset = PRESETS[DEFAULT_PRESET];
  // Les modèles livres commencent par « Bienvenue sur {serveur} » : le corps
  // passe par le même remplacement que le titre et le pied, puis est coupé au
  // plafond — dans cet ordre, sinon le marqueur resterait à l'écran.
  const body = fill(String(cfg.body || '').trim() || preset.text, vars).slice(0, BODY_MAX);
  return {
    title: fill(cfg.title || i18n.t(lang, 'rules_title'), vars).slice(0, TITLE_MAX),
    body,
    footer: fill(cfg.footer || i18n.t(lang, 'rules_footer'), vars).slice(0, FOOTER_MAX),
    button: fill(cfg.button_label || i18n.t(lang, 'rules_button'), vars).slice(0, BUTTON_MAX),
    color: cfg.color || COLOR_DEFAULT,
    style: styleOf(cfg.button_style),
  };
}

function channelFor(guild, ref) {
  const id = String(ref || '').trim().replace(/^#/, '');
  if (!id) return null;
  const direct = guild.channels && guild.channels.cache ? guild.channels.cache.get(id) : null;
  if (direct) return direct;
  const name = id.toLowerCase();
  const list = (guild.channels && guild.channels.cache ? [...guild.channels.cache.values()] : []);
  return list.find((c) => c && c.name && c.name.toLowerCase() === name && typeof c.send === 'function') || null;
}

function fail(message, code) {
  const e = new Error(message);
  e.code = code || 'RULES_ERROR';
  return e;
}

// Le payload exact (extrait pour être testé sans bot ni réseau).
function buildPanel(t, botId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hxrules:${botId}:accept`)
      .setLabel(t.button || "J'accepte les règles")
      .setEmoji('✅')
      .setStyle(RULES_STYLES[t.style] || ButtonStyle.Success),
  );
  // ui.v2panel s'occupe des séparateurs entre paragraphes et de l'audit des
  // plafonds Discord (titre, budget de texte, nombre de composants).
  return ui.v2panel({
    color: t.color,
    title: `📜 ${t.title}`,
    description: t.body,
    footer: t.footer || false,
  }, [row]);
}

// ------------------------------------------------------------
// Publication : mise à jour du panneau suivi, sinon nouvel envoi
// ------------------------------------------------------------
async function sendPanel(botId, guild, channelId) {
  const cfg = cfgOf(guild.id);
  const lang = i18n.langForGuild(guild.id);
  const target = channelFor(guild, channelId || cfg.channel);
  if (!target) throw fail(i18n.t(lang, 'rules_no_channel'), 'NO_CHANNEL');
  const roleSuivi = cfg.role && guild.roles && guild.roles.cache ? guild.roles.cache.get(cfg.role) : null;
  const t = texts(cfg, lang, {
    serveur: guild.name || 'le serveur',
    role: roleSuivi ? `@${roleSuivi.name}` : '—',
    rôle: roleSuivi ? `@${roleSuivi.name}` : '—',
    membres: String(stateOf(guild.id).count),
  });
  const payload = buildPanel(t, botId);

  // Déjà un panneau suivi sur ce serveur → on le met à jour.
  if (cfg.panel_message && cfg.panel_channel) {
    const previous = channelFor(guild, cfg.panel_channel);
    const message = previous && previous.messages
      ? await previous.messages.fetch(cfg.panel_message).catch(() => null) : null;
    if (message) {
      await message.edit(payload).catch(() => null);
      if (String(previous.id) !== String(target.id)) {
        // Le salon a changé : l'ancien message est retiré, le nouveau part ailleurs.
        await message.delete().catch(() => {});
      } else {
        saveCfg(guild.id, { panel_message: message.id, panel_channel: previous.id });
        return { mode: 'edit', message };
      }
    } else {
      saveCfg(guild.id, { panel_message: '', panel_channel: '' });
    }
  }
  const sent = await target.send(payload);
  saveCfg(guild.id, {
    panel_message: sent.id,
    panel_channel: sent.channel.id,
    channel: String(cfg.channel || sent.channel.id),
  });
  logging.log(botId, guild, {
    title: '📜 Panneau de règles publié', color: t.color, type: 'other',
    fields: [
      { name: '📣 Salon', value: `#${sent.channel.name || sent.channel.id}`, inline: true },
      { name: '🏷️ Rôle donné', value: cfg.role ? '<@&' + cfg.role + '>' : 'aucun', inline: true },
    ],
  });
  return { mode: 'send', message: sent };
}

async function deletePanel(botId, guild) {
  const cfg = cfgOf(guild.id);
  if (!cfg.panel_message || !cfg.panel_channel) return { mode: 'none' };
  const channel = channelFor(guild, cfg.panel_channel);
  const message = channel && channel.messages
    ? await channel.messages.fetch(cfg.panel_message).catch(() => null) : null;
  if (message) await message.delete().catch(() => {});
  saveCfg(guild.id, { panel_message: '', panel_channel: '' });
  return { mode: message ? 'deleted' : 'forgotten' };
}

// ------------------------------------------------------------
// Acceptations
// ------------------------------------------------------------
function stateOf(guildId) {
  let raw = { count: 0, last_at: 0, members: [] };
  try {
    const parsed = JSON.parse(store.settings.get(`rules_state:${guildId}`) || '{}') || {};
    raw = { ...raw, ...parsed };
  } catch {}
  if (!Array.isArray(raw.members)) raw.members = [];
  raw.count = Number(raw.count) || 0;
  raw.last_at = Number(raw.last_at) || 0;
  raw.members = raw.members.slice(0, HISTORY_CAP);
  return raw;
}

function noteAcceptation(guildId, user) {
  const state = stateOf(guildId);
  const id = String(user.id);
  const others = state.members.filter((m) => String(m.id) !== id);
  const entry = {
    id,
    tag: String(user.tag || user.username || id).slice(0, 80),
    at: Date.now(),
  };
  const members = [entry, ...others].slice(0, HISTORY_CAP);
  store.settings.set(`rules_state:${guildId}`, JSON.stringify({
    count: Math.max(state.count, members.length), last_at: entry.at, members,
  }));
  return entry;
}

function resetAcceptations(guildId) {
  store.settings.set(`rules_state:${guildId}`, JSON.stringify({ count: 0, last_at: 0, members: [] }));
  return true;
}

// Qui n'a PAS le rôle alors que le panneau est en ligne (liste d'appel).
async function missingMembers(botId, guild, limit = 200) {
  const cfg = cfgOf(guild.id);
  const roleId = String(cfg.role || '');
  if (!roleId) return { error: 'Aucun rôle d\'acceptation n\'est configuré.' };
  const role = guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
  if (!role) return { error: 'Le rôle configuré est introuvable sur ce serveur.' };
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return { error: 'Le serveur n\'est pas encore chargé, réessayez dans une minute.' };
  const cap = Math.max(1, Math.min(Number(limit) || 200, 500));
  const out = [];
  for (const member of members.values()) {
    if (out.length >= cap) break;
    if (!member || !member.roles || !member.roles.cache || member.roles.cache.has(role.id)) continue;
    if (member.user && member.user.bot) continue;
    out.push({
      id: member.id,
      tag: (member.user && (member.user.tag || member.user.username)) || member.id,
      joined: member.joinedTimestamp || 0,
    });
  }
  return { total: out.length, role: role.name, members: out };
}

// ------------------------------------------------------------
// Clic sur « J'accepte les règles »
// ------------------------------------------------------------
async function handleButton(botId, interaction) {
  const cid = String(interaction.customId || '');
  if (!cid.startsWith('hxrules:')) return false;
  const guild = interaction.guild;
  const member = interaction.member;
  const lang = guild ? i18n.langForGuild(guild.id) : 'fr';
  const say = (content) => interaction.reply({ content, ephemeral: true }).catch(() => {});
  if (!guild || !member) { await say(i18n.t(lang, 'rules_need_guild')); return true; }

  const cfg = cfgOf(guild.id);
  if (!cfg.enabled) { await say(i18n.t(lang, 'rules_off')); return true; }

  const roleId = String(cfg.role || '');
  const role = roleId && guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
  const vars = {
    serveur: guild.name || 'le serveur',
    role: role ? `@${role.name}` : '—',
    membres: String(stateOf(guild.id).count),
  };

  const already = !!(member.roles && member.roles.cache && role && member.roles.cache.has(role.id));
  if (already) {
    noteAcceptation(guild.id, member.user || { id: member.id, tag: member.displayName });
    await say(fill(cfg.thanks || i18n.t(lang, 'rules_already'), vars));
    return true;
  }

  if (roleId && !role) { await say(i18n.t(lang, 'rules_no_role')); return true; }

  if (role) {
    const me = guild.members && guild.members.me;
    const canManage = !!me && (typeof me.permissions?.has !== 'function' || me.permissions.has(F.ManageRoles) || me.permissions.has(F.Administrator));
    if (!canManage) { await say(i18n.t(lang, 'rules_no_manage_roles')); return true; }
    const highest = me && me.roles && me.roles.highest ? me.roles.highest.position : 0;
    if (role.managed) { await say(i18n.t(lang, 'rules_managed_role')); return true; }
    if (!(role.position < highest)) { await say(fill(i18n.t(lang, 'rules_role_position'), { role: role.name })); return true; }
    try {
      await member.roles.add(role, 'Règles du serveur acceptées');
    } catch {
      await say(fill(i18n.t(lang, 'rules_grant_failed'), { role: role.name }));
      return true;
    }
  }

  const entry = noteAcceptation(guild.id, interaction.user || { id: member.id, tag: member.displayName });
  await say(fill(cfg.thanks || i18n.t(lang, 'rules_thanks'), vars));
  const logChannel = channelFor(guild, cfg.log_channel) || logging.logChannel(botId, guild);
  if (logChannel) {
    logChannel.send({
      content: `📜 **Règles acceptées** — ${interaction.user ? interaction.user.toString() : `<@${entry.id}>`} · ${role ? 'rôle @' + role.name : 'sans rôle'}`,
    }).catch(() => {});
  }
  return true;
}

// Récap pour le tableau de bord (payload du serveur).
function summary(guildId) {
  const cfg = cfgOf(guildId);
  const state = stateOf(guildId);
  return {
    ...cfg,
    accepts: state.count,
    last_at: state.last_at,
    recent: state.members.slice(0, 12),
    presets: presets(),
    default_preset: DEFAULT_PRESET,
  };
}

module.exports = {
  TITLE_MAX, BODY_MAX, BUTTON_MAX, FOOTER_MAX, HISTORY_CAP, COLOR_DEFAULT, DEFAULT_PRESET, PRESETS,
  cfgOf, saveCfg, texts, buildPanel, channelFor,
  sendPanel, deletePanel, handleButton,
  stateOf, noteAcceptation, resetAcceptations, missingMembers, summary, presets, fill,
};
