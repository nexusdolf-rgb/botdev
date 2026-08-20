// ============================================================
// Test Hoxera v85 — Tickets niveau pro
//  1. Numérotation des tickets par serveur (#1, #2, #3…), indépendante par serveur
//  2. Fiche open_tickets : création, activité (touch), prise en charge, fermeture
//  3. Historique du membre (transcriptions précédentes comptées)
//  4. Fermeture automatique : rappel 10 min avant, fermeture à 2 h, activité = repoussé
//  5. Suppression automatique 24 h après fermeture + transcription stockée
//  6. Salon disparu → fiche nettoyée
//  7. Transcription : en-tête pro (numéro, dates, prise en charge) + pièces jointes
//  8. Notes ⭐ : enregistrement, doublon refusé, moyenne
//  9. Fermeture par le créateur (bouton dédié) : réservée à l'ouvreur
// 10. Traductions FR/EN des nouveaux messages
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v85-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  const i18n = require('../server/i18n');
  const BOT = 1, G = 'G1', G2 = 'G2';

  // ---------- 1. Numérotation ----------
  check('compteur : premier ticket = #1', store.ticketCounters.next(BOT, G) === 1);
  check('compteur : deuxième ticket = #2', store.ticketCounters.next(BOT, G) === 2);
  check('compteur : indépendant par serveur', store.ticketCounters.next(BOT, G2) === 1);

  // ---------- 2. Fiche open_tickets ----------
  store.openTickets.add(BOT, G, { channel_id: 'C1', number: 42, opener_id: 'u1', opener_tag: 'Membre#0001', type_label: 'Question' });
  const row = store.openTickets.getByChannel('C1');
  check('fiche : créée avec numéro et ouvreur', row && row.number === 42 && row.opener_id === 'u1' && row.opened_at && row.last_activity);
  store.openTickets.touch('C1', '2026-08-20T10:00:00.000Z');
  check('fiche : activité mise à jour', store.openTickets.getByChannel('C1').last_activity === '2026-08-20T10:00:00.000Z');
  store.openTickets.update('C1', { claimed_by: 'u9', claimed_tag: 'Modo#0001', claimed_at: '2026-08-20T10:01:00.000Z', closed_at: '2026-08-20T11:00:00.000Z' });
  const row2 = store.openTickets.getByChannel('C1');
  check('fiche : prise en charge enregistrée', row2.claimed_by === 'u9' && row2.claimed_tag === 'Modo#0001');
  check('fiche : fermeture enregistrée', row2.closed_at === '2026-08-20T11:00:00.000Z');
  store.openTickets.remove('C1');
  check('fiche : suppression', store.openTickets.getByChannel('C1') === null);

  // ---------- 3. Historique du membre ----------
  store.transcripts.add({ token: 'tk-1', bot_id: BOT, guild_id: G, channel_name: 't-a', opener_id: 'u1', type_label: '', server_name: 'S', messages: 'x' });
  store.transcripts.add({ token: 'tk-2', bot_id: BOT, guild_id: G, channel_name: 't-b', opener_id: 'u1', type_label: '', server_name: 'S', messages: 'x' });
  check('historique : 2 tickets précédents comptés', store.transcripts.countByOpener(BOT, G, 'u1') === 2);
  check('historique : autre membre = 0', store.transcripts.countByOpener(BOT, G, 'u9') === 0);

  // ---------- 4 & 5. Fermeture et suppression automatiques ----------
  const sent = [];
  const channel = {
    id: 'CT1', name: 'ticket-u2',
    permissionOverwrites: { edit: async () => {} },
    send: async (p) => { sent.push(p.content); return {}; },
    delete: async () => { channel.deleted = true; },
    messages: { fetch: async () => new Map() },
  };
  const coll = (map) => ({ get: (id) => map.get(id) || null, has: (id) => map.has(id), find: (fn) => [...map.values()].find(fn) || null, values: () => map.values() });
  const guild = {
    id: G, name: 'Serveur Test',
    channels: { cache: coll(new Map([['CT1', channel]])) },
    members: { fetch: async () => ({ user: { send: async () => ({}) } }) },
  };
  const clientFake = {
    users: { fetch: async () => ({ send: async () => ({}) }) },
    guilds: { cache: coll(new Map([[G, guild]])) },
  };
  const entry = { client: clientFake };
  const now0 = new Date('2026-08-20T10:00:00Z');
  store.openTickets.add(BOT, G, { channel_id: 'CT1', number: 7, opener_id: 'u2', opener_tag: 'Deux#0002', type_label: 'Bug' });
  store.openTickets.update('CT1', { last_activity: '2026-08-20T10:00:00.000Z' });
  store.openTickets.touch('CT1', '2026-08-20T10:00:00.000Z');

  // 110 min plus tard → rappel (pas encore fermé)
  await panels.sweepInactiveTickets(BOT, entry, new Date(now0.getTime() + 110 * 60000));
  check('auto : rappel envoyé à 110 min', sent.includes(i18n.t('fr', 'ticket_auto_warn')));
  check('auto : pas fermé avant 2 h', store.openTickets.getByChannel('CT1').closed_at === '' || store.openTickets.getByChannel('CT1').closed_at === null);

  // 121 min → fermeture automatique
  await panels.sweepInactiveTickets(BOT, entry, new Date(now0.getTime() + 121 * 60000));
  check('auto : fermé à 2 h d\'inactivité', store.openTickets.getByChannel('CT1').closed_at);
  check('auto : message de fermeture envoyé', sent.includes(i18n.t('fr', 'ticket_auto_closed')));

  // Nouvelle activité → touch remet warned à 0 (testé sur une autre fiche)
  store.openTickets.add(BOT, G, { channel_id: 'CT2', number: 8, opener_id: 'u3', opener_tag: 'Trois#0003', type_label: '' });
  store.openTickets.update('CT2', { warned_inactive: 1 });
  store.openTickets.touch('CT2', '2026-08-20T12:00:00.000Z');
  check('auto : nouvelle activité remet warned à 0', store.openTickets.getByChannel('CT2').warned_inactive === 0);
  store.openTickets.remove('CT2');

  // 24 h après fermeture → suppression automatique + transcription
  const before = store.db.prepare('SELECT COUNT(*) AS n FROM transcripts').get().n;
  await panels.sweepInactiveTickets(BOT, entry, new Date(now0.getTime() + (121 + 24 * 60) * 60000));
  await sleep(2000); // la suppression du salon est différée de 1,5 s (comme en prod)
  check('auto : salon supprimé après 24 h', channel.deleted === true);
  check('auto : fiche nettoyée', store.openTickets.getByChannel('CT1') === null);
  check('auto : transcription enregistrée', store.db.prepare('SELECT COUNT(*) AS n FROM transcripts').get().n === before + 1);

  // ---------- 6. Salon disparu → nettoyage ----------
  store.openTickets.add(BOT, G, { channel_id: 'GONE', number: 9, opener_id: 'u4', opener_tag: 'X', type_label: '' });
  await panels.sweepInactiveTickets(BOT, entry, new Date(now0));
  check('auto : fiche orpheline nettoyée', store.openTickets.getByChannel('GONE') === null);

  // ---------- 7. Transcription : en-tête pro + pièces jointes ----------
  const atts = { size: 1, values: () => [{ url: 'https://cdn.example/a.png' }, { url: 'https://cdn.example/b.png' }] };
  const msgs = new Map([
    ['m2', { content: 'voici une capture', author: { username: 'u2' }, createdAt: new Date('2026-08-20T10:05:00Z'), attachments: atts, embeds: [] }],
  ]);
  const chT = {
    id: 'CT3', name: 'ticket-t', topic: 'Ticket #5 de X | 1336752601802473482 | Bug',
    permissionOverwrites: { edit: async () => {} },
    send: async () => ({}),
    messages: { fetch: async () => msgs },
  };
  const guildT = { id: G, name: 'S', channels: { cache: coll(new Map([['CT3', chT]])) } };
  store.openTickets.add(BOT, G, { channel_id: 'CT3', number: 5, opener_id: '1336752601802473482', opener_tag: 'Deux#0002', type_label: 'Bug' });
  store.openTickets.update('CT3', { claimed_by: 'u9', claimed_tag: 'Modo#0001', claimed_at: '2026-08-20T10:03:00.000Z', closed_at: '2026-08-20T11:00:00.000Z' });
  store.openTickets.touch('CT3', '2026-08-20T10:05:00.000Z');
  const t = await panels.buildTranscriptFromChannel(BOT, chT, guildT, ['fin']);
  check('transcription : numéro en en-tête', t.text.includes('#5'));
  check('transcription : ouverture et fermeture datées', t.text.includes('Ouvert le') && t.text.includes('Fermé le'));
  check('transcription : prise en charge mentionnée', t.text.includes('Modo#0001'));
  check('transcription : pièces jointes listées', t.text.includes('https://cdn.example/a.png') && t.text.includes('https://cdn.example/b.png'));
  store.openTickets.remove('CT3');

  // ---------- 8. Notes ⭐ ----------
  store.ticketRatings.add(BOT, G, { number: 5, opener_id: 'u2', rating: 5 });
  store.ticketRatings.add(BOT, G, { number: 6, opener_id: 'u3', rating: 3 });
  const stats = store.ticketRatings.stats(BOT, G);
  check('notes : moyenne 4.0 sur 2 avis', stats.count === 2 && stats.avg === 4);
  check('notes : doublon détecté', store.ticketRatings.has(BOT, G, 5) === true && store.ticketRatings.has(BOT, G, 99) === false);
  check('notes : note hors limites bornée à 5', store.ticketRatings.add(BOT, G, { number: 7, opener_id: 'u4', rating: 9 }) && store.ticketRatings.stats(BOT, G).count === 3);

  // ---------- 9. Fermeture par le créateur : réservée à l'ouvreur ----------
  store.openTickets.add(BOT, G, { channel_id: 'CT4', number: 3, opener_id: '1336752601802473482', opener_tag: 'Deux#0002', type_label: '' });
  const channelMsgs = [];
  const replies = [];
  const mkInteraction = (userId) => ({
    user: { id: userId, tag: userId + '#0001' },
    guild: { id: G, name: 'Serveur Test' },
    channel: {
      id: 'CT4', topic: 'Ticket #3 de X | 1336752601802473482 |',
      permissionOverwrites: { edit: async () => {} },
      send: async (p) => { channelMsgs.push(p.content); return {}; },
    },
    reply: async (p) => { replies.push(p); },
  });
  // Un tiers essaie de fermer → refus
  const intruder = mkInteraction('u99');
  await panels.handleOpenerClose(BOT, intruder);
  check('fermeture créateur : un tiers est refusé', replies.some((r) => r.content.includes('Seul le créateur')));
  check('fermeture créateur : le ticket reste ouvert', !store.openTickets.getByChannel('CT4').closed_at);
  // L'ouvreur ferme → OK
  const opener = mkInteraction('1336752601802473482');
  await panels.handleOpenerClose(BOT, opener);
  check('fermeture créateur : l\'ouvreur peut fermer', !!store.openTickets.getByChannel('CT4').closed_at);
  check('fermeture créateur : message dans le salon', channelMsgs.some((c) => c.includes('créateur')));
  check('fermeture créateur : confirmation envoyée', replies.some((r) => r.content.includes('fermé')));
  store.openTickets.remove('CT4');

  // ---------- 10. Traductions ----------
  check('i18n FR : message de prise en charge', i18n.t('fr', 'ticket_claim_msg', { staff: '@Modo' }).includes('prend'));
  check('i18n EN : message de prise en charge', i18n.t('en', 'ticket_claim_msg', { staff: '@Modo' }).includes('taking'));
  check('i18n FR : rappel fermeture auto', i18n.t('fr', 'ticket_auto_warn').includes('10 minutes'));
  check('i18n EN : rappel fermeture auto', i18n.t('en', 'ticket_auto_warn').includes('10 minutes'));
  check('i18n FR : note merci', i18n.t('fr', 'ticket_rating_done', { stars: 4 }).includes('4/5'));
  check('i18n EN : note merci', i18n.t('en', 'ticket_rating_done', { stars: 4 }).includes('4/5'));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v85 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Erreur fatale du test :', e); process.exit(1); });
