// Test v1.15 : pas de bouton sous le menu déroulant + réouverture après fermeture
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v15-${Date.now()}`);
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
      { label: 'Signaler un bug', emoji: '🐛', category: 'Bugs', staff_role: 'Devs' },
    ]),
  });

  // ---------- 1. Panneau : menu déroulant SANS bouton en dessous ----------
  let panelPayload;
  await panels.sendTicketPanel(1, 'G1', { user: { displayAvatarURL: () => 'https://x/a.png' } }, { send: async (p) => { panelPayload = p; } });
  const types = panelPayload.components.map((r) => r.components[0].data.type);
  assert(types.includes(3), 'menu déroulant présent');
  assert(!types.includes(2), 'aucun bouton générique');
  assert(panelPayload.embeds[0].data.description.includes('menu déroulant ci-dessous'), 'description adaptée au menu');
  console.log('1️⃣  Panneau = menu déroulant seul (sans bouton dessous) ✅');

  // ---------- Serveur simulé avec cache de salons ----------
  const channels = []; // salons existants
  const guild = {
    id: 'G1', name: 'Serveur', ownerId: 'OWNER1',
    roles: { cache: { get: () => undefined, find: () => undefined } },
    channels: {
      cache: { get: (id) => channels.find((c) => c.id === id), find: (fn) => channels.find(fn) },
      create: async (opts) => {
        if (opts.type === 4) return { id: 'CAT-' + opts.name, name: opts.name };
        const ch = { id: 'CH-' + opts.name, name: opts.name, send: async () => {}, topic: opts.topic };
        return ch;
      },
    },
    members: { me: null },
  };

  const makeOpen = (typeLabel, channelSuffix) => ({
    guild, user: { id: 'U1' },
    member: { user: { id: 'U1', username: 'Membre', tag: 'Membre#1' }, roles: { cache: { has: () => false } } },
    customId: 'bd-ttype:1', values: [typeLabel],
    isStringSelectMenu: () => true, isButton: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async (p) => { lastReply = p; },
  });
  let lastReply, lastCreated;

  // ---------- 2. Premier ticket : nom normal ----------
  guild.channels.create = async (opts) => {
    if (opts.type === 4) return { id: 'CAT-' + opts.name, name: opts.name };
    lastCreated = { name: opts.name };
    return { id: 'CH1', name: opts.name, send: async () => {}, topic: opts.topic };
  };
  await panels.dispatchPanels(1, makeOpen('Ticket contre admin'));
  assert(lastCreated.name === 'ticket-contre-ad-membre', 'nom : ' + lastCreated.name);
  console.log('2️⃣  Premier ticket → « ticket-contre-ad-membre » ✅');

  // ---------- 3. Ticket ENCORE OUVERT (membre peut voir) → autre type refusé ----------
  channels.push({ id: 'CH1', name: 'ticket-contre-ad-membre', permissionsFor: () => ({ has: () => true }) });
  lastReply = null;
  await panels.dispatchPanels(1, makeOpen('Signaler un bug'));
  assert(lastReply.content.includes('déjà un ticket ouvert'), 'bloqué : ' + lastReply.content);
  console.log('3️⃣  Ticket ouvert → deuxième ticket REFUSÉ ✅ («', lastReply.content, '»)');

  // ---------- 4. Ticket FERMÉ (membre ne peut plus voir) → même type rouvert avec suffixe ----------
  channels.length = 0;
  channels.push({ id: 'CH1', name: 'ticket-contre-ad-membre', permissionsFor: () => ({ has: () => false }) });
  lastReply = null; lastCreated = null;
  await panels.dispatchPanels(1, makeOpen('Ticket contre admin'));
  assert(lastCreated.name === 'ticket-contre-ad-membre-2', 'suffixe attendu : ' + lastCreated.name);
  console.log('4️⃣  Ticket fermé → MÊME type rouvert ✅ (« ' + lastCreated.name + ' »)');

  // ---------- 5. Ticket fermé → AUTRE type ouvert normalement ----------
  channels.length = 0;
  channels.push({ id: 'CH1', name: 'ticket-contre-ad-membre', permissionsFor: () => ({ has: () => false }) });
  lastCreated = null;
  await panels.dispatchPanels(1, makeOpen('Signaler un bug'));
  assert(lastCreated.name === 'signaler-un-bug-membre', 'nom : ' + lastCreated.name);
  console.log('5️⃣  Ticket fermé → AUTRE type ouvert ✅ (« ' + lastCreated.name + ' »)');

  // ---------- 6. Sans types configurés → simple bouton ----------
  store.tickets.set(1, 'G2', { name: 'S', channel: '#s', message: '', button_label: '🎫 Aide', support_role: '', category: 'T', types: '[]' });
  let payload2;
  await panels.sendTicketPanel(1, 'G2', { user: { displayAvatarURL: () => 'https://x/a.png' } }, { send: async (p) => { payload2 = p; } });
  const types2 = payload2.components.map((r) => r.components[0].data.type);
  assert(types2.includes(2) && !types2.includes(3), 'bouton seul sans types');
  assert(payload2.embeds[0].data.description.includes('🎫 Aide'), 'description mentionne le bouton');
  console.log('6️⃣  Sans types → simple bouton (description adaptée) ✅');

  console.log('\n🎉 Tous les tests v1.15 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
