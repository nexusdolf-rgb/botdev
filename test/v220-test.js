// Test v220 — Traits de séparation « pro » entre les grandes sections des panneaux.
//  1. Design system : SEPARATOR = 20 × ━ ; sectionize() mono = inchangé, multi =
//     traits entre sections, blocs de code jamais coupés, pas de demi-trait en fin.
//  2. ui.embed/ui.panel : transformation active par défaut, désactivable (sections:false).
//  3. Runtime : giveaways, suggestions, menu de rôles et panneau tickets reçoivent
//     le trait ; le contenu utilisateur multi-paragraphes est structuré.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v220-'));
const store = require('../server/db');
const ui = require('../server/discord/ui');

let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

console.log('\n1️⃣  SEPARATOR + sectionize()');
check('SEPARATOR = 20 × ━', ui.SEPARATOR === '━'.repeat(20));
check('SEPARATOR rendu texte sans couleur', /^[━]+$/.test(ui.SEPARATOR) && !ui.SEPARATOR.includes('\u001b'));

const mono = '**Bienvenue**\nVoici le règlement :\n- Règle 1\n- Règle 2';
check('texte à section unique : STRICTEMENT inchangé', ui.sectionize(mono) === mono);
check('texte vide → vide', ui.sectionize('') === '' && ui.sectionize(null) === '');

