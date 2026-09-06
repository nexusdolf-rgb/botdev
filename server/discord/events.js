// ============================================================
// BotDev - Événements (bienvenue, départ, auto-rôle)
// ============================================================
const { EmbedBuilder } = require('discord.js');
const ui = require('./ui');
const store = require('../db');
const { resolveVariables } = require('./engine');
const identity = require('./identity');
const logging = require('./logging');

const EVENT_DEFS = {
  member_join: {
    label: 'Message de bienvenue',
    emoji: '👋',
    description: 'Envoie un message quand un membre rejoint le serveur.',
    config: [
      { key: 'channel', label: 'Salon d\'accueil', type: 'channel', placeholder: '#bienvenue' },
      // v241 — le titre du panneau dit déjà « 👋 Bienvenue sur {serveur} ! » et
      // la rubrique « 👥 Membre n° » porte déjà le compteur : le corps n'a plus
      // à les répéter. Il ne reste que la phrase chaleureuse.
      { key: 'message', label: 'Message ({user}, {server}, {count}…)', type: 'multiline', default: "Passez un bon moment parmi nous — l'équipe est là pour vous aider ! 🚀" },
      { key: 'card', label: '🖼️ Carte de bienvenue en image (avatar + pseudo)', type: 'checkbox', default: false },
      { key: 'plain', label: '📝 Mode texte simple (désactive le panneau premium)', type: 'checkbox', default: false },
      { key: 'color', label: 'Couleur de l\'embed', type: 'color', default: '#57F287' },
      { key: 'image', label: 'Image de l\'embed (URL, optionnel)', type: 'text', placeholder: 'https://…' },
      { key: 'channels', label: '📌 Salons à détailler (règles, tickets, chat général…) — une phrase par salon, utilisez {channels} dans le message', type: 'channelsmulti', default: '' },
    ],
  },
  member_leave: {
    label: 'Message de départ',
    emoji: '👋',
    description: 'Envoie un message quand un membre quitte le serveur.',
    config: [
      { key: 'channel', label: 'Salon des départs', type: 'channel', placeholder: '#au-revoir' },
      // v241 — l'en-tête dit déjà « {pseudo} s'en va… » : le corps ne le répète pas.
      { key: 'message', label: 'Message', type: 'multiline', default: 'Merci d\'avoir fait partie de {server} 💛' },
      { key: 'plain', label: '📝 Mode texte simple (désactive le panneau premium)', type: 'checkbox', default: false },
      { key: 'color', label: 'Couleur de l\'embed', type: 'color', default: '#ED4245' },
      { key: 'image', label: 'Image de l\'embed (URL, optionnel)', type: 'text', placeholder: 'https://…' },
      { key: 'channels', label: '📌 Salons à mentionner — utilisez {channels} dans le message', type: 'channelsmulti', default: '' },
    ],
  },
  autorole: {
    label: 'Auto-rôle',
    emoji: '🏷️',
    description: 'Donne automatiquement un ou PLUSIEURS rôles aux nouveaux membres.',
    config: [
      { key: 'roles', label: 'Rôles à donner automatiquement (plusieurs possibles)', type: 'rolesmulti', placeholder: 'Membre, Nouveau' },
      { key: 'role', label: 'Ancien réglage (un seul rôle — laisser vide si la liste ci-dessus est utilisée)', type: 'role', placeholder: 'Membre' },
    ],
  },
};

function eventsState(botId, guildId) {
  const rows = store.events.all(botId, guildId);
  const out = {};
  for (const key of Object.keys(EVENT_DEFS)) {
    out[key] = rows[key] || { enabled: false, config: {} };
  }
  return out;
}

