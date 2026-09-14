// ============================================================================
// Test v237 — 3 corrections demandées par l'utilisateur sur les tickets :
//
//  1. Le RÉCAPITULATIF du journal des tickets n'avait aucun séparateur : c'était
//     un EmbedBuilder construit à la main dans sendTicketRecap, jamais passé par
//     le système de panneaux. → Components V2, séparateurs natifs pleine largeur.
//     Sa note ⭐ s'éditait en relisant `msg.embeds[0].fields` → elle patche
//     désormais le TextDisplay du conteneur.
//  2. 🐛 Le MP d'évaluation RESTAIT AFFICHÉ après le clic sur les étoiles :
//     `interaction.update({ content, embeds: [], components: [] })` est REJETÉ
//     sur un message Components V2 (on ne peut pas retirer le flag, et un
//     message V2 ne porte ni content ni embeds) → le bot basculait sur la
//     réponse éphémère de secours et le panneau ne bougeait pas.
//  3. Dans le SALON PRIVÉ du ticket, le menu « ⚙️ Actions du staff » traînait
//     EN DESSOUS du panneau (message en 3 morceaux : content + embed + row).
//     → un seul payload V2, première ligne en tête de conteneur, menu DEDANS,
//     et séparateurs natifs entre les blocs (demande explicite).
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v237-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const i18n = require('../server/i18n');

