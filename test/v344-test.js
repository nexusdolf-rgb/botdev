// v344 — Commandes Discord : sélecteurs salon / catégorie / rôle (plus de saisie à la main).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ApplicationCommandOptionType, ChannelType } = require('discord.js');

const TMP = path.join(require('node:os').tmpdir(), 'hoxera-v344-' + process.pid + '-' + Date.now());
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
const premadeSrc = racine('server/discord/premade.js');
const panelSrc = racine('server/discord/panelCommands.js');
const panelsSrc = racine('server/discord/panels.js');
const extraSrc = racine('server/discord/extra.js');
const eventsSrc = racine('server/discord/guildEvents.js');

require('../server/db');
const premade = require('../server/discord/premade');
const extra = require('../server/discord/extra');
const guildEvents = require('../server/discord/guildEvents');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v344 —');
check('index.html : ?v=360 ×7', (html.match(/\?v=360/g) || []).length === 7);
check('sw.js : cache botdev-v360', sw.includes("const CACHE = 'botdev-v360';"));
check('index.html : plus aucune ?v=343', !html.includes('?v=343'));
check('VERSION ≥ 344', changelog.VERSION >= 344);
check('journal v344 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);

console.log('— 2. /ticket : sélecteurs —');
const payloads = premade.buildSlashPayloads(1);
const ticket = payloads.find((p) => p.name === 'ticket');
function sub(cmd, name) { return (cmd.options || []).find((o) => o.name === name); }
check('commande /ticket présente', !!ticket);
const logs = sub(ticket, 'logs');
check('/ticket logs existe', !!logs && logs.type === ApplicationCommandOptionType.Subcommand);
check('/ticket logs : option salon Channel', logs && logs.options && logs.options[0] && logs.options[0].type === ApplicationCommandOptionType.Channel);
check('/ticket logs : salons texte seulement', logs && logs.options && logs.options[0].channel_types && logs.options[0].channel_types.includes(ChannelType.GuildText));
const cat = sub(ticket, 'category');
check('/ticket category : sélecteur de catégorie', cat && cat.options && cat.options[0] && cat.options[0].type === ApplicationCommandOptionType.Channel && cat.options[0].channel_types && cat.options[0].channel_types.includes(ChannelType.GuildCategory));
const types = sub(ticket, 'types');
const add = types && (types.options || []).find((o) => o.name === 'add');
const addCat = add && (add.options || []).find((o) => o.name === 'categorie');
const addRole = add && (add.options || []).find((o) => o.name === 'staffrole');
check('/ticket types add : catégorie = Channel', addCat && addCat.type === ApplicationCommandOptionType.Channel);
check('/ticket types add : staffrole = Role', addRole && addRole.type === ApplicationCommandOptionType.Role);
check('assistant : étape récap staff', panelSrc.includes("key: 'logs'") && panelSrc.includes('Récapitulatif staff'));
check('assistant : catégorie en ChannelSelect', panelSrc.includes('ChannelType.GuildCategory'));
check('types wizard : ChannelSelect catégorie', panelsSrc.includes('bdw-tc:') && panelsSrc.includes('ChannelSelectMenuBuilder'));
check('récap staff : retrouve le salon par ID', panelsSrc.includes('guild.channels.cache.get(raw)') || panelsSrc.includes('cache.get(id)'));

console.log('— 3. Autres commandes de config —');
const gw = payloads.find((p) => p.name === 'giveaway');
check('/giveaway : option salon', gw && (gw.options || []).some((o) => o.name === 'salon' && o.type === ApplicationCommandOptionType.Channel));
const sug = payloads.find((p) => p.name === 'suggestions');
check('/suggestions : channel_types texte', sug && (sug.options || []).some((o) => o.name === 'salon' && Array.isArray(o.channel_types)));
const extraP = extra.buildExtraPayloads();
const vt = extraP.find((p) => p.name === 'voicetemp');
const vtSalon = vt && (vt.options || []).find((o) => o.name === 'salon');
check('/voicetemp salon : vocaux seulement', vtSalon && vtSalon.channel_types && vtSalon.channel_types.includes(ChannelType.GuildVoice));
const apply = extraP.find((p) => p.name === 'apply');
check('/apply salon : texte', apply && (apply.options || []).some((o) => o.name === 'salon' && Array.isArray(o.channel_types)));
const ev = guildEvents.buildEventPayloads().find((p) => p.name === 'event');
const evRole = ev && (ev.options || []).find((o) => o.name === 'role');
const evSalon = ev && (ev.options || []).find((o) => o.name === 'salon');
check('/event role = sélecteur Role', evRole && evRole.type === ApplicationCommandOptionType.Role);
check('/event salon : channel_types', evSalon && Array.isArray(evSalon.channel_types));
check('aide /ticket logs', premadeSrc.includes('/ticket logs'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v344 : ' + ok + ' vérifications passed.');
