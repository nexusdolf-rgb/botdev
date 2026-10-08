// v353 — MP d’ouverture, de clôture/transcription et de demande d’avis bilingues.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ButtonStyle } = require('discord.js');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v353-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const i18n = require('../server/i18n');
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

const guild = { id: '153999999999999353', name: 'Serveur exemple' };
const client = {
  user: { displayAvatarURL: () => 'https://cdn.example/bot.png' },
  users: { fetch: async () => user },
};
let sent = [];
const user = { send: async (payload) => { sent.push(payload); } };
const channel = { id: '154000000000000353' };
const ticketUrl = `https://discord.com/channels/${guild.id}/${channel.id}`;

function lastSent() { return sent[sent.length - 1] || null; }
function oneLink(payload) {
  const controls = v2.controls(payload);
  return controls.length === 1 ? controls[0] : null;
}

async function main() {
  console.log('— MP d’ouverture : texte localisé et bouton-lien direct —');
  const openFr = panels.__testBuildTicketOpenDmPayload(client, guild, channel, 123, 'fr');
  const frLink = oneLink(openFr);
  check('FR : titre exact avec numéro', v2.title(openFr) === '🎫 Ticket ouvert · #123');
  check('FR : description exacte', v2.allText(openFr).includes('Votre demande sur **Serveur exemple** a été transmise à l’équipe.'));
  check('FR : aucun champ Type ni ancienne consigne redondante',
    !v2.allText(openFr).includes('Type de ticket')
      && !v2.allText(openFr).includes('Prochaine étape')
      && !v2.allText(openFr).includes('Rejoignez-le ici'));
  check('FR : un seul bouton-lien Discord vers le salon du ticket',
    !!frLink && frLink.style === ButtonStyle.Link && frLink.url === ticketUrl
      && frLink.label === '🎫 Ouvrir mon ticket');
  check('FR : message d’ouverture en Components V2, avatar conservé',
    v2.isV2(openFr) && v2.thumbnailUrls(openFr).includes('https://cdn.example/bot.png'));

  const openEn = panels.__testBuildTicketOpenDmPayload(client, guild, channel, 123, 'en');
  const enLink = oneLink(openEn);
  check('EN : title and description are translated',
    v2.title(openEn) === '🎫 Ticket opened · #123'
      && v2.allText(openEn).includes('Your request on **Serveur exemple** has been sent to the team.'));
  check('EN : direct link button is localized and opens the same ticket',
    !!enLink && enLink.style === ButtonStyle.Link && enLink.url === ticketUrl
      && enLink.label === '🎫 Open my ticket');

  console.log('— MP de clôture : transcription jointe et lien localisé —');
  store.settings.set('public_url', 'https://hoxera.example');
  store.guildSettings.set(1, guild.id, { lang: 'fr', close_dm_message: '', close_dm_image: '' });
  sent = [];
  const sentFr = await panels.sendTranscriptDm(client, guild, 'ticket-123', {
    text: 'Membre : Bonjour\nStaff : Réponse',
    url: 'https://hoxera.example/transcript/abc123',
    openerId: '154000000000000123',
  }, 1);
  const transcriptFr = lastSent();
  const transcriptFrLink = oneLink(transcriptFr);
  check('FR : le MP de clôture part toujours avec la transcription jointe',
    sentFr && v2.isV2(transcriptFr) && Array.isArray(transcriptFr.files)
      && transcriptFr.files.length === 1
      && transcriptFr.files[0].attachment.toString('utf8').includes('Staff : Réponse'));
  check('FR : texte de clôture exact',
    v2.title(transcriptFr) === '🎫 Ticket clôturé'
      && v2.allText(transcriptFr).includes('Votre ticket sur **Serveur exemple** est clôturé. La transcription complète est jointe.'));
  check('FR : bouton-lien « Voir la transcription » garde l’URL',
    !!transcriptFrLink && transcriptFrLink.style === ButtonStyle.Link
      && transcriptFrLink.label === '📄 Voir la transcription'
      && transcriptFrLink.url === 'https://hoxera.example/transcript/abc123');

  store.guildSettings.set(1, guild.id, { lang: 'en', close_dm_message: '', close_dm_image: '' });
  sent = [];
  const sentEn = await panels.sendTranscriptDm(client, guild, 'ticket-123', {
    text: 'Member: Hello\nStaff: Reply',
    url: 'https://hoxera.example/transcript/def456',
    openerId: '154000000000000123',
  }, 1);
  const transcriptEn = lastSent();
  const transcriptEnLink = oneLink(transcriptEn);
  check('EN : titre et texte de clôture traduits',
    sentEn && v2.title(transcriptEn) === '🎫 Ticket closed'
      && v2.allText(transcriptEn).includes('Your ticket on **Serveur exemple** is closed. The full transcript is attached.'));
  check('EN : bouton-lien de transcription traduit et fonctionnel',
    !!transcriptEnLink && transcriptEnLink.style === ButtonStyle.Link
      && transcriptEnLink.label === '📄 View transcript'
      && transcriptEnLink.url === 'https://hoxera.example/transcript/def456');

  console.log('— Personnalisation de clôture par serveur conservée —');
  store.guildSettings.set(1, guild.id, {
    lang: 'fr',
    close_dm_message: 'Message personnalisé pour {server} · {url}',
    close_dm_image: 'https://cdn.example/custom-close.png',
  });
  sent = [];
  const sentCustom = await panels.sendTranscriptDm(client, guild, 'ticket-123', {
    text: 'Transcription personnalisée',
    url: 'https://hoxera.example/transcript/custom',
    openerId: '154000000000000123',
  }, 1);
  const custom = lastSent();
  check('le texte personnalisé continue de remplacer le texte par défaut',
    sentCustom && v2.allText(custom).includes('Message personnalisé pour Serveur exemple · https://hoxera.example/transcript/custom')
      && !v2.allText(custom).includes('La transcription complète est jointe'));
  check('l’image de clôture personnalisée reste appliquée',
    v2.mediaUrls(custom).includes('https://cdn.example/custom-close.png'));
  check('le bouton de transcription reste présent avec une personnalisation',
    !!oneLink(custom) && oneLink(custom).url === 'https://hoxera.example/transcript/custom');

  console.log('— Demande d’avis : texte simplifié, étoiles interactives conservées —');
  store.guildSettings.set(1, guild.id, { lang: 'fr', close_dm_message: '', close_dm_image: '' });
  sent = [];
  const ratingFrOk = await panels.sendRatingDm(client, guild, '154000000000000123', 123, 'fr');
  const ratingFr = lastSent();
  const ratingFrButtons = v2.controls(ratingFr);
  check('FR : titre et description de demande d’avis exacts',
    ratingFrOk && v2.title(ratingFr) === '⭐ Votre avis'
      && v2.allText(ratingFr).includes('Votre ticket **#123** sur **Serveur exemple** est clôturé. Comment évaluez-vous la prise en charge ?'));
  check('FR : les cinq boutons d’étoiles restent interactifs',
    ratingFrButtons.length === 5
      && ratingFrButtons.every((button, i) => button.custom_id.startsWith('bd-rate:') && button.label === '⭐'.repeat(i + 1)));
  check('FR : champ d’explication redondant retiré', !v2.allText(ratingFr).includes('Comment noter ?'));

  sent = [];
  const ratingEnOk = await panels.sendRatingDm(client, guild, '154000000000000123', 123, 'en');
  const ratingEn = lastSent();
  check('EN : titre et texte de demande d’avis traduits',
    ratingEnOk && v2.title(ratingEn) === '⭐ Your feedback'
      && v2.allText(ratingEn).includes('Your ticket **#123** on **Serveur exemple** is closed. How would you rate the support?'));
  check('EN : boutons étoiles et identifiants d’action restent présents',
    v2.controls(ratingEn).length === 5
      && v2.controls(ratingEn).every((button) => button.custom_id.endsWith(':en')));

  console.log('— Confirmations après notation et versions —');
  const panelsSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');
  const handleStart = panelsSrc.indexOf('async function handleRating(');
  const handleEnd = panelsSrc.indexOf('\n// v237', handleStart);
  const handleCode = panelsSrc.slice(handleStart, handleEnd > handleStart ? handleEnd : undefined);
  check('la confirmation après notation n’a pas été modifiée',
    handleCode.includes("ratingConfirmPanel(i18n.t(lang, 'ticket_rating_done', { stars }))"));
  check('les nouvelles clés FR et EN sont bien définies',
    i18n.t('fr', 'ticket_dm_open_button') === '🎫 Ouvrir mon ticket'
      && i18n.t('en', 'ticket_dm_open_button') === '🎫 Open my ticket'
      && i18n.t('fr', 'transcript_button') === '📄 Voir la transcription'
      && i18n.t('en', 'transcript_button') === '📄 View transcript');
  check('le journal conserve v353 et démarre désormais en v356',
    changelog.VERSION === 356 && changelog.VERSIONS[0].v === 356
      && changelog.VERSIONS[1].v === 355 && changelog.VERSIONS.some((entry) => entry.v === 353)
      && changelog.NOTES.v === 356);
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('cache web actualisé : ?v=356 7 fois et botdev-v356',
    (index.match(/\?v=356/g) || []).length === 7 && sw.includes("const CACHE = 'botdev-v356';"));

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ v353-test.js : ${ok} vérifications OK`);
  }
}

main().catch((error) => {
  console.error('💥 Erreur fatale du test v353 :', error);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exitCode = 1;
});