async function runJoinEvent(botId, member, opts = {}) {
  const trace = (msg) => console.log(`[Hoxera] 👋 arrivée ${member.id} : ${msg}`);
  const state = store.events.all(botId, member.guild.id);
  const botRecord = store.bots.get(botId);

  // 📈 Statistiques : nouveaux membres du jour (pas en mode test)
  if (!opts.test) {
    try {
      store.joinStats.bump(botId, member.guild.id, new Date().toISOString().slice(0, 10));
    } catch (e) { console.error('[Hoxera] join stats:', e.message); }
  }

  // 🛡️ Bouclier anti-raid : compteur d'arrivées + déclenchement éventuel
  if (!opts.test) {
    try {
      const antiraid = require('./antiraid');
      await antiraid.onJoin(botId, member);
    } catch (e) { console.error('[Hoxera] anti-raid join:', e.message); }
  }

  if (state.member_join && state.member_join.enabled) {
    const cfg = state.member_join.config || {};
    const channel = await resolveChannel(member.guild, cfg.channel);
    trace(`bienvenue activée · salon « ${cfg.channel || ''} » → ${channel ? '#' + channel.name : 'INTROUVABLE ❌'}`);
    if (channel) {
      const channelsMention = await channelMentions(member.guild, cfg.channels, resolveChannel);
      const text = autoMentionChannels(member.guild, render(member, botRecord, cfg.message, { channelsMention }));
      // Limites Discord : description d'embed 4096, contenu texte 2000.
      // v240 — 🚨 `ui.sectionize()` est SUPPRIMÉ d'ici. Il collait des traits
      // TEXTE « ━ » de 20 caractères entre les paragraphes : sur Discord un
      // trait texte s'arrête avant les bords arrondis du panneau, donc il
      // paraît COURT à côté des séparateurs natifs pleine largeur de tous les
      // autres panneaux (migration v231→v236). C'est exactement le bug signalé
      // sur le modèle « ✨ bienvenue pro » — il n'apparaissait QUE quand la
      // carte de bienvenue était activée, parce que cette branche retombait sur
      // un embed classique.
      const finalContent = text.length > 2000 ? text.slice(0, 2000) : text;
      // 🖼️ Carte de bienvenue en image (avatar + pseudo) — jamais bloquante :
      // si la génération échoue, le message part sans image.
      let files = [];
      if (cfg.card) {
        try {
          const community = require('./community');
          const buf = await community.welcomeCard(member);
          if (buf && buf.length) files = [{ attachment: buf, name: 'bienvenue.png' }];
        } catch (e) { console.error('[Hoxera] carte de bienvenue :', e.message); }
      }
      if (!cfg.plain) {
        // 🏆 Panneau de bienvenue PREMIUM (par défaut — case « texte simple » pour l'ancien style) : avatar, n° de membre, âge du
        // compte, recruteur (traqueur d'invitations) — un vrai tableau pro.
        const user = member.user || {};
        const avatarUrl = user.displayAvatarURL ? user.displayAvatarURL({ size: 256 }) : '';
        const createdTs = user.createdTimestamp ? Math.floor(user.createdTimestamp / 1000) : 0;
        let invitedBy = '';
        try {
          const ij = store.inviteJoins.whoInvited(botId, member.guild.id, member.id);
          if (ij && ij.inviter_id) invitedBy = `<@${ij.inviter_id}>`;
        } catch {}
        // 👤 Un seul avatar : porté par le visuel (carte, image ou vignette),
        // jamais en author. Les 3 compteurs sont partagés par les 2 rendus.
        // v241 — le compteur de membres était écrit DEUX fois : dans le corps
        // (« Vous êtes le membre n°1287 ») et dans cette rubrique. On ne garde
        // la rubrique que si le message configuré ne contient pas déjà {count}.
        // L'intitulé est raccourci : « Vous êtes le membre » + « n°1287 » se
        // lisait comme une phrase coupée en deux.
        const compteDansTexte = String(cfg.message || '').includes('{count}');
        const welcomeFields = [
          ...(compteDansTexte ? [] : [{ name: '👥 Membre n°', value: `**${member.guild.memberCount || '?'}**`, inline: true }]),
          ...(createdTs ? [{ name: '📅 Compte créé', value: `<t:${createdTs}:R>`, inline: true }] : []),
          ...(invitedBy ? [{ name: '🎟️ Invité par', value: invitedBy, inline: true }] : []),
        ];
        // v236 — 🚨 La carte de bienvenue est une PIÈCE JOINTE envoyée par
        // webhook (identity.sendAsProfile). Or **Components V2 + webhook +
        // files = 400 BAD REQUEST** (documentation officielle Discord, ressource
        // Webhook : « When the flag IS_COMPONENTS_V2 is set, the webhook message
        // can only contain components. Providing content, embeds, files[n] or
        // poll will fail »). C'est exactement le piège n°10 qui a fait exclure
        // xp.js en v232.
        // → Le panneau reste en embed classique QUAND la carte image est
        //   activée, et passe en Components V2 SANS carte (réglage par défaut :
        //   `card` vaut false). Ses paragraphes sont alors séparés par un
        //   séparateur NATIF pleine largeur au lieu du trait texte ━.
        // v240 — UNE SEULE branche V2 au lieu de deux rendus différents.
        //
        // La seule contrainte : la carte de bienvenue est une PIÈCE JOINTE, et
        // **V2 + webhook + files = 400 BAD REQUEST** (piège n°10, doc officielle
        // Discord ressource Webhook). `identity.sendAsProfile()` passe par un
        // webhook dès qu'un profil d'envoi personnalisé est réglé sur ce
        // serveur, et par `channel.send()` sinon.
        //   • pas de carte            → V2, toujours (webhook ou non : pas de file)
        //   • carte + pas de webhook  → V2 + MediaGallery en `attachment://`
        //   • carte + webhook         → embed classique, seul cas restant
        // Dans ce dernier cas on n'ajoute AUCUN trait : un séparateur natif y
        // est impossible et un trait texte serait court et cassé. Les
        // paragraphes respirent par des lignes vides, comme partout ailleurs en
        // mode classique.
        const viaWebhook = !!((identity.effectiveProfile(botId, member.guild.id) || {}).name);
        const carteV2 = files.length && !viaWebhook;
        let welcomePayload;
        if (!files.length || carteV2) {
          welcomePayload = {
            ...ui.v2panel({
              color: cfg.color || '#57F287',
              author: { name: `${user.tag || user.username || 'Nouveau membre'} vient d'arriver !` },
              title: `👋 Bienvenue sur ${member.guild.name} !`,
              // `text` brut : ui.v2panel découpe lui-même les paragraphes et
              // pose les séparateurs NATIFS pleine largeur entre eux.
              description: text,
              fields: welcomeFields,
              // 🎴 La carte générée est une pièce jointe → MediaGallery en
              //    `attachment://` (en V2 une pièce jointe n'apparaît que si un
              //    composant la référence, piège n°18). Elle contient déjà
              //    l'avatar et le pseudo en grand : pas de vignette en plus.
              // 🖼️ Sinon : l'image configurée (URL HTTP), ou l'avatar en vignette.
              image: carteV2 ? 'attachment://bienvenue.png' : (cfg.image ? String(cfg.image).trim() : ''),
              thumbnail: !carteV2 && !cfg.image && avatarUrl ? avatarUrl : '',
              // L'iconURL du pied d'embed n'existe pas en V2 (pied en texte discret).
              footer: `Hoxera · ${member.guild.name}`,
            }),
            ...(carteV2 ? { files } : {}),
          };
        } else {
          const embed = new EmbedBuilder()
            .setColor(cfg.color || '#57F287')
            .setAuthor({ name: `${user.tag || user.username || 'Nouveau membre'} vient d'arriver !` })
            .setTitle(`👋 Bienvenue sur ${member.guild.name} !`)
            // Pas de ui.sectionize() : les paragraphes respirent par des lignes
            // vides. Un trait texte serait court (20 caractères) et s'arrêterait
            // avant les bords arrondis — exactement le bug corrigé en v240.
            .setDescription(ui.text(text, 4096))
            .addFields(...welcomeFields)
            // v241 — aligné sur le panneau premium : pied signé « Hoxera · … »
            // et PLUS d'horodatage (Discord affiche déjà l'heure du message).
            .setFooter({ text: `Hoxera · ${member.guild.name}`, iconURL: member.guild.iconURL ? (member.guild.iconURL({ size: 64 }) || undefined) : undefined })
            .setImage('attachment://bienvenue.png');
          welcomePayload = { embeds: [embed], files };
        }
        const ok = await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, welcomePayload).then(() => true).catch((e) => { trace('envoi panneau ÉCHOUÉ : ' + e.message); return false; });
        trace(ok ? 'panneau premium envoyé ✅' : 'panneau premium NON envoyé ❌ (permissions ?)');
      } else {
        const ok = await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { content: finalContent, files }).then(() => true).catch((e) => { trace('envoi texte ÉCHOUÉ : ' + e.message); return false; });
        trace(ok ? 'message texte envoyé ✅' : 'message texte NON envoyé ❌');
      }
      await logging.log(botId, member.guild, {
        title: '👋 Nouveau membre',
        description: `${(member.user && (member.user.tag || member.user.username)) || "Un membre"} a rejoint le serveur (membre n°${member.guild.memberCount || 0})`,
        color: '#57F287',
      });
    }
  }

  if (!opts.test && state.autorole && state.autorole.enabled) {
    const cfg = state.autorole.config || {};
    // 🏷️ v2.1 : PLUSIEURS rôles possibles (liste « roles » séparée par des
    // virgules) + compatibilité avec l'ancien réglage « role » (un seul).
    const wanted = parseRoleList(cfg);
    for (const name of wanted) {
      const role = member.guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (role && member.guild.members.me && role.position < member.guild.members.me.roles.highest.position) {
        await member.roles.add(role).catch(() => {});
      }
    }
  }
}

