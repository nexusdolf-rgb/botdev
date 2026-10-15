// v363 — 📜 Règles : le bouton ne peut plus disparaître, et le panneau se
// vérifie tout seul.
//
// Le signalement du fondateur : « quand le panneau de règles est envoyé sur
// Discord, y a pas le bouton ». Cause trouvée dans le code (et reproduite
// avant de corriger) : un panneau V2 accepte 40 composants maximum, corps ET
// boutons confondus. Le corps était posé en premier, la ligne de boutons en
// dernier derrière un garde-fou `v2room()` — donc dès qu'un texte comptait
// assez de paragraphes, le bouton était ABANDONNÉ EN SILENCE : message envoyé,
// HTTP 200, aucune erreur nulle part.
//
// Vérifié ici :
//   1. réservation du budget : de 5 à 40 règles, le bouton est TOUJOURS là et
//      le payload passe l'audit Discord (v2Audit = []) ;
//   2. nettoyage des faux séparateurs « ━ » (2 composants gaspillés par trait,
//      ligne doublonnée à l'écran) — sans jamais manger une ligne de liste ;
//   3. plan() : le compte annoncé est le compte réel du payload construit ;
//   4. deux présentations du bouton (rangée pleine largeur / accessoire de
//      Section) et persistance du choix ;
//   5. mentions coupées : publier un panneau ne ping PLUS personne, même si le
//      texte contient `@everyone` ou que {role} devient « @NomDuRôle » ;
//   6. auto-contrôle : le message renvoyé par Discord est relu, et un panneau
//      sans bouton est SIGNALÉ au lieu d'être annoncé comme un succès ;
//   7. re-clic : la date de la PREMIÈRE acceptation est conservée et affichée ;
//   8. câblage : routes, i18n fr+en, miroir du compteur dans le dashboard,
//      couche CSS, version du cache.
const fs = require('fs');
const path = require('path');

const TMP = path.join(require('node:os').tmpdir(), 'hoxera-v363-' + process.pid + '-' + Date.now());
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const rules = require('../server/discord/rules');
const ui = require('../server/discord/ui');
const i18n = require('../server/i18n');

let ok = 0;
let ko = 0;
function check(label, cond, info) {
  if (cond) { ok += 1; console.log('  ✅ ' + label); return; }
  ko += 1;
  console.log('  ❌ ' + label + (info ? ' — ' + info : ''));
}
const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
// L'entree exacte du module dans le catalogue du tableau de bord (MODULES).
const CAT_RULES = "['rules', '📖', 'Règles']";

const wire = (payload) => JSON.parse(JSON.stringify(payload));
const enfants = (payload) => wire(payload).components[0].components;
// Le bouton est soit dans une ActionRow (type 1), soit en accessoire d'une
// Section (type 9) : les deux sont des enfants légaux du conteneur.
function boutonDe(payload, botId) {
  const cid = `hxrules:${botId}:accept`;
  let out = null;
  const walk = (list) => {
    for (const c of list || []) {
      if (!c || typeof c !== 'object') continue;
      if (c.custom_id === cid) out = c;
      if (Array.isArray(c.components)) walk(c.components);
      if (c.accessory) walk([c.accessory]);
    }
  };
  walk(wire(payload).components);
  return out;
}

const regl = (n) => Array.from({ length: n }, (_, i) => `**${i + 1}.** Règle numéro ${i + 1}, avec un paragraphe de texte suffisant.`).join('\n\n');

// ------------------------------------------------------------
// Serveur et canal simulés (mêmes formes que v362, rien de plus).
// ------------------------------------------------------------
function channe(id, name, opts = {}) {
  const sent = [];
  const ch = {
    id, name, type: 0, sent,
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      const msg = {
        id: String(1800000000000000000 + sent.length), channel: ch,
        // `sansBouton` simule le pire cas : Discord (ou un futur changement de
        // design) revient sans les composants interactifs.
        ...(opts.sansBouton ? { components: [] } : payload),
        edit: async (p) => { Object.assign(msg, opts.sansBouton ? { components: [] } : p); return msg; },
        delete: async () => true,
      };
      return msg;
    },
    messages: { fetch: async () => null },
    permissionsFor: () => null,
  };
  return ch;
}
function guildMock(channels, roleId, guildName) {
  const map = (obj) => {
    const m = new Map(Object.entries(obj));
    m.find = (fn) => [...m.values()].find(fn);
    return m;
  };
  const role = roleId ? { id: roleId, name: 'Membre', position: 3, managed: false } : null;
  const g = {
    id: 'gV363', name: guildName || 'Carré RP',
    channels: { cache: map(channels) },
    roles: { cache: map(role ? { [role.id]: role } : {}) },
    members: {
      me: { id: 'botUser', permissions: { has: () => true }, roles: { highest: { position: 20 } } },
      fetch: async () => map({}),
    },
  };
  for (const c of Object.values(channels)) c.guild = g;
  return { guild: g, role };
}

