// v345 — Commandes : menus en français, sélecteurs manquants, slowmode + nick.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ApplicationCommandOptionType, ChannelType } = require('discord.js');

const TMP = path.join(__dirname, '.tmp-v345');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');

require('../server/db');
const premade = require('../server/discord/premade');
const extra = require('../server/discord/extra');
const guildEvents = require('../server/discord/guildEvents');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v345 —');
check('index.html : ?v=353 ×7', (html.match(/\?v=353/g) || []).length === 7);
check('sw.js : cache botdev-v353', sw.includes("const CACHE = 'botdev-v353';"));
check('index.html : plus aucune ?v=344', !html.includes('?v=344'));
check('VERSION ≥ 345', changelog.VERSION >= 345);
check('journal v345 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);

console.log('— 2. Sélecteurs ajoutés —');
const payloads = premade.buildSlashPayloads(1);
const find = (n) => payloads.find((p) => p.name === n);
const opt = (cmd, name) => ((cmd && cmd.options) || []).find((o) => o.name === name);
const unban = find('unban');
check('/unban : sélecteur utilisateur', opt(unban, 'utilisateur') && opt(unban, 'utilisateur').type === ApplicationCommandOptionType.User);
check('/unban : plus d’identifiant texte', !opt(unban, 'identifiant'));
const clear = find('clear');
check('/clear : filtre membre', opt(clear, 'membre') && opt(clear, 'membre').type === ApplicationCommandOptionType.User);
check('/clear : sélecteur salon', opt(clear, 'salon') && opt(clear, 'salon').type === ApplicationCommandOptionType.Channel);
const say = find('say');
check('/say : sélecteur salon', opt(say, 'salon') && opt(say, 'salon').type === ApplicationCommandOptionType.Channel);
const slow = find('slowmode');
check('/slowmode existe', !!slow);
check('/slowmode : salon Channel', opt(slow, 'salon') && opt(slow, 'salon').type === ApplicationCommandOptionType.Channel);
check('/slowmode : secondes', opt(slow, 'secondes') && opt(slow, 'secondes').required);
const nick = find('nick');
check('/nick existe', !!nick);
check('/nick : membre User', opt(nick, 'membre') && opt(nick, 'membre').type === ApplicationCommandOptionType.User);

console.log('— 3. Menus en français —');
function choiceNames(cmd, optName) {
  const o = opt(cmd, optName);
  return ((o && o.choices) || []).map((c) => c.name).join(' | ');
}
const gw = find('giveaway');
check('/giveaway : Créer (pas create)', choiceNames(gw, 'action').includes('Créer') && !choiceNames(gw, 'action').split(' | ').includes('create'));
const sug = find('suggestions');
check('/suggestions : Choisir le salon (pas set)', choiceNames(sug, 'action').includes('Choisir') && !choiceNames(sug, 'action').split(' | ').includes('set'));
const extraP = extra.buildExtraPayloads();
const xf = (n) => extraP.find((p) => p.name === n);
const xopt = (cmd, name) => ((cmd && cmd.options) || []).find((o) => o.name === name);
function xnames(cmd, n) { return ((xopt(cmd, n) && xopt(cmd, n).choices) || []).map((c) => c.name).join(' | '); }
check('/birthday : Enregistrer (pas set)', xnames(xf('birthday'), 'action').includes('Enregistrer'));
check('/lockdown : Verrouiller (pas on)', xnames(xf('lockdown'), 'action').includes('Verrouiller'));
check('/lockdown : sélecteur salon', xopt(xf('lockdown'), 'salon') && xopt(xf('lockdown'), 'salon').type === ApplicationCommandOptionType.Channel);
check('/voicetemp : Régler (pas set brut)', xnames(xf('voicetemp'), 'action').includes('Régler'));
check('/apply : Choisir le salon', xnames(xf('apply'), 'action').includes('Choisir'));
check('/emotes : Installer', xnames(xf('emotes'), 'action').includes('Installer'));
const ev = guildEvents.buildEventPayloads().find((p) => p.name === 'event');
const evAct = ((ev.options || []).find((o) => o.name === 'action') || {}).choices || [];
check('/event : Créer un événement', evAct.some((c) => /Créer/.test(c.name)));
check('sticky : plus de (v276)', !racine('server/discord/extra.js').includes('(v276)'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v345 : ' + ok + ' vérifications passed.');
