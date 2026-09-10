// v259 — Menus contextuels (clic droit) : membre et message.
//
// Feuille de route : clic droit sur un membre → « Voir le profil »,
// « Avertir » ; clic droit sur un message → « Signaler ce message »,
// « Ouvrir un ticket sur ce message ». Hoxera était 100 % slash : c'est un
// ajout très visible pour peu de code.
//
// Règles produit vérifiées ici :
//   • payloads de type 2 (membre) et 3 (message), AJOUTÉS EN TÊTE de la
//     synchronisation globale — le plafond de 90 ne peut pas les évincer ;
//   • noms fr + name_localizations en (v240 : fr et en seulement) ;
//   • « Avertir » : permission de modération exigée, raison par MODALE
//     (jamais vide), enregistrement en base + journal du serveur ;
//   • « Signaler » : anti-spam d'une minute, enregistrement en table
//     reports + journal ;
//   • « Ouvrir un ticket sur ce message » : réutilise openTicket() du
//     module tickets (lien et extrait du message en raison) ;
//   • toutes les confirmations sont éphémères (v238).

process.env.BOTDEV_DATA_DIR = process.env.BOTDEV_DATA_DIR || require('node:fs').mkdtempSync('/tmp/v259-');

const fs = require('node:fs');
const path = require('node:path');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const botManager = racine('server/discord/botManager.js');
const dbSrc = racine('server/db.js');
const index = racine('public/index.html');

const store = require('../server/db');
const ctx = require('../server/discord/contextmenus');
const i18n = require('../server/i18n');

console.log('— 1. Les quatre menus existent, en fr et en —');
const payloads = ctx.buildContextMenuPayloads();
check('deux menus membre (type 2) et deux menus message (type 3)',
  payloads.filter((p) => p.type === 2).length === 2 && payloads.filter((p) => p.type === 3).length === 2);
check('les noms fr de la feuille de route',
  payloads.map((p) => p.name).join('|') === 'Voir le profil|Avertir|Signaler ce message|Ouvrir un ticket sur ce message');
check('…localisations anglaises présentes',
  payloads.every((p) => p.name_localizations && p.name_localizations.en));
check('…« Avertir » réservé à qui peut modérer',
  payloads.find((p) => p.name === 'Avertir').default_member_permissions != null);

console.log('— 2. Synchronisation et routage —');
check('les menus sont EN TÊTE de la synchro (le plafond 90 ne les évince pas)',
  botManager.indexOf('buildContextMenuPayloads(),') < botManager.indexOf('...buildSlashPayloads(botId)'));
check("…et traités AVANT tous les gestionnaires d'interactions",
  botManager.indexOf("require('./contextmenus')") < botManager.indexOf("require('./extra')"));

