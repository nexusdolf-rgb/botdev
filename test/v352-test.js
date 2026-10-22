// v352 — retrait du champ « Équipe en charge » du panneau privé de ticket.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v352-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const changelog = require('../server/discord/changelog');
const v2 = require('./helpers/v2');

let ok = 0;
const failures = [];
function check(label, condition) {
  if (condition) {
    ok++;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

const member = {
  id: 'U1',
  user: { id: 'U1', username: 'Alice', displayAvatarURL: () => 'https://cdn.example/alice.png' },
  toString: () => '<@U1>',
  guild: { name: 'Serveur de test' },
};
const roleMention = '<@&R1>';
const panel = panels.ticketWelcomePanel(
  member, null, roleMention, 'Ma commande n’est jamais arrivée…', '', [], 'fr',
  { number: 42 }, {}, { teamLabel: 'Modération' },
);
const texts = v2.texts(panel);
const allText = v2.allText(panel);
const root = v2.plain(v2.container(panel));
const parts = (root && root.components) || [];
const textIndex = (needle) => parts.findIndex((part) =>
  Number(part.type) === v2.TYPE.TEXT_DISPLAY && String(part.content || '').includes(needle));
const separatorsBetween = (left, right) => {
  const from = textIndex(left);
  const to = textIndex(right);
  if (from < 0 || to <= from) return -1;
  return parts.slice(from + 1, to).filter((part) =>
    Number(part.type) === v2.TYPE.SEPARATOR && part.divider === true).length;
};

console.log('— Le champ est retiré, le ping reste —');
check('le panneau reste un seul message Components V2',
  v2.isV2(panel) && panel.content === undefined && panel.embeds === undefined && panel.components.length === 1);
check('titre et numéro restent inchangés', v2.title(panel) === '🎫 Ticket #42');
check('le bloc d’identité conserve le créateur, sans ping ajouté',
  (texts[1] || '').startsWith('👤 **Ouvert par :** <@U1>')
    && !texts[1].includes('Équipe') && v2.author(panel) === '');
check('aucun ping de rôle ajouté (carte identique aux captures)', (allText.match(/<@&R1>/g) || []).length === 0);
check('« Équipe en charge : Modération » a disparu du panneau',
  !allText.includes('Équipe en charge') && !allText.includes('Modération'));

console.log('— Le reste du panneau reste intact —');
const typeBlock = texts.find((text) => text.includes('🏷 **Type :**')) || '';
check('le type simple « 🎟️ Simple » reste présent sans champ équipe',
  typeBlock.includes('🏷 **Type :** 🎟️ Simple') && !typeBlock.includes('Équipe en charge'));
// v379 — la carte ne porte plus de texte d'accueil implicite.
check('aucun texte d’accueil implicite ne s’ajoute à la carte', !allText.includes('Bienvenue <@U1>'));
const reasonBlock = texts.find((text) => text.includes('📄 **Raison :**')) || '';
check('libellé et réponse de la raison restent présents (bloc de code)',
  reasonBlock.includes('📄 **Raison :**')
    && reasonBlock.includes('```\nMa commande n’est jamais arrivée…\n```'));
check('le séparateur reste sous le titre, entre les lignes de la carte',
  separatorsBetween('### 🎫 Ticket #42', '👤 **Ouvert par :**') === 1
    && v2.dividers(panel) === 1);
check('aucune vignette sur la carte (v379)',
  v2.thumbnailUrls(panel).length === 0
    && (v2.json(panel).match(/alice\.png/g) || []).length === 0);
check('aucun ancien séparateur textuel et plafond Components V2 respecté',
  !allText.includes('━') && v2.componentCount(panel) <= 40);

console.log('— Contrôles staff, types et titres personnalisés —');
const staffMenu = new StringSelectMenuBuilder()
  .setCustomId('v352:staff')
  .setPlaceholder('Gérer ce ticket…')
  .addOptions(new StringSelectMenuOptionBuilder().setLabel('🔒 Fermer').setValue('close'));
const claimButton = new ButtonBuilder()
  .setCustomId('v352:claim')
  .setStyle(ButtonStyle.Primary)
  .setLabel('🖐️ Pris en charge');
const withControls = panels.ticketWelcomePanel(
  member, null, roleMention, 'Raison', '', [], 'fr', { number: 43 }, {},
  { rows: [new ActionRowBuilder().addComponents(staffMenu), new ActionRowBuilder().addComponents(claimButton)] },
);
check('menu et bouton staff restent dans le même conteneur V2',
  v2.rows(withControls).length === 2
    && v2.controlByPrefix(withControls, 'v352:staff')
    && v2.controlByPrefix(withControls, 'v352:claim'));
const controlParts = (v2.plain(v2.container(withControls)) || {}).components || [];
const lastNote = controlParts.findIndex((part) =>
  Number(part.type) === v2.TYPE.TEXT_DISPLAY && String(part.content || '').includes('📄 **Raison :**'));
const firstAction = controlParts.findIndex((part) => Number(part.type) === v2.TYPE.ACTION_ROW);
check('aucun séparateur supplémentaire avant les actions staff', lastNote >= 0 && firstAction === lastNote + 1);
const customType = panels.ticketWelcomePanel(
  member, { label: 'Assistance spéciale', emoji: '🧭', description: '', staff_roles: [] },
  roleMention, '', '', [], 'fr', { number: 44 }, {}, {},
);
check('les noms et emojis personnalisés de type restent inchangés',
  v2.allText(customType).includes('🏷 **Type :** 🧭 Assistance spéciale')
    && !v2.allText(customType).includes('Équipe en charge'));
const customTitle = panels.ticketWelcomePanel(
  member, null, roleMention, '', '', [], 'fr', { number: 9 },
  { title: 'Assistance {user}', welcome: 'Bienvenue personnalisée {member}', steps: '' }, {},
);
check('titre personnalisé et numéro restent respectés', v2.title(customTitle) === 'Assistance Alice · #9');

console.log('— Journal des versions /update —');
const current = changelog.VERSIONS[0];
const previous = changelog.VERSIONS[1];
check('v352 reste dans le journal après l’ajout de versions récentes',
  changelog.VERSION === 360 && current.v === 360 && changelog.NOTES.v === 360
    && changelog.VERSIONS.some((entry) => entry.v === 352));
const home = changelog.buildHomePanel(1);
const homeText = v2.allText(home);
check('/update présente la version courante puis v359',
  v2.title(home) === `🚀 Mises à jour de Hoxera (v${current.v})`
    && previous.v === 359
    && homeText.includes(`**v${current.v} — ${current.title}**`)
    && homeText.includes('**v359 — Espace fondateur repensé**'));

const previewPath = path.join(__dirname, '..', 'docs', 'apercu-ticket-prive.html');
const preview = fs.readFileSync(previewPath, 'utf8');
check('l’aperçu statique reflète la carte v379 (statut + ping conservé)',
  !preview.includes('Équipe en charge')
    && preview.includes('Ouvert par')
    && preview.includes('<span class="ping">@Modération</span>'));

try { store.db.close(); } catch {}
try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
if (failures.length) {
  failures.forEach((failure) => console.log(`  ❌ ${failure}`));
  process.exit(1);
}
console.log(`\n✅ v352-test.js : ${ok} vérifications OK`);
