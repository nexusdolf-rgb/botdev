// ============================================================
// BotDev - Niveaux (XP) : gain en discutant, annonces de niveau,
// rôles de récompense, tout est configurable par serveur.
// ============================================================
const store = require('../db');
const { EmbedBuilder } = require('discord.js');
const ui = require('./ui');

// Progression : niveau N nécessite 100*N² XP
function xpForLevel(level) {
  return 100 * level * level;
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function resolveRole(guild, nameOrId) {
  const q = String(nameOrId || '').trim();
  if (!q) return null;
  const id = q.replace(/[<@&>]/g, '');
  if (/^\d{15,21}$/.test(id)) {
    const byId = guild.roles.cache.get(id);
    if (byId) return byId;
  }
  return guild.roles.cache.find((r) => r.name.toLowerCase() === q.toLowerCase()) || null;
}

function resolveChannel(guild, query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) {
    const c = guild.channels.cache.get(idMatch[1]);
    if (c) return c;
  }
  const name = q.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find((c) => c.name && c.name.toLowerCase() === name && c.isTextBased && c.isTextBased()) || null;
}

// ============================================================
// v214 — Rôles de niveau « en échelle » : chaque niveau configuré
// possède son rôle. Atteindre un palier donne SON rôle et RETIRE les
// rôles des paliers inférieurs : le membre ne porte que son rang actuel.
// ============================================================

// Calcule l'objectif de rôle pour un niveau donné : le rôle du dernier
// palier atteint + les rôles de palier inférieurs qui doivent être retirés.
function computeRankGoal(rewards, level) {
  const list = (Array.isArray(rewards) ? rewards : [])
    .filter((r) => r && String(r.role || '').trim())
    .map((r) => ({ level: Math.max(1, parseInt(r.level, 10) || 1), role: String(r.role).trim() }))
    .sort((a, b) => a.level - b.level);
  let target = null;
  for (const r of list) if (r.level <= Number(level)) target = r;
  return {
    add: target ? target.role : null,
    remove: target ? list.filter((r) => r.level < target.level).map((r) => r.role) : [],
    targetLevel: target ? target.level : 0,
  };
}

// Applique le rôle de rang à un membre (ajout + retraits), en respectant la
// hiérarchie Discord. Renvoie les compteurs d'actions réellement effectuées.
async function applyRankToMember(botId, guild, member, level, rewards) {
  const out = { added: 0, removed: 0, changed: false };
  try {
    const roles = Array.isArray(rewards) ? rewards : store.xpRoles.all(botId, guild.id);
    if (!roles.length || !member || member.user && member.user.bot) return out;
    if (!member.roles || !member.roles.cache) return out;
    const goal = computeRankGoal(roles, Number(level) || 0);
    if (!goal.add) return out;
    const me = guild.members && guild.members.me ? guild.members.me : null;
    const target = resolveRole(guild, goal.add);
    if (!target) return out;
    if (me && me.roles && me.roles.highest && target.position >= me.roles.highest.position) return out;
    if (!member.roles.cache.has(target.id)) {
      await member.roles.add(target).catch(() => {});
      out.added = 1;
      out.changed = true;
    }
    for (const name of goal.remove) {
      if (name === goal.add) continue;
      const lower = resolveRole(guild, name);
      if (!lower || lower.id === target.id) continue;
      if (me && me.roles && me.roles.highest && lower.position >= me.roles.highest.position) continue;
      if (member.roles.cache.has(lower.id)) {
        await member.roles.remove(lower).catch(() => {});
        out.removed += 1;
        out.changed = true;
      }
    }
  } catch (e) {
    console.error('[Hoxera] rôle de niveau :', e.message);
  }
  return out;
}

// Appelé à chaque message. Retourne true si de l'XP a été gagnée.
async function onMessage(botId, message) {
  if (!message || message.author.bot || !message.guild) return false;
  const gs = store.guildSettings.get(botId, message.guild.id) || {};
  if (gs.xp_enabled === 0) return false;

  const now = Date.now();
  const row = store.xp.get(botId, message.guild.id, message.author.id);
  const cooldown = Math.max(0, Number(gs.xp_cooldown ?? 60)) * 1000;
  if (row && row.last_ts && now - row.last_ts < cooldown) return false;

  const rawMin = Number(gs.xp_min ?? 10);
  const rawMax = Number(gs.xp_max ?? 25);
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  const amount = Math.floor(min + Math.random() * (max - min + 1));

  const newXp = (row ? row.xp : 0) + amount;
  const newLevel = levelFromXp(newXp);
  const oldLevel = row ? (row.level || 0) : 0;

  store.xp.add(botId, message.guild.id, message.author.id, amount, now);

  if (newLevel > oldLevel) {
    store.xp.setLevel(botId, message.guild.id, message.author.id, newLevel);
    await announce(botId, message, newLevel, gs, oldLevel);
    await applyRewards(botId, message, newLevel);
  }
  return true;
}