// 🏷️ Liste des rôles voulus par l'auto-rôle (fonction PURE, testable) :
// combine la liste multiple (cfg.roles, séparés par des virgules) et
// l'ancien réglage simple (cfg.role), sans doublons ni entrées vides.
function parseRoleList(cfg) {
  const out = [];
  const push = (v) => {
    const name = String(v || '').trim();
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  String((cfg && cfg.roles) || '').split(',').forEach(push);
  push(cfg && cfg.role);
  return out;
}

async function runLeaveEvent(botId, member, opts = {}) {
  const trace = (msg) => console.log(`[Hoxera] 👋 départ ${member.id} : ${msg}`);
  trace(`événement reçu (user: ${member.user ? 'ok' : 'ABSENT'}${member.partial ? ' · partiel' : ''})`);
  const state = store.events.all(botId, member.guild.id);
  const botRecord = store.bots.get(botId);
  if (!(state.member_leave && state.member_leave.enabled)) { trace('départ non activé'); return; }
  const cfg = state.member_leave.config || {};
  const channel = await resolveChannel(member.guild, cfg.channel);
  trace(`salon « ${cfg.channel || ''} » → ${channel ? '#' + channel.name : 'INTROUVABLE ❌'}`);
  if (!channel) return;
  const channelsMention = await channelMentions(member.guild, cfg.channels, resolveChannel);
  const text = autoMentionChannels(member.guild, render(member, botRecord, cfg.message, { channelsMention }));
      // v236 — le panneau de départ est en Components V2 : ui.v2panel découpe
      // lui-même les paragraphes et pose des séparateurs NATIFS pleine largeur.
      // `finalText` (ui.sectionize) n'a donc plus d'usage ici et a été retiré.
      // `finalContent` reste pour le mode « texte simple » (cfg.plain), qui
      // n'applique aucun séparateur.
      const finalContent = text.length > 2000 ? text.slice(0, 2000) : text;
  if (!cfg.plain) {
    // 🏆 Panneau de départ assorti (premium par défaut) au panneau de bienvenue (membre partiel
    // possible : chaque info est optionnelle, rien ne casse).
    const user = member.user || {};
    const avatarUrl = user.displayAvatarURL ? user.displayAvatarURL({ size: 256 }) : '';
    const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : 0;
    // v236 — panneau de départ en Components V2 : séparateurs NATIFS pleine
    // largeur entre les paragraphes. Contrairement à la bienvenue, le départ
    // n'envoie JAMAIS de pièce jointe (pas de carte image) → le webhook + V2 est
    // toujours valable ici, aucun branchement nécessaire.
    const ok = await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, ui.v2panel({
      color: cfg.color || '#ED4245',
      // 👤 Un seul avatar : porté par l'image ou la vignette, pas en author.
      author: { name: `${user.tag || user.username || 'Un membre'} s'en va…` },
      description: text,
      fields: [
        { name: '👥 Membres restants', value: `**${member.guild.memberCount || '?'}**`, inline: true },
        // v241 — `<t:…:R>` rend « il y a 1 jour », ce qui donnait la phrase
        // cassée « Était membre depuis il y a 1 jour ». On affiche une DURÉE.
        // ⚠️ `joinedTs` est en SECONDES (divisé par 1000 ci-dessus) alors que
        // `dureeDepuis` attend des millisecondes : sans cette conversion la
        // durée affichait « 56 ans » (Date.now() - secondes ≈ Date.now()).
        ...(joinedTs ? [{ name: '🕐 Membre pendant', value: dureeDepuis(joinedTs * 1000), inline: true }] : []),
      ],
      // 🖼️ L'image configurée est le visuel ; pas de vignette en double.
      image: cfg.image ? String(cfg.image).trim() : '',
      thumbnail: !cfg.image && avatarUrl ? avatarUrl : '',
      footer: `Hoxera · ${member.guild.name}`,
    })).then(() => true).catch((e) => { trace('envoi ÉCHOUÉ : ' + e.message); return false; });
    trace(ok ? 'panneau de départ envoyé ✅' : 'panneau NON envoyé ❌ (permissions ?)');
  } else {
    await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { content: finalContent }).catch(() => {});
  }
  if (opts.test) return; // en test : pas de journal serveur
  await logging.log(botId, member.guild, {
    title: '👋 Membre parti',
    description: `${(member.user && (member.user.tag || member.user.username)) || 'Un membre'} a quitté le serveur`,
    color: '#ED4245',
  });
}

