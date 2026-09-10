// ============================================================================
// Test v238 — 2 demandes utilisateur sur les tickets :
//
//  1. Le pied de page du panneau du SALON PRIVÉ affichait le lien du dashboard
//     (`public_url`) et l'heure. Retirés : il ne reste que « Hoxera · Ticket #N ».
//  2. Le système « ➕ Ajouter un membre » rendu professionnel :
//     • recherche tolérante : @mention → identifiant → pseudo d'affichage /
//       surnom / pseudo / tag EXACT → début de pseudo → pseudo contenu ;
//     • plusieurs résultats → MENU DE CHOIX au lieu d'un échec ;
//     • réponses en panneaux Components V2 (succès / introuvable / ambigu /
//       accès refusé), toutes éphémères (visibles par le staff seul) ;
//     • bouton « 🔁 Réessayer » qui rouvre la fenêtre à remplir.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v238-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const i18n = require('../server/i18n');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', f), 'utf8');

const BOT = store.bots.create({ user_id: store.users.create('discord:v238@x', 'x', {}), name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
const GUILD = 'G238';
const STAFF = 'STAFF1';

// ---------------------------------------------------------------------------
// Serveur factice : 6 membres aux formes de nom différentes.
// ---------------------------------------------------------------------------
const mkMember = (id, username, opts = {}) => ({
  id,
  nickname: opts.nickname || null,
  displayName: opts.displayName || opts.nickname || username,
  user: {
    id, username,
    globalName: opts.globalName || null,
    tag: `${username}#0001`,
    displayAvatarURL: () => `https://cdn.discordapp.com/${username}.png`,
  },
});
const MEMBERS = [
  mkMember('100000000000000001', 'alice', { globalName: 'Alice Martin', nickname: 'Alice 🌸' }),
  mkMember('100000000000000002', 'bob', { displayName: 'Bobby' }),
  mkMember('100000000000000003', 'charlie'),
  mkMember('100000000000000004', 'alicia'),          // commence aussi par « ali »
  mkMember('100000000000000005', 'zoe', { nickname: 'Zoé du 75' }),
  mkMember('100000000000000006', 'supportbot'),
];
const findMember = (id) => MEMBERS.find((m) => m.id === id) || null;
const guild = {
  id: GUILD, name: 'Serveur de Hoxera', ownerId: STAFF, iconURL: () => null,
  members: {
    cache: { get: (id) => findMember(id), values: () => MEMBERS.values(), find: (fn) => MEMBERS.find(fn) },
    fetch: async (arg) => {
      if (typeof arg === 'string') {
        const m = findMember(arg);
        if (!m) throw new Error('Unknown Member');
        return m;
      }
      return { values: () => MEMBERS.values() };
    },
  },
  channels: { cache: { get: () => null, find: () => null } },
  roles: { cache: { find: () => null, has: () => false } },
};

// Canal de ticket : enregistre les permissions posées, et peut être mis en échec.
let granted = [];
let grantFails = false;
const channel = {
  id: 'CTICKET', name: 'ticket-alice', isTextBased: () => true,
  permissionOverwrites: {
    edit: async (id, perms) => {
      if (grantFails) throw new Error('Missing Permissions');
      granted.push({ id, perms });
      return {};
    },
  },
};

// Interaction factice (le staff est propriétaire du serveur → isStaff = true).
const mkInteraction = (value, extra = {}) => {
  const out = { replied: null, updated: null, modal: null, guild, channel, member: { permissions: { has: () => true }, roles: { cache: new Map() } }, user: { id: STAFF, tag: 'Staff#0001' }, ...extra };
  out.reply = async (p) => { out.replied = p; return {}; };
  out.update = async (p) => { out.updated = p; return {}; };
  out.showModal = async (m) => { out.modal = m; return {}; };
  out.fields = { getTextInputValue: () => value };
  out.values = extra.values || [];
  return out;
};

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n1) Pied de page du salon privé : plus de lien, plus d\'heure');
  // ═══════════════════════════════════════════════════════════════════════
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' }, toString: () => '@Alice', guild };
  const chosen = { label: 'Support', emoji: '🎫', description: 'Pour toute demande.', staff_roles: [], color: '#5865F2' };
  const welcome = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'Ma demande', '', [], 'fr', { number: 12 }, {},
    { content: '🎫 **Support** · @Alice' });
  const footer = v2.footer(welcome);
  check('pied de page : signature conservée « Hoxera · Ticket #12 »', footer === 'Hoxera · Ticket #12', JSON.stringify(footer));
  check('pied de page : le lien du dashboard a disparu',
    !footer.includes('hoxera.is-a.dev') && !v2.json(welcome).includes('hoxera.is-a.dev'));
  check('pied de page : l\'horodatage a disparu', !/\d{2}\/\d{2}\s+\d{2}:\d{2}/.test(footer));
  check('pied de page : le lien reste utilisé AILLEURS (bannière du panneau public)',
    src('panels.js').includes("store.settings.get('public_url') || 'https://hoxera.is-a.dev'"));
  check('pied de page : le reste du panneau est intact (V2 + séparateurs + menu dedans)',
    v2.isV2(welcome) && v2.dividers(welcome) >= 3 && v2.title(welcome).includes('🎫'));

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n2) Recherche du membre — toutes les formes de saisie');
  // ═══════════════════════════════════════════════════════════════════════
  const resolve = (q) => panels.__testResolveTicketMember(guild, q);
  const one = async (q, id, label) => {
    const r = await resolve(q);
    check(label, !!r.member && r.member.id === id && !r.matches,
      r.member ? `trouvé ${r.member.id}` : (r.matches ? `${r.matches.length} candidats` : 'rien'));
  };
  await one('<@100000000000000003>', '100000000000000003', '@mention <@id> → trouvé');
  await one('<@!100000000000000003>', '100000000000000003', '@mention <@!id> (ancien format) → trouvé');
  await one('100000000000000003', '100000000000000003', 'identifiant brut → trouvé');
  await one('id 100000000000000003 svp', '100000000000000003', 'identifiant entouré de texte → trouvé');
  await one('charlie', '100000000000000003', 'pseudo exact → trouvé');
  await one('CHARLIE', '100000000000000003', 'pseudo exact en MAJUSCULES → trouvé');
  await one('Alice 🌸', '100000000000000001', 'surnom exact → trouvé');
  await one('Bobby', '100000000000000002', 'pseudo d\'affichage exact → trouvé');
  await one('Alice Martin', '100000000000000001', 'pseudo global exact → trouvé');
  await one('charlie#0001', '100000000000000003', 'tag complet → trouvé');
  await one('supportbot', '100000000000000006', 'un bot peut être ajouté → trouvé');
  await one('  charlie  ', '100000000000000003', 'espaces autour → ignorés');

  // Début de pseudo : 1 seul résultat → pris directement.
  await one('zoe', '100000000000000005', 'pseudo exact alors qu\'un surnom existe → trouvé');
  await one('char', '100000000000000003', 'début de pseudo, 1 seul candidat → trouvé');
  await one('lie', '100000000000000003', 'pseudo contenu (« charlie » contient « lie ») → 1 seul candidat');

  // Ambiguïté : « ali » matche alice ET alicia → on ne devine PAS.
  const amb = await resolve('ali');
  check('ambigu (« ali » → alice + alicia) : aucun membre choisi arbitrairement',
    !amb.member && Array.isArray(amb.matches) && amb.matches.length === 2,
    amb.member ? 'un membre a été choisi !' : `${(amb.matches || []).length} candidats`);
  check('ambigu : les 2 candidats sont bien alice et alicia',
    (amb.matches || []).map((m) => m.id).sort().join(',') === '100000000000000001,100000000000000004');

  // Introuvable / vide.
  const none = await resolve('zzz-introuvable');
  check('introuvable : ni membre ni candidat', !none.member && !none.matches);
  check('saisie vide : rien (pas de crash, pas de liste complète)',
    !(await resolve('')).member && !(await resolve('   ')).member);
  check('identifiant inexistant : retombe sur la recherche textuelle sans crasher',
    !(await resolve('999999999999999999')).member);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n3) Ajout réussi — panneau pro, éphémère, accès réellement posés');
  // ═══════════════════════════════════════════════════════════════════════
  granted = []; grantFails = false;
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  const it1 = mkInteraction('charlie');
  // pendingAdds est posé par handleTicketAddAsk ; on simule son passage.
  const itAsk = mkInteraction('');
  await armPending(BOT, itAsk);
  check('fenêtre à remplir : ouverte via le menu staff', !!itAsk.modal);
  check('fenêtre à remplir : le placeholder annonce les 3 formes acceptées',
    itAsk.modal && JSON.stringify(itAsk.modal.toJSON ? itAsk.modal.toJSON() : itAsk.modal).includes('@mention'));
  await panels.__testSubmitAddMember(BOT, it1);
  // __testSubmitAddMember consomme pendingAdds : on le repose pour chaque cas.
  const rep = it1.replied;
  check('succès : un panneau Components V2 est répondu', rep && v2.isV2(rep));
  check('succès : éphémère (visible par le staff seul, choix utilisateur)',
    rep && (rep.flags & 64) !== 0);
  check('succès : titre + description nomment le membre',
    rep && v2.title(rep) === i18n.t('fr', 'ticket_add_ok_title')
    && v2.texts(rep).some((t) => t.includes('charlie') || t.includes('Charlie')));
  check('succès : les 4 blocs pro sont rendus (compte, identifiant, ajouté par, accès)',
    rep && ['🔖 Compte', '🆔 Identifiant', '🖐️ Ajouté par', '🔓 Accès accordés'].every((k) => v2.json(rep).includes(k)));
  check('succès : l\'identifiant et le staff sont cités',
    rep && v2.json(rep).includes('100000000000000003') && v2.json(rep).includes(`<@${STAFF}>`));
  check('succès : l\'avatar du membre est en vignette',
    rep && v2.thumbnailUrls(rep).includes('https://cdn.discordapp.com/charlie.png'));
  check('succès : séparateurs natifs, aucun trait texte ━',
    rep && v2.dividers(rep) >= 1 && !v2.json(rep).includes(ui.SEPARATOR));
  check('succès : les permissions sont RÉELLEMENT posées sur le salon',
    granted.length === 1 && granted[0].id === '100000000000000003'
    && granted[0].perms.ViewChannel === true && granted[0].perms.SendMessages === true
    && granted[0].perms.ReadMessageHistory === true);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n4) Plusieurs candidats — menu de choix au lieu d\'un échec');
  // ═══════════════════════════════════════════════════════════════════════
  granted = [];
  const it2 = mkInteraction('ali');
  await armPending(BOT, it2);
  await panels.__testSubmitAddMember(BOT, it2);
  const amb2 = it2.replied;
  check('ambigu : panneau V2 éphémère avec un MENU de choix', amb2 && v2.isV2(amb2) && (amb2.flags & 64) !== 0);
  check('ambigu : le titre annonce plusieurs correspondances',
    amb2 && v2.title(amb2) === i18n.t('fr', 'ticket_add_amb_title'));
  check('ambigu : le menu porte le bon customId et 1 seule valeur',
    amb2 && v2.json(amb2).includes(`bd-taddpick:${BOT}`) && v2.json(amb2).includes('"min_values":1'));
  check('ambigu : les 2 candidats sont proposés avec leur pseudo',
    amb2 && v2.json(amb2).includes('100000000000000001') && v2.json(amb2).includes('100000000000000004'));
  check('ambigu : le menu est DANS le conteneur', amb2 && v2.rows(amb2).length === 1);
  check('ambigu : AUCUNE permission posée tant que le staff n\'a pas tranché', granted.length === 0);

  // Le staff tranche → l'accès est posé et le message est REMPLACÉ.
  const it3 = mkInteraction('', { values: ['100000000000000004'] });
  await panels.__testSubmitAddMemberPick(BOT, it3);
  check('choix : le message de choix est mis à jour (pas de 2ᵉ message)', !!it3.updated && !it3.replied);
  check('choix : la mise à jour reste en Components V2 (jamais de content)',
    it3.updated && (it3.updated.flags & 32768) !== 0 && it3.updated.content === undefined);
  check('choix : panneau de confirmation du bon membre',
    it3.updated && v2.title(it3.updated) === i18n.t('fr', 'ticket_add_ok_title')
    && v2.json(it3.updated).includes('100000000000000004'));
  check('choix : la permission est posée sur le membre choisi',
    granted.length === 1 && granted[0].id === '100000000000000004');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n5) Introuvable — le panneau explique au lieu de juste rater');
  // ═══════════════════════════════════════════════════════════════════════
  granted = [];
  const it4 = mkInteraction('zzz-introuvable');
  await armPending(BOT, it4);
  await panels.__testSubmitAddMember(BOT, it4);
  const err = it4.replied;
  check('introuvable : panneau V2 éphémère', err && v2.isV2(err) && (err.flags & 64) !== 0);
  check('introuvable : la saisie du staff est reprise dans le message',
    err && v2.json(err).includes('zzz-introuvable'));
  check('introuvable : la liste de ce qui est accepté est affichée (4 formes)',
    err && ['@mention', 'identifiant', 'pseudo', 'début de pseudo'].every((k) => v2.json(err).includes(k)));
  check('introuvable : l\'astuce « mode développeur » est affichée',
    err && v2.json(err).includes('mode développeur'));
  check('introuvable : un bouton « 🔁 Réessayer » est proposé',
    err && v2.rows(err).length === 1 && v2.json(err).includes(`bd-taddretry:${BOT}`)
    && v2.json(err).includes('Réessayer'));
  check('introuvable : aucune permission posée', granted.length === 0);

  // Le bouton « Réessayer » rouvre bien la fenêtre.
  const itRetry = mkInteraction('');
  await armPending(BOT, itRetry, `bd-taddretry:${BOT}`);
  check('bouton « Réessayer » : rouvre la fenêtre à remplir', !!itRetry.modal);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n6) Cas limites — expiration, accès refusé, sécurité');
  // ═══════════════════════════════════════════════════════════════════════
  // Demande expirée (plus de pendingAdds) → message éphémère, pas de silence.
  // ⚠️ Le test du bouton « Réessayer » ci-dessus a ré-armé une demande pour le
  // staff : on la consomme d'abord (saisie vide → aucun effet, aucune
  // permission posée) pour partir d'un état réellement pur.
  await panels.__testSubmitAddMember(BOT, mkInteraction(''));
  granted = [];
  const it5 = mkInteraction('charlie');
  await panels.__testSubmitAddMember(BOT, it5);
  check('expiré : réponse éphémère qui explique (pas de silence)',
    it5.replied && it5.replied.ephemeral === true
    && String(it5.replied.content || '').includes('expiré'));
  check('expiré : aucune permission posée', granted.length === 0);

  // Discord refuse la modification des accès → on le dit au lieu de faire croire
  // que ça a marché (avant : `.catch(() => {})` puis « ✅ ajouté » quand même).
  const it6 = mkInteraction('charlie');
  await armPending(BOT, it6);
  grantFails = true; granted = [];
  await panels.__testSubmitAddMember(BOT, it6);
  check('accès refusé : un panneau d\'échec honnête (pas un faux « ✅ ajouté »)',
    it6.replied && v2.isV2(it6.replied) && v2.title(it6.replied) === i18n.t('fr', 'ticket_add_err_title')
    && v2.json(it6.replied).includes('refuse'));
  check('accès refusé : le membre est bien identifié + piste de correction donnée',
    v2.json(it6.replied).includes('trouvé') && v2.json(it6.replied).includes('au-dessus'));
  grantFails = false;

  // Non-staff → refus, comme partout ailleurs.
  const it7 = mkInteraction('charlie');
  it7.member = { permissions: { has: () => false }, roles: { cache: new Map() } };
  it7.user = { id: 'PASSTAFF', tag: 'Intru#0001' };
  await armPending(BOT, it7);
  await panels.__testSubmitAddMember(BOT, it7);
  check('sécurité : un non-staff est refusé', it7.replied && String(it7.replied.content || '').includes('staff'));
  const it8 = mkInteraction('', { values: ['100000000000000003'] });
  it8.member = { permissions: { has: () => false }, roles: { cache: new Map() } };
  it8.user = { id: 'PASSTAFF', tag: 'Intru#0001' };
  await panels.__testSubmitAddMemberPick(BOT, it8);
  check('sécurité : le menu de choix refuse aussi un non-staff',
    it8.replied && String(it8.replied.content || '').includes('staff'));

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n7) Garde-fous source');
  // ═══════════════════════════════════════════════════════════════════════
  const pSrc = src('panels.js');
  check('panels.js : plus de réponse en texte brut pour l\'ajout réussi',
    !pSrc.includes("interaction.reply({ content: i18n.t(lang, 'ticket_add_ok'"));
  check('panels.js : plus de recherche limitée au pseudo exact',
    !pSrc.includes("return name === q.toLowerCase() || nick === q.toLowerCase();"));
  check('panels.js : les 3 routes sont câblées (modale, choix, réessayer)',
    pSrc.includes('bd-taddm:${botId}') && pSrc.includes('bd-taddpick:${botId}') && pSrc.includes('bd-taddretry:${botId}'));
  check('panels.js : les 2 nouvelles routes sont bien dispatchées',
    pSrc.includes('submitAddMemberPick(botId, interaction)')
    && /bd-taddretry:\$\{botId\}`\)\) \{ await handleTicketAddAsk/.test(pSrc));
  check('panels.js : le plafond Discord de 25 options est respecté', pSrc.includes('.slice(0, 25)'));
  check('panels.js : le pied de page du salon privé ne calcule plus footerSite',
    !/ticketWelcomePanel[\s\S]{0,4200}footerSite/.test(pSrc));
  const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'i18n.js'), 'utf8');
  check('i18n : les nouvelles clés existent en FR et en EN',
    ['ticket_add_ok_title', 'ticket_add_err_title', 'ticket_add_amb_title', 'ticket_add_retry', 'ticket_add_expired']
      .every((k) => (i18nSrc.match(new RegExp(k + ':', 'g')) || []).length === 2));
  check('i18n : le placeholder de la fenêtre annonce les 3 formes acceptées',
    i18n.t('fr', 'ticket_add_modal_ph').includes('@mention')
    && i18n.t('fr', 'ticket_add_modal_ph').includes('identifiant')
    && i18n.t('fr', 'ticket_add_modal_ph').includes('pseudo'));

  console.log('\n8) Aucun secret ajouté');
  const fuites = ['server/discord/panels.js', 'server/i18n.js', 'test/v238-test.js']
    .filter((f) => /(ghp_|github_pat_|rnd_|xox[baprs]-)[A-Za-z0-9_-]{15,}/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
  check('aucun token en dur dans les fichiers modifiés', fuites.length === 0, fuites.join(', '));

  console.log('\n9) Version épinglée v238');
  {
    const root = path.join(__dirname, '..');
    const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
    check('index.html : ?v=261 référencé 7 fois', (index.match(/\?v=261/g) || []).length === 7,
      `trouvé ${(index.match(/\?v=261/g) || []).length}`);
    check("sw.js : cache 'botdev-v261'", sw.includes("const CACHE = 'botdev-v261';"));
    check('index.html : plus aucun ?v=237', !/\?v=237/.test(index));
  }
}

// dispatchPanels teste TOUS les prédicats `is*` de discord.js : un mock partiel
// fait plancher le dispatcher (« interaction.isChatInputCommand is not a
// function »). On fournit donc la série complète.
// ⚠️ Un Proxy ne survit PAS à un spread : `{ ...proxy }` ne copie que les clés
// réellement présentes et perd le piège `get`. On construit donc d'abord
// l'objet, puis on l'ENVELOPPE. Sans ça le dispatcher plante sur le premier
// prédicat discord.js absent du mock (isChatInputCommand, isRoleSelectMenu, …)
// — et cette liste s'allonge à chaque version de la lib.
function withPredicates(obj, which) {
  const base = {
    ...obj,
    isChatInputCommand: () => which === 'chat',
    isButton: () => which === 'button',
    isStringSelectMenu: () => which === 'select',
    isAnySelectMenu: () => which === 'select',
    isSelectMenu: () => which === 'select',
    isModalSubmit: () => which === 'modal',
    isRepliable: () => true,
    deferred: false,
    replied: false,
  };
  return new Proxy(base, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^is[A-Z]/.test(prop)) return () => false;
      return undefined;
    },
  });
}

// Purge la file interne des demandes en attente (aucune API publique) en
// laissant filer leur horodatage : le cas « expiré » doit être testable.
function pendingAddsVide() { /* rien à faire : chaque test consomme sa demande */ }

// dispatchPanels teste TOUS les prédicats `is*` de discord.js : un mock partiel
// fait plancher le dispatcher (« interaction.isChatInputCommand is not a
// function »). On fournit donc la série complète.
// Un Proxy fournit TOUTES les méthodes `is*` que discord.js peut exposer :
// sans ça le dispatcher plante sur le premier prédicat absent du mock
// (isChatInputCommand, isRoleSelectMenu, …) et la liste s'allonge à chaque
// version de la lib. Les 4 utiles sont surchargées explicitement.
const allPredicates = (which) => new Proxy({
  isChatInputCommand: () => which === 'chat',
  isButton: () => which === 'button',
  isStringSelectMenu: () => which === 'select',
  isAnySelectMenu: () => which === 'select',
  isSelectMenu: () => which === 'select',
  isModalSubmit: () => which === 'modal',
  isRepliable: () => true,
  deferred: false, replied: false,
}, {
  get: (target, prop) => {
    if (prop in target) return target[prop];
    if (typeof prop === 'string' && /^is[A-Z]/.test(prop)) return () => false;
    return undefined;
  },
});

// `pendingAdds` est une Map interne : elle n'est posée que par
// handleTicketAddAsk. On la déclenche via le dispatcher pour rester au plus
// près du comportement réel (menu staff → fenêtre à remplir).
async function armPending(botId, interaction, customId) {
  await panels.dispatchPanels(botId, withPredicates({
    ...interaction,
    customId: customId || `bd-tmenu:${botId}:addmember`,
    showModal: async (m) => { interaction.modal = m; },
  }, 'button'));
}

main().then(() => {
  try { store.db.close(); } catch {}
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n${echecs === 0 ? '🎉' : '❌'} V238 — ${echecs} échec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
}).catch((e) => { console.error('💥 Erreur fatale du test :', e); process.exit(1); });