const multi = 'Section un\n\nSection deux\n\nSection trois';
const sMulti = ui.sectionize(multi);
check('multi : 2 traits insérés', (sMulti.match(new RegExp(ui.SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 2);
check('multi : contenu préservé', sMulti.includes('Section un') && sMulti.includes('Section deux') && sMulti.includes('Section trois'));
check('multi : plus aucune ligne vide nue', !sMulti.split('\n').some((l) => l.trim() === ''));

// Bloc de code : les lignes vides DANS la clôture appartiennent au bloc.
const withCode = 'Explication :\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nÀ retenir.';
const sCode = ui.sectionize(withCode);
check('code : clôture intacte', sCode.includes('```js\nconst a = 1;\n\nconst b = 2;\n```'));
check('code : trait AVANT et APRÈS le bloc seulement',
  (sCode.match(new RegExp(ui.SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 2);

// Troncature : jamais de demi-trait visible.
const big = Array.from({ length: 40 }, (_, i) => `Paragraphe ${i} — du contenu pour allonger la description.`).join('\n\n');
const cut = ui.sectionize(big, 200);
check('troncature : longueur <= max', cut.length <= 200);
check('troncature : pas de demi-trait final', !/━{1,19}$/.test(cut));

console.log('\n2️⃣  ui.embed / ui.panel');
const eAuto = ui.panel({ title: 'T', description: 'Partie A\n\nPartie B' }).embeds[0].data.description;
check('ui.panel : trait inséré par défaut', eAuto.includes(ui.SEPARATOR));
const eRaw = ui.panel({ title: 'T', description: 'Partie A\n\nPartie B', sections: false }).embeds[0].data.description;
check('sections:false : texte brut conservé', eRaw.includes('\n\n') && !eRaw.includes(ui.SEPARATOR));
const eOne = ui.panel({ title: 'T', description: 'Message court.' }).embeds[0].data.description;
check('message court : inchangé', eOne === 'Message court.');
check('mono-section 4096 max non touchée', ui.embed({ description: 'x'.repeat(4096) }).data.description.length === 4096);

(async () => {
  console.log('\n3️⃣  Runtime — panneaux réels');
  const uid = store.users.create('discord:220@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Test220', token: 'T', client_id: '1', prefix: '!' });

  // Giveaway : prix | message, et contenu utilisateur multi-paragraphes structuré.
  const giveaway = require('../server/discord/giveaway');
  const embG = giveaway.buildEmbed({ prize: 'Nitro Boost', winners: 1, ends_at: Date.now() + 60000 },
    { message: 'Réagis avec 🎉 pour participer !\n\nSeuls les membres du serveur sont éligibles.' });
  const gDesc = embG.data.description;
  check('giveaway : trait entre prix et message', gDesc.includes('**Nitro Boost**') && gDesc.includes(ui.SEPARATOR) && gDesc.includes('Réagis avec 🎉'));
  check('giveaway : paragraphes du message structurés', (gDesc.match(new RegExp(ui.SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 2);
  // Giveaway TERMINÉ : message permanent édité dans le salon — le prix, le
  // résultat et le remerciement forment des sections reliées par le trait.
  const embEnd = giveaway.buildEndedEmbed({ prize: 'Nitro Boost' }, [{ toString: () => '<@u1>' }, { toString: () => '<@u2>' }], false);
  const endDesc = embEnd.data.description;
  const sepRe = new RegExp(ui.SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  check('giveaway terminé : 3 sections (prix / gagnants / merci)', endDesc.includes('**Nitro Boost**') && endDesc.includes('🏆 Gagnant(s)') && endDesc.includes('Merci à tous'));
  check('giveaway terminé : 2 traits entre les 3 sections', (endDesc.match(sepRe) || []).length === 2);
  const embNoWin = giveaway.buildEndedEmbed({ prize: 'Nitro Boost' }, [], false);
  check('giveaway terminé sans gagnant : mention « aucun participant »', embNoWin.data.description.includes('Aucun participant'));

  // Suggestions : texte libre multi-paragraphes dans l'embed publié.
  const suggest = require('../server/discord/suggest');
  const embS = suggest.buildEmbed({ id: 1, status: 'pending', upvotes: 0, downvotes: 0, bot_id: BOT, text: 'Ajouter un salon musique.\n\nEt un salon cinéma.' }, 'Toto', {});
  check('suggest : contenu multi-paragraphes structuré', embS.data.description.includes(ui.SEPARATOR));
  const embS1 = suggest.buildEmbed({ id: 2, status: 'pending', upvotes: 0, downvotes: 0, bot_id: BOT, text: 'Suggestion en une seule partie.' }, 'Toto', {});
  check('suggest : mono-paragraphe sans trait', !embS1.data.description.includes(ui.SEPARATOR));

  // Menu de rôles (ui.panel, v219) : contenu personnalisé structuré.
  const panels = require('../server/discord/panels');
  const payload = panels.roleMenuPayload(BOT, {
    id: 'M1', name: 'Rôles & notifications', mode: 'select', guild_id: 'G220',
    content: 'Choisis tes rôles ci-dessous.\n\nTu peux les activer ou les retirer à tout moment.',
    options: [{ label: '🎮 Gamer', role: 'R1' }, { label: '🎨 Créatif', role: 'R2' }, { label: '🎧 Music', role: 'R3' }],
  });
  const rmDesc = payload.embeds[0].data.description;
  check('menu de rôles : contenu structuré', rmDesc.includes(ui.SEPARATOR) && rmDesc.includes('Choisis tes rôles ci-dessous.'));
  check('menu de rôles : option « Comment ça marche » intacte',
    payload.embeds[0].data.fields.some((f) => f.name === '🧭 Comment ça marche ?'));

  // Panneau tickets (i18n) : bienvenue | explication, règles en champ intact.
  const embT = panels.buildTicketPanelEmbed({}, {}, [], 'Serveur de Hoxera', 'G220');
  const tDesc = embT.data.description;
  check('tickets : trait entre bienvenue et explication', tDesc.includes(ui.SEPARATOR));
  check('tickets : texte i18n conservé', tDesc.includes('Bienvenue sur le support officiel de Serveur de Hoxera'));
  check('tickets : règles toujours en champ (pas de trait dans le champ)',
    embT.data.fields.some((f) => f.value.includes('🔴➡️')) && !embT.data.fields.some((f) => f.value.includes(ui.SEPARATOR)));

  console.log('\n4️⃣  Couverture des autres panneaux');
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', f), 'utf8');
  const countOf = (f, needle) => src(f).split(needle).length - 1;
  // Bienvenue premium ET départ assorti (events.js) : 2 × sectionize(text, 4096).
  check('bienvenue + départ premium : sectionize sur les deux', countOf('events.js', 'ui.sectionize(text, 4096)') === 2);
  check('logs (logging.js) : description passée par sectionize', src('logging.js').includes('ui.sectionize(String(description), 1024)'));
  check('embed builder (engine.js send_embed) : description structurée', src('engine.js').includes('const embedBody = ui.sectionize('));
  check('annonce de live (liveWatch.js) : description structurée', src('liveWatch.js').includes('ui.sectionize(`**${result.name}**'));
  const evSrc = src('events.js');
  check('départ : panneau premium = message utilisateur structuré', evSrc.includes("s'en va…") && evSrc.includes('ui.sectionize(text, 4096)'));
  check('automod : avertissements via ui.embed (couverture auto)',
    src('automod.js').includes("const ui = require('./ui')") && src('automod.js').includes('ui.embed({'));
  // Système de tickets personnalisés (advancedTickets, panneau Container V2) :
  // les séparations passent par des SÉPARATEURS NATIFS pleine largeur (type 14),
  // jamais par un trait-texte court qui ne va pas jusqu'au fond du panneau.
  const advSrc = src('advancedTickets.js');
  check('tickets personnalisés : intro découpée en paragraphes', advSrc.includes('ui.paragraphs(cfg.message'));
  check('tickets personnalisés : séparateurs natifs entre paragraphes/blocs',
    countOf('advancedTickets.js', 'addSeparatorComponents(new SeparatorBuilder().setDivider(true))') >= 3);
  check('tickets personnalisés : aucun trait-texte court (━) dans le panneau',
    !advSrc.includes('.setContent(ui.SEPARATOR)'));
  const adv = require('../server/discord/advancedTickets');
  const advCfg = {
    id: 'P', bot_id: BOT, guild_id: 'G220', mode: 'buttons', name: 'Centre d’aide', channel: 'C',
    message: 'Premier paragraphe.\n\nSecond paragraphe.', color: '#e07a5f',
    types: [
      { id: 't1', label: 'Support', emoji: '🎫', description: 'Question ?', button_style: '1', questions: [] },
      { id: 't2', label: 'Plainte', emoji: '⚖️', description: 'Abus ?', button_style: '4', questions: [] },
      { id: 't3', label: 'Recrutement', emoji: '📝', description: 'Postuler', button_style: '3', questions: [] },
    ],
  };
  const advComps = JSON.parse(JSON.stringify(adv.buildPanelPayload(advCfg))).components[0].components || [];
  const nativeSeps = advComps.filter((x) => x && x.type === 14).length;
  check('tickets personnalisés (runtime) : séparateurs natifs présents', nativeSeps >= 3);
  check('tickets personnalisés (runtime) : aucun texte ne contient de ━',
    !advComps.some((x) => x && typeof x.content === 'string' && x.content.includes('━')));
  // Garde-fou global : AUCUN panneau natif V2 (Container/TextDisplay) du bot
  // ne doit insérer le trait texte ━ (qui ne va pas jusqu'au fond) — les
  // séparations y sont toujours des séparateurs NATIFS pleine largeur.
  const v2Files = fs.readdirSync(path.join(__dirname, '..', 'server', 'discord'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /TextDisplayBuilder|ContainerBuilder/.test(src(f)));
  check('garde-fou V2 : aucun ━ texte dans les panneaux natifs',
    v2Files.every((f) => !/━{2,}/.test(src(f).replace(/^\/\/.*$/gm, ''))));
  // Messages d'accueil/confirmation COURTS (salon privé du ticket + DMs) :
  // ils gardent leurs sauts de paragraphe naturels, SANS trait plaqué entre
  // deux petites phrases — le trait est réservé aux grands panneaux à sections.
  const pSrc = src('panels.js');
  check('salon privé : accueil = texte naturel (ui.text, pas de trait)',
    pSrc.includes('.setDescription(ui.text(desc, 4096))'));
  check('DM « ton ticket est ouvert » : sections désactivées',
    pSrc.includes('sections: false,') && pSrc.includes("title: '🎫 Ton ticket est ouvert'"));
  check('DM de transcription : texte naturel (ui.text, pas de trait)',
    pSrc.includes('.setDescription(ui.text(desc, 4096))'));
  const memberW = { id: 'u1', user: { username: 'Alice', displayAvatarURL: () => '' }, toString: () => '@Alice', guild: { name: 'S' } };
  const wDesc = panels.ticketWelcomeEmbed(memberW, { label: 'Support', emoji: '🎫', staff_roles: [] }, '', '', '', [], 'fr', { number: 1 }, {}).data.description;
  check('salon privé (runtime) : description d accueil sans ━, sauts conservés',
    !wDesc.includes('━') && wDesc.includes('\n\n'));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v220 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('❌ Erreur :', e); process.exit(1); });
