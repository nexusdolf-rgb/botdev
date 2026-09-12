// ============================================================================
// Test v239 — 2 bugs signalés par l'utilisateur :
//
//  1. Le MP de TRANSCRIPTION envoyé au créateur du ticket après la fermeture
//     était le DERNIER panneau construit à la main (`new EmbedBuilder()`) :
//     jamais passé par le système de panneaux, donc jamais migré en v231→v236.
//     Résultat : AUCUN séparateur natif, un rendu différent de tous les autres.
//     → ui.v2panel() + séparateurs pleine largeur + composant File (type 13)
//       pour la transcription .txt (en V2 une pièce jointe n'apparaît plus
//       toute seule) + MediaGallery pour la bannière + bouton lien DANS le
//       conteneur.
//
//  2. L'aperçu « 👀 Aperçu sur Discord » du modèle « ✨ bienvenue pro »
//     (dashboard, section Bienvenue) n'affichait AUCUN trait. Double cause :
//       (a) il lisait la clé `embed`, qui N'EXISTE PAS dans EVENT_DEFS — la
//           vraie clé est `plain`, logique INVERSÉE → `isEmbed` toujours false
//           → l'aperçu retombait en permanence sur le rendu « texte simple » ;
//       (b) même dans sa branche « embed », il dessinait un embed CLASSIQUE
//           (barre de couleur à gauche, texte d'un bloc) alors que le bot
//           envoie du Components V2 depuis la v236.
//
//  3. Piège découvert en corrigeant (1) : `ui.v2panel(options, rows)` faisait
//     `{ ...options, rows }` — le `[]` par défaut du 2ᵉ paramètre ÉCRASAIT
//     `options.rows`. Passer ses boutons via `rows:` dans les options les
//     faisait disparaître EN SILENCE (aucune erreur, juste pas de bouton).
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v239-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const events = require('../server/discord/events');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ⚠️ v2.json() renvoie une CHAÎNE (JSON.stringify) et v2.dividers() un NOMBRE.
// Pour lister les composants d'un type donné il faut donc marcher soi-même
// l'objet renvoyé par v2.container().
const collect = (payload, type) => {
  const out = [];
  const walk = (n) => {
    const j = v2.plain(n);
    if (!j) return;
    if (Number(j.type) === type) out.push(j);
    (j.components || []).forEach(walk);
    if (j.accessory) walk(j.accessory);
  };
  walk(v2.container(payload));
  return out;
};
const FILE_COMPONENTS = (payload) => collect(payload, 13);

// ---------------------------------------------------------------------------
// Serveur + utilisateur factices. `sent` capture le payload du MP.
// ---------------------------------------------------------------------------
const GUILD_ID = 'G239';
// Le texte inséré par le bouton « ✨ Modèle bienvenue pro » du dashboard, avec
// {user}/{server}/{count}/{channels} déjà remplacés comme le fait le serveur.
const PRO_TEXT = "👋 Bienvenue @NouveauMembre sur Mon serveur !\nVous êtes le membre n°42 🎉\n\nPour bien commencer, découvrez les salons utiles :\n📜 <#111111111111111111> · règlement\n💬 <#222222222222222222> · support\n\nPassez un bon moment parmi nous — l'équipe est là pour vous aider ! 🚀";
// Ce que le bot envoie VRAIMENT sur Discord (mêmes options que events.js,
// branche sans carte) — sert de référence à l'aperçu du dashboard.
const welcomeV2Server = () => require('../server/discord/ui').v2panel({
  color: '#57F287',
  author: { name: 'NouveauMembre#0001 vient d\u2019arriver !' },
  title: '👋 Bienvenue sur Mon serveur !',
  description: PRO_TEXT,
  fields: [{ name: '👥 Tu es le membre', value: '**n°42**', inline: true }],
  thumbnail: 'https://cdn/x.png',
  footer: 'Mon serveur',
});
const OPENER = '100000000000000009';
let sent = null;
let sentThrows = false;
let fallbackUsed = false;

const fakeUser = {
  id: OPENER,
  username: 'alice',
  tag: 'alice#0001',
  send: async (payload) => {
    if (sentThrows) { const e = new Error('Cannot send messages to this user'); e.code = 50007; throw e; }
    // Le 2ᵉ envoi (le repli classique) est distingué pour vérifier qu'il part.
    if (sent) fallbackUsed = true;
    sent = payload;
    return {};
  },
};
const fakeClient = { users: { fetch: async (id) => (id === OPENER ? fakeUser : (() => { throw new Error('Unknown User'); })()) }, botId: 1 };
const fakeGuild = { id: GUILD_ID, name: 'Serveur de test', client: fakeClient, members: { fetch: async () => ({ user: fakeUser }) } };