/**
 * v241 — durée écoulée depuis un horodatage, en français court.
 * Remplace le `<t:…:R>` du panneau de départ, qui produisait la phrase cassée
 * « Était membre depuis il y a 1 jour ».
 * @param {number} depuisMs horodatage en MILLISECONDES (pas en secondes :
 *   `member.joinedTimestamp / 1000` doit être re-multiplié par l'appelant).
 */
function dureeDepuis(depuisMs) {
  const ms = Number(depuisMs);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  // Garde-fou : une valeur en secondes donnerait une durée > 40 ans.
  if (Date.now() - ms > 100 * 365 * 86400000) return '—';
  let min = Math.max(1, Math.round((Date.now() - ms) / 60000));
  const a = Math.floor(min / 525600); min -= a * 525600;   // années
  const j = Math.floor(min / 1440); min -= j * 1440;
  const h = Math.floor(min / 60); min -= h * 60;
  const morceaux = [];
  if (a) morceaux.push(`${a} an${a > 1 ? 's' : ''}`);
  if (j) morceaux.push(`${j} j`);
  if (!a && h) morceaux.push(`${h} h`);
  if (!a && !j) morceaux.push(`${min} min`);
  return morceaux.length ? morceaux.slice(0, 2).join(' ') : 'moins d\'une minute';
}