async function announce(botId, message, level, gs, oldLevel = 0) {
  const template = String(gs.xp_message || '').trim() || '{user} vient d\'atteindre le **niveau {level}** ! 🎉';
  const text = template
    .replace(/\{user\}/g, `<@${message.author.id}>`)
    .replace(/\{level\}/g, String(level))
    .replace(/\{server\}/g, message.guild.name)
    .slice(0, 4096);
  let channel = null;
  // ⚠️ resolveChannel est ASYNCHRONE : sans await, on recevait une promesse
  // (sans .send) → l'annonce partait toujours dans le salon du message.
  if (gs.xp_channel) channel = await resolveChannel(message.guild, gs.xp_channel);
  channel = channel || message.channel;
  if (!channel || typeof channel.send !== 'function') return;

  // 🎉 Annonce de niveau en EMBED soigné (v209) : ton texte personnalisé
  // reste la description ({user}, {level}, {server}…), on y ajoute la
  // progression, le rang et la récompense de rôle débloquée.
  const row = store.xp.get(botId, message.guild.id, message.author.id) || { xp: 0 };
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const pct = next > cur ? Math.max(0, Math.min(1, (row.xp - cur) / (next - cur))) : 0;
  const bars = 12;
  const bar = '▰'.repeat(Math.round(pct * bars)) + '▱'.repeat(bars - Math.round(pct * bars));
  let pos = 0;
  try { pos = store.xp.rankOf(botId, message.guild.id, message.author.id) || 0; } catch {}
  let reward = '';
  try {
    // v214 : le rôle annoncé est celui du palier FRANCHI (même en sautant
    // plusieurs niveaux d'un coup : ex 3 → 6 avec un palier à 5).
    const rewards = store.xpRoles.all(botId, message.guild.id) || [];
    let crossed = null;
    for (const r of rewards) {
      if (Number(r.level) > Number(oldLevel) && Number(r.level) <= Number(level)) crossed = r;
    }
    if (crossed) {
      const role = resolveRole(message.guild, crossed.role);
      if (role) reward = role.toString();
    }
  } catch {}

  const user = message.author || {};
  const avatarUrl = (typeof user.displayAvatarURL === 'function')
    ? user.displayAvatarURL({ extension: 'png', size: 256 }) : '';
  const authorName = `${user.username || user.tag || 'Membre'} 🎉`;
  const authorOpts = { name: authorName };
  if (avatarUrl) authorOpts.iconURL = avatarUrl;
  // ⛔ EXCLUSION VOLONTAIRE de la migration Components V2 (v232) — et elle est
  // DOCUMENTÉE, pas oubliée.
  //
  // Ce message est envoyé par identity.sendAsProfile(), qui passe par un
  // WEBHOOK (pour afficher le nom et l'avatar personnalisés du bot). Or la doc
  // officielle Discord (Webhook Resource, Execute Webhook) est explicite :
  //   « When the flag IS_COMPONENTS_V2 is set, the webhook message can only
  //    contain components. Providing content, embeds, files[n] or poll will
  //    fail with a 400 BAD REQUEST response »
  // Ce message transporte la CARTE DE NIVEAU en pièce jointe
  // (attachment://levelup.png). En V2 via webhook → 400 BAD REQUEST, puis
  // repli silencieux sur channel.send() : le message partirait, mais SANS le
  // nom et l'avatar personnalisés. On perdrait donc une fonctionnalité produit
  // pour un détail cosmétique.
  //
  // Un webhook « application-owned » (créé par le bot, ce qui est le cas ici
  // via channel.createWebhook) accepte bien les composants V2 — mais pas avec
  // des fichiers. Les messages V2 SANS pièce jointe qui passent par
  // sendAsProfile restent donc migrables.
  //
  // Le trait reste ici un trait TEXTE. Pour le rendre pleine largeur il
  // faudrait soit renoncer à la carte de niveau, soit renoncer à l'identité
  // personnalisée : les deux sont des décisions produit, pas techniques.
  const embed = new EmbedBuilder()
    .setColor('#e07a5f')
    .setAuthor(authorOpts)
    .setDescription(ui.sectionize(text))
    .addFields(
      { name: '✨ XP', value: `${Math.max(row.xp || 0, cur)} / ${next}`, inline: true },
      { name: '🏆 Rang', value: pos ? `#${pos}` : '—', inline: true },
      ...(reward ? [{ name: '🎁 Rôle débloqué', value: reward, inline: true }] : []),
      { name: 'Progression', value: `${bar} ${Math.round(pct * 100)}%` },
    )
    .setFooter({ text: `Hoxera · ${message.guild.name}` })
    .setTimestamp();
  // 🖼️ Carte de montée de niveau (v210) : image avatar + niveau + barre de
  // progression, option activée par défaut — jamais bloquante : si la
  // génération échoue (ou option désactivée), l'embed part seul.
  let files = [];
  const cardEnabled = !(gs.xp_card === 0 || gs.xp_card === false);
  if (cardEnabled) {
    try {
      const community = require('./community');
      const buf = await community.levelUpCard({
        avatarUrl, name: user.username || user.tag || 'Membre',
        server: message.guild.name, level, pct,
      });
      if (buf && buf.length) {
        files = [{ attachment: buf, name: 'levelup.png' }];
        embed.setImage('attachment://levelup.png');
      }
    } catch (e) { console.error('[Hoxera] carte de niveau :', e.message); }
  }
  const identity = require('./identity');
  await identity.sendAsProfile(message.client, botId, message.guild, channel, { embeds: [embed], files }).catch(() => {});
}

