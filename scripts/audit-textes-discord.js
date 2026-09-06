// ============================================================================
// v241 — AUDIT des textes affichés SUR DISCORD.
//
//   node scripts/audit-textes-discord.js              # inventaire complet
//   node scripts/audit-textes-discord.js --html       # + aperçu HTML
//
// Rend les VRAIS builders (pas une copie) et extrait le texte tel que Discord
// l'affichera. Objectif : juger la qualité rédactionnelle de chaque panneau,
// repérer les longueurs inutiles et les informations redondantes.
//
// Ne modifie AUCUN fichier (sauf le HTML en sortie, hors dépôt).
// ============================================================================
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-audit-'));
const store = require('../server/db');
const ui = require('../server/discord/ui');
const v2 = require('../test/helpers/v2');

const SORTIE_HTML = '/home/user/hoxera-audit-textes-discord.html';

// ---------------------------------------------------------------------------
// Extraction : un payload V2 OU un embed classique → texte lisible.
// ---------------------------------------------------------------------------
function toJSON(payload) {
  if (!payload) return null;
  // EmbedBuilder / composants discord.js exposent toJSON()
  const p = { ...payload };
  if (Array.isArray(p.embeds)) p.embeds = p.embeds.map((e) => (e && e.toJSON ? e.toJSON() : e));
  if (Array.isArray(p.components)) p.components = p.components.map((c) => (c && c.toJSON ? c.toJSON() : c));
  return p;
}

/** Décrit un payload comme Discord l'affiche, ligne par ligne. */
function decrire(payload) {
  const p = toJSON(payload);
  if (!p) return ['(payload vide)'];
  const out = [];

  if (p.content) out.push(String(p.content));

  // ── Components V2 ──
  if (v2.isV2(p)) {
    const conteneur = v2.container(p);
    if (!conteneur) return out.length ? out : ['(conteneur V2 vide)'];
    const accent = v2.accentColor(p);
    if (accent) out.push(`[couleur d'accent : ${accent}]`);
    const blocs = [];
    for (const c of conteneur.components || []) {
      const t = c && c.type;
      if (t === 10) blocs.push({ kind: 'texte', value: c.content });
      else if (t === 14) blocs.push({ kind: 'séparateur', value: c.divider ? 'pleine largeur' : 'court' });
      else if (t === 9) blocs.push({ kind: 'section', value: (c.components || []).map((x) => x.content).join(' · ') });
      else if (t === 12) blocs.push({ kind: 'image', value: (c.items || []).map((x) => x.media && x.media.url).join(', ') });
      else if (t === 11) blocs.push({ kind: 'vignette', value: c.media && c.media.url });
      else if (t === 13) blocs.push({ kind: 'fichier', value: c.file && c.file.url });
      else if (t === 1) blocs.push({ kind: 'boutons', value: (c.components || []).map((b) => b.label || b.emoji || '?').join(' | ') });
      else blocs.push({ kind: `type ${t}`, value: JSON.stringify(c).slice(0, 70) });
    }
    for (const b of blocs) {
      if (b.kind === 'séparateur') { out.push(`  ─── ${b.value} ───`); continue; }
      if (b.kind === 'boutons') { out.push(`  [boutons] ${b.value}`); continue; }
      if (['image', 'vignette', 'fichier'].includes(b.kind)) { out.push(`  [${b.kind}] ${b.value}`); continue; }
      out.push(String(b.value || ''));
    }
    const pied = conteneur.footer;
    if (pied) out.push(`  (pied) ${pied}`);
    return out;
  }

  // ── Embed classique ──
  for (const e of p.embeds || []) {
    if (e.author && e.author.name) out.push(`(auteur) ${e.author.name}`);
    if (e.title) out.push(`# ${e.title}`);
    if (e.description) out.push(String(e.description));
    for (const f of e.fields || []) out.push(`  • ${f.name} : ${String(f.value).slice(0, 80)}`);
    if (e.footer && e.footer.text) out.push(`  (pied) ${e.footer.text}`);
  }
  return out.length ? out : ['(rien à afficher)'];
}

