// Test v200 — « Bienvenue pro » : salons à mentionner dans le message
// de bienvenue / de départ ({channels} → mentions cliquables Discord).
// 1. EVENT_DEFS : champ channelsmulti sur member_join + member_leave
// 2. channelMentions : construit les mentions depuis [{channel, label}]
// 3. resolveVariables : remplace {channels}
// 4. Renderer : le dashboard gère le type channelsmulti + la collecte JSON
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v200-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  const events = require('../server/discord/events');
  const engine = require('../server/discord/engine');
  const { resolveVariables } = engine;

  // ================= 1. Définitions =================
  console.log('\n1️⃣  Définitions des événements');
  const joinCfg = events.EVENT_DEFS.member_join.config;
  const leaveCfg = events.EVENT_DEFS.member_leave.config;
  check('member_join : champ channelsmulti', joinCfg.some((f) => f.type === 'channelsmulti' && f.key === 'channels'));
  check('member_leave : champ channelsmulti', leaveCfg.some((f) => f.type === 'channelsmulti' && f.key === 'channels'));
  check('libellé du champ explique {channels}', joinCfg.some((f) => f.type === 'channelsmulti' && String(f.label).includes('{channels}')));

  // ================= 2. channelMentions =================
  console.log('\n2️⃣  channelMentions (construction des mentions)');
  const fakeGuild = {
    id: 'G200',
    name: 'Serveur Test',
    channels: { cache: new Map([
      ['100', { id: '100', name: 'regles' }],
      ['200', { id: '200', name: 'tickets' }],
      ['300', { id: '300', name: 'general' }],
    ]) },
  };
  const fakeResolve = async (guild, ref) => {
    const name = String(ref || '').replace(/^#/, '').toLowerCase();
    for (const ch of guild.channels.cache.values()) {
      if (ch.name.toLowerCase() === name) return ch;
    }
    return null;
  };
  // Cas normal : 3 salons avec libellés
  const cfg1 = JSON.stringify([
    { channel: '#regles', label: '📜 Règles' },
    { channel: '#tickets', label: '🎫 Ticket' },
    { channel: '#general', label: '💬 Chat général' },
  ]);
  const out1 = await events.channelMentions(fakeGuild, cfg1, fakeResolve);
  check('3 mentions construites', out1.split('\n').length === 3);
  check('format : libellé → mention', out1.includes('📜 Règles → <#100>') && out1.includes('🎫 Ticket → <#200>'));
  check('toutes les lignes sont des mentions valides', /^.+ → <#\d+>$/.test(out1.split('\n')[0]));
  // Sans libellé : juste la mention
  const cfg2 = JSON.stringify([{ channel: '#general', label: '' }]);
  const out2 = await events.channelMentions(fakeGuild, cfg2, fakeResolve);
  check('sans libellé → mention seule', out2 === '<#300>');
  // Salon introuvable : ignoré
  const cfg3 = JSON.stringify([{ channel: '#inexistant', label: 'X' }, { channel: '#regles', label: 'R' }]);
  const out3 = await events.channelMentions(fakeGuild, cfg3, fakeResolve);
  check('salon introuvable ignoré', out3 === 'R → <#100>');
  // JSON invalide / vide : chaîne vide
  check('config vide → rien', await events.channelMentions(fakeGuild, '', fakeResolve) === '');
  check('JSON invalide → rien', await events.channelMentions(fakeGuild, 'pas du json', fakeResolve) === '');
  check('null → rien', await events.channelMentions(fakeGuild, null, fakeResolve) === '');

  // ================= 3. resolveVariables {channels} =================
  console.log('\n3️⃣  Variable {channels}');
  const rendered = resolveVariables('Bienvenue {user} ! Voici les liens :\n{channels}', {
    vars: { userMention: '<@42>', channelsMention: '📜 Règles → <#100>\n🎫 Ticket → <#200>' },
  });
  check('{channels} remplacé', rendered.includes('📜 Règles → <#100>') && rendered.includes('🎫 Ticket → <#200>'));
  check('{user} toujours remplacé', rendered.includes('<@42>'));
  check('sans channelsMention → vide (aucun impact)', resolveVariables('Salut {channels}', { vars: {} }) === 'Salut ');

  // ================= 4. render() passe channelsMention =================
  console.log('\n4️⃣  Intégration dans render()');
  const src = read('server/discord/events.js');
  check('runJoinEvent passe channelsMention', src.includes("const channelsMention = await channelMentions(member.guild, cfg.channels, resolveChannel);"));
  check('runLeaveEvent passe channelsMention', src.includes("const channelsMention = await channelMentions(member.guild, cfg.channels, resolveChannel);"));
  check('render accepte extraVars', src.includes('function render(member, botRecord, template, extraVars = {})'));
  const engineSrc = read('server/discord/engine.js');
  check('engine : {channels} ajouté', engineSrc.includes('.replace(/\\{channels\\}/g, v.channelsMention || \'\')'));

  // ================= 5. Dashboard =================
  console.log('\n5️⃣  Dashboard');
  const dash = read('public/js/dashboard.js');
  check('renderer : type channelsmulti géré', dash.includes("f.type === 'channelsmulti'"));
  check('renderer : libellé par salon', dash.includes('data-cm-label'));
  check('renderer : collecte JSON au save', dash.includes('dataset.channelsmulti') && dash.includes('JSON.stringify(rows)'));
  check('renderer : aide {channels} affichée', dash.includes('{channels}'));

  console.log(failures === 0
    ? '\n🎉 Tous les tests v2.0 passent — Bienvenue pro avec salons cliquables !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