async function applyRewards(botId, message, level) {
  const member = message.member;
  if (!member || !member.guild) return;
  await applyRankToMember(botId, message.guild, member, level, store.xpRoles.all(botId, message.guild.id));
}

// ============================================================
// v249 — XP VOCALE : gagner de l'XP en restant dans un salon vocal.
//
// Comme Arcane, Hoxera n'ENTRE PAS dans les salons vocaux : ce serait coûteux,
// limitrait le suivi à un seul salon à la fois, et la documentation d'Arcane
// parle elle-même de « cauchemar de confidentialité ». On écoute l'événement
// Discord voiceStateUpdate, qui indique déjà qui est où, et si le membre est
// muet ou sourd. C'est exactement la méthode des bots du marché.
//
// L'XP gagnée alimente la MÊME table `xp` que l'XP des messages (choix du
// propriétaire) : un seul niveau, un seul classement, les mêmes rôles de
// récompense.
//
// Réglages par défaut, alignés sur Arcane et PeakBot (vérifié dans leur doc) :
//   10 XP par minute · versement toutes les 3 minutes · 2 membres minimum dans
//   le salon · muets/sourds exclus · salon AFK exclu · réduction après 4 h.
// Désactivé par défaut : aucun serveur déjà équipé ne doit voir son rythme de
// progression changer sans l'avoir demandé.
// ============================================================

// Sessions vocales en cours, en mémoire uniquement.
//
// Volontairement NON persistées : au redémarrage du bot, on repart de zéro et
// le premier versement n'intervient qu'après un intervalle complet de présence
// réellement observée. Persister ferait verser de l'XP pour une absence.
// clé : `${botId}:${guildId}:${userId}`
const sessionsVocales = new Map();

const cleSession = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;

// Pas du suivi. 30 s : assez fin pour qu'un départ soit repéré vite, assez
// large pour que le coût reste négligeable même sur un gros serveur.
const BATTEMENT_MS = 30000;

// Types de salons vocaux Discord.
const TYPE_VOCAL = 2;        // GuildVoice
const TYPE_SCENE = 13;       // GuildStageVoice

// Seuils du lissage anti-AFK, en heures de présence continue.
const PALIER_LENT = 4;       // au-delà : moitié
const PALIER_NUL = 8;        // au-delà : plus rien

// ------------------------------------------------------------
// Événement Discord : quelqu'un rejoint, quitte ou change de salon vocal.
// ------------------------------------------------------------
function onVoiceState(botId, oldState, newState) {
  try {
    const st = newState || oldState;
    const member = st && st.member;
    if (!member || !member.id) return;
    if (member.user && member.user.bot) return;          // un bot ne farme pas
    const guild = st.guild;
    if (!guild || !guild.id) return;

    const cle = cleSession(botId, guild.id, member.id);
    const channelId = newState ? newState.channelId : null;

    // Déconnexion vocale : la session s'arrête. On ne verse rien au prorata —
    // les versements ont déjà eu lieu toutes les N minutes.
    if (!channelId) { sessionsVocales.delete(cle); return; }

    const existante = sessionsVocales.get(cle);
    if (existante) {
      // Changement de salon : même session. On conserve startedAt pour que le
      // lissage anti-AFK continue de s'appliquer, et on ne réinitialise PAS
      // lastGrantAt — sauter d'un salon à l'autre ne doit pas accélérer le gain.
      existante.channelId = channelId;
      existante.guild = guild;
      return;
    }
    sessionsVocales.set(cle, {
      botId, guild, userId: member.id, channelId,
      startedAt: Date.now(),
      lastGrantAt: Date.now(),   // le 1er versement demande un intervalle complet
    });
    demarrerSuivi();
  } catch (e) {
    console.error('[Hoxera] XP vocale (état) :', (e && e.message) || e);
  }
}

