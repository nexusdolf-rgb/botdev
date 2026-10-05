// v351 — panneau d’ouverture du ticket privé, d’après la maquette confirmée.
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

const DATA_DIR = path.join(os.tmpdir(), `botdev-v351-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const i18n = require('../server/i18n');
const changelog = require('../server/discord/changelog');
const v2 = require('./helpers/v2');

let ok = 0;
const failures = [];
function check(label, condition, extra = '') {
  if (condition) {
    ok++;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}${extra ? ` — ${extra}` : ''}`);
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

const member = {
  id: 'U1',
  user: { id: 'U1', username: 'Alice', displayAvatarURL: () => 'https://cdn.example/alice.png' },
  toString: () => '<@U1>',
  guild: { name: 'Serveur de test' },
};
const roleMention = '<@&R1>';
const simplePanel = panels.ticketWelcomePanel(
  member, null, roleMention, 'Ma commande n’est jamais arrivée…', '', [], 'fr',
  { number: 42 }, {}, { teamLabel: 'Modération' },
);
const simpleTexts = v2.texts(simplePanel);
const simpleRoot = v2.plain(v2.container(simplePanel));
const simpleParts = (simpleRoot && simpleRoot.components) || [];
const textPartIndex = (needle, parts = simpleParts) => parts.findIndex((part) =>
  Number(part.type) === v2.TYPE.TEXT_DISPLAY && String(part.content || '').includes(needle));
const separatorsBetween = (left, right, parts = simpleParts) => {
  const from = textPartIndex(left, parts);
  const to = textPartIndex(right, parts);
  if (from < 0 || to <= from) return -1;
  return parts.slice(from + 1, to).filter((part) =>
    Number(part.type) === v2.TYPE.SEPARATOR && part.divider === true).length;
};

console.log('— Titre, numéro et ligne d’identité —');
check('un seul message Components V2', v2.isV2(simplePanel) && simplePanel.content === undefined && simplePanel.embeds === undefined);
check('titre en capitales avec le numéro à côté', v2.title(simplePanel) === '🎫 TICKET OUVERT · #42');
check('le titre est le premier bloc ; la ligne auteur a disparu',
  simpleTexts[0] === '## 🎫 TICKET OUVERT · #42' && v2.author(simplePanel) === ''
    && !v2.allText(simplePanel).includes('Ticket de Alice · #42'));
check('la ligne suivante indique le créateur puis ping le rôle staff',
  simpleTexts[1] === `Ticket de <@U1> • ${roleMention}`);
check('le ping réel du rôle reste présent une seule fois et le champ équipe est absent',
  (v2.allText(simplePanel).match(/<@&R1>/g) || []).length === 1
    && !v2.allText(simplePanel).includes('Équipe en charge')
    && !v2.allText(simplePanel).includes('Modération'));

console.log('— Type, raison et texte de bienvenue —');
const typeBlock = simpleTexts.find((t) => t.includes('Type de ticket')) || '';
check('le type simple est « 🎟️ Simple », sans champ équipe redondant',
  typeBlock.includes('**🎟️ Simple**') && !typeBlock.includes('Ticket simple')
    && !typeBlock.includes('Équipe en charge'));
const greetingBlock = simpleTexts.find((t) => t.includes('Bienvenue')) || '';
check('bienvenue et consigne restent dans le même bloc (aucun séparateur entre elles)',
  greetingBlock.includes('Bienvenue <@U1>')
    && greetingBlock.includes('\n✍️ Décrivez votre demande')
    && !greetingBlock.includes('\n\n'));
const reasonBlock = simpleTexts.find((t) => t.includes('Raison de l’ouverture du ticket')) || '';
check('le motif porte le nouveau libellé et garde la réponse',
  reasonBlock.includes('📝 Raison de l’ouverture du ticket')
    && reasonBlock.includes('Ma commande n’est jamais arrivée…'));
check('la note de transcription reste présente', v2.allText(simplePanel).includes('📄 À la fermeture définitive'));
check('séparateurs confirmés dans l’ordre : identité, consignes, type, raison',
  separatorsBetween('Ticket de <@U1>', 'Bienvenue <@U1>') === 1
    && separatorsBetween('Décrivez votre demande', 'Type de ticket') === 1
    && separatorsBetween('Type de ticket', 'Raison de l’ouverture du ticket') === 1
    && separatorsBetween('Raison de l’ouverture du ticket', 'À la fermeture définitive') === 1
    && v2.dividers(simplePanel) === 4,
  `${v2.dividers(simplePanel)} séparateur(s)`);
check('aucun ancien trait en texte « ━ »', !v2.allText(simplePanel).includes('━'));
check('l’avatar membre reste présent une seule fois',
  v2.thumbnailUrls(simplePanel).includes('https://cdn.example/alice.png')
    && (v2.json(simplePanel).match(/alice\.png/g) || []).length === 1);
check('le panneau reste sans ligne d’accent ni pied par défaut',
  v2.accentColor(simplePanel) === undefined && v2.footer(simplePanel) === '');
check('limite Components V2 respectée', v2.componentCount(simplePanel) <= 40);

