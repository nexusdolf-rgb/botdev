// v312 — DEMANDE DU FONDATEUR : retirer TOUTES les signatures « Hoxera · … »
// sous TOUS les panneaux. Plus de pied par défaut du moteur, plus de
// `footer: 'Hoxera · …'` sur les panneaux (tickets, rôles, vocaux, giveaways,
// suggestions, bienvenue, vérification, économie, etc.).
// Survivent : un pied VRAIMENT personnalisé par l'admin (annonce, tickets
// avancés `footer_text`, blacklist configurée) et les pieds UTILES qui ne
// sont pas une signature (⭐ starboard, pagination /top, /help).
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v312');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const extra = require('../server/discord/extra');
const suggest = require('../server/discord/suggest');
const giveaway = require('../server/discord/giveaway');
const adv = require('../server/discord/advancedTickets');
const announcements = require('../server/discord/announcements');
const v2 = require('./helpers/v2');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const brut = (p) => JSON.stringify(p.components ? p.components.map((c) => (c && c.toJSON ? c.toJSON() : c)) : p);

console.log('— 1. Pins de version v312 —');
const html = racine('public/index.html');
check('index.html : ?v=318 ×7', (html.match(/\?v=318/g) || []).length === 7);
check('sw.js : cache botdev-v318', racine('public/sw.js').includes("const CACHE = 'botdev-v318';"));

console.log('— 2. Moteur : plus de signature par défaut —');
{
  const p = ui.v2panel({ title: 'Titre', description: 'Un paragraphe.' });
  check('v2panel sans footer → aucun « -# Hoxera »', v2.footer(p) === '' && !brut(p).includes('-# Hoxera'), v2.footer(p));
  const e = ui.embed({ title: 'Titre', description: 'Un paragraphe.' }).toJSON();
  check('embed sans footer → pas de pied', !e.footer, JSON.stringify(e.footer || null));
  const avec = ui.v2panel({ title: 'T', description: 'A', footer: 'Pied perso' });
  check('un pied EXPLICITE (non-Hoxera) est toujours honoré', v2.footer(avec) === 'Pied perso', v2.footer(avec));
}

console.log('— 3. Panneaux produits : plus de signature —');
store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' });
{
  const ticket = panels.buildTicketPanel({ message: '' }, {}, [], 'Serveur', 'G312');
  check('tickets public : pas de signature', !brut(ticket).includes('-# Hoxera') && v2.footer(ticket) === '');
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' }, toString: () => '@Alice', guild: { name: 'Serveur' } };
  const welcome = panels.ticketWelcomePanel(member, { label: 'Support', emoji: '🎫', staff_roles: [], color: '#5865F2' }, '<@&R1>', 'Ma demande', '', [], 'fr', { number: 9 }, {}, { content: '' });
  check('salon privé : pas de signature', !String(v2.footer(welcome)).includes('Hoxera'));
  const roles = panels.roleMenuPayload(1, { name: 'Rôles', mode: 'menu', content: 'Choisissez.', options: [{ label: 'A', role: 'R1' }] });
  check('menu des rôles : pas de signature', !brut(roles).includes('-# Hoxera'));
  const vt = extra.buildVtPanel(1, null);
  check('vocaux temporaires : pas de signature Hoxera', !brut(vt).includes('-# Hoxera'));
  const sug = suggest.buildPanel({ id: 4, status: 'pending', upvotes: 0, downvotes: 0, bot_id: 1, text: 'Idée' }, 'Toto', {});
  check('suggestions : pas de signature', !String(v2.footer(sug)).includes('Hoxera'));
  const gw = giveaway.buildPanel({ prize: 'Nitro', winners: 1, ends_at: Date.now() + 60000 }, { color: '#FEE75C', message: '' }, '', { botId: 1, lang: 'fr' });
  check('giveaway : pas de signature', !brut(gw).includes('Hoxera · Giveaway'));
  const cfg = adv.normalizeConfig({ id: 2, bot_id: 1, guild_id: 'G312', name: 'Tickets', mode: 'menu', channel: '#c', message: '', image_url: '', require_reason: 1, types: [{ label: 'Aide', id: 't1' }] });
  check('tickets avancés sans footer_text : pas de signature', !brut(adv.buildPanelPayload(cfg)).includes('Hoxera ·'));
}

console.log('— 4. Pieds personnalisés et utiles : conservés —');
{
  const cfg = adv.normalizeConfig({ id: 3, bot_id: 1, guild_id: 'G312', name: 'Tickets', mode: 'menu', channel: '#c', message: '', image_url: '', require_reason: 1, types: [{ label: 'Aide', id: 't1' }], footer_text: 'Support de MonServeur' });
  check('tickets avancés : footer_text admin honoré', brut(adv.buildPanelPayload(cfg)).includes('-# Support de MonServeur'));
  const ann = announcements.buildPanel({ title: 'Info', message: 'Bonjour', footer: 'Annonce du staff' }, { name: 'Serveur' });
  check('annonce : pied saisi par l\'admin honoré', v2.footer(ann) === 'Annonce du staff', v2.footer(ann));
  const annVide = announcements.buildPanel({ title: 'Info', message: 'Bonjour', footer: '' }, { name: 'Serveur' });
  check('annonce sans pied : pas de signature par défaut', !String(v2.footer(annVide)).includes('Hoxera'));
}

console.log('— 5. Source : plus de footer: « Hoxera · » actif —');
{
  const files = ['panels.js', 'extra.js', 'premade.js', 'giveaway.js', 'suggest.js', 'events.js', 'verification.js', 'automod.js', 'xp.js', 'guildEvents.js', 'tasks.js'];
  for (const f of files) {
    const src = racine('server/discord/' + f);
    const hits = [];
    src.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (/footer:\s*[`'"]Hoxera ·/.test(line) || /\.setFooter\(\{[^}]*Hoxera ·/.test(line)) hits.push(i + 1);
    });
    check(`${f} : aucune signature Hoxera active`, hits.length === 0, hits.join(','));
  }
}

console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`\n✅ v312 : ${ok} vérifications passed.`);
process.exit(ko === 0 ? 0 : 1);
