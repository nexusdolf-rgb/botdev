// Test v201 — Panneau de bienvenue « pro » : salons détaillés par phrase
// ({salon} = mention cliquable dans la phrase) + modèle prêt à l'emploi
// (membre mentionné + salons organisés dans le panneau Discord).
// 1. channelMentions : {salon} inséré dans la phrase, sinon « phrase → <#id> »
// 2. Compatibilité arrière : ancien format label → <#id>
// 3. Modèle « bienvenue pro » dans le dashboard (mention {user} + {channels})
// 4. Variable {channels} toujours gérée par engine.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v201-'));
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

  const fakeGuild = {
    id: 'G201',
    name: 'Serveur Test',
    channels: { cache: new Map([
      ['100', { id: '100', name: 'regles' }],
      ['200', { id: '200', name: 'tickets' }],
      ['300', { id: '300', name: 'general' }],
    ]) },
  };
  const fakeResolve = async (guild, ref) => {
    const name = String(ref || '').replace(/^#/, '').toLowerCase();
    for (const ch of guild.channels.cache.values()) if (ch.name.toLowerCase() === name) return ch;
    return null;
  };

  // ================= 1. {salon} dans la phrase =================
  console.log('\n1️⃣  Phrases détaillées ({salon})');
  const out1 = await events.channelMentions(fakeGuild, JSON.stringify([
    { channel: '#regles', label: '📜 Je vous invite à prendre connaissance de {salon}' },
  ]), fakeResolve);
  check('phrase avec {salon} → mention à l\u0027intérieur', out1 === '📜 Je vous invite à prendre connaissance de <#100>');
  const out2 = await events.channelMentions(fakeGuild, JSON.stringify([
    { channel: '#regles', label: '{salon}' },
  ]), fakeResolve);
  check('{salon} seul → mention seule', out2 === '<#100>');
  const out3 = await events.channelMentions(fakeGuild, JSON.stringify([
    { channel: '#regles', label: 'Deux mentions : {salon} et encore {salon}' },
  ]), fakeResolve);
  check('plusieurs {salon} remplacés', out3 === 'Deux mentions : <#100> et encore <#100>');
  const out4 = await events.channelMentions(fakeGuild, JSON.stringify([
    { channel: '#regles', label: '📜 Je vous invite à prendre connaissance de {salon}' },
    { channel: '#tickets', label: '🎫 Besoin d\u0027aide ? Ouvre un ticket : {salon}' },
    { channel: '#general', label: '💬 Viens discuter : {salon}' },
  ]), fakeResolve);
  check('3 salons détaillés en lignes séparées', out4.split('\n').length === 3
    && out4.includes('<#100>') && out4.includes('<#200>') && out4.includes('<#300>')
    && out4.includes('📜 Je vous invite à prendre connaissance de'));

  // ================= 2. Compatibilité arrière =================
  console.log('\n2️⃣  Compatibilité arrière');
  const old1 = await events.channelMentions(fakeGuild, JSON.stringify([{ channel: '#tickets', label: '🎫 Ticket' }]), fakeResolve);
  check('ancien format « phrase → mention »', old1 === '🎫 Ticket → <#200>');
  const old2 = await events.channelMentions(fakeGuild, JSON.stringify([{ channel: '#general', label: '' }]), fakeResolve);
  check('sans phrase → mention seule', old2 === '<#300>');
  check('salon introuvable ignoré', await events.channelMentions(fakeGuild, JSON.stringify([{ channel: '#x', label: 'X' }]), fakeResolve) === '');
  check('JSON invalide → rien', await events.channelMentions(fakeGuild, 'bzzt', fakeResolve) === '');

  // ================= 3. Définitions + dashboard =================
  console.log('\n3️⃣  Dashboard (modèle + aperçu)');
  const joinCfg = events.EVENT_DEFS.member_join.config;
  const leaveCfg = events.EVENT_DEFS.member_leave.config;
  check('channelsmulti toujours présent (arrivée)', joinCfg.some((f) => f.type === 'channelsmulti'));
  check('channelsmulti toujours présent (départ)', leaveCfg.some((f) => f.type === 'channelsmulti'));
  const dash = read('public/js/dashboard.js');
  check('bouton ✨ Modèle présent', dash.includes('✨ Modèle'));
  check('modèle bienvenue : {user} + {channels}', dash.includes('Bienvenue {user} sur {server}') && dash.includes('{channels}'));
  check('modèle départ : {user}', dash.includes('Au revoir {user}'));
  check('placeholder phrase avec {salon}', dash.includes('prendre connaissance de {salon}'));
  check('aperçu remplace {salon}', dash.includes("line.split('{salon}').join"));
  const engineSrc = read('server/discord/engine.js');
  check('engine gère toujours {channels}', engineSrc.includes('.replace(/\\{channels\\}/g, v.channelsMention'));
  const eventsSrc = read('server/discord/events.js');
  check('backend : {salon} géré', eventsSrc.includes("label.includes('{salon}')"));

  console.log(failures === 0
    ? '\n🎉 Tous les tests v2.1 passent — panneau pro avec salons détaillés !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
