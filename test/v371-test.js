// ============================================================
// v371 — la confirmation « ticket créé » est un panneau, plus du texte brut.
//
// Après un clic sur « Ouvrir un ticket », le bot répondait par une phrase et un
// bouton posé dessous, seule réponse encore dans ce format. Elle prend la même
// carte que le MP d'ouverture, et reste éphémère.
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ButtonStyle } = require('discord.js');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v371-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const i18n = require('../server/i18n');
const panels = require('../server/discord/panels');
const v2 = require('./helpers/v2');

let ok = 0;
const echecs = [];
const check = (label, cond, detail) => {
  if (cond) { ok++; console.log('  ✅ ' + label); return; }
  echecs.push(label);
  console.log('  ❌ ' + label + (detail === undefined ? '' : ' — ' + String(detail).slice(0, 140)));
};

const RACINE = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RACINE, 'server', 'discord', 'panels.js'), 'utf8');
const VERSION = 371;
const guild = { id: '153999999999999371', name: 'Serveur exemple' };
const channel = { id: '154000000000000371', name: 'ticket-alice' };
const client = { user: { displayAvatarURL: () => 'https://cdn.example/bot.png' } };

console.log('— 1. Version —');
const index = fs.readFileSync(path.join(RACINE, 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(RACINE, 'public', 'sw.js'), 'utf8');
check(`index.html : ?v=${VERSION} référencé 7 fois`, (index.match(/\?v=371/g) || []).length === 7);
check('service worker au même cache', sw.includes("const CACHE = 'botdev-v371';"));

console.log('— 2. Le message de confirmation est une carte —');
const pay = panels.__testBuildTicketOpenConfirmPayload(client, guild, channel, 12, 'fr', '**Bug**');
check('payload Components V2', v2.isV2(pay));
check('toujours éphémère', (Number(pay.flags) & 64) !== 0);
check('un conteneur, pas un message nu', Number(v2.container(pay).type) === 17);
check('aucun composant hors du conteneur', pay.components.length === 1 && v2.componentCount(pay) >= 3);
const textes = v2.allText(pay);
check('titre avec le numéro', v2.title(pay).includes('#12'), v2.title(pay));
check('la phrase de création est dans la carte',
  textes.includes('a été créé') && textes.includes('<#154000000000000371>'));
check('le type choisi est rappelé', textes.includes('**Bug**'));
check('la petite ligne dit que seul le demandeur la voit',
  textes.includes(i18n.t('fr', 'ticket_confirm_note')));
// v371 — ordre demandé : la phrase, un trait, le bouton, PUIS la petite ligne.
{
  // Les enfants du conteneur sont des builders : on les passe en JSON pour
  // lire l'ordre réel de ce qui partira sur le réseau.
  const enfants = JSON.parse(JSON.stringify(pay.components[0])).components || [];
  const types = enfants.map((c) => Number(c.type));
  const posBouton = types.indexOf(1);
  const posSeparateur = types.indexOf(14);
  const posNote = enfants.findIndex((c) => Number(c.type) === 10
    && String(c.content || '').includes(i18n.t('fr', 'ticket_confirm_note')));
  check('le trait sépare la phrase du bouton', posSeparateur > -1 && posSeparateur < posBouton, types.join(','));
  check('la petite ligne est SOUS le bouton', posNote > posBouton, types.join(','));
}
check('le bouton est DANS le conteneur (plus posé dessous)',
  v2.controls(pay).length === 1 && v2.controls(pay)[0].style === ButtonStyle.Link);
check('le bouton pointe vers le salon du ticket',
  v2.controls(pay)[0].url === `https://discord.com/channels/${guild.id}/${channel.id}`);

console.log('— 3. Plus aucun texte brut à cet endroit —');
check('openTicket n’envoie plus content + components',
  !/ackReply\(interaction, \{ content: confirmMsg, components: \[linkRow\] \}\)/.test(src));
check('le libellé du bouton vient de l’i18n, plus en dur',
  !/setLabel\('🎫 Ouvrir mon ticket'\)/.test(src));
check('le constructeur est appelé par openTicket',
  /buildTicketOpenConfirmPayload\(interaction\.client, guild, channel, ticketNumber, lang, typeConfirm\)/.test(src));

console.log('— 4. Les autres langues suivent —');
check('EN : titre localisé', v2.title(panels.__testBuildTicketOpenConfirmPayload(client, guild, channel, 3, 'en')).includes('#3'));
check('EN : phrase et pied traduits',
  v2.allText(panels.__testBuildTicketOpenConfirmPayload(client, guild, channel, 3, 'en')).includes('Only you can see this message'));
check('aucun cadratin dans les textes ajoutés',
  !i18n.t('fr', 'ticket_confirm_note').includes('—') && !i18n.t('en', 'ticket_confirm_note').includes('—'));

console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌ sur ${ok + echecs.length} vérifications`);
try { store.db.close(); } catch {}
try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
console.log('🎉 v371 — la confirmation d’ouverture est une carte, bouton compris.');
