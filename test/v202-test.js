// Test v202 — Correctif « <#undefined> » + sélecteur de salons.
// 1. RÉGRESSION : channelMentions attend le résolveur (async) → plus de
//    <#undefined> dans le panneau de bienvenue (bug vu en production).
// 2. Compatibilité : anciennes configs (libellés simples, IDs Discord) OK.
// 3. UI : sélecteur déroulant (➕ Ajouter) au lieu de la grille de cases,
//    phrases par salon conservées, aide « Comment ça marche » enrichie.
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v202-'));
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

  const fakeGuild = {
    id: 'G202',
    name: 'Serveur Test',
    channels: { cache: new Map([
      ['101234567890123456', { id: '101234567890123456', name: 'regles' }],
      ['201234567890123456', { id: '201234567890123456', name: 'tickets' }],
      ['301234567890123456', { id: '301234567890123456', name: 'general' }],
    ]) },
  };
  // VRAI résolveur async, comme resolveChannel (le bug venait d'un résolveur
  // non attendu : ch = Promesse → ch.id = undefined → <#undefined>).
  const asyncResolve = async (guild, ref) => {
    // Même logique que resolveChannel : ID d'abord, puis nom avec/sans « # »
    const s = String(ref || '').trim();
    if (/^\d{15,21}$/.test(s)) {
      for (const ch of guild.channels.cache.values()) if (ch.id === s) return ch;
      return null;
    }
    const name = s.replace(/^#/, '').toLowerCase();
    for (const ch of guild.channels.cache.values()) if (ch.name.toLowerCase() === name) return ch;
    return null;
  };

  // ================= 1. RÉGRESSION <#undefined> =================
  console.log('\n1️⃣  Régression <#undefined> (résolveur async)');
  const cfg = JSON.stringify([
    { channel: '#regles', label: '📜 Je vous invite à prendre connaissance de {salon}' },
    { channel: '#tickets', label: '🎫 Ticket' },
    { channel: '#general', label: '' },
  ]);
  const out = await events.channelMentions(fakeGuild, cfg, asyncResolve);
  check('AUCUN <#undefined> dans le résultat', !out.includes('<#undefined>'));
  check('phrase {salon} → mention dans la phrase', out.includes('📜 Je vous invite à prendre connaissance de <#101234567890123456>'));
  check('ancien format → phrase → mention', out.includes('🎫 Ticket → <#201234567890123456>'));
  check('sans phrase → mention seule', out.includes('<#301234567890123456>'));
  check('3 lignes exactement', out.split('\n').length === 3);

  // ================= 2. Compatibilité configs existantes =================
  console.log('\n2️⃣  Compatibilité');
  // Ancienne config sauvegardée avec des ID Discord (v200/v201 acceptaient les deux)
  const outId = await events.channelMentions(fakeGuild, JSON.stringify([{ channel: '101234567890123456', label: 'Règles' }]), asyncResolve);
  check('ID Discord dans la config → mention OK', outId === 'Règles → <#101234567890123456>');
  check('salon introuvable ignoré', await events.channelMentions(fakeGuild, JSON.stringify([{ channel: '#x', label: 'X' }]), asyncResolve) === '');
  check('config vide → rien', await events.channelMentions(fakeGuild, '', asyncResolve) === '');
  check('appelants await (join)', read('server/discord/events.js').includes('await channelMentions(member.guild, cfg.channels, resolveChannel)'));

  // ================= 3. UI : sélecteur =================
  console.log('\n3️⃣  UI : sélecteur + aide enrichie');
  const dash = read('public/js/dashboard.js');
  check('sélecteur déroulant (data-cm-add)', dash.includes('data-cm-add'));
  check('bouton ➕ Ajouter (data-cm-addbtn)', dash.includes('data-cm-addbtn'));
  check('bouton ✖ par salon (data-cm-remove)', dash.includes('data-cm-remove'));
  check('plus de cases à cocher (data-cm-check retiré)', !dash.includes('data-cm-check'));
  check('sauvegarde JSON [{channel, label}] conservée', dash.includes('JSON.stringify(rows)') && dash.includes('rows.push({ channel: ref, label:'));
  check('aperçu lit les phrases des lignes', dash.includes('.cm-row [data-cm-label]'));
  check('aide « Comment ça marche » présente', dash.includes('Comment ça marche'));
  check('placeholder phrase {salon}', dash.includes('prendre connaissance de {salon}'));
  const eventsSrc = read('server/discord/events.js');
  check('EVENT_DEFS champ channelsmulti conservé', eventsSrc.includes("type: 'channelsmulti'"));

  console.log(failures === 0
    ? '\n🎉 Tous les tests v2.2 passent — plus de <#undefined>, sélecteur de salons !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