function render(member, botRecord, template, extraVars = {}) {
  const guild = member.guild;
  const u = member.user || {}; // membre partiel possible (départ non mis en cache)
  const ctx = {
    vars: {
      ...extraVars,
      userMention: `<@${member.id}>`,
      userTag: u.tag || u.username || 'un membre',
      userName: u.username || 'un membre',
      userId: member.id,
      serverName: guild.name,
      serverId: guild.id,
      channelMention: '',
      channelId: '',
      prefix: botRecord.prefix,
      args: '',
      arg1: '', arg2: '', arg3: '', arg4: '', arg5: '',
      count: guild.memberCount || 0,
      coins: 0,
      randomUser: '',
      botMention: '',
    },
  };
  return resolveVariables(template || '', ctx);
}

// 📌 Salons à mentionner (v200) : config JSON [{channel, label}] → texte cliquable.
// Ex : « 📜 Règles → <#123> » sur chaque ligne. Les salons introuvables sont ignorés.
async function channelMentions(guild, raw, resolve) {
  let list = [];
  try { list = JSON.parse(String(raw || '') || '[]'); } catch { return ''; }
  if (!Array.isArray(list)) return '';
  const lines = [];
  for (const item of list) {
    const ref = String((item && item.channel) || '').trim();
    if (!ref) continue;
    // ⚠️ resolveChannel est async : il faut AWAIT, sinon « ch » est une
    // Promesse et « ch.id » vaut undefined → <#undefined> dans le panneau.
    const label = String((item && item.label) || '').trim();
    const ch = resolve ? await resolve(guild, ref) : null;
    // Salon introuvable : la ligne est ignorée (le nom en clair resterait
    // un message cassé). Les noms copiés de Discord (U+2060, décorations)
    // sont déjà résolus par resolveChannel grâce à la normalisation, donc
    // on ne perd aucune ligne légitime.
    if (!ch) continue;
    const mention = `<#${ch.id}>`;
    // v2.1 : si la phrase contient {salon}, la mention est insérée À L'INTÉRIEUR
    // (ex : « Je vous invite à prendre connaissance de {salon} » → … de #regles).
    if (label.includes('{salon}')) lines.push(label.split('{salon}').join(mention));
    else lines.push(label ? `${label} → ${mention}` : mention);
  }
  return lines.join('\n');
}