// ---------------------------------------------------------------------------
// 1) ui.v2container — nouvelle option `files` (composant File, type 13).
// ---------------------------------------------------------------------------
console.log('\n1) ui.v2container : option `files` → composants File (type 13)');
{
  const p = ui.v2panel({
    title: 'T', description: 'para 1\n\npara 2',
    files: ['transcription-ticket-alice.txt'], footer: 'Hoxera', timestamp: false,
  });
  const files = FILE_COMPONENTS(p);
  check('le payload est bien en Components V2', v2.isV2(p));
  check('1 composant File (type 13) émis', files.length === 1, `trouvé ${files.length}`);
  check('le File référence attachment:// (seul protocole accepté)',
    files.length === 1 && String(files[0].file && files[0].file.url) === 'attachment://transcription-ticket-alice.txt',
    files[0] ? JSON.stringify(files[0].file) : '');

  // Préfixe déjà présent → pas de double « attachment://attachment:// ».
  const p2 = ui.v2panel({ title: 'T', files: ['attachment://deja.txt'], footer: false });
  const urls2 = FILE_COMPONENTS(p2).map((n) => String(n.file && n.file.url));
  check('un préfixe attachment:// déjà présent n\u2019est pas doublé',
    urls2.length === 1 && urls2[0] === 'attachment://deja.txt', urls2.join(' | '));

  // Plafond : 10 File maximum, et le budget de 40 composants jamais dépassé.
  const many = ui.v2panel({ title: 'T', files: Array.from({ length: 30 }, (_, i) => `f${i}.txt`), footer: false });
  const n3 = FILE_COMPONENTS(many);
  check('au maximum 10 composants File (au-delà : ignorés)', n3.length === 10, `trouvé ${n3.length}`);
  check('le plafond de 40 composants n\u2019est jamais dépassé', v2.componentCount(many) <= 40, `${v2.componentCount(many)}`);

  // Sans `files`, rien ne change (régression).
  const p4 = ui.v2panel({ title: 'T', description: 'x', footer: 'F', timestamp: false });
  check('sans option `files` : aucun composant File (comportement inchangé)', FILE_COMPONENTS(p4).length === 0);
}

// ---------------------------------------------------------------------------
// 2) ui.v2panel — `rows` dans les options n'est plus avalé.
// ---------------------------------------------------------------------------
console.log('\n2) ui.v2panel : les boutons passés dans options.rows ne disparaissent plus');
{
  const row = ui.linkRow('📜 Ouvrir la transcription', 'https://hoxera.is-a.dev/transcript/abc');

  const viaOptions = ui.v2panel({ title: 'T', description: 'd', rows: [row], footer: false });
  check('rows DANS les options → la rangée est présente',
    v2.rows(viaOptions).length === 1, `${v2.rows(viaOptions).length} rangée(s)`);
  check('rows DANS les options → le bon bouton',
    (v2.controls(viaOptions).find((b) => /Ouvrir la transcription/.test(b.label || '')) || {}).url
      === 'https://hoxera.is-a.dev/transcript/abc');

  const viaArg = ui.v2panel({ title: 'T', description: 'd', footer: false }, [row]);
  check('rows en 2ᵉ argument → toujours présent (convention historique)', v2.rows(viaArg).length === 1);

  // Le 2ᵉ argument reste PRIORITAIRE (sinon les appels existants changeraient
  // de comportement).
  const row2 = ui.linkRow('Autre', 'https://hoxera.is-a.dev/x');
  const both = ui.v2panel({ title: 'T', rows: [row], footer: false }, [row2]);
  const labels = v2.controls(both).map((b) => b.label);
  check('le 2ᵉ argument gagne sur options.rows', labels.length === 1 && labels[0] === 'Autre', labels.join(' | '));

  // Ni l'un ni l'autre → aucune rangée, aucune erreur.
  const none = ui.v2panel({ title: 'T', footer: false });
  check('aucun rows → aucune rangée', v2.rows(none).length === 0);
}

