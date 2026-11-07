// Test v387 — Ticket : le staff qui a pris un ticket peut RETIRER sa prise en
// charge (le ticket redevient libre), et chaque refus est poli et précis :
//   • pas staff                → « réservé au staff »
//   • pris par quelqu'un d'autre → « seul X peut le retirer »
//   • personne ne l'a pris     → « rien à retirer »
'use strict';
const fs = require('fs');
const path = require('path');

const TMP = path.join(require('node:os').tmpdir(), 'hoxera-v387-' + process.pid + '-' + Date.now());
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}

const store = require('../server/db');
const panels = require('../server/discord/panels');
const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');

const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });

// Un serveur minimal : le staff est administrateur, le membre ne l'est pas.
const guild = { id: 'g387', ownerId: 'OWNER', roles: { everyone: { id: 'everyone' } }, channels: { cache: new Map() } };
const staffMember = { id: 'STAFF1', permissions: { has: () => true }, roles: { cache: new Map([['LEAD', { id: 'LEAD' }]]) } };
const otherStaff = { id: 'STAFF2', permissions: { has: () => true }, roles: { cache: new Map([['LEAD', { id: 'LEAD' }]]) } };
const simpleMember = { id: 'MEMB1', permissions: { has: () => false }, roles: { cache: new Map() } };

function fauxInteraction({ user, member, row, message }) {
  const etat = { reply: null, edit: null };
  return {
    state: etat,
    interaction: {
      guild,
      channel: { id: 'CH1', send: async (p) => { etat.sent = p; } },
      user: { id: user, tag: user },
      member,
      message,
      isButton: () => true,
      reply: async (p) => { etat.reply = p; },
      editReply: async (p) => { etat.editReply = p; },
      deferUpdate: async () => { etat.deferred = true; },
      deferReply: async () => { etat.deferred = true; },
    },
  };
}

function messageFactice() {
  const etat = { corps: null };
  return {
    state: etat,
    message: {
      components: [{ type: 17, components: [
        { type: 10, content: '⏳ **Statut :** en attente' },
        { type: 1, components: [{ type: 2, custom_id: `bd-tmenu:${botId}:release`, label: '🖐️ Retirer ma prise en charge', style: 2 }] },
      ] }],
      edit: async (p) => { etat.corps = p; },
    },
  };
}

(async () => {
  console.log('— 1. Le bouton change de rôle selon l’état du ticket —');
  {
    const libre = panels.__testStaffTicketRows(botId, false, 'fr');
    const b = libre[0].components[0];
    check('ticket libre : « Pris en charge » actif, bouton principal',
      String(b.data.custom_id).endsWith(':claim') && !b.data.disabled && b.data.style === 1, JSON.stringify(b.data.custom_id));
    check('…libellé « 🖐️ Pris en charge »', String(b.data.label).includes('Pris en charge'));

    const pris = panels.__testStaffTicketRows(botId, true, 'fr');
    const b2 = pris[0].components[0];
    check('ticket pris : le bouton devient « Retirer ma prise en charge »',
      String(b2.data.custom_id).endsWith(':release'), JSON.stringify(b2.data.custom_id));
    check('…il est actif (plus grisé) et en gris Discord', b2.data.disabled !== true && b2.data.style === 2);
    check('…le clic est routé vers le retrait', source.includes('bd-tmenu:${botId}:release') && source.includes('handleTicketRelease'));
  }

  console.log('— 2. Une personne qui n’est pas du staff —');
  {
    store.openTickets.add(botId, guild.id, { channel_id: 'CH1', number: 7, opener_id: 'MEMB1' });
    store.openTickets.update('CH1', { claimed_by: 'STAFF1', claimed_tag: 'STAFF1' });
    const f = fauxInteraction({ user: 'MEMB1', member: simpleMember });
    await panels.__testHandleTicketRelease(botId, f.interaction);
    check('refus poli : réservé au staff',
      !!f.state.reply && f.state.reply.ephemeral === true && String(f.state.reply.content).includes('staff'),
      String(f.state.reply && f.state.reply.content));
    check('…et le ticket reste pris par STAFF1',
      store.openTickets.getByChannel('CH1').claimed_by === 'STAFF1');
  }

  console.log('— 3. Un autre membre du staff que celui qui le tient —');
  {
    const f = fauxInteraction({ user: 'STAFF2', member: otherStaff });
    await panels.__testHandleTicketRelease(botId, f.interaction);
    check('refus poli : le ticket appartient à quelqu’un d’autre',
      String(f.state.reply && f.state.reply.content).includes('<@STAFF1>'),
      String(f.state.reply && f.state.reply.content));
    check('…aucune mention envoyée (parse: [])', f.state.reply.allowedMentions
      && Array.isArray(f.state.reply.allowedMentions.parse) && f.state.reply.allowedMentions.parse.length === 0);
    check('…et le ticket n’est pas libéré', store.openTickets.getByChannel('CH1').claimed_by === 'STAFF1');
  }

  console.log('— 4. Celui qui tient le ticket le rend —');
  {
    const msg = messageFactice();
    const f = fauxInteraction({ user: 'STAFF1', member: staffMember, message: msg.message });
    await panels.__testHandleTicketRelease(botId, f.interaction);
    const row = store.openTickets.getByChannel('CH1');
    check('le ticket redevient libre', row.claimed_by === '' && row.claimed_tag === '');
    check('le panneau repasse à « en attente »',
      !!msg.state.corps && JSON.stringify(msg.state.corps).includes('en attente'));
    check('…et le bouton redevient « Pris en charge »',
      JSON.stringify(msg.state.corps).includes(':claim'));
    check('…aucun bouton grisé ne reste sur le panneau',
      !JSON.stringify(msg.state.corps).includes('"disabled":true'));
    check('le créateur est prévenu dans le salon (sans mention)',
      !!f.state.sent && JSON.stringify(f.state.sent).includes('Prise en charge retirée'));
    const act = store.activity.all ? store.activity.all(botId, guild.id, 5) : null;
    if (act) check('…et le retrait est journalisé', JSON.stringify(act).includes('retiré sa prise en charge'));
  }

  console.log('— 5. Personne ne l’a pris : rien à retirer —');
  {
    const msg = messageFactice();
    const f = fauxInteraction({ user: 'STAFF1', member: staffMember, message: msg.message });
    await panels.__testHandleTicketRelease(botId, f.interaction);
    check('refus poli : « rien à retirer »',
      String(f.state.reply && f.state.reply.content).includes('rien à retirer'),
      String(f.state.reply && f.state.reply.content));
    check('…le panneau est quand même remis d’aplomb (bouton « Pris en charge »)',
      !!msg.state.corps && JSON.stringify(msg.state.corps).includes(':claim'));
  }

  store.openTickets.remove('CH1');
  console.log(`\n${ko ? '❌' : '🎉'} v387 — ${ok} vérifications : la prise en charge se retire proprement.`);
  if (ko) { console.log(fails.join('\n')); process.exit(1); }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