// ------------------------------------------------------------
// Le membre est-il en train de mériter de l'XP, là, maintenant ?
// Renvoie { ok, why } — le motif sert au tableau de bord de diagnostic.
// ------------------------------------------------------------
function qualifierVocal(session, gs) {
  const guild = session.guild;
  if (!guild || guild.available === false) return { ok: false, why: 'serveur indisponible', mort: true };
  const cache = guild.members && guild.members.cache;
  const member = cache ? cache.get(session.userId) : null;
  if (!member) return { ok: false, why: 'membre introuvable', mort: true };
  if (member.user && member.user.bot) return { ok: false, why: 'bot', mort: true };

  const voice = member.voice;
  if (!voice || !voice.channelId) return { ok: false, why: 'plus en vocal', mort: true };

  const channel = voice.channel
    || (guild.channels && guild.channels.cache ? guild.channels.cache.get(voice.channelId) : null);
  if (!channel) return { ok: false, why: 'salon introuvable' };
  if (channel.type !== TYPE_VOCAL && channel.type !== TYPE_SCENE) return { ok: false, why: 'salon non vocal' };

  if (gs.voice_xp_ignore_afk !== 0 && guild.afkChannelId && channel.id === guild.afkChannelId) {
    return { ok: false, why: 'salon AFK' };
  }
  // Muet OU sourd, par soi-même ou par le serveur : les quatre sont testés,
  // comme le fait Arcane (« unmuted and not deaf »). Sans ça, il suffit de
  // laisser un salon ouvert en coupant son micro pour farmer.
  if (gs.voice_xp_ignore_muted !== 0
    && (voice.selfMute || voice.selfDeaf || voice.serverMute || voice.serverDeaf)) {
    return { ok: false, why: 'muet ou sourd' };
  }

  const min = Math.max(1, Number(gs.voice_xp_min_members ?? 2));
  let humains = 0;
  if (channel.members && typeof channel.members.forEach === 'function') {
    channel.members.forEach((m) => { if (!m.user || !m.user.bot) humains += 1; });
  }
  if (humains < min) return { ok: false, why: `trop peu nombreux (${humains}/${min})`, humains };

  session.channelId = channel.id;   // resynchronise après un déplacement
  return { ok: true, member, humains };
}

// ------------------------------------------------------------
// Lissage anti-AFK : au-delà de plusieurs heures d'affilée, le gain diminue puis
// s'arrête. Reprend le comportement d'Arcane, qui « commence à réduire l'XP
// après plusieurs heures dans une même session ».
// ------------------------------------------------------------
function coefficientAntiAfk(session, gs, now) {
  if (gs.voice_xp_taper === 0) return 1;
  const heures = (now - session.startedAt) / 3600000;
  if (heures >= PALIER_NUL) return 0;
  if (heures >= PALIER_LENT) return 0.5;
  return 1;
}

// ------------------------------------------------------------
// Versement. Construit un contexte « façon message » parce que announce() et
// applyRewards() lisent .author, .guild, .member, .client et .channel.
//
// En vocal il n'y a PAS de message, donc pas de salon évident où annoncer. On
// utilise le salon d'annonce déjà configuré pour les niveaux (xp_channel). S'il
// n'y en a pas, announce() s'arrête proprement sur son test `channel.send` :
// mieux vaut ne rien dire que d'envoyer le niveau atteint dans un salon texte
// au hasard. Les rôles de récompense, eux, sont toujours appliqués.
// ------------------------------------------------------------
async function verserXpVocale(botId, session, montant, guild, member) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  const row = store.xp.get(botId, guild.id, member.id);
  const oldLevel = row ? (row.level || 0) : 0;
  const newXp = (row ? row.xp : 0) + montant;
  const newLevel = levelFromXp(newXp);

  store.xp.add(botId, guild.id, member.id, montant, Date.now());

  if (newLevel > oldLevel) {
    store.xp.setLevel(botId, guild.id, member.id, newLevel);
    let channel = null;
    try { channel = gs.xp_channel ? await resolveChannel(guild, gs.xp_channel) : null; } catch { channel = null; }
    const contexte = { client: guild.client, guild, member, author: member.user, channel };
    await announce(botId, contexte, newLevel, gs, oldLevel);
    await applyRewards(botId, contexte, newLevel);
  }
  return { niveau: newLevel, monte: newLevel > oldLevel };
}

