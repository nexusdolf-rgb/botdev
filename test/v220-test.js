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
  // v233 — les giveaways sont en Components V2 : la séparation n'est plus un
  // trait TEXTE (qui s'arrêtait avant le bord arrondi de l'embed) mais un
  // Separator NATIF pleine largeur, comme dans le panneau de tickets
  // personnalisés. L'INTENTION v220 est conservée : chaque paragraphe du
  // contenu utilisateur forme bien une section visuellement distincte.
  const gwCont = (p) => p.components[0].toJSON();
  const gwTexts = (p) => gwCont(p).components.filter((k) => k.type === 10).map((k) => k.content).join('\n');
  const gwDiv = (p) => gwCont(p).components.filter((k) => k.type === 14 && k.divider === true).length;
  const embG = giveaway.buildPanel({ prize: 'Nitro Boost', winners: 1, ends_at: Date.now() + 60000 },
    { message: 'Réagis avec 🎉 pour participer !\n\nSeuls les membres du serveur sont éligibles.' });
  check('giveaway : séparation entre prix et message', gwTexts(embG).includes('**Nitro Boost**') && gwTexts(embG).includes('Réagis avec 🎉'));
  check('giveaway : AUCUN trait texte ━ (séparateurs natifs)', !JSON.stringify(embG).includes(ui.SEPARATOR));
  // 3 paragraphes + 1 bloc de compteurs = 4 blocs → 3 séparateurs, + 1 pied = 4.
  check('giveaway : paragraphes du message structurés (4 séparateurs natifs)', gwDiv(embG) === 4);
  // Giveaway TERMINÉ : message permanent édité dans le salon — le prix, le
  // résultat et le remerciement forment des sections séparées en natif.
  const embEnd = giveaway.buildEndedPanel({ prize: 'Nitro Boost' }, [{ toString: () => '<@u1>' }, { toString: () => '<@u2>' }], false);
  check('giveaway terminé : 3 sections (prix / gagnants / merci)',
    gwTexts(embEnd).includes('**Nitro Boost**') && gwTexts(embEnd).includes('🏆 Gagnant(s)') && gwTexts(embEnd).includes('Merci à tous'));
  check('giveaway terminé : 4 séparateurs natifs (3 entre sections + 1 pied)', gwDiv(embEnd) === 4);
  check('giveaway terminé : aucun trait texte ━', !JSON.stringify(embEnd).includes(ui.SEPARATOR));
  const embNoWin = giveaway.buildEndedPanel({ prize: 'Nitro Boost' }, [], false);
  check('giveaway terminé sans gagnant : mention « aucun participant »', gwTexts(embNoWin).includes('Aucun participant'));

  // Suggestions : texte libre multi-paragraphes dans le message publié.
  // v232 — les suggestions sont en Components V2 : la séparation n'est plus un
  // trait TEXTE (qui s'arrêtait avant le bord arrondi) mais un Separator NATIF
  // pleine largeur, comme dans le panneau de tickets personnalisés.
  const suggest = require('../server/discord/suggest');
  const sugCont = (o) => suggest.buildPanel(o, 'Toto', {}).components[0].toJSON();
  const nDiv = (c) => c.components.filter((k) => k.type === 14 && k.divider === true).length;
  const embS = sugCont({ id: 1, status: 'pending', upvotes: 0, downvotes: 0, bot_id: BOT, text: 'Ajouter un salon musique.\n\nEt un salon cinéma.' });
  // 2 paragraphes + 1 bloc de compteurs = 3 blocs → 2 séparateurs, + 1 avant
  // le pied = 3.
  check('suggest : contenu multi-paragraphes → 3 séparateurs natifs', nDiv(embS) === 3);
  check('suggest : aucun trait texte ━ (v232)',
    !JSON.stringify(embS.components).includes(ui.SEPARATOR));
  const embS1 = sugCont({ id: 2, status: 'pending', upvotes: 0, downvotes: 0, bot_id: BOT, text: 'Suggestion en une seule partie.' });
  // 1 paragraphe + 1 bloc de compteurs = 2 blocs → 1 séparateur, + 1 pied = 2.
  check('suggest : mono-paragraphe → 2 séparateurs (pas de découpe inutile)', nDiv(embS1) === 2);
  check('suggest : les 3 compteurs inline restent groupés sur une ligne',
    embS.components.filter((k) => k.type === 10).some((k) => /\*\*📊 Statut\*\* .* · \*\*👍 Votes\*\* /.test(k.content)));

  // v234 — le menu de rôles et le panneau tickets sont passés en Components V2 :
  // un payload V2 n'a plus de champ `embeds`, on lit les TextDisplay du
  // conteneur. Helpers de lecture (récursifs : Section > TextDisplay).
  const { MessageFlags } = require('discord.js');
  const IS_V2 = MessageFlags.IsComponentsV2;
  const v2texts = (p) => {
    const out = [];
    const walk = (c) => { for (const k of (c && c.components) || []) { if (Number(k.type) === 10) out.push(String(k.content || '')); else walk(k); } };
    walk(p.components[0].toJSON());
    return out;
  };
  const v2div = (p) => p.components[0].toJSON().components.filter((k) => Number(k.type) === 14 && k.divider === true).length;
  const v2json = (p) => JSON.stringify(p.components[0].toJSON());
  const p2types = (p) => p.components[0].toJSON().components.map((k) => Number(k.type));

  // Menu de rôles (v219 → v234 V2) : contenu personnalisé structuré.
  const panels = require('../server/discord/panels');
  const payload = panels.roleMenuPayload(BOT, {
    id: 'M1', name: 'Rôles & notifications', mode: 'select', guild_id: 'G220',
    content: 'Choisis tes rôles ci-dessous.\n\nTu peux les activer ou les retirer à tout moment.',
    options: [{ label: '🎮 Gamer', role: 'R1' }, { label: '🎨 Créatif', role: 'R2' }, { label: '🎧 Music', role: 'R3' }],
  });
  const rmT = v2texts(payload);
  check('menu de rôles : payload Components V2 (plus d’embed)',
    (payload.flags & IS_V2) !== 0 && payload.embeds === undefined);
  check('menu de rôles : les 2 paragraphes du contenu personnalisé sont séparés',
    rmT.includes('Choisis tes rôles ci-dessous.') && rmT.includes('Tu peux les activer ou les retirer à tout moment.') && v2div(payload) >= 1);
  check('menu de rôles : aucun trait texte ━ (v234)', !v2json(payload).includes(ui.SEPARATOR));
  check('menu de rôles : option « Comment ça marche » intacte',
    rmT.some((t) => t.startsWith('**🧭 Comment ça marche ?**')));
  check('menu de rôles : le menu déroulant est DANS le conteneur (V2)',
    v2json(payload).includes('bd-menu:') && payload.components.length === 1
    && p2types(payload).includes(1));   // 1 = ActionRow, imbriqué dans le conteneur

  // Panneau tickets (i18n) : bienvenue | explication, règles en bloc intact.
  const tPayload = panels.buildTicketPanel({}, {}, [], 'Serveur de Hoxera', 'G220');
  const tT = v2texts(tPayload);
  check('tickets : payload Components V2 (plus d’embed)',
    (tPayload.flags & IS_V2) !== 0 && tPayload.embeds === undefined);
  check('tickets : séparateur natif entre bienvenue et explication',
    tT.some((t) => t.includes('Bienvenue sur le support officiel de Serveur de Hoxera')) && v2div(tPayload) >= 1);
  check('tickets : aucun trait texte ━ (v234)', !v2json(tPayload).includes(ui.SEPARATOR));
  check('tickets : règles toujours dans leur propre bloc (pas de trait dedans)',
    tT.some((t) => t.includes('🔴➡️') && !t.includes(ui.SEPARATOR)));
  check('tickets : l’espaceur invisible U+200B n’apparaît plus comme intitulé',
    !tT.some((t) => /\*\*[\u200B-\u200F\u2060\uFEFF\s]+\*\*/.test(t)));
  check('tickets : bannière conservée en MediaGallery pleine largeur',
    v2json(tPayload).includes('/api/tickets/panel-banner/'));
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const fakeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ROW_TEST').setLabel('test').setStyle(ButtonStyle.Primary));
  const withRows = panels.buildTicketPanel({}, {}, [], 'S', 'G', [fakeRow]);
  check('tickets : les boutons/menus sont DANS le conteneur (rows en 6e argument)',
    withRows.components.length === 1 && v2json(withRows).includes('ROW_TEST')
    && p2types(withRows).includes(1));

  // Le nettoyage des anciens panneaux doit reconnaître les DEUX formats, sinon
  // les panneaux V2 ne seraient jamais remplacés et s'accumuleraient.
  const panelsSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');
  check('pruneOldPanels : lecture du titre compatible V2 (panelTitleOf)',
    /function panelTitleOf\(msg\)/.test(panelsSrc) && /const title = panelTitleOf\(msg\);/.test(panelsSrc)
    && !/const emb = msg\.embeds && msg\.embeds\[0\];/.test(panelsSrc));
  check('sendRoleMenu : édition d’un ancien message classique → champs vidés',
    /existing\.edit\(\{ \.\.\.payload, content: null, embeds: \[\], attachments: \[\] \}\)/.test(panelsSrc));

  console.log('\n4️⃣  Couverture des autres panneaux');
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', f), 'utf8');
  const countOf = (f, needle) => src(f).split(needle).length - 1;
  // v236 — bienvenue, départ, journal, action send_embed, annonce de live et
  // automod sont passés en Components V2 : leurs paragraphes sont séparés par
  // des séparateurs NATIFS pleine largeur au lieu du trait texte ui.sectionize.
  check('bienvenue premium : panneau V2 quand aucune pièce jointe (v236)',
    src('events.js').includes('welcomePayload = ui.v2panel({'));
  check('bienvenue premium : embed classique conservé quand la carte image est jointe (v236)',
    src('events.js').includes("welcomePayload = { embeds: [embed], files };")
    && countOf('events.js', 'ui.sectionize(text, 4096)') === 1);
  check('journal (logging.js) : description en V2 (v236)',
    src('logging.js').includes('ui.v2panel({'));
  check('action send_embed (engine.js) : description structurée en V2 (v236)',
    src('engine.js').includes('ui.v2panel('));
  check('annonce de live (liveWatch.js) : description structurée en V2 (v236)',
    src('liveWatch.js').includes('ui.v2panel({'));
  const evSrc = src('events.js');
  check('départ : panneau premium = message utilisateur structuré en V2 (v236)',
    evSrc.includes("s'en va…") && evSrc.includes('ui.v2panel({'));
  check('automod : avertissements en Components V2 (v236)',
    src('automod.js').includes("const ui = require('./ui')") && src('automod.js').includes('ui.v2panel({')
    && !src('automod.js').includes('ui.embed({'));
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
  // Messages COURTS / interactifs : le trait est réservé aux grands textes
  // structurés — mariage, pendu, morpion (et leurs mises à jour LIVE) gardent
  // leurs sauts de ligne naturels via sections:false.
  const exSrc = src('extra.js');
  check('jeux & demandes courts : sections:false (pas de trait orphelin)',
    (exSrc.match(/sections: false/g) || []).length >= 5);
  // /meme : sources FRANCOPHONES en priorité (titres en français), jamais NSFW.
  const pmSrc = src('premade.js');
  check('meme : sources francophones (memesfr, frenchmemes, rance)',
    pmSrc.includes("const MEME_FR_SOURCES = ['memesfr', 'frenchmemes', 'rance']"));
  check('meme : filtrage NSFW/spoiler actif',
    pmSrc.includes('!data.nsfw && !data.spoiler'));
  check('meme : la commande passe par la sélection française',
    pmSrc.includes('const data = await fetchRandomMeme()'));
  const pSrc = src('panels.js');
  check('salon privé : accueil = texte naturel (ui.text, pas de trait)',
    pSrc.includes('.setDescription(ui.text(desc, 4096))'));
  check('DM « ton ticket est ouvert » : sections désactivées',
    pSrc.includes('sections: false,') && pSrc.includes("title: '🎫 Ton ticket est ouvert'"));
  check('DM de transcription : texte naturel (ui.text, pas de trait)',
    pSrc.includes('.setDescription(ui.text(desc, 4096))'));
  const memberW = { id: 'u1', user: { username: 'Alice', displayAvatarURL: () => '' }, toString: () => '@Alice', guild: { name: 'S' } };
  // v237 — le message du salon privé est passé en Components V2 : les
  // paragraphes de l'accueil deviennent des blocs séparés par des séparateurs
  // NATIFS pleine largeur (plus de sauts de ligne « bruts » à la place).
  const wPanel = panels.ticketWelcomePanel(memberW, { label: 'Support', emoji: '🎫', staff_roles: [] }, '', '', '', [], 'fr', { number: 1 }, {});
  check('salon privé (runtime) : payload Components V2',
    (wPanel.flags & IS_V2) !== 0 && wPanel.embeds === undefined);
  check('salon privé (runtime) : séparateurs natifs, aucun trait texte ━',
    v2div(wPanel) >= 2 && !v2json(wPanel).includes(ui.SEPARATOR));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v220 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('❌ Erreur :', e); process.exit(1); });