const IS_V2 = MessageFlags.IsComponentsV2;
let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', f), 'utf8');
// Les commentaires explicatifs v237 citent volontairement l'ancien code fautif
// (`interaction.update({ content: … })`, `msg.embeds[0].fields`) : les garde-fous
// source doivent les ignorer et ne juger que le code réellement exécuté.
const codeOnly = (f) => src(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const noTextSep = (payload, label) => check(label, !v2.json(payload).includes(ui.SEPARATOR));

const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
const GUILD = 'G237';

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n1) Récapitulatif du journal des tickets — séparateurs natifs');
  // ═══════════════════════════════════════════════════════════════════════
  store.guildSettings.set(BOT, GUILD, { ticket_log_channel: 'journal' });
  let recap = null;
  const board = {
    id: 'CBOARD', name: 'journal', isTextBased: () => true,
    send: async (p) => { recap = p; return { id: 'MSG-RECAP' }; },
  };
  const guild = {
    id: GUILD, name: 'Serveur test', iconURL: () => null,
    channels: {
      cache: {
        find: (fn) => (fn(board) ? board : undefined),
        get: (id) => (id === 'CBOARD' ? board : undefined),
      },
    },
  };
  const interaction = {
    guild,
    user: { id: 'STAFF1', tag: 'Moderateur#0001' },
    client: { users: { fetch: async () => ({ displayAvatarURL: () => 'https://cdn.discordapp.com/opener.png' }) } },
  };
  await panels.__testSendTicketRecap(BOT, interaction, {
    row: {
      number: 7, opener_id: 'U1', opener_tag: 'Alice#0001',
      claimed_by: 'STAFF2', claimed_tag: 'Bob#0002', type_label: 'Support',
      opened_at: new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' '),
    },
    meta: { openerId: 'U1', reason: 'Bug sur le dashboard' },
    closeReason: 'Problème résolu par le staff',
    transcript: { msgCount: 24, url: 'https://hoxera.is-a.dev/t/abc' },
  });

  check('récap : un payload envoyé', !!recap);
  check('récap : Components V2 (plus aucun embed)', v2.isV2(recap) && recap.embeds === undefined);
  check('récap : titre avec le numéro et le type',
    (v2.title(recap) || '').includes('📔 Récapitulatif — Ticket #7') && (v2.title(recap) || '').includes('Support'),
    JSON.stringify(v2.title(recap)));
  check('récap : séparateurs NATIFS pleine largeur entre les blocs', v2.dividers(recap) >= 4,
    `${v2.dividers(recap)} séparateur(s)`);
  noTextSep(recap, 'récap : aucun trait texte ━');
  check('récap : les 8 informations sont toujours rendues',
    ['👤 Ouvert par', '🖐️ Pris en charge par', '🔒 Fermé par', "📝 Raison d'ouverture",
      '🔐 Raison de fermeture', '⏱️ Durée', '💬 Messages', '⭐ Évaluation']
      .every((k) => v2.json(recap).includes(k)));
  check('récap : les valeurs sont conservées (créateur, staff, raisons, durée, messages)',
    v2.json(recap).includes('Alice#0001') && v2.json(recap).includes('Bob#0002')
    && v2.json(recap).includes('Bug sur le dashboard') && v2.json(recap).includes('Problème résolu par le staff')
    && v2.json(recap).includes('24') && /\d+ min|\d+ h/.test(v2.json(recap)));
  // ⚙️ Condition sine qua non de l'édition de la note : le bloc ⭐ doit être
  // SEUL dans son TextDisplay, sinon le patch ne peut pas le cibler.
  const starBlock = v2.texts(recap).find((t) => t.startsWith('**⭐ Évaluation**'));
  check('récap : « ⭐ Évaluation » est un bloc isolé (éditable sans tout reconstruire)',
    starBlock === '**⭐ Évaluation**\nEn attente de la note du membre…', JSON.stringify(starBlock));
  check('récap : l\'avatar du créateur est en vignette',
    v2.thumbnailUrls(recap).includes('https://cdn.discordapp.com/opener.png'));
  check('récap : le bouton « transcription » est DANS le conteneur',
    v2.rows(recap).length === 1 && v2.json(recap).includes('Voir la transcription complète'));
  check('récap : plafond de 40 composants respecté', v2.componentCount(recap) <= 40,
    `${v2.componentCount(recap)} composants`);
  const ref = store.ticketLogMsgs.get(BOT, GUILD, 7);
  check('récap : référence du message enregistrée pour l\'édition ultérieure',
    !!ref && ref.channel_id === 'CBOARD' && ref.message_id === 'MSG-RECAP');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n2) La note ⭐ s\'écrit dans le conteneur V2 (plus de msg.embeds[0])');
  // ═══════════════════════════════════════════════════════════════════════
  // On simule ce que renvoie l'API au fetch : des composants déjà sérialisés.
  let editPayload = null;
  board.messages = {
    fetch: async () => ({
      components: JSON.parse(JSON.stringify(recap.components.map((c) => (c.toJSON ? c.toJSON() : c)))),
      edit: async (p) => { editPayload = p; return {}; },
    }),
  };
  const client = { guilds: { cache: { get: (id) => (String(id) === GUILD ? guild : undefined) } } };
  await panels.__testUpdateRecapRating(BOT, client, GUILD, 7, 4);

  check('note : le message est bien édité', !!editPayload);
  check('note : l\'édition RESTE en Components V2 (flag re-posé)',
    editPayload && (editPayload.flags & IS_V2) !== 0);
  check('note : content/embeds/attachments vidés explicitement',
    editPayload && editPayload.content === null && editPayload.embeds.length === 0
    && editPayload.attachments.length === 0);
  const editedTexts = v2.texts(editPayload);
  check('note : « ⭐ Évaluation » remplacé par les 4 étoiles',
    editedTexts.includes('**⭐ Évaluation**\n⭐⭐⭐⭐ (4/5)'), JSON.stringify(editedTexts.find((t) => t.includes('Évaluation'))));
  check('note : la mention « En attente de la note » a disparu',
    !editedTexts.some((t) => t.includes('En attente de la note')));
  check('note : TOUT le reste du panneau est préservé à l\'identique',
    v2.title(editPayload) === v2.title(recap)
    && editedTexts.filter((t) => !t.includes('Évaluation')).length === v2.texts(recap).filter((t) => !t.includes('Évaluation')).length
    && v2.dividers(editPayload) === v2.dividers(recap)
    && v2.rows(editPayload).length === 1
    && v2.json(editPayload).includes('Voir la transcription complète'));
  noTextSep(editPayload, 'note : aucun trait texte ━ après édition');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n3) 🐛 Le MP d\'évaluation est REMPLACÉ après le clic (il ne reste plus)');
  // ═══════════════════════════════════════════════════════════════════════
  const rating = (number, stars, lang = 'fr') => {
    let updated = null;
    let fallback = null;
    return {
      payload: () => updated,
      fallback: () => fallback,
      interaction: {
        customId: `bd-rate:${GUILD}:${number}:${stars}:${lang}`,
        user: { id: 'U1' },
        client,
        update: async (p) => { updated = p; return {}; },
        // Le repli éphémère ne doit plus servir : s'il est atteint, c'est que
        // l'update a été rejeté — donc que le panneau resterait affiché.
        reply: async (p) => { fallback = p; return {}; },
      },
    };
  };

  const r1 = rating(8, 5);
  await panels.__testHandleRating(BOT, r1.interaction);
  check('clic sur ⭐⭐⭐⭐⭐ : le message est mis à jour (pas de repli éphémère)',
    !!r1.payload() && !r1.fallback(), r1.fallback() ? 'repli éphémère atteint = update rejeté' : '');
  check('clic : la mise à jour RESTE en Components V2', r1.payload() && (r1.payload().flags & IS_V2) !== 0);
  check('clic : aucun `content` ni `embeds` (interdits sur un message V2)',
    r1.payload() && r1.payload().content === undefined && r1.payload().embeds === undefined);
  check('clic : le message de confirmation est DANS le conteneur',
    r1.payload() && v2.texts(r1.payload()).some((t) => t.includes('Note enregistrée') && t.includes('5/5')),
    JSON.stringify(r1.payload() && v2.texts(r1.payload())));
  check('clic : les 5 boutons étoiles ont disparu (plus de rangée)',
    r1.payload() && v2.rows(r1.payload()).length === 0 && !v2.json(r1.payload()).includes('bd-rate:'));
  check('clic : un seul conteneur, aucun séparateur inutile (message d\'une phrase)',
    r1.payload() && r1.payload().components.length === 1 && v2.dividers(r1.payload()) === 0);
  noTextSep(r1.payload(), 'clic : aucun trait texte ━');
  check('clic : la note est enregistrée en base',
    store.ticketRatings.has(BOT, GUILD, 8) === true);

  // Second clic sur le même ticket → « déjà noté », même exigence de format.
  const r2 = rating(8, 1);
  await panels.__testHandleRating(BOT, r2.interaction);
  check('déjà noté : le message est mis à jour (pas de repli éphémère)',
    !!r2.payload() && !r2.fallback());
  check('déjà noté : reste en V2 + texte attendu',
    r2.payload() && (r2.payload().flags & IS_V2) !== 0
    && v2.texts(r2.payload()).some((t) => t.includes(i18n.t('fr', 'ticket_rating_already'))));
  check('déjà noté : la note en base n\'est PAS écrasée',
    store.ticketRatings.has(BOT, GUILD, 8) === true && !v2.json(r2.payload()).includes('1/5'));

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n4) Salon privé : le menu staff entre DANS le panneau');
  // ═══════════════════════════════════════════════════════════════════════
  const member = {
    id: 'u1',
    user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn.discordapp.com/alice.png' },
    toString: () => '<@u1>', guild: { name: 'Serveur test' },
  };
  const chosen = { label: 'Support', emoji: '🎫', description: 'Pour toute demande générale.', staff_roles: [], color: '#5865F2' };
  const staffRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bd-troom:${BOT}`)
      .setPlaceholder('⚙️ Actions du staff — gérer ce ticket…')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('🖐️ Prendre en charge').setValue('claim'),
        new StringSelectMenuOptionBuilder().setLabel('🗑 Supprimer définitivement').setValue('delete'),
      )
  );
  const firstLine = '🎫 **Support** · <@u1> · <@&R1>';
  const welcome = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'Je n\'arrive pas à me connecter', '',
    [{ q: 'Urgence ?', a: 'Haute' }], 'fr', { number: 12 }, {},
    { content: firstLine, rows: [staffRow] });

  check('salon privé : un SEUL payload Components V2', v2.isV2(welcome) && welcome.embeds === undefined);
  check('salon privé : aucun `content`/`components` au niveau message',
    welcome.content === undefined && welcome.components.length === 1);
  check('salon privé : la première ligne (type + créateur + ping staff) est en tête de conteneur',
    v2.texts(welcome)[0] === firstLine, JSON.stringify(v2.texts(welcome)[0]));
  check('salon privé : le menu « ⚙️ Actions du staff » est DANS le conteneur',
    v2.rows(welcome).length === 1 && v2.json(welcome).includes(`bd-troom:${BOT}`)
    && v2.json(welcome).includes('Actions du staff'));
  check('salon privé : séparateurs NATIFS entre les blocs (demande utilisateur)',
    v2.dividers(welcome) >= 3, `${v2.dividers(welcome)} séparateur(s)`);
  noTextSep(welcome, 'salon privé : aucun trait texte ━');
  check('salon privé : message d\'accueil découpé en paragraphes (plus de \\n\\n brut)',
    !v2.texts(welcome).some((t) => t.includes('\n\n')));
  check('salon privé : tous les blocs sont rendus (type, équipe, à propos, réponses, raison)',
    ['Type de ticket', 'Équipe en charge', 'À propos de ce type', 'Urgence ?', 'Haute', 'Je n\'arrive pas à me connecter']
      .every((k) => v2.json(welcome).includes(k)));
  check('salon privé : l\'espaceur invisible \\u200b ne réapparaît pas comme intitulé',
    !v2.texts(welcome).some((t) => t.includes('\u200b')));
  check('salon privé : l\'avatar n\'est PAS répété (vignette seule)',
    v2.thumbnailUrls(welcome).includes('https://cdn.discordapp.com/alice.png')
    && (v2.json(welcome).match(/alice\.png/g) || []).length === 1);
  check('salon privé : titre + pied + couleur conservés',
    (v2.title(welcome) || '').includes('🎫') && v2.json(welcome).includes('Journal') === false
    && v2.accentColor(welcome) === 0x5865F2 && v2.footer(welcome).includes('Ticket #12'));
  check('salon privé : plafond de 40 composants respecté', v2.componentCount(welcome) <= 40,
    `${v2.componentCount(welcome)} composants`);

  // Sans `extra` (appel des tests historiques) : rien ne casse.
  const bare = panels.ticketWelcomePanel(member, chosen, '', 'raison', '', [], 'fr', { number: 3 }, {});
  check('salon privé : appel sans content ni menu → payload V2 valide',
    v2.isV2(bare) && v2.rows(bare).length === 0 && v2.texts(bare).length >= 2);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n5) Garde-fous source (les pièges ne peuvent pas revenir)');
  // ═══════════════════════════════════════════════════════════════════════
  const pSrc = src('panels.js');
  check('panels.js : plus de ticketWelcomeEmbed (renommé ticketWelcomePanel)',
    !pSrc.includes('ticketWelcomeEmbed') && pSrc.includes('function ticketWelcomePanel('));
  check('panels.js : le salon privé n\'est plus envoyé en 3 morceaux',
    !pSrc.includes('embeds: [welcome]') && !pSrc.includes('components: [row1]'));
  // Portée limitée à handleRating : `handleTicketDeleteCancel` fait encore un
  // `update({ content: … })`, mais c'est une ROUTE MORTE — son customId
  // `bd-tmenu:{botId}:delcancel` n'est envoyé nulle part (l'ancien bouton de
  // confirmation a été remplacé par une modale). Aucun message V2 ne l'atteint.
  const ratingFn = (pSrc.match(/async function handleRating\([\s\S]*?\n\}/) || [''])[0];
  check('handleRating : plus aucun `update({ content: … })` (rejeté sur un message V2)',
    ratingFn.length > 0 && !ratingFn.includes('interaction.update({ content:'));
  check('handleRating : les 2 branches passent par ratingConfirmPanel',
    (ratingFn.match(/ratingConfirmPanel\(/g) || []).length === 2);
  const pCode = codeOnly('panels.js');
  check('panels.js : le récapitulatif ne relit plus msg.embeds[0]',
    !pCode.includes('EmbedBuilder.from(msg.embeds[0])') && !pCode.includes('msg.embeds[0].fields'));
  check('panels.js : `delcancel` reste une route morte documentée (aucun envoi)',
    (pSrc.match(/delcancel/g) || []).length === 1);
  check('panels.js : le récapitulatif ne construit plus d\'EmbedBuilder',
    !/sendTicketRecap[\s\S]{0,2600}new EmbedBuilder\(\)/.test(pSrc));
  check('panels.js : libellé de la note centralisé (RECAP_RATING_LABEL)',
    pSrc.includes("const RECAP_RATING_LABEL = '⭐ Évaluation';")
    && (pSrc.match(/RECAP_RATING_LABEL/g) || []).length >= 3);
  check('panels.js : le flag IsComponentsV2 est re-posé à l\'édition du récap',
    pSrc.includes('flags: MessageFlags.IsComponentsV2'));

  console.log('\n6) Aucun secret ajouté');
  const fuites = ['server/discord/panels.js', 'test/v237-test.js', 'test/v36-test.js', 'test/v79-test.js', 'test/v220-test.js']
    .filter((f) => /(ghp_|github_pat_|rnd_|xox[baprs]-)[A-Za-z0-9_-]{15,}/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
  check('aucun token en dur dans les fichiers modifiés', fuites.length === 0, fuites.join(', '));
}

main().then(() => {
  try { store.db.close(); } catch {}
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n${echecs === 0 ? '🎉' : '❌'} V237 — ${echecs} échec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
}).catch((e) => { console.error('💥 Erreur fatale du test :', e); process.exit(1); });