// ------------------------------------------------------------
// Un pas du suivi : parcourt les sessions et verse ce qui est dû.
// Exporté pour les tests — c'est le cœur de la fonction.
// ------------------------------------------------------------
async function battement(now = Date.now()) {
  const rapport = { sessions: sessionsVocales.size, examinees: 0, versements: 0, xp: 0, niveaux: 0, refus: {} };
  const refuser = (pourquoi) => { rapport.refus[pourquoi] = (rapport.refus[pourquoi] || 0) + 1; };

  for (const [cle, session] of [...sessionsVocales]) {
    try {
      const guild = session.guild;
      if (!guild || !guild.id) { sessionsVocales.delete(cle); continue; }
      const gs = store.guildSettings.get(session.botId, guild.id) || {};
      if (gs.voice_xp_enabled !== 1) { refuser('xp vocale désactivée'); continue; }
      // Le module niveaux coupé coupe toutes les sources d'XP, vocale comprise :
      // sinon on continuerait à faire monter des niveaux sur un serveur qui a
      // explicitement désactivé les niveaux.
      if (gs.xp_enabled === 0) { refuser('module niveaux désactivé'); continue; }

      const minutes = Math.max(1, Number(gs.voice_xp_interval ?? 3));
      const intervalle = minutes * 60000;
      if (now - session.lastGrantAt < intervalle) continue;   // pas encore l'heure

      rapport.examinees += 1;
      const q = qualifierVocal(session, gs);
      if (!q.ok) {
        refuser(q.why);
        // Session morte (membre parti sans événement, bot expulsé…) : on la
        // retire, sinon la carte grossit indéfiniment.
        if (q.mort) sessionsVocales.delete(cle);
        // On ne réinitialise PAS lastGrantAt : le temps non qualifié est mis en
        // pause, pas perdu. Un membre qui coupe son micro 2 h puis le rallume
        // reçoit son versement dès qu'il redevient éligible — un seul, pas
        // deux heures d'un coup, puisque le montant dépend de l'intervalle.
        continue;
      }

      const coef = coefficientAntiAfk(session, gs, now);
      const brut = Math.max(0, Number(gs.voice_xp_rate ?? 10)) * minutes * coef;
      const montant = Math.floor(brut);
      session.lastGrantAt = now;      // l'horloge avance même si le montant est nul
      if (montant <= 0) { refuser('lissage anti-AFK à zéro'); continue; }

      const r = await verserXpVocale(session.botId, session, montant, guild, q.member);
      rapport.versements += 1;
      rapport.xp += montant;
      if (r.monte) rapport.niveaux += 1;
    } catch (e) {
      console.error('[Hoxera] XP vocale (versement) :', (e && e.message) || e);
    }
  }
  return rapport;
}

// ------------------------------------------------------------
// Minuteur du suivi. Démarré à la volée au premier événement vocal, et non au
// chargement du module : un processus sans bot connecté n'a pas besoin d'un
// battement toutes les 30 s. unref() pour ne pas retenir le processus ouvert.
// ------------------------------------------------------------
let minuteur = null;
function demarrerSuivi() {
  if (minuteur) return minuteur;
  minuteur = setInterval(() => {
    battement().catch((e) => console.error('[Hoxera] XP vocale (battement) :', (e && e.message) || e));
  }, BATTEMENT_MS);
  if (typeof minuteur.unref === 'function') minuteur.unref();
  return minuteur;
}
function arreterSuivi() {
  if (minuteur) { clearInterval(minuteur); minuteur = null; }
}

// Oublie toutes les sessions d'un bot (déconnexion, suppression du bot) : sans
// ça le suivi continuerait de verser de l'XP pour un client qui n'existe plus.
function oublierBot(botId) {
  let n = 0;
  for (const [cle, session] of [...sessionsVocales]) {
    if (session.botId === botId || cle.startsWith(`${botId}:`)) { sessionsVocales.delete(cle); n += 1; }
  }
  return n;
}

module.exports = {
  xpForLevel, levelFromXp, onMessage, computeRankGoal, applyRankToMember, resolveRole,
  // v249 — XP vocale
  onVoiceState, battement, qualifierVocal, coefficientAntiAfk, verserXpVocale,
  demarrerSuivi, arreterSuivi, oublierBot, sessionsVocales, cleSession,
  BATTEMENT_MS, PALIER_LENT, PALIER_NUL,
};
