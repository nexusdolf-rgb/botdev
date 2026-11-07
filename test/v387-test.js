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
        { type: 1, components: [
          { type: 2, custom_id: `bd-tmenu:${botId}:claim`, label: '🖐️ Pris en charge', style: 1 },
          { type: 2, custom_id: `bd-tmenu:${botId}:release`, label: '🖐️ Retirer du ticket', style: 2, disabled: true },
        ] },
      ] }],
      edit: async (p) => { etat.corps = p; },
    },
  };
}

(async () => {
  console.log('— 1. DEUX boutons indépendants, chacun son état —');
  {
    const libre = panels.__testStaffTicketRows(botId, false, 'fr');
    const [prendre, retirer] = libre[0].components;
    check('il y a bien deux boutons dans la rangée', libre[0].components.length === 2);
    check('chacun a son propre identifiant',
      String(prendre.data.custom_id).endsWith(':claim') && String(retirer.data.custom_id).endsWith(':release'));
    check('ticket libre : « Pris en charge » actif, « Retirer » grisé',
      prendre.data.disabled !== true && retirer.data.disabled === true);
    check('…le premier est bleu, le second gris',
      prendre.data.style === 1 && retirer.data.style === 2);
    check('…leurs libellés ne sont jamais échangés',
      String(prendre.data.label).includes('Pris en charge') && String(retirer.data.label).includes('Retirer'));

    const pris = panels.__testStaffTicketRows(botId, true, 'fr');
    const [prendre2, retirer2] = pris[0].components;
    check('ticket pris : « Pris en charge » grisé, « Retirer » actif',
      prendre2.data.disabled === true && retirer2.data.disabled !== true);
    check('…les deux boutons restent affichés (rien ne disparaît)',
      String(prendre2.data.label).includes('Pris en charge') && String(retirer2.data.label).includes('Retirer'));
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
    const apres = JSON.stringify(msg.state.corps);
    check('…« Pris en charge » redevient actif', apres.includes(':claim'));
    check('…et « Retirer du ticket » repasse en grisé',
      apres.includes(':release') && (apres.match(/"disabled":true/g) || []).length === 1,
      apres.slice(0, 200));
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
    check('…le panneau est quand même remis d’aplomb (« Pris en charge » actif, « Retirer » grisé)',
      !!msg.state.corps && JSON.stringify(msg.state.corps).includes(':claim')
      && (JSON.stringify(msg.state.corps).match(/"disabled":true/g) || []).length === 1);
  }

  store.openTickets.remove('CH1');
  console.log(`\n${ko ? '❌' : '🎉'} v387 — ${ok} vérifications : la prise en charge se retire proprement.`);
  if (ko) { console.log(fails.join('\n')); process.exit(1); }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