// ---------------------------------------------------------------------------
// Contexte factice commun
// ---------------------------------------------------------------------------
const uid = store.users.create('discord:audit@x', 'x', {});
// ⚠️ `store.bots.create()` renvoie le `lastInsertRowid` (un NOMBRE), pas la
// ligne : `BOT.id` vaudrait `undefined` et ferait sauter un NOT NULL plus loin.
const BOT_ROW = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
const BOT = { id: String(BOT_ROW && BOT_ROW.id ? BOT_ROW.id : BOT_ROW) };
const GUILD = { id: 'G1', name: 'Serveur de Hoxera', memberCount: 1287 };
const member = {
  id: 'u1',
  user: { username: 'Alice', tag: 'Alice#0001', id: 'u1', displayAvatarURL: () => '', createdAt: new Date(Date.now() - 86400000 * 400) },
  toString: () => '@Alice',
  guild: GUILD,
};

const RESULTATS = [];
function panneau(zone, nom, payload, note) {
  let lignes;
  try { lignes = decrire(payload); } catch (e) { lignes = [`💥 erreur de rendu : ${e.message}`]; }
  const texte = lignes.join('\n');
  RESULTATS.push({ zone, nom, lignes, note: note || '', caracteres: texte.length, mots: texte.split(/\s+/).filter(Boolean).length });
}

// ---------------------------------------------------------------------------
// 1. TICKETS
// ---------------------------------------------------------------------------
try {
  const panels = require('../server/discord/panels');
  panneau('Tickets', 'Panneau principal (salon #support)',
    panels.buildTicketPanel({}, {}, [], GUILD.name, GUILD.id));
  panneau('Tickets', 'Panneau avec 3 types configurés',
    panels.buildTicketPanel({ title: '🎫 Support', description: '', button_label: 'Ouvrir un ticket' }, {},
      [{ label: 'Technique', emoji: '🛠️' }, { label: 'Facturation', emoji: '💰' }, { label: 'Partenariat', emoji: '🤝' }],
      GUILD.name, GUILD.id));
} catch (e) { RESULTATS.push({ zone: 'Tickets', nom: '—', lignes: [`💥 ${e.message}`], note: '', caracteres: 0, mots: 0 }); }

// ---------------------------------------------------------------------------
// 2. GIVEAWAY + SUGGESTIONS
// ---------------------------------------------------------------------------
try {
  const giveaway = require('../server/discord/giveaway');
  panneau('Giveaway', 'Panneau par défaut',
    giveaway.buildPanel({ prize: 'Nitro Boost 1 mois', winners: 1, ends_at: Date.now() + 3600000 }, {}));
  panneau('Giveaway', 'Panneau personnalisé (message long)',
    giveaway.buildPanel({ prize: 'Nitro Boost 1 mois', winners: 2, ends_at: Date.now() + 3600000 },
      { message: 'Réagissez avec 🎉 pour participer !\n\nSeuls les membres du serveur sont éligibles.' }));
} catch (e) { RESULTATS.push({ zone: 'Giveaway', nom: '—', lignes: [`💥 ${e.message}`], note: '', caracteres: 0, mots: 0 }); }

try {
  const suggest = require('../server/discord/suggest');
  panneau('Suggestions', 'Panneau de suggestion',
    suggest.buildPanel({ id: 12, bot_id: BOT.id, text: 'Ajouter un salon de musique pour que les membres puissent écouter ensemble.', status: 'pending', upvotes: 7, downvotes: 1 }, 'Alice#0001', {}));
} catch (e) { RESULTATS.push({ zone: 'Suggestions', nom: '—', lignes: [`💥 ${e.message}`], note: '', caracteres: 0, mots: 0 }); }

