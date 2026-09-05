// ============================================================
// Test Hoxera v79 — Brique 5 « Internationalisation FR/EN »
//  1. i18n : traductions, variables, repli français, normalisation
//  2. Langue du serveur : stockée et relue (par défaut fr)
//  3. Panneau de tickets : traduit (titre, bienvenue, règles, patience)
//  4. Embed de bienvenue du ticket : traduit
//  5. Transcription en MP : traduite
//  6. /lang : la commande change la langue et confirme dans la langue
//  7. Repli : langue inconnue → français ; aucune clé manquante ne casse
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v79-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const i18n = require('../server/i18n');
  const panels = require('../server/discord/panels');
  // v234 — lecteur de payload Components V2 (les embeds[0] n'existent plus).
  const v2 = require('./helpers/v2');

  const BOT = 1, G = 'G1';
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');
  store.tickets.set(BOT, G, { require_reason: 1, support_role: 'Staff', channel: '#support', types: '[]' });

  // ---------- 1. i18n de base ----------
  check('i18n : t() français', i18n.t('fr', 'panel_welcome', { server: 'Test' }).includes('Bienvenue sur le support officiel de Test'));
  check('i18n : t() anglais', i18n.t('en', 'panel_welcome', { server: 'Test' }).includes('Welcome to the official support of Test'));
  check('i18n : variables remplacées', i18n.t('en', 'ticket_first_line', { type: '❓ Question', member: '@Bob' }).includes('ticket from @Bob'));
  check('i18n : normalisation (EN → en)', i18n.normalize('EN') === 'en');
  check('i18n : langue inconnue → fr', i18n.normalize('xx') === 'fr');
  check('i18n : les 6 langues sont reconnues', ['fr', 'en', 'es', 'de', 'pt', 'it'].every((l) => i18n.normalize(l) === l));
  check('i18n : clé inconnue → repli fr ou clé (jamais de crash)', typeof i18n.t('en', 'cle_inexistante') === 'string');
  check('i18n : panelTexts règles (4)', i18n.panelTexts('en').rules.length === 4 && i18n.panelTexts('en').rules[0].includes('Be clear'));

  // ---------- 2. Langue du serveur ----------
  check('langue : défaut français', i18n.langForGuild(G) === 'fr');
  store.guildSettings.set(BOT, G, { lang: 'en' });
  check('langue : stockée en base', store.guildSettings.get(BOT, G).lang === 'en');
  check('langue : relue par langForGuild', i18n.langForGuild(G) === 'en');
  store.guildSettings.set(BOT, G, { lang: 'fr' });

  // ---------- 3. Panneau de tickets traduit ----------
  const sent = [];
  const fakeChannel = { id: 'C1', name: 'support', send: async (p) => { sent.push(p); return {}; } };
  const client = { guilds: { cache: { get: () => ({ name: 'Carré RP' }) } } };
  store.guildSettings.set(BOT, G, { lang: 'en' });
  await panels.sendTicketPanel(BOT, G, client, fakeChannel);
  // v234 — lecture Components V2.
  const textsEn = v2.texts(sent[0]);
  check('panneau EN : titre traduit', v2.title(sent[0]) === '👑 Support | Carré RP');
  check('panneau EN : bienvenue traduite', textsEn.includes('Welcome to the official support of Carré RP'));
  check('panneau EN : règle traduite', textsEn.some((t) => t.includes('Be clear and precise')));
  check('panneau EN : patience traduite', textsEn.some((t) => t.includes('Thank you for your patience')));
  store.guildSettings.set(BOT, G, { lang: 'fr' });
  await panels.sendTicketPanel(BOT, G, client, fakeChannel);
  check('panneau FR : bienvenue française', v2.texts(sent[1]).some((t) => t.startsWith('Bienvenue sur le support officiel')));

  // ---------- 4. Embed de bienvenue du ticket ----------
  const member = { id: 'u2', user: { id: 'u2', username: 'Bob', displayAvatarURL: () => '' }, toString: () => '<@u2>' };
  const chosen = { label: 'Question', emoji: '❓', description: '', staff_roles: [] };
  // v237 — payload Components V2 : le titre est porté par le conteneur et les
  // libellés de champs sont rendus dans des TextDisplay.
  const embTicketEn = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'hello', '', [], 'en');
  check('ticket EN : titre traduit', v2.title(embTicketEn) === '🎫 Ticket opened');
  check('ticket EN : champs traduits', v2.json(embTicketEn).includes('Ticket type') && v2.json(embTicketEn).includes('Team in charge'));
  const embTicketFr = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'bonjour', '', [], 'fr');
  check('ticket FR : champs français', v2.json(embTicketFr).includes('Type de ticket'));

  // ---------- 5. Transcription en MP traduite ----------
  const dms = [];
  const opener = { id: 'u2', username: 'Bob', send: async (p) => { dms.push(p); return {}; } };
  const guild = { id: G, name: 'Carré RP', members: { fetch: async () => ({ user: opener }) } };
  const interaction = { client: { users: { fetch: async () => opener } } };
  store.guildSettings.set(BOT, G, { lang: 'en' });
  await panels.sendTranscriptDm(interaction, guild, 'question-bob', { text: 'x', url: 'https://example.com/abc', openerId: 'u2' });
  // v239 — le MP est en Components V2 : plus d'embeds[0], on relit le conteneur.
  const dmEn = { title: v2.title(dms[0]), description: v2.texts(dms[0]).join('\n') };
  check('transcription EN : titre traduit', dmEn.title === '🎫 Your ticket has been closed', dmEn.title);
  check('transcription EN : texte traduit', String(dmEn.description).includes('Thank you for contacting'));
  store.guildSettings.set(BOT, G, { lang: 'fr' });

  // ---------- 6. Commande /lang ----------
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(BOT, k, 1);
  const premade = require('../server/discord/premade');
  const guild2 = { id: G, name: 'Carré RP', memberCount: 2, channels: { cache: { size: 0 } }, roles: { cache: { size: 0 } } };
  const mkI = (over = {}) => {
    const user = { id: 'u1', tag: 'A#1', username: 'A', bot: false, displayAvatarURL: () => '' };
    const member = { id: 'u1', user, permissions: { has: () => true }, roles: { cache: new Map() } };
    const i = {
      replied: false, replies: [], _replied: false,
      commandName: 'lang', user, member, guild: guild2,
      channel: { id: 'C1', isTextBased: () => true, send: async () => ({}) },
      options: { getString: (k) => (k === 'langue' ? over.langVal : null) },
      reply: async function (p) { this._replied = true; this.replied = true; this.replies.push(p); return {}; },
      followUp: async function (p) { this.replies.push(p); return {}; },
      isRepliable: () => true,
    };
    return i;
  };
  const entry = { client: { user: { username: 'Optimus Prime' } } };
  const wEn = mkI({ langVal: 'en' });
  await premade.handlePremadeSlash(BOT, entry, wEn);
  check('/lang en : répond en anglais', wEn._replied && wEn.replies.some((r) => String(r.content || '').includes('Server language set to')));
  check('/lang en : stocké', store.guildSettings.get(BOT, G).lang === 'en');
  const wFr = mkI({ langVal: 'fr' });
  await premade.handlePremadeSlash(BOT, entry, wFr);
  check('/lang fr : répond en français', wFr._replied && wFr.replies.some((r) => String(r.content || '').includes('Langue du serveur')));
  check('/lang fr : stocké', store.guildSettings.get(BOT, G).lang === 'fr');

  store.db.close();
  console.log(failures === 0 ? '\n✅ V79 — Brique 5 « Internationalisation FR/EN » : 100 % fonctionnelle. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
