// Test v1.17 : réinitialisation automatique après fermeture/suppression
// → le nouveau ticket reprend le nom d'origine, les anciens salons fermés sont nettoyés.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v17-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');

(async () => {
  store.settings.set('public_url', 'https://botdev-kqbd.onrender.com');
  store.tickets.set(1, 'G1', {
    name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket',
    support_role: 'Staff', category: 'Tickets',
    types: JSON.stringify([
      { label: 'Ticket contre admin', emoji: '⚔️', category: 'Admin', staff_role: 'Admins' },
    ]),
  });

  const roles = { R2: { id: 'R2', name: 'Admins' } };
  const channels = [];
  let lastCreated, lastReply, shownModal, deletedIds = [];

  const makeChannel = (name, topic) => {
    const ch = {
      id: 'CH-' + name + '-' + channels.length,
      name, topic,
      send: async () => {},
      delete: async () => {
        deletedIds.push(name);
        const i = channels.indexOf(ch);
        if (i !== -1) channels.splice(i, 1); // comme Discord : le salon quitte le cache
      },
      permissionOverwrites: { edit: async () => {} },
      permissionsFor: () => ({ has: () => true }),
      messages: { fetch: async () => new Map() },
    };
    channels.push(ch);
    return ch;
  };

  const guild = {
    id: 'G1', name: 'Serveur', ownerId: 'OWNER1',
    roles: { cache: { get: (id) => roles[id], find: (fn) => Object.values(roles).find(fn) } },
    channels: {
      cache: {
        get: (id) => channels.find((c) => c.id === id),
        find: (fn) => channels.find(fn),
        values: function* () { for (const c of channels) yield c; },
      },
      create: async (opts) => {
        if (opts.type === 4) return { id: 'CAT-' + opts.name, name: opts.name };
        lastCreated = opts;
        return makeChannel(opts.name, opts.topic);
      },
    },
    members: { me: null },
  };

  const openType = async (typeLabel, reason) => {
    shownModal = null;
    const sel = {
      guild, user: { id: 'U1' },
      member: { user: { id: 'U1', username: 'Membre', tag: 'Membre#1' }, roles: { cache: { has: () => false } } },
      customId: 'bd-ttype:1', values: [typeLabel],
      isStringSelectMenu: () => true, isButton: () => false, isChatInputCommand: () => false,
      isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
      reply: async (p) => { lastReply = p; },
      showModal: async (m) => { shownModal = m; },
    };
    await panels.dispatchPanels(1, sel);
    assert(shownModal, 'modale raison attendue');
    await panels.dispatchPanels(1, {
      ...sel, customId: 'bd-treason:1', isStringSelectMenu: () => false, isModalSubmit: () => true,
      fields: { getTextInputValue: () => reason },
    });
  };

  const staffBtn = (cid, channel) => ({
    guild, user: { id: 'STAFF1' },
    member: { user: { id: 'STAFF1', tag: 'Staff#1' }, roles: { cache: { has: (id) => id === 'R2' } }, permissions: { has: () => false } },
    channel,
    customId: cid, isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async (p) => { lastReply = p; },
    update: async (p) => { lastReply = p; },
    deferReply: async () => { lastReply = null; },
    deferUpdate: async () => { lastReply = null; },
    editReply: async (p) => { lastReply = p; },
    isRepliable: () => true,
    showModal: async (m) => { shownModal = m; },
    client: { users: { fetch: async (id) => ({ id, send: async () => {} }) } },
  });

  // ---------- 1. Premier ticket : nom d'origine ----------
  await openType('Ticket contre admin', 'je me suis fait attaquer');
  assert(lastCreated.name === 'ticket-contre-ad-membre', 'nom : ' + lastCreated.name);
  const ch1 = channels[channels.length - 1];
  console.log('1️⃣  Ouverture → « ticket-contre-ad-membre » ✅');

  // ---------- 2. Fermeture par le staff → registre ----------
  ch1.permissionsFor = () => ({ has: () => false }); // verrouillé
  await panels.dispatchPanels(1, staffBtn('bd-tmenu:1:close', ch1));
  assert(lastReply.content.includes('fermé'), 'fermeture confirmée');
  assert(store.closedTickets.isClosed(ch1.id), 'registre : salon marqué fermé');
  console.log('2️⃣  Fermeture → registre mis à jour ✅');

  // ---------- 3. Réouverture du même type → RÉINITIALISATION automatique ----------
  deletedIds = [];
  await openType('Ticket contre admin', 'récidive');
  assert(deletedIds.includes('ticket-contre-ad-membre'), 'ancien salon fermé supprimé automatiquement');
  assert(lastCreated.name === 'ticket-contre-ad-membre', 'nom RÉINITIALISÉ : ' + lastCreated.name);
  assert(!store.closedTickets.isClosed(ch1.id), 'registre nettoyé');
  console.log('3️⃣  Réouverture → ancien salon nettoyé + nom réinitialisé ✅ («', lastCreated.name, '»)');

  // ---------- 4. Ticket ouvert → deuxième refusé ----------
  lastReply = null;
  await openType('Ticket contre admin', 'encore moi');
  assert(lastReply.content.includes('déjà un ticket ouvert'), 'bloqué');
  console.log('4️⃣  Ticket ouvert → deuxième ticket REFUSÉ ✅');

  // ---------- 5. Suppression (modale) → registre immédiat + réouverture OK ----------
  const ch2 = channels[channels.length - 1];
  deletedIds = [];
  shownModal = null;
  await panels.dispatchPanels(1, staffBtn('bd-tmenu:1:delete', ch2));
  assert(shownModal && shownModal.data.title.includes('Supprimer'), 'modale raison');
  await panels.dispatchPanels(1, {
    ...staffBtn('bd-tdel:1', ch2), isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'doublon' },
  });
  assert(store.closedTickets.isClosed(ch2.id), 'registre mis à jour dès la suppression');
  console.log('5️⃣  Suppression → registre immédiat (même avant la fin du délai) ✅');

  // ---------- 6. Réouverture immédiate (pendant le délai de suppression) ----------
  await openType('Ticket contre admin', 'revenu');
  assert(lastCreated.name === 'ticket-contre-ad-membre', 'nom réinitialisé même pendant le délai : ' + lastCreated.name);
  console.log('6️⃣  Réouverture immédiate après suppression → OK ✅ («', lastCreated.name, '»)');

  console.log('\n🎉 Tous les tests v1.17 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