// ---------------------------------------------------------------------------
// 2b. MENU DE RÔLES + PANNEAU DU SALON PRIVÉ (ticket « déroulant »)
// ---------------------------------------------------------------------------
try {
  const panels = require('../server/discord/panels');
  // `roleMenus.create()` renvoie un IDENTIFIANT, et `options` est stocké en
  // JSON texte : on construit directement l'objet que le builder recevra.
  const menuRow = {
    id: 1, bot_id: BOT.id, guild_id: GUILD.id, name: 'Rôles du serveur',
    content: 'Choisissez vos rôles ci-dessous. Vous pouvez les activer ou les retirer à tout moment.',
    placeholder: 'Choisissez vos rôles…', channel: 'C1', mode: 'buttons',
    options: [{ role: '1', label: '🎨 Artiste', emoji: '🎨' }, { role: '2', label: '🎮 Joueur', emoji: '🎮' },
      { role: '3', label: '📰 Actualités', emoji: '📰' }],
  };
  panneau('Menu de rôles', 'Panneau avec contenu personnalisé (boutons)', panels.roleMenuPayload(BOT.id, menuRow));
  panneau('Menu de rôles', 'Panneau par DÉFAUT (aucun contenu saisi, menu déroulant)',
    panels.roleMenuPayload(BOT.id, { ...menuRow, id: 2, content: '', mode: 'select',
      options: [{ role: '1', label: '🎨 Artiste', emoji: '🎨' }] }));

  // panels.js lit `chosen.label` (et non `name`) — cf. ticketWelcomePanel:657.
  const chosen = { label: 'Technique', emoji: '🛠️', id: 'tech', description: 'Problème technique, bug, connexion.' };
  panneau('Tickets', 'Salon privé — panneau de bienvenue (le « déroulant »)',
    panels.ticketWelcomePanel(member, chosen, '<@&999>', "Je n'arrive pas à connecter mon compte Twitch.",
      '', [], 'fr', { number: 42 }, undefined, {}));
  panneau('Tickets', 'Salon privé — avec questionnaire (2 réponses)',
    panels.ticketWelcomePanel(member, chosen, '<@&999>', 'Demande de partenariat',
      '', [{ q: 'Quel est votre pseudo ?', a: 'Alice' }, { q: 'Depuis combien de temps suivez-vous le serveur ?', a: '2 ans' }],
      'fr', { number: 43 }, undefined, {}));
} catch (e) {
  RESULTATS.push({ zone: 'Menu de rôles', nom: '—', lignes: [`💥 ${e.message}`], note: '', caracteres: 0, mots: 0 });
}

// ---------------------------------------------------------------------------
// 2c. Panneaux non rendables hors Discord : extraits du code source.
// ---------------------------------------------------------------------------
function extraitLitteraux(fichier, motif, zone, nom) {
  const src = fs.readFileSync(path.join(__dirname, '..', fichier), 'utf8');
  const re = new RegExp(motif, 'g');
  const lignes = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const avant = src.slice(0, m.index).split('\n').length;
    lignes.push(`  (ligne ${avant}) ${m[0].replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  if (lignes.length) RESULTATS.push({ zone, nom, lignes, note: 'extrait du source', caracteres: 0, mots: 0 });
}

extraitLitteraux('server/discord/liveWatch.js',
  "title: `[^`]*`|description: `[^`]*`", 'Annonce de live', 'Textes du panneau d\'annonce');
extraitLitteraux('server/discord/automod.js',
  "title: '[^']*Avertissement[^']*'|description: '[^']{20,}'|value: '[^']{20,}'",
  'Avertissement (Auto-Mod)', 'Textes du MP + message public');
extraitLitteraux('server/i18n.js',
  "transcript_[a-z_]*: '[^']{15,}'", 'Transcription', 'Clés i18n du MP de transcription');
extraitLitteraux('server/i18n.js',
  "ticket_[a-z_]*: '[^']{15,}'", 'Tickets', 'Clés i18n « ticket_* »');

// ---------------------------------------------------------------------------
// 3. BIENVENUE / DÉPART — rendu réel via events.js
//    (`store.events.set(botId, guildId, clé, actif, config)` est la seule API
//     de configuration ; `guildSettings.upsert` n'existe pas.)
// ---------------------------------------------------------------------------
// ⚠️ Les textes audités ne sont PAS recopiés ici : ils sont relus depuis le
// code source, sinon l'audit afficherait un texte qui n'existe plus.
// Extraction par ANCRES + lecture de littéral (pas de regex) : ces chaînes
// contiennent des apostrophes droites et typographiques et des \n échappés,
// ce qui rend toute regex de classe de caractères illisible et fragile.
function litLitteraux(fichier, ancre, combien = 1) {
  const src = fs.readFileSync(path.join(__dirname, '..', fichier), 'utf8');
  const depart = src.indexOf(ancre);
  if (depart < 0) throw new Error(`ancre introuvable dans ${fichier} : ${ancre}`);
  const out = [];
  let pos = depart + ancre.length;
  while (out.length < combien && pos < src.length) {
    const q = src[pos];
    if (q === '"' || q === "'" || q === '`') {
      let k = pos + 1; let brut = '';
      while (k < src.length) {
        if (src[k] === '\\') { brut += src[k] + (src[k + 1] || ''); k += 2; continue; }
        if (src[k] === q) break;
        brut += src[k]; k++;
      }
      out.push(eval(q + brut + q));   // résout \n, \' et les guillemets
      pos = k + 1;
      continue;
    }
    pos++;
  }
  if (out.length < combien) throw new Error(`${combien} littéral(aux) attendu(s) après « ${ancre} » dans ${fichier}`);
  return out;
}