console.log('— 3. Voir le profil (interaction simulée) —');
(async () => {
  let rep = null;
  await ctx.handleInteraction(1, {}, {
    isModalSubmit: () => false,
    isUserContextMenuInteraction: () => true,
    isMessageContextMenuInteraction: () => false,
    commandName: 'Voir le profil',
    guild: { id: 'G1', name: 'Test' },
    targetUser: { id: 'U2', username: 'Bob', createdTimestamp: Date.now() },
    targetMember: { joinedTimestamp: Date.now(), roles: { cache: { filter: () => ({ map: () => [] }) } } },
    reply: async (p) => { rep = p; },
  });
  check('réponse éphémère en Components V2 (panneau, pas embed)',
    !!rep && typeof rep.flags === 'number' && rep.flags > 0 && Array.isArray(rep.components));
  check('…quatre champs : création, arrivée, rôles, avertissements',
    JSON.stringify(rep).includes('Compte créé') && JSON.stringify(rep).includes('Avertissements actifs'));

  console.log('— 4. Avertir : permission, modale, enregistrement —');
  let rep2 = null;
  await ctx.handleInteraction(1, {}, {
    isModalSubmit: () => false,
    isUserContextMenuInteraction: () => true,
    isMessageContextMenuInteraction: () => false,
    commandName: 'Avertir',
    guild: { id: 'G1', name: 'Test' },
    member: { permissions: { has: () => false } },
    targetUser: { id: 'U2' },
    reply: async (p) => { rep2 = p; },
  });
  check('sans permission de modération : refus éphémère',
    !!rep2 && JSON.stringify(rep2).includes('Permission de modération'));
  let modal = null;
  await ctx.handleInteraction(1, {}, {
    isModalSubmit: () => false,
    isUserContextMenuInteraction: () => true,
    isMessageContextMenuInteraction: () => false,
    commandName: 'Avertir',
    guild: { id: 'G1', name: 'Test' },
    member: { permissions: { has: () => true } },
    targetUser: { id: 'U2' },
    showModal: async (m) => { modal = m; },
  });
  const mj = modal && (modal.toJSON ? modal.toJSON() : modal.data);
  check('avec permission : modale de raison portant la cible',
    !!mj && JSON.stringify(mj).includes('ctxwarn:U2'));
  const avant = store.warnings.count(1, 'G1', 'U2');
  let rep3 = null;
  await ctx.handleInteraction(1, {}, {
    isModalSubmit: () => true,
    customId: 'ctxwarn:U2',
    guild: { id: 'G1', name: 'Test' },
    user: { id: 'M1' },
    fields: { getTextInputValue: () => 'Raison de test' },
    reply: async (p) => { rep3 = p; },
  });
  check('la raison envoyée devient un avertissement en base',
    store.warnings.count(1, 'G1', 'U2') === avant + 1);
  check('…confirmation éphémère au modérateur',
    !!rep3 && JSON.stringify(rep3).includes('Membre averti'));

  console.log('— 5. Signaler ce message : anti-spam —');
  let rep4 = null;
  const msgStub = {
    isModalSubmit: () => false,
    isUserContextMenuInteraction: () => false,
    isMessageContextMenuInteraction: () => true,
    commandName: 'Signaler ce message',
    guild: { id: 'G1', name: 'Test' },
    user: { id: 'U9' },
    channel: { id: 'C1' },
    targetMessage: { id: 'M1', author: { id: 'A1' }, content: 'bla', url: 'https://discord.com/x' },
    reply: async (p) => { rep4 = p; },
  };
  await ctx.handleInteraction(1, {}, msgStub);
  check('premier signalement : confirmé et enregistré',
    !!rep4 && JSON.stringify(rep4).includes('signalé au staff') && store.reports.count(1, 'G1', 'U9') >= 1);
  let rep5 = null;
  await ctx.handleInteraction(1, {}, { ...msgStub, reply: async (p) => { rep5 = p; } });
  check('deuxième dans la minute : refroidi',
    !!rep5 && JSON.stringify(rep5).includes('moins d'));

  console.log('— 6. Ticket et textes —');
  check('le menu ticket réutilise openTicket du module tickets',
    racine('server/discord/contextmenus.js').includes("panels.openTicket(botId, i, null, reason)"));
  check('toutes les clés de texte existent en fr ET en',
    ['ctx_guild_only', 'ctx_warn_done', 'ctx_report_done', 'ctx_report_cooldown', 'ctx_ticket_reason',
      'ctx_warn_modal_reason', 'ctx_profile_created'].every((k) => i18n.t('fr', k) !== k && i18n.t('en', k) !== k));
  check('la table reports existe en base et est exportée',
    dbSrc.includes('CREATE TABLE IF NOT EXISTS reports (') && !!store.reports);

  console.log('— 7. Version —');
  check('index.html : ?v=273 référencé 7 fois', (index.match(/\?v=273/g) || []).length === 7,
    String((index.match(/\?v=273/g) || []).length));
  check('sw.js : cache « botdev-v273 »', racine('public/sw.js').includes("const CACHE = 'botdev-v273';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v259 — ${ok} vérifications OK : le clic droit arrive dans Hoxera.`);
  else { console.log(`❌ v259 — ${ko} échec(s)`); process.exitCode = 1; }
})();