// ---------------------------------------------------------------------------
// 3) Le MP de transcription réel.
// ---------------------------------------------------------------------------
async function dmTranscript(overrides = {}, keepFailing = false) {
  sent = null; fallbackUsed = false;
  if (!keepFailing) sentThrows = false;
  const ok = await panels.sendTranscriptDm(fakeClient, fakeGuild, 'ticket-alice', {
    text: 'alice: bonjour\nstaff: bonjour !',
    url: 'https://hoxera.is-a.dev/transcript/abc123',
    openerId: OPENER,
    msgCount: 2,
    ...overrides,
  }, 1);
  return ok;
}

async function main() {
  console.log('\n3) MP de transcription — le panneau reçu par le membre');
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  check('le MP part bien', (await dmTranscript()) === true);

  const p = sent;
  check('c\u2019est un payload Components V2', v2.isV2(p));
  check('plus aucun embed classique dans le MP', !p.embeds || p.embeds.length === 0,
    p.embeds ? JSON.stringify(p.embeds).slice(0, 80) : '');
  check('plus aucun `content` au niveau du message (interdit en V2)', !p.content);

  // Le cœur du bug signalé : les traits.
  const seps = v2.dividers(p); // ⚠️ renvoie un NOMBRE
  check('des séparateurs NATIFS pleine largeur sont présents', seps >= 3, `${seps} séparateur(s)`);
  check('tous les séparateurs sont de type 14 avec divider:true',
    collect(p, 14).length === seps && collect(p, 14).every((x) => x.divider === true));
  const all = v2.allText(p);
  check('aucun trait texte ━ (le rendu doit être identique aux autres panneaux)',
    !all.includes('\u2501'), all.slice(0, 60));

  // La pièce jointe doit être RÉFÉRENCÉE par un composant, sinon elle reste
  // invisible en V2 (« attachments do not appear automatically »).
  const files = FILE_COMPONENTS(p);
  check('la transcription .txt est référencée par un composant File', files.length === 1);
  check('le .txt est TOUJOURS uploadé au niveau du message',
    Array.isArray(p.files) && p.files.length === 1 && p.files[0].name === 'transcription-ticket-alice.txt',
    p.files ? JSON.stringify(p.files.map((f) => f.name)) : 'aucun files');
  check('le contenu du .txt est bien la transcription',
    p.files && p.files[0] && Buffer.isBuffer(p.files[0].attachment)
      ? p.files[0].attachment.toString('utf-8').includes('staff: bonjour !') : false);

  // Bannière du profil bot → MediaGallery (URL HTTP, pas de pièce jointe).
  const media = v2.mediaUrls(p);
  check('la bannière est rendue en MediaGallery', media.length === 1, media.join(' | '));

  // Le bouton lien rentre DANS le conteneur.
  const ctrls = v2.controls(p);
  check('le bouton « 📜 Ouvrir la transcription » est DANS le conteneur',
    ctrls.some((b) => /Ouvrir la transcription/.test(b.label || '')),
    ctrls.map((b) => b.label).join(' | '));
  check('ce bouton pointe vers la transcription',
    (ctrls.find((b) => /Ouvrir la transcription/.test(b.label || '')) || {}).url
      === 'https://hoxera.is-a.dev/transcript/abc123');

  // Pied de page : signature seule, pas d'heure (aligné sur la v238).
  const foot = v2.footer(p);
  check('le pied de page est présent', !!foot, JSON.stringify(foot));
  check('le pied de page ne contient PAS d\u2019heure', !/\d{2}:\d{2}/.test(String(foot)), String(foot));
  check('le pied de page ne contient PAS de lien', !/hoxera\.is-a\.dev/.test(String(foot)), String(foot));

  // Budgets Discord.
  check('le plafond de 40 composants est respecté', v2.componentCount(p) <= 40, `${v2.componentCount(p)}`);
  check('le budget de 4000 caractères de texte est respecté', all.length <= 4000, `${all.length}`);

  // Sans lien de transcription (site non configuré) : pas de bouton, pas de crash.
  console.log('\n4) MP de transcription — cas dégradés');
  store.settings.set('public_url', '');
  await dmTranscript({ url: '' });
  check('sans URL : le MP part quand même', !!sent && v2.isV2(sent));
  check('sans URL : aucun bouton lien', v2.controls(sent || { components: [] }).length === 0);
  check('sans URL : les séparateurs restent', v2.dividers(sent || { components: [] }) >= 2);
  store.settings.set('public_url', 'https://hoxera.is-a.dev');

  // Message + image personnalisés (réglages « close_dm_message » / « close_dm_image »).
  store.guildSettings.set(1, GUILD_ID, { close_dm_message: 'Merci {server} ! Vois {url}', close_dm_image: 'https://exemple.com/b.png' });
  await dmTranscript();
  check('message personnalisé : il remplace le texte par défaut',
    v2.allText(sent).includes('Merci Serveur de test !'), v2.allText(sent).slice(0, 90));
  check('image personnalisée : c\u2019est elle qui est affichée',
    v2.mediaUrls(sent).includes('https://exemple.com/b.png'), v2.mediaUrls(sent).join(' | '));
  check('message personnalisé : toujours des séparateurs', v2.dividers(sent) >= 1);
  store.guildSettings.set(1, GUILD_ID, {});

  // Transcription vide → le .txt doit quand même exister (pas de message vide).
  await dmTranscript({ text: '' });
  check('transcription vide : un .txt de repli est quand même joint',
    sent.files && sent.files[0] && sent.files[0].attachment.toString('utf-8').length > 0);

  // MP impossible (l'utilisateur a désactivé les MP) → false, aucune exception.
  sentThrows = true;
  let threw = false;
  let res;
  try { res = await dmTranscript({}, true); } catch { threw = true; }
  check('MP refusé par Discord : aucune exception ne remonte', !threw);
  check('MP refusé par Discord : renvoie false', res === false, String(res));
  check('MP refusé : le repli classique a été tenté puis a échoué aussi', fallbackUsed === false);
  sentThrows = false;

  // Utilisateur introuvable → false, pas de crash.
  const badGuild = { ...fakeGuild, members: { fetch: async () => { throw new Error('Unknown Member'); } } };
  const badClient = { users: { fetch: async () => { throw new Error('Unknown User'); } }, botId: 1 };
  let res2; let threw2 = false;
  try { res2 = await panels.sendTranscriptDm(badClient, badGuild, 'ticket-x', { text: 'x', url: '', openerId: '999' }, 1); } catch { threw2 = true; }
  check('utilisateur introuvable : aucune exception', !threw2);
  check('utilisateur introuvable : renvoie false', res2 === false);

  // Pas d'openerId → on n'envoie rien du tout.
  const res3 = await panels.sendTranscriptDm(fakeClient, fakeGuild, 'ticket-x', { text: 'x', url: '', openerId: '' }, 1);
  check('pas d\u2019openerId : renvoie false sans envoyer', res3 === false);

  // -----------------------------------------------------------------------
  // 5) Aperçu « Bienvenue » du dashboard — le bug des traits absents.
  // -----------------------------------------------------------------------
  console.log('\n5) Aperçu « Bienvenue » du dashboard — la clé lue était la bonne ?');
  const dash = src('public/js/dashboard.js');
  const evSrc = src('server/discord/events.js');

  // (a) La clé `embed` n'a JAMAIS existé dans EVENT_DEFS : la vraie est `plain`.
  const joinDef = evSrc.slice(evSrc.indexOf('member_join: {'), evSrc.indexOf('member_leave: {'));
  check('EVENT_DEFS.member_join ne définit AUCUNE clé `embed`', !/key: 'embed'/.test(joinDef));
  check('EVENT_DEFS.member_join définit bien la clé `plain`', /key: 'plain'/.test(joinDef));
  check('le serveur branche sur `cfg.plain` (logique inversée)', /if \(!cfg\.plain\)/.test(evSrc));

  // (b) L'aperçu ne doit plus lire cette clé fantôme.
  check("dashboard : plus aucun get('embed') dans l'aperçu Bienvenue", !/get\('embed'\)/.test(dash));
  check("dashboard : l'aperçu lit get('plain')", /get\('plain'\)/.test(dash));

  // (c) L'aperçu doit dessiner le V2 : séparateurs pleine largeur, pas un
  //     embed classique à barre de gauche.
  const pvBlock = dash.slice(dash.indexOf('👀 Aperçu Discord en direct'), dash.indexOf('cfgZone.addEventListener(\'input\', renderPv)'));
  check('l\u2019aperçu dessine un séparateur pleine largeur (border-top + débordement du padding)',
    /border-top:1px solid #3f4147/.test(pvBlock) && /calc\(100% \+ 24px\)/.test(pvBlock));
  check('l\u2019aperçu dessine un CONTENEUR V2 (bordure gauche d\u2019accent + coins arrondis 8px)',
    /border-left:4px solid/.test(pvBlock) && /border-radius:8px/.test(pvBlock));
  check('l\u2019aperçu découpe les paragraphes sur les lignes vides (comme le bot)',
    /split\(\/\\n\\s\*\\n\/\)/.test(pvBlock));
  check('l\u2019aperçu pose un séparateur ENTRE chaque paragraphe (join(sep))', /\.join\(sep\)/.test(pvBlock));
  check('l\u2019aperçu montre l\u2019en-tête en section + vignette', /align-items:flex-start/.test(pvBlock) && /border-radius:6px/.test(pvBlock));
  check('l\u2019aperçu montre le pied discret (-# …) avec le nom du serveur',
    /font-size:11\.5px;color:#949ba4/.test(pvBlock));
  check('l\u2019aperçu distingue arrivée et départ (titre seulement à l\u2019arrivée)',
    /isJoin/.test(pvBlock) && /vient d/.test(pvBlock) && /s\\u2019en va/.test(pvBlock));
  check("l\u2019aperçu gère le mode texte simple (aucun panneau, donc aucun trait)", /if \(isPlain\)/.test(pvBlock));
  check("la carte de bienvenue n'est proposée qu'à l'arrivée (member_leave n'a pas la clé)", /hasCard = isJoin && !!get\('card'\)/.test(pvBlock));
  check("l'image d'embed personnalisée est montrée dans l'aperçu", /get\('image'\)/.test(pvBlock));

  // -----------------------------------------------------------------------
  // 6) L'aperçu rendu dans un VRAI DOM (jsdom) — la preuve directe du bug.
  //    Avant : `!!get('embed')` lisait une clé inexistante → toujours false →
  //    l'aperçu ne dessinait JAMAIS de panneau, donc jamais aucun trait.
  // -----------------------------------------------------------------------
  console.log('\n6) Aperçu « Bienvenue » rendu dans un vrai DOM (jsdom)');
  const { buildDom } = require('./helpers/dashboard-preview');
  const pvCfg = {
    message: "👋 Bienvenue {user} sur {server} !\nVous êtes le membre n°{count} 🎉\n\nPour bien commencer, découvrez les salons utiles :\n{channels}\n\nPassez un bon moment parmi nous — l'équipe est là pour vous aider ! 🚀",
    plain: false, card: false, color: '#57F287', image: '',
    _channelRows: [['règlement', 'Lis le règlement'], ['support', 'Ouvre un ticket']],
  };
  const pvGuild = { name: 'Mon serveur', members: 42 };
  const pvChans = [{ id: '111111111111111111', name: 'règlement' }, { id: '222222222222222222', name: 'support' }];
  const hr = (h) => (h.match(/<hr/g) || []).length;

  const join = buildDom({ key: 'member_join', config: pvCfg, guild: pvGuild, channels: pvChans }).html;
  check('modèle « ✨ bienvenue pro » : l\u2019aperçu dessine UN PANNEAU (avant : aucun)',
    /border-left:4px solid #57F287/.test(join) && /border-radius:8px/.test(join));
  check('modèle « ✨ bienvenue pro » : 4 séparateurs pleine largeur', hr(join) === 4, `trouvé ${hr(join)}`);
  check('les séparateurs débordent le padding du conteneur (vraie pleine largeur)',
    /margin:9px -12px;width:calc\(100% \+ 24px\)/.test(join));
  check('en-tête : « vient d\u2019arriver ! » + titre + vignette',
    /vient d/.test(join) && /👋 Bienvenue sur Mon serveur !/.test(join) && /border-radius:6px/.test(join));
  check('{user} → ping, {count} → n°42, {server} → nom réel',
    /dc-mention">@NouveauMembre/.test(join) && /n°42/.test(join));
  check('{channels} → les 2 salons avec leurs phrases et leurs vrais pings',
    /dc-mention">#règlement/.test(join) && /dc-mention">#support/.test(join)
    && /Lis le règlement/.test(join) && /Ouvre un ticket/.test(join));
  check('pied de l\u2019aperçu : nom du serveur + heure', /Mon serveur · \d{2}\/\d{2} \d{2}:\d{2}/.test(join));
  check('l\u2019aperçu a le MÊME nombre de séparateurs que le vrai panneau Discord',
    hr(join) === v2.dividers(welcomeV2Server()),
    `aperçu ${hr(join)} vs Discord ${v2.dividers(welcomeV2Server())}`);
  check('l\u2019aperçu ne contient aucun trait texte ━', !join.includes('\u2501'));

  const withCard = buildDom({ key: 'member_join', config: { ...pvCfg, card: true }, guild: pvGuild, channels: pvChans }).html;
  check('carte activée : l\u2019aperçu la montre DANS le panneau', /Carte de bienvenue/.test(withCard));

  const withImg = buildDom({ key: 'member_join', config: { ...pvCfg, image: 'https://exemple.com/b.png' }, guild: pvGuild, channels: pvChans }).html;
  check('image d\u2019embed configurée : affichée ET la vignette disparaît (pas de doublon)',
    /exemple\.com\/b\.png/.test(withImg) && !/border-radius:6px;flex-shrink:0/.test(withImg));

  const plainPv = buildDom({ key: 'member_join', config: { ...pvCfg, plain: true }, guild: pvGuild, channels: pvChans }).html;
  check('mode « 📝 texte simple » : AUCUN séparateur (fidèle au bot)', hr(plainPv) === 0, `trouvé ${hr(plainPv)}`);
  check('mode « 📝 texte simple » : aucun panneau dessiné', !/border-left:4px solid/.test(plainPv));
  check('mode « 📝 texte simple » : le texte reste lisible', /Bienvenue/.test(plainPv));

  const leave = buildDom({
    key: 'member_leave',
    config: { message: "👋 Au revoir {user} !\nMerci d'avoir fait partie de {server}.\n\nBonne continuation ! 💛", plain: false, color: '#ED4245', image: '' },
    guild: pvGuild, channels: pvChans,
  }).html;
  check('départ : panneau dessiné avec la bonne couleur', /border-left:4px solid #ED4245/.test(leave));
  check('départ : 3 séparateurs (2 paragraphes + champs + pied)', hr(leave) === 3, `trouvé ${hr(leave)}`);
  check('départ : pas de titre « 👋 Bienvenue sur … »', !/👋 Bienvenue sur/.test(leave));
  check('départ : « s\u2019en va… » + champ « Membres restants »', /s\u2019en va/.test(leave) && /Membres restants/.test(leave));
  check('départ : la carte n\u2019est jamais proposée (clé absente de member_leave)', !/Carte de bienvenue/.test(leave));

  // (d) Le rendu côté SERVEUR, pour comparer : la bienvenue sans carte est
  //     bien en V2 avec des séparateurs natifs.
  console.log('\n7) Côté serveur : le panneau de bienvenue envoyé sur Discord');
  const welcomeV2 = welcomeV2Server();
  check('le modèle « bienvenue pro » produit des séparateurs natifs', v2.dividers(welcomeV2) >= 3,
    `${v2.dividers(welcomeV2)}`);
  check('le modèle « bienvenue pro » ne contient aucun trait texte ━', !v2.allText(welcomeV2).includes('\u2501'));
  check('l\u2019en-tête est une Section (type 9) avec vignette en accessoire',
    collect(welcomeV2, 9).some((n) => n.accessory && Number(n.accessory.type) === 11));

  // v240 — la carte image passe en V2 + MediaGallery SAUF quand un profil
  // d'envoi impose un webhook : V2 + webhook + files = 400 (piège n°10).
  // L'embed classique ne reste donc que pour ce dernier cas.
  const branchStart = evSrc.indexOf('if (!cfg.plain) {');
  // ⚠️ Le premier `} else {` après ce point est celui de la branche CARTE —
  // il tombe AVANT le ui.v2panel. On découpe jusqu'à l'envoi effectif.
  const cardBranch = evSrc.slice(branchStart, evSrc.indexOf('const ok = await identity.sendAsProfile', branchStart));
  check('branche carte image + webhook : EmbedBuilder conservé (V2 + webhook + files = 400)',
    /const carteV2 = files\.length && !viaWebhook;/.test(cardBranch)
    && /new EmbedBuilder\(\)/.test(cardBranch));
  check('branche sans carte : toujours ui.v2panel (pas de régression)',
    /ui\.v2panel\(\{/.test(cardBranch));

  // -----------------------------------------------------------------------
  // 7) Garde-fous source
  // -----------------------------------------------------------------------
  console.log('\n8) Garde-fous source');
  const panelsSrc = src('server/discord/panels.js');
  const fnStart = panelsSrc.indexOf('async function sendTranscriptDm(');
  const fnEnd = panelsSrc.indexOf('\n// ====', fnStart);
  const fnBody = panelsSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 6000);
  // On retire les commentaires : ils citent volontairement l'ancien code.
  const codeOnly = (t) => t.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  const fnCode = codeOnly(fnBody);

  check('sendTranscriptDm passe par ui.v2panel', /ui\.v2panel\(\{/.test(fnCode));
  check('sendTranscriptDm référence le .txt via l\u2019option files', /files: \[fileName\]/.test(fnCode));
  check('sendTranscriptDm éteint explicitement l\u2019heure du pied', /timestamp: false/.test(fnCode));
  check('sendTranscriptDm passe les boutons en 2ᵉ argument de v2panel', /\}, url \? \[ui\.linkRow\(/.test(fnCode));
  check('sendTranscriptDm garde un repli classique si le V2 est refusé',
    /catch \(e\) \{/.test(fnCode) && /new EmbedBuilder\(\)/.test(fnCode));
  check('sendTranscriptDm n\u2019envoie plus d\u2019embed en chemin nominal',
    !/^\s*embeds: \[embed\]/m.test(fnCode));

  const uiSrc = src('server/discord/ui.js');
  check('ui.js importe FileBuilder', /FileBuilder/.test(uiSrc.split('require(\'discord.js\')')[0]));
  check('ui.v2panel ne peut plus écraser options.rows', /finalRows/.test(uiSrc));
  check('ui.v2container borne le nombre de composants File', /fileRefs\.slice\(0, 10\)/.test(uiSrc));

  // Les constantes de type du helper doivent coller à discord.js : 21 fichiers
  // de test l'importent, une valeur fausse y ferait échouer des assertions en
  // silence (SECTION valait 18 alors que l'API dit 9).
  const CT = require('discord.js').ComponentType;
  const TYPE_MAP = {
    ACTION_ROW: 'ActionRow', SECTION: 'Section', TEXT_DISPLAY: 'TextDisplay',
    THUMBNAIL: 'Thumbnail', MEDIA_GALLERY: 'MediaGallery', FILE: 'File',
    SEPARATOR: 'Separator', CONTAINER: 'Container',
  };
  const ecarts = Object.entries(TYPE_MAP).filter(([k, n]) => v2.TYPE[k] !== CT[n]);
  check('test/helpers/v2.js : les 8 constantes TYPE collent à discord.js',
    ecarts.length === 0, ecarts.map(([k, n]) => `${k}=${v2.TYPE[k]} attendu ${CT[n]}`).join(', '));

  // La migration v231→v236 ne doit pas régresser.
  const serverFiles = fs.readdirSync(path.join(__dirname, '..', 'server', 'discord')).filter((f) => f.endsWith('.js'));
  const legacy = serverFiles.filter((f) => {
    const t = codeOnly(src('server/discord/' + f));
    return /\bui\.panel\(|\bui\.embed\(/.test(t);
  });
  check('aucun retour de ui.panel( / ui.embed( dans server/discord', legacy.length === 0, legacy.join(', '));

  // -----------------------------------------------------------------------
  // 8) Aucun secret ajouté
  // -----------------------------------------------------------------------
  console.log('\n9) Aucun secret ajouté');
  const fuites = ['server/discord/ui.js', 'server/discord/panels.js', 'public/js/dashboard.js', 'test/v239-test.js']
    .filter((f) => /(ghp_|github_pat_|rnd_|xox[baprs]-)[A-Za-z0-9_-]{15,}/.test(src(f)));
  check('aucun token en dur dans les fichiers modifiés', fuites.length === 0, fuites.join(', '));

  // -----------------------------------------------------------------------
  // 9) Version épinglée
  // -----------------------------------------------------------------------
  console.log('\n10) Version épinglée v239');
  const index = src('public/index.html');
  const sw = src('public/sw.js');
  check('index.html : ?v=293 référencé 7 fois', (index.match(/\?v=293/g) || []).length === 7,
    `trouvé ${(index.match(/\?v=293/g) || []).length}`);
  check("sw.js : cache 'botdev-v293'", sw.includes("const CACHE = 'botdev-v293';"));
  check('index.html : plus aucun ?v=238', !/\?v=238/.test(index));
}

main().then(() => {
  try { store.db.close(); } catch {}
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n${echecs === 0 ? '🎉' : '❌'} V239 — ${echecs} échec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
}).catch((e) => { console.error('💥 Erreur fatale du test :', e); process.exit(1); });