// Bouton « ✨ Modèle bienvenue pro / départ pro » du dashboard : un ternaire,
// donc les 2 modèles se suivent.
const [modeleJoin, modeleLeave] = litLitteraux('public/js/dashboard.js',
  "msgEl.value = (key === 'member_join')", 2);
const MODELES = { join: modeleJoin, leave: modeleLeave };

// Valeurs par défaut du formulaire (EVENT_DEFS dans events.js).
const DEFAUTS = {
  join: litLitteraux('server/discord/events.js',
    "label: 'Message ({user}, {server}, {count}…)', type: 'multiline', default:")[0],
  leave: litLitteraux('server/discord/events.js',
    "label: 'Message', type: 'multiline', default:")[0],
};

(async () => {
  const events = require('../server/discord/events');
  const GID = 'GAUDIT';
  let captures = [];
  const channel = {
    id: 'CEV', name: 'accueil', isTextBased: () => true, toString: () => '#accueil',
    send: async (p) => { captures.push(p); return { id: 'M1' }; },
  };
  const fakeMember = () => ({
    id: 'U9', partial: false,
    user: { id: 'U9', tag: 'Alice#0001', username: 'Alice', bot: false,
      createdTimestamp: Date.now() - 400 * 86400000, displayAvatarURL: () => 'https://x/a.png' },
    toString: () => '@Alice',
    guild: {
      id: GID, name: 'Serveur de Hoxera', memberCount: 1287, iconURL: () => null,
      channels: { cache: { get: () => undefined, find: () => channel, filter: () => [] } },
      roles: { cache: { find: () => null } },
    },
    roles: { cache: [] },
    joinedTimestamp: Date.now() - 86400000,
  });

  const variantes = [
    ['Modèle « bienvenue pro » (bouton ✨ du dashboard)', MODELES.join, {}],
    ['Message par DÉFAUT (rien configuré)', DEFAUTS.join, {}],
    ['Modèle pro + carte image activée', MODELES.join, { card: true }],
  ];
  for (const [nom, message, plus] of variantes) {
    store.events.set(BOT.id, GID, 'member_join', true,
      { channel: 'accueil', plain: false, card: false, message, ...plus });
    captures = [];
    await events.runJoinEvent(BOT.id, fakeMember(), { test: true }).catch(() => {});
    if (captures.length) panneau('Bienvenue', nom, captures[0]);
    else RESULTATS.push({ zone: 'Bienvenue', nom, lignes: ['(aucun message capturé)'], note: '', caracteres: 0, mots: 0 });
  }
  for (const [nom, message] of [['Modèle « départ pro »', MODELES.leave], ['Message par DÉFAUT', DEFAUTS.leave]]) {
    store.events.set(BOT.id, GID, 'member_leave', true, { channel: 'accueil', plain: false, message });
    captures = [];
    if (typeof events.runLeaveEvent === 'function') {
      await events.runLeaveEvent(BOT.id, fakeMember(), { test: true }).catch(() => {});
    }
    if (captures.length) panneau('Départ', nom, captures[0]);
    else RESULTATS.push({ zone: 'Départ', nom, lignes: ['(aucun message capturé)'], note: '', caracteres: 0, mots: 0 });
  }

  rapport();
})();

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
function rapport() {
  const zones = [...new Set(RESULTATS.map((r) => r.zone))];
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  AUDIT — textes affichés sur Discord (rendu réel des builders)');
  console.log('════════════════════════════════════════════════════════════════\n');
  for (const z of zones) {
    console.log(`\n┌─── ${z} ${'─'.repeat(Math.max(0, 52 - z.length))}`);
    for (const r of RESULTATS.filter((x) => x.zone === z)) {
      console.log(`│\n│ ■ ${r.nom}   (${r.mots} mots, ${r.caracteres} caractères)`);
      if (r.note) console.log(`│   ℹ️  ${r.note}`);
      for (const l of r.lignes) {
        for (const sous of String(l).split('\n')) console.log(`│   ${sous}`);
      }
    }
    console.log('└' + '─'.repeat(60));
  }
  try { store.db.close(); } catch {}
  fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
}