// 🔤 Normalise un nom de salon pour la comparaison : retire le « # », les
// caractères invisibles que Discord colle quand on COPIE un nom de salon
// (U+2060 « word joiner » ⁠, espaces de largeur nulle, etc.), les espaces
// idéographiques et les espaces multiples. Sans cela, « ⁠『📨』ticket » ne
// matchait jamais le vrai salon « 『📨』ticket » → pas de ping.
function normalizeChannelName(value) {
  return String(value == null ? '' : value)
    .replace(/^#+\s*/, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Énumère les salons du cache du serveur, quel que soit le support :
// Collection/Map Discord.js (.values()), tableau brut, ou objet simple.
// Les mocks de tests historiques exposent parfois seulement cache.find()
// (pas itérable) : on renvoie [] et findChannelByName bascule sur cache.find.
function channelEntries(guild) {
  if (!guild || !guild.channels || !guild.channels.cache) return [];
  const cache = guild.channels.cache;
  if (Array.isArray(cache)) return cache;
  if (cache && typeof cache.values === 'function') {
    try { return Array.from(cache.values()); } catch { /* collection partielle */ }
  }
  if (cache && typeof cache === 'object') {
    const vals = Object.values(cache).filter((v) => v && typeof v === 'object');
    if (vals.length) return vals;
  }
  return [];
}

function findChannelByName(guild, normalizedQuery) {
  if (!guild || !guild.channels || !guild.channels.cache || !normalizedQuery) return null;
  const cache = guild.channels.cache;
  const isText = (ch) => !!ch && (typeof ch.isTextBased !== 'function' || ch.isTextBased());
  const entries = channelEntries(guild);
  // 1) correspondance EXACTE (après normalisation)
  for (const ch of entries) {
    if (!isText(ch)) continue;
    if (normalizeChannelName(ch.name) === normalizedQuery) return ch;
  }
  // 2) correspondance « contient » (noms décorés/copiés) : d'abord les salons
  //    dont le nom CONTIENT la recherche (plus court = le plus proche) ; puis,
  //    seulement si rien, les noms de salons contenus DANS la recherche
  //    (collages avec contexte, ex. « le salon regles officiel ») — jamais
  //    sous 3 caractères pour éviter les faux positifs.
  if (normalizedQuery.length >= 3) {
    let best = null;
    for (const ch of entries) {
      if (!isText(ch)) continue;
      const name = normalizeChannelName(ch.name);
      if (!name) continue;
      if (name.includes(normalizedQuery)) {
        if (!best || name.length < normalizeChannelName(best.name).length) best = ch;
      }
    }
    if (!best) {
      for (const ch of entries) {
        if (!isText(ch)) continue;
        const name = normalizeChannelName(ch.name);
        if (!name || name.length < 3) continue;
        if (normalizedQuery.includes(name)) {
          // le PLUS LONG nom contenu = le plus proche de la recherche
          if (!best || name.length > normalizeChannelName(best.name).length) best = ch;
        }
      }
    }
    if (best) return best;
  }
  // 3) cache non itérable mais exposant find() (anciens mocks) : match exact
  if (!entries.length && cache && typeof cache.find === 'function') {
    try {
      const found = cache.find((ch) => isText(ch) && normalizeChannelName(ch && ch.name) === normalizedQuery);
      if (found) return found;
    } catch { /* cache.find introuvable */ }
  }
  return null;
}

async function resolveChannel(guild, query) {
  if (!query || !guild) return null;
  const q = normalizeChannelName(query);
  if (!q) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) {
    const ch = await guild.channels.fetch(idMatch[1]).catch(() => null);
    if (ch) return ch;
  }
  let found = findChannelByName(guild, q);
  if (found) return found;
  // Cache incomplet (Discord charge les salons paresseusement) : on rafraîchit
  // la liste complète une fois, puis on re-cherche dans la collection renvoyée
  // (discord.js la remplit aussi dans guild.channels.cache, mais certains
  // mocks/hôtes ne mutent pas la cache — chercher dans `fetched` est sûr).
  try {
    const fetched = await guild.channels.fetch();
    if (fetched && typeof fetched.size !== 'undefined') {
      found = findChannelByName({ channels: { cache: fetched } }, q);
    }
  } catch {}
  return found || null;
}

// 🔗 Auto-mention : après remplacement des variables, on transforme en vrais
// pings les noms de salons collés depuis Discord dans le message (« #nom » ou
// « ⁠nom », souvent entourés de ** markdown). Un nom « simple » (lettres
// uniquement, sans # ni caractère invisible) n'est jamais converti — « général »
// ne doit pas devenir un ping.
function autoMentionChannels(guild, text) {
  if (!text || !guild || !guild.channels || !guild.channels.cache) return text;
  const byNorm = new Map();
  for (const ch of channelEntries(guild)) {
    if (!ch || !ch.id || typeof ch.isTextBased !== 'function' || !ch.isTextBased()) continue;
    const key = normalizeChannelName(ch.name);
    if (key && !byNorm.has(key)) byNorm.set(key, ch.id);
  }
  if (!byNorm.size) return text;
  return String(text).replace(/(?<![<\w])((?:#|[\u200B-\u200D\u2060\uFEFF])?)([^\s#<>{}|*_`~]+)/g, (full, prefix, token) => {
    const key = normalizeChannelName(token);
    if (!key) return full;
    let id = byNorm.get(key);
    if (!id && key.length >= 3) {
      // Nom partiel de salon (ex : « chat-général » → 『💬』chat-général) :
      // on préfère le nom le plus court qui contient le mot.
      let best = null;
      for (const [name, cid] of byNorm) {
        if (name.includes(key) && (!best || name.length < best[0].length)) best = [name, cid];
      }
      if (best) id = best[1];
    }
    if (!id) return full;
    const forced = !!prefix && (prefix === '#' || /[\u200B-\u200D\u2060\uFEFF]/.test(prefix));
    const hasNonLetter = /[^a-zà-ÿœæ]/.test(key);
    if (!forced && !hasNonLetter) return full;
    return `<#${id}>`;
  });
}

// 🧹 Assainit la config d'un événement avant sauvegarde (types, longueurs,
// forme du champ channelsmulti). Empêche des configs invalides/abusives
// d'entrer en base et casse le bot au moment de l'envoi.
function sanitizeEventConfig(type, raw) {
  const def = EVENT_DEFS[type];
  if (!def) return {};
  const out = {};
  const cfg = raw && typeof raw === 'object' ? raw : {};
  for (const f of def.config) {
    const v = cfg[f.key];
    if (v === undefined || v === null) continue;
    switch (f.type) {
      case 'checkbox': out[f.key] = !!v; break;
      case 'multiline':
      case 'text': {
        const str = String(v);
        out[f.key] = str.length > 2000 ? str.slice(0, 2000) : str;
        break;
      }
      case 'channel':
      case 'role': {
        const str = String(v).trim();
        out[f.key] = str.length > 200 ? str.slice(0, 200) : str;
        break;
      }
      case 'color': {
        const str = String(v).trim();
        out[f.key] = /^#[0-9a-fA-F]{6}$/.test(str) ? str : '#e07a5f';
        break;
      }
      case 'rolesmulti': {
        const str = String(v);
        out[f.key] = str.length > 2000 ? str.slice(0, 2000) : str;
        break;
      }
      case 'channelsmulti': {
        let list = [];
        if (typeof v === 'string') { try { list = JSON.parse(v); } catch { list = []; } }
        else if (Array.isArray(v)) list = v;
        const clean = [];
        if (Array.isArray(list)) {
          // On assainit d'abord (retrait des lignes vides/invalides), puis on
          // borne à 50 lignes : une ligne valide n'est jamais sacrifiée par
          // une ligne vide qui la précède.
          for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const channel = String(item.channel || '').trim().replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').slice(0, 200);
            const label = String(item.label || '').trim().slice(0, 600);
            if (!channel) continue;
            clean.push({ channel, label });
            if (clean.length >= 50) break;
          }
        }
        out[f.key] = JSON.stringify(clean);
        break;
      }
      default: out[f.key] = v;
    }
  }
  return out;
}

module.exports = { EVENT_DEFS, eventsState, runJoinEvent, runLeaveEvent, resolveChannel, parseRoleList, channelMentions, normalizeChannelName, findChannelByName, autoMentionChannels, sanitizeEventConfig };
