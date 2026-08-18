// ============================================================
// Test Hoxera v49 — Panneau de tickets personnalisé PAR SERVEUR
// Chaque serveur voit SON nom dans le panneau (titre, bienvenue,
// bannière générée) — automatiquement. Logique tickets intacte.
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v49-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  const banner = require('../server/banner');
  const BOT = 1;
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');
  store.tickets.set(BOT, 'G1', { require_reason: 1, support_role: 'Staff', channel: '#support', types: '[]' });

  // ---------- 1. Générateur de bannière ----------
  const b1 = await banner.generateBanner('Carré RP');
  check('bannière : PNG généré pour un nom', !!b1 && b1.length > 1000 && b1.slice(0, 4).toString('hex') === '89504e47');
  const b2 = await banner.generateBanner('A&B <x> "quote"');
  check('bannière : caractères spéciaux sans crash', !!b2 && b2.length > 500);
  const b3 = await banner.generateBanner('');
  check('bannière : nom vide → repli NEXORA', !!b3 && b3.length > 500);

  // ---------- 2. Panneau du serveur A ----------
  const sentA = [];
  const mkClient = (guilds) => ({
    guilds: { cache: { get: (id) => guilds[id] || null } },
    user: { id: 'bot1' },
  });
  const clientA = mkClient({ G1: { name: 'Carré RP Officiel' } });
  const chA = { id: 'C1', name: 'support', send: async (p) => { sentA.push(p); return {}; } };
  await panels.sendTicketPanel(BOT, 'G1', clientA, chA);
  const embedA = sentA[0].embeds[0].toJSON();
  check('serveur A : titre « 👑 Support | Carré RP Officiel »', embedA.title === '👑 Support | Carré RP Officiel');
  check('serveur A : bienvenue avec le nom', embedA.description.startsWith('Bienvenue sur le support officiel de Carré RP Officiel'));
  check('serveur A : bannière dynamique (URL du serveur)', embedA.image.url.includes('/api/tickets/panel-banner/G1.gif'));
  check('serveur A : nom mémorisé en base', store.guildSettings.get(BOT, 'G1').panel_name === 'Carré RP Officiel');
  check('serveur A : nom mémorisé retrouvé pour la bannière', banner.storedPanelName('G1') === 'Carré RP Officiel');

  // ---------- 3. Panneau du serveur B (nom différent) ----------
  store.tickets.set(BOT, 'G2', { require_reason: 1, support_role: 'Staff', channel: '#support', types: '[]' });
  const sentB = [];
  const clientB = mkClient({ G2: { name: 'Les Copains 🎉' } });
  const chB = { id: 'C1', name: 'support', send: async (p) => { sentB.push(p); return {}; } };
  await panels.sendTicketPanel(BOT, 'G2', clientB, chB);
  const embedB = sentB[0].embeds[0].toJSON();
  check('serveur B : titre avec SON nom', embedB.title === '👑 Support | Les Copains 🎉');
  check('serveur B : bienvenue avec SON nom', embedB.description.includes('Les Copains 🎉'));
  check('serveur B : bannière différente (G2)', embedB.image.url.includes('/api/tickets/panel-banner/G2.gif'));
  check('serveur B : pas de mélange avec le serveur A', embedB.title !== embedA.title && embedB.image.url !== embedA.image.url);

  // ---------- 4. Repli Nexora (client sans guildes) ----------
  store.tickets.set(BOT, 'G3', { require_reason: 1, support_role: 'Staff', channel: '#support', types: '[]' });
  const sentC = [];
  const chC = { id: 'C1', name: 'support', send: async (p) => { sentC.push(p); return {}; } };
  await panels.sendTicketPanel(BOT, 'G3', null, chC);
  const embedC = sentC[0].embeds[0].toJSON();
  check('repli : titre « 👑 Support | Nexora »', embedC.title === '👑 Support | Nexora');
  check('repli : bannière animée dynamique (nom NEXORA par défaut)', embedC.image.url.includes('/api/tickets/panel-banner/G3.gif'));

  // ---------- 5. Logique intacte : menu et sélection ----------
  store.tickets.set(BOT, 'G1', { ...store.tickets.get(BOT, 'G1'), types: JSON.stringify([{ label: 'Réclamation', emoji: '⚠️', questions: [], staff_roles: [] }]) });
  const sentD = [];
  const chD = { id: 'C1', name: 'support', send: async (p) => { sentD.push(p); return {}; } };
  await panels.sendTicketPanel(BOT, 'G1', clientA, chD);
  const select = sentD[0].components[0].components[0].toJSON();
  check('logique : menu toujours là (custom_id intact)', select.custom_id === `bd-ttype:${BOT}`);
  check('logique : placeholder conservé', select.placeholder.includes('Choisissez le type de ticket'));
  check('logique : 1 seule rangée, 1 seul menu', sentD[0].components.length === 1 && sentD[0].components[0].components.length === 1);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V49 — Panneau personnalisé par serveur (titre, bienvenue, bannière) : 100 % fonctionnel. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