(async () => {
  // store.bots.create renvoie L'IDENTIFIANT numerique du bot (pas un objet) :
  // c'est celui qui entre dans les custom_id, donc dans les assertions.
  const BOT_ID = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const BOT = { id: BOT_ID };
  const G = 'gV363';

  // ==========================================================
  console.log('\n— 1. Le bouton ne peut plus être éjecté du panneau —');
  {
    const cfg = { title: 'Règles', footer: 'En acceptant, vous vous engagez à les respecter.', button_label: 'J’accepte les règles', button_style: 'vert' };
    let tousOK = true;
    const details = [];
    for (const n of [1, 5, 12, 17, 18, 25, 40, 80]) {
      const t = rules.texts({ ...cfg, body: regl(n) }, 'fr', { serveur: 'S', membres: '0' });
      const payload = rules.buildPanel(t, BOT.id);
      const bouton = boutonDe(payload, BOT.id);
      const total = enfants(payload).length + 1 + (bouton ? 1 : 0); // conteneur + bouton imbriqué
      if (!bouton || ui.v2Audit(wire(payload)).length || total > ui.V2_COMPONENT_CAP) tousOK = false;
      details.push(`${n}:${bouton ? 'bouton' : 'ABSENT'}/${total}`);
    }
    check('de 1 à 80 règles : bouton présent, payload audité, jamais plus de 40 composants', tousOK, details.join(' '));
    check('les blocs en trop sont REGROUPÉS au lieu d’évincer le bouton',
      enfants(rules.buildPanel(rules.texts({ ...cfg, body: regl(40) }, 'fr', {}), BOT.id)).length
      < enfants(rules.buildPanel(rules.texts({ ...cfg, body: regl(12) }, 'fr', {}), BOT.id)).length);
    check('le texte n’est jamais tronqué par le regroupement (mêmes caractères que 12 règles)',
      JSON.stringify(enfants(rules.buildPanel(rules.texts({ ...cfg, body: regl(40) }, 'fr', {}), BOT.id)))
        .replace(/\\n\\n/g, '').length
      >= regl(40).length - 40, String(regl(40).length));
    check('ui expose le coût des lignes interactives et la fusion (réutilisables, testables)',
      typeof ui.v2rowCost === 'function' && typeof ui.v2fitBlocks === 'function'
      && ui.v2rowCost([{ components: [{}, {}, {}] }]) === 4
      && ui.v2fitBlocks(Array.from({ length: 30 }, (_, i) => String(i)), 10).length <= 6);
  }

  // ==========================================================
  console.log('\n— 2. Les « ━ » tapés à la main sont retirés, pas les listes —');
  {
    const t = rules.cleanBody('> intro\n\n━\n\n- un point\n- un autre\n\n━━━\n\n**1.** a\n\n\n\nfin');
    check('les lignes réduites à un trait disparaissent (1, 3 ou 60 caractères)',
      !/━/.test(t) && !/^\s*-\s*$/.test(t), JSON.stringify(t));
    check('les vraies lignes de liste survivent', t.includes('- un point\n- un autre'), JSON.stringify(t));
    check('les triples sauts de ligne sont réduits à un paragraphe', !/\n\n\n/.test(t));
    check('un texte sans trait repart inchangé (à la normalisation près)',
      rules.cleanBody('**1.** Bonjour\n\n**2.** Au revoir') === '**1.** Bonjour\n\n**2.** Au revoir');
    check('une puce vide (« - » tout seul) part avec le trait, le texte reste',
      rules.cleanBody('- \n\ntexte') === 'texte', JSON.stringify(rules.cleanBody('- \n\ntexte')));
    check('un long trait (60 « ━ ») est traité comme les courts',
      !/━/.test(rules.cleanBody('a\n\n' + '━'.repeat(60) + '\n\nb')),
      JSON.stringify(rules.cleanBody('a\n\n' + '━'.repeat(60) + '\n\nb')));
    check('« --- » (rule horizontale markdown) est aussi reconnu comme trait',
      rules.cleanBody('a\n\n---\n\nb') === 'a\n\nb', JSON.stringify(rules.cleanBody('a\n\n---\n\nb')));
    const throughTexts = rules.texts({ body: 'a\n\n━\n\nb' }, 'fr', {}).body;
    check('texts() applique le nettoyage AVANT la coupe au plafond',
      throughTexts === 'a\n\nb', JSON.stringify(throughTexts));
  }

  // ==========================================================
  console.log('\n— 3. plan() annonce le payload réel —');
  {
    const cfgBase = { title: 'Règles du serveur', footer: 'pied', button_label: 'ok', button_style: 'vert' };
    let fidele = true;
    const ecart = [];
    for (const n of [3, 7, 12, 17, 18, 30]) {
      const cfg = { ...cfgBase, body: regl(n) };
      const p = rules.plan(cfg, 'fr', { serveur: 'S' });
      const payload = rules.buildPanel(rules.texts(cfg, 'fr', { serveur: 'S' }), 1);
      const reel = enfants(payload).length + 1 + (boutonDe(payload, 1) ? 1 : 0);
      ecart.push(`${n}:${p.components}/${reel}`);
      if (p.components !== reel) fidele = false;
    }
    check('le nombre de composants annoncé est celui du panneau construit', fidele, ecart.join(' '));
    const long = rules.plan({ ...cfgBase, body: regl(30) }, 'fr', {});
    check('au-delà du maximum, plan() le dit (airy=false) sans annoncer de perte',
      long.blocks === 30 && long.airy === false && long.shown <= long.max_blocks && long.fits === true,
      JSON.stringify(long));
    const court = rules.plan({ ...cfgBase, body: regl(4) }, 'fr', {});
    check('en dessous, rien n’est regroupé', court.airy === true && court.shown === 4, JSON.stringify(court));
    check('plan() est exposé au tableau de bord via cfgOf et summary',
      !!rules.cfgOf(G).plan && !!rules.summary(G).plan);
    check('MAX_BLOCKS correspond au plafond Discord (40 - conteneur - titre - pied - bouton)',
      rules.MAX_BLOCKS === Math.floor((ui.V2_COMPONENT_CAP - 5) / 2), String(rules.MAX_BLOCKS));
  }

  // ==========================================================
  console.log('\n— 4. Deux présentations du bouton, choisies par l\u2019administrateur —');
  {
    const t = (placement) => rules.texts({ body: regl(4), button_placement: placement }, 'fr', { serveur: 'S' });
    const ligne = rules.buildPanel(t('ligne'), BOT.id);
    const carte = rules.buildPanel(t('carte'), BOT.id);
    const enfantsLigne = enfants(ligne);
    const enfantsCarte = enfants(carte);
    const rang = enfantsLigne[enfantsLigne.length - 1];
    const sect = enfantsCarte[enfantsCarte.length - 1];
    check('« ligne » : ActionRow (type 1) en dernier enfant du conteneur',
      rang.type === 1 && rang.components.length === 1 && rang.components[0].custom_id === `hxrules:${BOT.id}:accept`,
      JSON.stringify(rang).slice(0, 160));
    check('« carte » : Section (type 9) dont l’accessoire est le bouton',
      sect.type === 9 && sect.accessory && sect.accessory.custom_id === `hxrules:${BOT.id}:accept`
      && Array.isArray(sect.components) && sect.components[0].type === 10,
      JSON.stringify(sect).slice(0, 200));
    check('les deux présentations passent l’audit Discord',
      ui.v2Audit(wire(ligne)).length === 0 && ui.v2Audit(wire(carte)).length === 0,
      JSON.stringify([ui.v2Audit(wire(ligne)), ui.v2Audit(wire(carte))]));
    check('la Section « carte » porte la phrase d\u2019acceptation (i18n du serveur)',
      JSON.stringify(sect).includes(i18n.t('fr', 'rules_accept_hint').replace('{serveur}', 'S').slice(0, 24)));
    rules.saveCfg(G, { button_placement: 'carte' });
    check('le choix est enregistré et relu', rules.cfgOf(G).button_placement === 'carte');
    rules.saveCfg(G, { button_placement: 'n importe quoi' });
    check('une valeur inconnome retombe sur la présentation par défaut',
      rules.cfgOf(G).button_placement === rules.PLACEMENT_DEFAULT);
    check('cfgOf valide déjà le placement (défaut à la lecture)',
      rules.cfgOf('gJamaisVu').button_placement === 'ligne');
  }

  // ==========================================================
  console.log('\n— 5. Publier un panneau ne ping PLUS personne —');
  {
    rules.saveCfg(G, { enabled: true, button_placement: 'ligne', body: '> Bienvenue sur {serveur}.\n\n**1.** Pas de `@everyone` ici.\n\n**2.** Le rôle {role} est donné.', footer: 'pied', title: 'Règles', role: 'r1', panel_message: '', panel_channel: '' });
    const ch = channe('ch1', 'regles');
    const { guild } = guildMock({ ch1: ch }, 'r1');
    const out = await rules.sendPanel(BOT.id, guild, 'ch1');
    const payload = ch.sent[0];
    check('allowedMentions vide sur l’envoi (parse = [])',
      payload.allowedMentions && Array.isArray(payload.allowedMentions.parse) && payload.allowedMentions.parse.length === 0,
      JSON.stringify(payload.allowedMentions));
    check('aucune mention @everyone en clair dans le texte publié (le span de code protège)',
      !/@(everyone|here)/.test(JSON.stringify(wire(payload)).replace(/`@[^`]*`/g, '«code»')),
      JSON.stringify(wire(payload)).slice(0, 220));
    check('le marqueur {role} est bien devenu « @Membre » (texte, plus de ping)',
      JSON.stringify(wire(payload)).includes('@Membre'));
    check('le panneau publié est suivi (id + salon mémorisés)',
      rules.cfgOf(G).panel_message === out.message.id && rules.cfgOf(G).panel_channel === 'ch1');
  }

  // ==========================================================
  console.log('\n— 6. Le message est relu : un panneau sans bouton est signalé —');
  {
    const ok1 = rules.panelHasButton({ components: [{ type: 17, components: [{ type: 1, components: [{ type: 2, custom_id: `hxrules:${BOT.id}:accept` }] }] }] }, BOT.id);
    const ok2 = rules.panelHasButton({ components: [{ type: 17, components: [{ type: 9, components: [], accessory: { type: 2, custom_id: `hxrules:${BOT.id}:accept` } }] }] }, BOT.id);
    const builders = rules.panelHasButton({ components: rules.buildPanel(rules.texts({ body: regl(3) }, 'fr', {}), BOT.id).components }, BOT.id);
    const ko1 = rules.panelHasButton({ components: [{ type: 17, components: [{ type: 10, content: 'texte' }] }] }, BOT.id);
    const ko2 = rules.panelHasButton({}, BOT.id);
    check('bouton retrouvé dans une ActionRow du conteneur', ok1 === true);
    check('bouton retrouvé en accessoire d’une Section', ok2 === true);
    check('bouton retrouvé aussi sur les builders discord.js (pas que le JSON fil)', builders === true);
    check('panneau sans composant interactif → non vérifié', ko1 === false && ko2 === false);
    check('sendPanel renvoie verified: true quand Discord rend le bouton', await (async () => {
      const ch = channe('ch2', 'regles-2');
      const { guild } = guildMock({ ch2: ch }, 'r1');
      rules.saveCfg(G, { panel_message: '', panel_channel: '', channel: 'ch2' });
      const out = await rules.sendPanel(BOT.id, guild, 'ch2');
      return out.verified === true && !!out.plan && out.plan.components <= ui.V2_COMPONENT_CAP;
    })());
    check('sendPanel renvoie verified: false (et le dit) si le bouton a disparu', await (async () => {
      const ch = channe('ch3', 'regles-3', { sansBouton: true });
      const { guild } = guildMock({ ch3: ch }, 'r1');
      rules.saveCfg(G, { panel_message: '', panel_channel: '', channel: 'ch3' });
      const out = await rules.sendPanel(BOT.id, guild, 'ch3');
      return out.verified === false;
    })());
    const src = lire('server/discord/rules.js');
    check('le succès est JOURNALISÉ aussi (bouton vérifié + taille du panneau)',
      src.includes('function notePublished(') && src.includes('bouton \u2705 vérifié')
      && src.includes("notePublished(botId, guild, 'send', sent, plan_)")
      && src.includes("notePublished(botId, guild, 'edit', edited, plan_)"));
    check('le cas « publié sans bouton » est journalisé et remonté à /api/health/bot',
      src.includes("console.error(`[BotDev] 📜 panneau de règles publié SANS bouton") && src.includes("recordError('panneau-regles-sans-bouton'"));
    check('la saturation du budget crie aussi (fini le silence)',
      lire('server/discord/ui.js').includes("Panneau V2 saturé") && lire('server/discord/ui.js').includes("recordError('panneau-sature'"));
  }

  // ==========================================================
  console.log('\n— 7. Re-clic : la première acceptation reste la date qui compte —');
  {
    const role = { id: 'r1', name: 'Membre', position: 3, managed: false };
    const mkItx = (over = {}) => {
      const replies = [];
      const roles = new Map(over.hasRoles || []);
      const member = {
        id: over.id || 'u1', displayName: 'Leo',
        roles: {
          cache: roles,
          add: async (r) => { roles.set(r.id, r); },
        },
      };
      const itx = {
        customId: `hxrules:${BOT.id}:accept`,
        guild: over.guild === null ? null : guildMock({}, 'r1').guild,
        member: over.guild === null ? null : member,
        user: { id: member.id, tag: member.id + '#0001', username: member.id },
        reply: async (p) => { replies.push(p); return true; },
      };
      return { itx, replies, roles };
    };
    rules.resetAcceptations(G);
    rules.saveCfg(G, { enabled: true, role: 'r1', thanks: '', channel: 'ch1' });
    const { guild } = guildMock({ ch1: channe('ch1', 'regles') }, 'r1');
    guild.roles.cache.set('r1', role);
    const { itx, replies } = mkItx();
    itx.guild = guild;
    await rules.handleButton(BOT.id, itx);
    const premier = rules.stateOf(G).members[0];
    check('première acceptation : rôle donné, trace créée avec first_at',
      replies.length === 1 && premier && premier.first_at === premier.at, JSON.stringify(premier));
    const { itx: itx2, replies: r2 } = mkItx({ hasRoles: [['r1', role]] });
    itx2.guild = guild;
    await rules.handleButton(BOT.id, itx2);
    const relu = rules.stateOf(G).members[0];
    check('second clic : la date de première acceptation n’est pas écrasée',
      relu.first_at === premier.first_at && relu.at >= premier.at, JSON.stringify(relu));
    check('le message de re-clic cite le jour de la première acceptation',
      r2.length === 1 && /première acceptation le /.test(r2[0].content), r2[0] && r2[0].content);
    check('la clé i18n existe en français et en anglais',
      i18n.t('fr', 'rules_already_at').includes('{date}') && i18n.t('en', 'rules_already_at').includes('{date}')
      && i18n.t('fr', 'rules_accept_hint') !== 'rules_accept_hint' && i18n.t('en', 'rules_accept_hint') !== 'rules_accept_hint');
  }

  // ==========================================================
  console.log('\n— 8. Câblage tableau de bord, routes et cache —');
  {
    const dash = lire('public/js/dashboard.js');
    const css = lire('public/css/dashboard.css');
    const routes = lire('server/routes.js');
    check('le dashboard montre le plan du panneau (compteur de blocs + note)',
      dash.includes('id="rl-plan"') && dash.includes("champ('#rl-plan')") && css.includes('.rl-plan'));
    check('le dashboard reproduit le nettoyage des traits et la fusion (miroir de rules.cleanBody)',
      dash.includes('const nettoyer =') && dash.includes('const decoupe =') && dash.includes('const regrouper ='));
    check('le choix de présentation du bouton est dans le formulaire et la collecte',
      dash.includes('id="rl-placement"') && dash.includes("button_placement: (champ('#rl-placement')"));
    check('les modèles sont proposés en cartes avec leur intention',
      dash.includes('rl-modele-nom') && dash.includes('rl-modele-hint') && dash.includes('rl-modele-taille'));
    check('l’aperçu affiche les séparateurs réels et le bouton en accessoire',
      dash.includes('dprev-sep') && dash.includes('dprev-carte'));
    check('après publication, le dashboard dit si le bouton a été vérifié',
      dash.includes('r.verified === false') && dash.includes('bouton vérifié sur Discord'));
    check('le CSS v363 existe (cartes, plan, séparateurs, responsive)',
      css.includes('v363 — Règles') && css.includes('.rl-modeles-grille') && css.includes('.dprev-sep')
      && css.includes('@media (max-width: 640px)'));
    check('aucune couleur « blurlple » codée en dur dans la couche v363 (règle maison)',
      !/#5865[Ff]2/.test(css.slice(css.indexOf('v363 — Règles'))));
    check('la route PUT accepte button_placement', routes.includes('b.button_placement !== undefined'));
    check('la route POST renvoie verified + plan + cfg au tableau de bord',
      routes.includes('verified: out.verified === true') && routes.includes('plan: out.plan || null')
      && routes.includes("cfg: require('./discord/rules').summary(req.params.guildId)"));
    check('version du cache poussée à v363 (index.html x7, sw.js)',
      (lire('public/index.html').match(/\?v=366/g) || []).length === 7
      && lire('public/sw.js').includes("const CACHE = 'botdev-v366';"));
    check('le module Règles reste au catalogue avec son émoticône dessinée',
      dash.includes(CAT_RULES) && dash.includes("emote: 'hox_rules'"));
  }

  // ==========================================================
  console.log('\n— 9. Les quatre modèles livrés tiennent tels quels —');
  {
    const presets = rules.presets();
    check('quatre modèles, chacun avec label, intention, taille et plan',
      presets.length === 4 && presets.every((p) => p.label && p.hint && p.blocks >= 4 && p.length > 400),
      presets.map((p) => `${p.id}:${p.blocks}/${p.length}`).join(' '));
    let tousFides = true;
    const details = [];
    for (const p of presets) {
      const t = rules.texts({ body: p.text, title: '', footer: '', button_label: '', button_style: 'vert' }, 'fr', { serveur: 'Carré RP', role: '@Membre', membres: '12' });
      const payload = rules.buildPanel(t, BOT.id);
      const bouton = boutonDe(payload, BOT.id);
      const total = enfants(payload).length + 1 + (bouton ? 1 : 0);
      const ok = !!bouton && p.blocks <= rules.MAX_BLOCKS && total <= ui.V2_COMPONENT_CAP
        && ui.v2Audit(wire(payload)).length === 0 && t.body.includes('Carré RP') && !/━/.test(t.body);
      if (!ok) tousFides = false;
      details.push(`${p.id}:${bouton ? 'ok' : 'SANS BOUTON'}/${total}`);
    }
    check('chaque modèle : bouton présent, aucun regroupement nécessaire, audit vide, {serveur} rempli',
      tousFides, details.join(' '));
    check('aucun modèle ne contient de faux séparateur', presets.every((p) => !/^\s*━+\s*$/m.test(p.text)));
    check('les modèles sont en vouvoiement (règle maison, y compris « ton » seul)', await (async () => {
      const TU = /(^|[\s(,;:!?'«»])(tu|te|tes|ton|ta|toi)($|[\s.,;:!?'«»])/im;
      return presets.every((p) => !TU.test(p.text));
    })());
    check('« essentiel » reste le modèle par défaut et le plus court des quatre',
      rules.DEFAULT_PRESET === 'essentiel'
      && Math.min(...presets.map((p) => p.length)) === presets.find((p) => p.id === 'essentiel').length,
      presets.map((p) => `${p.id}:${p.length}`).join(','));
    // v363.2 : les six modèles ajoutés (amis, famille, support, tournoi,
    // créateurs, événement) ont été RETIRÉS sur demande du fondateur. Le test
    // verrouille ce choix pour que personne ne les « recommande » par erreur.
    check('les six modèles ajoutés en v363 sont bien retirés',
      ['amis', 'famille', 'support', 'tournoi', 'createurs', 'evenement']
        .every((id) => !rules.PRESETS[id]), Object.keys(rules.PRESETS).join(','));
  }

  // ==========================================================
  console.log('\n— 10. Le rendu réel du tableau de bord (navigateur simulé) —');
  // Comme v362 : le code du front et le scenario sont evalues DANS la page
  // jsdom (un `const` de haut niveau d'un eval n'est pas accessible depuis
  // Node), et le test ne recoit qu'un objet de mesures.
  try {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
      url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window;
    global.window = w; global.document = w.document;
    Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true });
    global.location = w.location;
    const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
      .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
    const snippet = String.raw`
  window.__r363 = (async () => {
    const out = { appels: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1500);
    if (typeof Dashboard === 'undefined' || !Dashboard.renderers) return { erreur: 'Dashboard absent' };
    const D = Dashboard;
    D.state.bot = { id: 1, name: 'Hoxera' };
    D.state.guildId = 'G1';
    window.fetch = async (url, options) => {
      out.appels.push({
        url: String(url), methode: (options && options.method) || 'GET',
        corps: options && typeof options.body === 'string' ? JSON.parse(options.body) : null,
      });
      const body = String(url).includes('/rules/panel') ? out.publication : { ok: true, cfg: {} };
      return { ok: true, status: 200, json: async () => body };
    };
    out.publication = { ok: true, mode: 'send', message_id: '1800000000000000001', verified: true, plan: { blocks: 4, shown: 4, max_blocks: 17, components: 13 }, cfg: {} };

    const donnees = {
      guild: { name: 'Carré RP' },
      channels: [{ id: 'C1', name: 'règles' }, { id: 'C2', name: 'bilans' }],
      roles: [{ id: 'R1', name: 'Membre' }],
      rules: {
        enabled: true, channel: 'C1', role: 'R1', title: 'Règlement', color: '#5865F2',
        body: '**1.** Poli.\n**2.** Gentil sur {serveur}.', footer: 'Le rôle {role} est donné.',
        button_label: '', button_style: 'vert', button_placement: 'ligne', thanks: '', log_channel: 'C2',
        panel_message: '', panel_channel: '', accepts: 2, last_at: Date.now(),
        recent: [{ id: '9', tag: 'leo#0001', at: Date.now(), first_at: Date.now() - 86400000 }],
        presets: [
          { id: 'essentiel', label: 'L’essentiel — 5 règles courtes', hint: 'Le plus lu.', text: '**1.** Court.\n\n**2.** Clair.', blocks: 3, length: 40, airy: true },
          { id: 'famille', label: 'Famille & jeunes publics', hint: 'Âge minimum rappelé.', text: '**1.** Propre.\n\n**2.** Calme.', blocks: 3, length: 36, airy: true },
        ],
        using_default: false,
        accept_hint: 'En cliquant sur le bouton, vous acceptez le règlement de {serveur}.',
        plan: { blocks: 2, shown: 2, max_blocks: 17, components: 9, cap: 40, airy: true, fits: true },
      },
    };

    const zone = document.createElement('div');
    document.body.appendChild(zone);
    await D.renderers.rules(zone, donnees);
    const txt = (sel) => ((zone.querySelector(sel) || {}).textContent || '').trim();
    const nbs = (sel) => zone.querySelectorAll(sel).length;

    out.cartes = nbs('.dash-card');
    out.plan = txt('#rl-plan');
    out.compteur = txt('#rl-count');
    out.modeles = nbs('.rl-modele');
    out.modelesNom = !!zone.querySelector('.rl-modele-nom');
    out.modelesHint = !!zone.querySelector('.rl-modele-hint');
    out.modelesTaille = !!zone.querySelector('.rl-modele-taille');
    out.placements = zone.querySelector('#rl-placement') ? zone.querySelector('#rl-placement').options.length : 0;
    out.seps = nbs('#rl-preview .dprev-sep');
    out.dmdInitial = nbs('#rl-preview .dmd');
    out.pied = txt('#rl-preview .dprev-foot');
    out.boutonsLigne = nbs('#rl-preview .dprev-btns .dprev-btn');
    out.carteDedans = nbs('#rl-preview .dprev-carte');

    const placement = zone.querySelector('#rl-placement');
    placement.value = 'carte';
    placement.onchange();
    out.carteApres = nbs('#rl-preview .dprev-carte');
    out.rangeeApres = nbs('#rl-preview .dprev-btns');
    out.indice = txt('#rl-preview .dprev-carte-texte');

    const corps = zone.querySelector('#rl-body');
    corps.value = Array.from({ length: 20 }, (_, i) => '**' + (i + 1) + '.** Règle ' + (i + 1) + '.').join('\n\n');
    corps.oninput();
    out.planHaut = zone.querySelector('#rl-plan').classList.contains('is-haut');
    out.planLong = txt('#rl-plan');
    out.blocsRendus = nbs('#rl-preview .dmd');

    corps.value = 'a\n\n━\n\nb';
    corps.oninput();
    out.apercuBrut = txt('#rl-preview');
    out.blocsApresTrait = nbs('#rl-preview .dmd');

    zone.querySelector('#rl-save').click();
    await wait(150);
    zone.querySelector('#rl-send').click();
    await wait(250);
    out.put = (out.appels.find((a) => a.methode === 'PUT' && a.url.includes('/rules')) || {}).corps || {};
    out.etatOk = txt('#rl-etat');

    out.publication = { ok: true, mode: 'send', message_id: '1800000000000000002', verified: false, plan: { blocks: 2, shown: 2, components: 9 } };
    zone.querySelector('#rl-send').click();
    await wait(250);
    out.etatKo = txt('#rl-etat');
    return out;
  })();
`;
    w.eval(code + '\n;\n' + snippet);
    await new Promise((r) => setTimeout(r, 15000));
    const res = await w.__r363;
    check('le navigateur simulé a rendu l\u2019écran des règles', !!res && !res.erreur, res && res.erreur);
    if (res && !res.erreur) {
      check('deux cartes : le panneau et les acceptations', res.cartes === 2, String(res.cartes));
      check('la ligne de plan annonce le budget de blocs', /17/.test(res.plan) && /bloc/i.test(res.plan), res.plan);
      check('le compteur affiche caractères ET blocs', /\/3000 · \d+ bloc/.test(res.compteur), res.compteur);
      check('les modèles sont rendus en cartes (nom, intention, taille)',
        res.modeles === 2 && res.modelesNom && res.modelesHint && res.modelesTaille, String(res.modeles));
      check('le sélecteur de présentation propose les deux modes', res.placements === 2, String(res.placements));
      // Discord met un <Separator> entre deux blocs ET avant le pied : avec un
    // seul bloc de corps + un pied, ca fait exactement un separateur.
    check('l’aperçu pose autant de séparateurs que Discord (blocs + pied)',
      res.seps === res.dmdInitial && res.seps === 1 && !!res.pied,
      `seps=${res.seps} blocs=${res.dmdInitial} pied=${JSON.stringify(res.pied)}`);
      check('mode « ligne » : le bouton est sous le panneau', res.boutonsLigne === 1 && res.carteDedans === 0,
        `${res.boutonsLigne}/${res.carteDedans}`);
      check('mode « carte » : le bouton passe dans le panneau, avec la phrase d’acceptation',
        res.carteApres === 1 && res.rangeeApres === 0 && /règlement de Carré RP/.test(res.indice), res.indice);
      check('au-delà du budget, la note explique le regroupement (et ne parle pas de perte)',
        res.planHaut === true && /regroup/i.test(res.planLong) && !/supprim/i.test(res.planLong), res.planLong);
      check('les 20 blocs sont regroupés à l’aperçu comme côté serveur',
        res.blocsRendus > 0 && res.blocsRendus <= 17, String(res.blocsRendus));
      check('un « ━ » tapé à la main ne reste pas affiché dans l’aperçu',
        !/━/.test(res.apercuBrut) && res.blocsApresTrait === 2, `${res.apercuBrut.slice(0, 40)} / ${res.blocsApresTrait}`);
      check('le PUT envoie le choix de présentation', res.put.button_placement === 'carte', JSON.stringify(res.put));
      check('publication vérifiée : l’écran le dit', /vérifié/.test(res.etatOk) && /⚠️/.test(res.etatOk) === false, res.etatOk);
      check('bouton introuvable chez Discord : l’écran le signale au lieu de le cacher',
        /non vérifié|⚠️/.test(res.etatKo), res.etatKo);
    }
  } catch (e) {
    check('rendu jsdom exécutable', false, String((e && e.stack) || e).slice(0, 200));
  }

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log('');
  if (ko === 0) console.log(`🎉 v363 — ${ok} vérifications OK : le bouton des règles est garanti, vérifié, et les quatre modèles tiennent.`);
  else { console.log(`❌ v363 — ${ko} échec(s) sur ${ok + ko}`); process.exitCode = 1; }
})().catch((e) => { console.error('💥', e && e.stack || e); process.exitCode = 1; });
