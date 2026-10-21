// ============================================================
// v370 — un seul MP à la fermeture : la transcription, puis la note dessous.
//
// Avant : deux messages coup sur coup dans le MP du créateur (le panneau de
// transcription, puis un panneau « Votre avis » avec cinq étoiles). Deux cartes
// pour une seule nouvelle. Maintenant c'est un conteneur unique, la question et
// les étoiles séparées par un trait natif, sous la transcription.
//
// Et quand le membre note, on réécrit CE message : la transcription et le .txt
// restent, seules les étoiles cèdent la place au remerciement.
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ButtonStyle } = require('discord.js');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v378-${process.pid}-${Date.now()}`);
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
  console.log('  ❌ ' + label + (detail === undefined ? '' : ' — ' + String(detail).slice(0, 120)));
};

const RACINE = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RACINE, 'server', 'discord', 'panels.js'), 'utf8');
const VERSION = 378;

const guild = { id: '153999999999999370', name: 'Serveur exemple' };
let envois = [];
const user = { send: async (p) => { envois.push(p); return { id: `MSG${envois.length}` }; } };
const client = { user: { displayAvatarURL: () => 'https://cdn.example/bot.png' }, users: { fetch: async () => user } };
const guildAvecMembres = Object.assign({}, guild, { members: { fetch: async () => ({ user }) } });
const ticketUrl = `https://discord.com/channels/${guild.id}/154000000000000370`;

async function main() {
  console.log('— 1. Version —');
  const index = fs.readFileSync(path.join(RACINE, 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(RACINE, 'public', 'sw.js'), 'utf8');
  check(`index.html : ?v=${VERSION} référencé 7 fois`, (index.match(/\?v=378/g) || []).length === 7);
  check('service worker au même cache', sw.includes("const CACHE = 'botdev-v378';"));

  console.log('— 2. Un seul message, la note en dessous —');
  envois = [];
  const okEnvoi = await panels.sendCloseDm(client, guildAvecMembres, 'ticket-alice',
    { text: 'Transcription du ticket', url: ticketUrl, openerId: '154000000000000001' }, 1, 42);
  check('envoi réussi', okEnvoi === true);
  check('un seul message envoyé, pas deux', envois.length === 1, envois.length);
  const msg = envois[0] || {};
  const controles = v2.controls(msg);
  const textes = v2.allText(msg);          // une seule chaîne, lignes jointes
  const etoiles = controles.filter((b) => String(b.custom_id || '').startsWith('bd-rate:'));
  check('cinq étoiles interactives présentes', etoiles.length === 5, controles.length);
  check('le bouton de transcription est toujours là',
    controles.some((b) => b.style === ButtonStyle.Link && b.url === ticketUrl));
  check('la question de la note est dans le même message',
    textes.includes(i18n.t('fr', 'ticket_rating_ask', { number: 42 })));
  check('la note ne redit pas que le ticket est clos une seconde fois',
    (textes.match(/est clôturé/g) || []).length === 1);
  check('la transcription .txt est toujours jointe',
    Array.isArray(msg.files) && msg.files.length === 1
      && /^transcription-ticket-alice\.txt$/.test(msg.files[0].name));
  check('le fichier est bien référencé par un composant File',
    /"type":\s*13/.test(JSON.stringify(msg.components)));

  // Un séparateur natif entre la transcription et la note : c'est ce qui fait
  // la différence visuelle entre « collé dessous » et « posé dessous ».
  const conteneur = JSON.parse(JSON.stringify(msg.components[0]));
  const types = (conteneur.components || []).map((c) => c.type);
  const posEtoiles = types.lastIndexOf(1);           // ActionRow des étoiles
  check('un séparateur (type 14) précède le bloc de note',
    types.indexOf(14) > -1 && types.indexOf(14) < posEtoiles, types.join(','));

  console.log('— 3. Le clic sur une étoile garde la transcription —');
  const cache = panels.mpFermeture.get('MSG1');
  check('le message est mémorisé pour la note', !!cache && cache.d.numero === 42);
  let majPay = null;
  const interaction = {
    customId: 'bd-rate:153999999999999370:42:4:fr',
    user: { id: '154000000000000001' },
    client,
    message: { id: 'MSG1' },
    update: async (p) => { majPay = p; },
    reply: async () => {},
  };
  await panels.__testHandleRating(1, interaction);
  check('la note est enregistrée', store.ticketRatings.has(1, guild.id, 42));
  check('la transcription est toujours dans le message réécrit',
    !!majPay && v2.allText(majPay).includes('est clôturé'));
  check('le fichier .txt est renvoyé avec le message', !!majPay && Array.isArray(majPay.files) && majPay.files.length === 1);
  check('les étoiles ont laissé place au remerciement',
    !!majPay && v2.allText(majPay).includes(i18n.t('fr', 'ticket_rating_done', { stars: 4 }))
      && v2.controls(majPay).every((b) => !String(b.custom_id || '').startsWith('bd-rate:')));
  check('le cache est vidé après la note', !panels.mpFermeture.has('MSG1'));

  console.log('— 4. Le code des deux chemins de suppression —');
  const appelsFusion = src.split('sendCloseDm(interaction, guild, channel.name, t, botId').length - 1;
  check('les deux chemins de suppression passent par le MP unique', appelsFusion === 2, appelsFusion);
  check('plus aucun second envoi de note juste après la transcription',
    !/sendRatingDm\(interaction\.client/.test(src));
  check('sendTranscriptDm et sendRatingDm restent disponibles (repli et autres usages)',
    /async function sendTranscriptDm\(/.test(src) && /async function sendRatingDm\(/.test(src));
  check('le repli en deux messages existe si Discord refuse la fusion',
    /DM fusionné impossible, retour aux deux messages[\s\S]{0,200}sendTranscriptDm\(/.test(src));

  console.log('— 5. Le texte de la note —');
  check('FR : question sans répéter la clôture',
    i18n.t('fr', 'ticket_rating_ask', { number: 7 }) === 'Comment évaluez-vous la prise en charge du ticket **#7** ?');
  check('EN : même chose', i18n.t('en', 'ticket_rating_ask', { number: 7 }).includes('#7'));
  check('aucun tiret cadratin dans les nouveaux textes',
    !i18n.t('fr', 'ticket_rating_ask', { number: 7 }).includes('—')
      && !i18n.t('en', 'ticket_rating_ask', { number: 7 }).includes('—'));

  console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌ sur ${ok + echecs.length} vérifications`);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
  console.log('🎉 v370 — une seule carte à la fermeture, la note posée dessous.');
}

main().catch((e) => { console.error('Erreur fatale du test :', e.message); process.exit(1); });
