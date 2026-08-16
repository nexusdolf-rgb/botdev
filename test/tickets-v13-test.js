// Test v1.13 : types personnalisables, staff par type, Fermer/Réouvrir/En attente, transcription + MP
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v13-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const { handlePanelCommand } = require('../server/discord/panelCommands');
const { buildSlashPayloads } = require('../server/discord/premade');

(async () => {
  store.settings.set('public_url', 'https://botdev-kqbd.onrender.com');
  store.tickets.set(1, 'G1', {
    name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket',
    support_role: 'Staff', category: 'Tickets',
    types: JSON.stringify([
      { label: 'Ticket contre admin', emoji: '⚔️', category: 'Admin', staff_role: 'Admins' },
      { label: 'Candidature staff', emoji: '📝', category: '', staff_role: 'Admins' },
      { label: 'Signaler un bug', emoji: '🐛', category: 'Bugs', staff_role: 'Devs' },
    ]),
  });

  const roles = { R1: { id: 'R1', name: 'Staff' }, R2: { id: 'R2', name: 'Admins' }, R3: { id: 'R3', name: 'Devs' } };
  const fakeMessages = new Map();
  const fakeMessage = (authorName, content) => ({
    author: { username: authorName },
    content,
    attachments: { size: 0 },
    embeds: { length: 0 },
    createdAt: new Date('2026-08-16T12:00:00Z'),
  });
  fakeMessages.set('1', fakeMessage('Je Suis Membre', 'Bonjour, j\'ai un souci'));
  fakeMessages.set('2', fakeMessage('StaffUser', 'Bonjour ! Quel est le problème ?'));

  let channelOverwrites = { member: { view: true, send: true } };
  const ticketChannel = {
    id: 'NEW_CH', name: 'ticket-contre-admin-membre',
    topic: 'Ticket de Je Suis Membre#1234 | 999888777666555444 | Ticket contre admin',
    send: async () => {},
    delete: async () => {},
    permissionOverwrites: {
      edit: async (id, perms) => {
        if (id === '999888777666555444') channelOverwrites.member = { view: perms.ViewChannel, send: perms.SendMessages };
      },
    },
    messages: { fetch: async () => fakeMessages },
  };

  const guild = {
    id: 'G1', name: 'Serveur Test', ownerId: 'OWNER1',
    roles: { cache: { get: (id) => roles[id], find: (fn) => Object.values(roles).find(fn) } },
    channels: {
      cache: { get: () => undefined, find: () => undefined },
      create: async (opts) => ({ ...ticketChannel, name: opts.name }),
    },
    members: { me: null },
  };

  // ---------- 1. Le panneau liste les 3 types ----------
  let panelPayload;
  await panels.sendTicketPanel(1, 'G1', { user: { displayAvatarURL: () => 'https://x.png/a.png' } }, { send: async (p) => { panelPayload = p; } });
  const sel = panelPayload.components.find((r) => r.components[0] && r.components[0].data.type === 3).components[0];
  assert(sel.options.length === 3, '3 types attendus');
  assert(sel.options[0].data.label === 'Ticket contre admin');
  console.log('1️⃣  Menu déroulant : 3 types personnalisés ✅ (', sel.options.map((o) => o.data.label).join(' | '), ')');

  // ---------- 2. Ticket « Ticket contre admin » → staff du type « Admins » dans les perms ----------
  let created, createdCategory = null;
  guild.channels.create = async (opts) => {
    if (opts.type === 4) { createdCategory = opts; return { id: 'CAT1', name: opts.name }; }
    created = opts; return { ...ticketChannel, name: opts.name };
  };
  const openInt = {
    guild, user: { id: 'U1' },
    member: { user: { id: 'U1', username: 'Je Suis Membre', tag: 'Je Suis Membre#1234' }, roles: { cache: { has: () => false } } },
    customId: 'bd-ttype:1', values: ['Ticket contre admin'],
    isStringSelectMenu: () => true, isButton: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async () => {},
  };
  await panels.dispatchPanels(1, openInt);
  assert(created && created.name.startsWith('ticket-contre-ad-'), 'nom attendu : ' + (created && created.name));
  assert(createdCategory && createdCategory.name === 'Admin', 'catégorie du type attendue');
  assert(created.parent === 'CAT1', 'salon dans la catégorie du type');
  const staffOverwrite = created.permissionOverwrites.find((p) => p.id === 'R2');
  assert(staffOverwrite, 'permission du rôle staff du TYPE (Admins) attendue');
  console.log('2️⃣  Ticket du type « ⚔️ Ticket contre admin » → catégorie Admin + rôle staff Admins ✅');

  // ---------- 3. Boutons Fermer / Réouvrir / En attente dans le ticket ----------
  const welcomeSent = {};
  const ch2 = { ...ticketChannel, send: async (p) => { Object.assign(welcomeSent, p); } };
  guild.channels.create = async (opts) => ch2;
  await panels.dispatchPanels(1, openInt);
  const labels = welcomeSent.components[0].components.map((c) => c.data.label);
  assert(labels.includes('🔒 Fermer') && labels.includes('🔓 Réouvrir') && labels.includes('⏸ En attente'));
  console.log('3️⃣  Boutons dans le ticket :', labels.join(' | '), '✅');

  // ---------- 4. Staff du type « Devs » (Signaler un bug) ne peut PAS fermer un ticket « admin » ----------
  const makeCloseBtn = (roleIds) => ({
    guild, user: { id: 'DEV1' },
    member: { user: { id: 'DEV1', username: 'Dev', tag: 'Dev#1' }, roles: { cache: { has: (id) => roleIds.includes(id) } }, permissions: { has: () => false } },
    channel: ticketChannel,
    customId: 'bd-tmenu:1:close', isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async (p) => { lastClose = p; },
  });
  let lastClose;
  await panels.dispatchPanels(1, makeCloseBtn(['R3']));
  assert(lastClose.content.includes('staff'), 'Devs refusé sur un ticket admin');
  console.log('4️⃣  Staff du type Devs sur ticket « admin » → REFUSÉ ✅');

  // ---------- 5. Staff du type « Admins » PEUT fermer → transcription + MP + verrou ----------
  let dmPayload = null;
  const staffClose = {
    ...makeCloseBtn(['R2']),
    client: { users: { fetch: async (id) => ({ id, send: async (p) => { dmPayload = p; } }) } },
  };
  await panels.dispatchPanels(1, staffClose);
  console.log('   [debug] lastClose =', JSON.stringify(lastClose));
  assert(lastClose && lastClose.content.includes('fermé'), 'fermeture confirmée');
  assert(dmPayload && dmPayload.embeds[0].data.title.includes('fermé'), 'MP envoyé');
  assert(dmPayload.embeds[0].data.description.includes('transcription'), 'lien de transcription dans le MP');
  assert(dmPayload.files && dmPayload.files[0].name.startsWith('transcription-'), 'fichier .txt joint');
  assert(channelOverwrites.member.view === false && channelOverwrites.member.send === false, 'salon verrouillé pour le créateur');
  const transcript = store.db.prepare('SELECT * FROM transcripts').all()[0];
  assert(transcript && transcript.messages.includes('Bonjour, j'), 'transcription stockée');
  console.log('5️⃣  Fermeture par staff du type ✅ → MP professionnel + lien transcription + fichier + verrouillage');

  // ---------- 6. Réouvrir ----------
  await panels.dispatchPanels(1, { ...staffClose, customId: 'bd-tmenu:1:reopen' });
  assert(channelOverwrites.member.view === true && channelOverwrites.member.send === true, 'accès restauré');
  console.log('6️⃣  Réouvrir → accès du créateur restauré ✅');

  // ---------- 7. En attente ----------
  await panels.dispatchPanels(1, { ...staffClose, customId: 'bd-tmenu:1:hold' });
  assert(channelOverwrites.member.view === true && channelOverwrites.member.send === false, 'en attente = lecture seule');
  console.log('7️⃣  En attente → créateur en lecture seule ✅');

  // ---------- 8. /ticket types add avec staffrole ----------
  let cmdReply = null;
  const ownerCmd = (group, sub) => ({
    guild, user: { id: 'OWNER1' },
    member: { user: { id: 'OWNER1', tag: 'Owner#1' }, permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    commandName: 'ticket', channel: { name: 'général' },
    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => group,
      getString: (k) => ({ nom: 'Ticket contre joueur', emoji: '⚔️', categorie: '', staffrole: 'Modos' })[k] || '',
      getChannel: () => null, getRole: () => ({ name: 'Staff' }), getInteger: () => 1, getUser: () => ({ id: 'x', toString: () => '<@x>' }),
    },
    reply: async (p) => { cmdReply = p; },
  });
  await handlePanelCommand(1, ownerCmd('types', 'add'));
  let types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(types.length === 4 && types[3].label === 'Ticket contre joueur' && types[3].staff_role === 'Modos');
  console.log('8️⃣  /ticket types add « ⚔️ Ticket contre joueur » (staff Modos) ✅');

  // ---------- 9. remove + list ----------
  await handlePanelCommand(1, ownerCmd('types', 'remove'));
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(types.length === 3 && !types.some((t) => t.label === 'Ticket contre joueur'));
  await handlePanelCommand(1, ownerCmd('types', 'list'));
  assert(cmdReply.embeds[0].data.description.includes('Signaler un bug'));
  console.log('9️⃣  /ticket types remove ✅ + /ticket types list ✅');

  // ---------- 10. Non-propriétaire : types refusés ----------
  let denied;
  const strangerCmd = { ...ownerCmd('types', 'add'), user: { id: 'STRANGER' }, member: { user: { id: 'STRANGER' }, permissions: { has: () => false }, roles: { cache: { has: () => false } } }, reply: async (p) => { denied = p; } };
  await handlePanelCommand(1, strangerCmd);
  assert(denied.content.includes('propriétaire'));
  console.log('🔟  /ticket types par non-propriétaire → REFUSÉ ✅');

  // ---------- 11. Payload : groupe types en premier, sous-commandes add/remove/list ----------
  const payloads = buildSlashPayloads(1);
  const ticket = payloads.find((p) => p.name === 'ticket');
  const group = ticket.options.find((o) => o.name === 'types');
  assert(group && group.type === 2, 'groupe attendu'); // 2 = SUB_COMMAND_GROUP
  assert(ticket.options[0].name === 'types', 'groupe en premier (règle Discord)');
  const subs = group.options.map((o) => o.name);
  assert(subs.includes('add') && subs.includes('remove') && subs.includes('list'));
  const addOpts = group.options.find((o) => o.name === 'add').options.map((o) => o.name);
  assert(addOpts.includes('staffrole') && addOpts.includes('categorie') && addOpts.includes('emoji'));
  console.log('1️⃣1️⃣  Payload /ticket : groupe « types » (add/remove/list, staffrole) ✅');

  // ---------- 12. Page transcription (route serveur) ----------
  const store2 = require('../server/db');
  const t = store2.db.prepare('SELECT * FROM transcripts').all()[0];
  assert(t, 'transcription en base');
  console.log('1️⃣2️⃣  Transcription en base ✅ (token ' + t.token.slice(0, 8) + '…, serveur : ' + t.server_name + ')');

  console.log('\n🎉 Tous les tests du système de tickets complet passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