console.log('— Réglages personnalisés et autres langues —');
const customTitle = panels.ticketWelcomePanel(
  member, null, roleMention, '', '', [], 'fr', { number: 9 },
  { title: 'Assistance {user}', welcome: 'Bienvenue personnalisée {member}', steps: '' },
  { teamLabel: 'Modération' },
);
check('titre personnalisé conservé et numéro ajouté', v2.title(customTitle) === 'Assistance Alice · #9');
const numberTokenTitle = panels.ticketWelcomePanel(
  member, null, roleMention, '', '', [], 'fr', { number: 10 },
  { title: 'Commande #{number}', welcome: '', steps: '' }, { teamLabel: 'Modération' },
);
check('un titre personnalisé utilisant {number} n’ajoute pas un second numéro', v2.title(numberTokenTitle) === 'Commande #10');
const alreadyNumberedTitle = panels.ticketWelcomePanel(
  member, null, roleMention, '', '', [], 'fr', { number: 11 },
  { title: 'Commande #11', welcome: '', steps: '' }, { teamLabel: 'Modération' },
);
check('un titre déjà numéroté n’est pas doublé', v2.title(alreadyNumberedTitle) === 'Commande #11');
const chosenType = panels.ticketWelcomePanel(
  member, { label: 'Ticket simple personnalisé', emoji: '🎫', description: '', staff_roles: [] },
  roleMention, '', '', [], 'fr', { number: 12 }, {}, { teamLabel: 'Modération' },
);
check('les noms et emojis des types personnalisés restent inchangés',
  v2.allText(chosenType).includes('🎫 **Ticket simple personnalisé**'));
const englishPanel = panels.ticketWelcomePanel(
  member, null, roleMention, 'The reason', '', [], 'en', { number: 7 }, {}, { teamLabel: 'Moderation' },
);
check('anglais : titre et motif cohérents',
  v2.title(englishPanel) === '🎫 TICKET OPEN · #7'
    && v2.allText(englishPanel).includes('📝 Reason for opening this ticket'));
check('sans numéro, le titre par défaut reste propre',
  v2.title(panels.ticketWelcomePanel(member, null, '', '', '', [], 'fr', {}, {})) === '🎫 TICKET OUVERT');

console.log('— Contrôles staff et version —');
const staffMenu = new StringSelectMenuBuilder()
  .setCustomId('v351:staff')
  .setPlaceholder('⚙️ Actions du staff — gérer ce ticket…')
  .addOptions(new StringSelectMenuOptionBuilder().setLabel('🔒 Fermer').setValue('close'));
const claimButton = new ButtonBuilder()
  .setCustomId('v351:claim')
  .setStyle(ButtonStyle.Success)
  .setLabel('🖐️ Prendre ce ticket');
const withControls = panels.ticketWelcomePanel(
  member, null, roleMention, 'Raison', '', [], 'fr', { number: 43 }, {},
  { teamLabel: 'Modération', rows: [new ActionRowBuilder().addComponents(staffMenu), new ActionRowBuilder().addComponents(claimButton)] },
);
check('menu et bouton staff restent dans le même conteneur V2',
  v2.rows(withControls).length === 2
    && v2.controlByPrefix(withControls, 'v351:staff')
    && v2.controlByPrefix(withControls, 'v351:claim'));
const controlsParts = (v2.plain(v2.container(withControls)) || {}).components || [];
const lastNoteIndex = textPartIndex('À la fermeture définitive', controlsParts);
const firstActionIndex = controlsParts.findIndex((part) => Number(part.type) === v2.TYPE.ACTION_ROW);
check('aucun séparateur entre la dernière note et les actions staff',
  lastNoteIndex >= 0 && firstActionIndex === lastNoteIndex + 1);
check('journal : v351 est conservée derrière la version courante',
  changelog.VERSION >= 351 && changelog.VERSIONS[0].v === changelog.VERSION
    && changelog.NOTES.v === changelog.VERSION && changelog.VERSIONS.some((version) => version.v === 351));
const homeUpdate = changelog.buildHomePanel(1);
const homeUpdateText = v2.allText(homeUpdate);
const currentUpdate = changelog.VERSIONS[0];
const previousUpdate = changelog.VERSIONS[1];
check('/update affiche la version courante et la précédente',
  v2.title(homeUpdate) === `🚀 Optimus Prime — Mises à jour (v${currentUpdate.v})`
    && homeUpdateText.includes(`**v${currentUpdate.v} — ${currentUpdate.title}**`)
    && homeUpdateText.includes(`**v${previousUpdate.v} — ${previousUpdate.title}**`));
check('traductions : raison, type simple et accueil sans séparateur ajouté',
  i18n.t('fr', 'ticket_reason') === '📝 Raison de l’ouverture du ticket'
    && i18n.t('fr', 'ticket_simple') === '🎟️ Simple'
    && !i18n.t('fr', 'ticket_welcome_desc', { member: '<@U1>' }).includes('\n\n'));

try { store.db.close(); } catch {}
try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
if (failures.length) {
  failures.forEach((failure) => console.log(`  ❌ ${failure}`));
  process.exit(1);
}
console.log(`\n✅ v351-test.js : ${ok} vérifications OK`);
