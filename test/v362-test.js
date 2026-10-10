// v362 — 📜 Règles + 🗳️ Sondages (sondage natif Discord).
// Vérifié ici :
//   1. config des deux modules (défauts, bornes, blanche-liste des champs) ;
//   2. les modèles de règles livrés : longueur, balises Markdown, vouvoiement ;
//   3. panneau de règles : payload V2 valide (audit Discord), bouton, suivi du
//      message (mise à jour au lieu d'empiler) ;
//   4. clic sur « J'accepte les règles » : rôle donné, rôle absent, hiérarchie,
//      permission manquante, déjà accepté, module désactivé ;
//   5. journal des acceptations (compteur, doublons, plafonds, liste d'appel) ;
//   6. sondage : limites Discord RÉELLES (300 / 55 / 10 choix / 1-768 h),
//      payload exact, permissions, résultats, clôture, votants, échéancier ;
//   7. câblage : hook d'interaction, routes protégées, i18n fr+en, permission
//      « Créer des sondages » demandée à l'invitation, balayage du scheduler ;
//   8. catalogue du dashboard : fiches, émoticônes dessinées, rendu réel.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(require('node:os').tmpdir(), 'hoxera-v362-' + process.pid + '-' + Date.now());
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const rules = require('../server/discord/rules');
const polls = require('../server/discord/polls');
const { v2Audit } = require('../server/discord/ui');
const { PermissionsBitField } = require('discord.js');
const SEND_POLLS = PermissionsBitField.Flags.SendPolls;
const i18n = require('../server/i18n');

let ok = 0;
let ko = 0;
function check(label, cond, info) {
  if (cond) { ok += 1; console.log('  ✅ ' + label); return; }
  ko += 1;
  console.log('  ❌ ' + label + (info ? ' — ' + info : ''));
}
const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// ------------------------------------------------------------
// Fabrication d'un serveur Discord simulé, ni plus ni moins réaliste
// que celui des autres tests du dépôt (v290, v292…).
// ------------------------------------------------------------
function guildMock({ channels = {}, roles = {}, me = {}, members } = {}) {
  const cache = (obj) => {
    const map = new Map(Object.entries(obj));
    map.find = (fn) => [...map.values()].find(fn);
    return map;
  };
  const guild = {
    id: 'gV362', name: 'Carré RP',
    channels: { cache: cache(channels) },
    roles: { cache: cache(roles), highest: me.highest || { position: 5 } },
    members: {
      me: { id: 'botUser', permissions: me.permissions || {}, roles: { highest: me.highest || { position: 5 } } },
      fetch: async () => (members ? cache(members) : new Map()),
    },
  };
  for (const ch of Object.values(channels)) { ch.guild = guild; }
  return guild;
}

let seq = 0;
const snowflake = () => String(1712345678901234567 + (seq += 1));

function textChannel(extra = {}) {
  const sent = [];
  const edits = [];
  const stored = new Map((extra.messages || []).map((m) => [m.id, m]));
  const channel = {
    id: extra.id || 'ch1', name: extra.name || 'regles', type: 0,
    sent, edits, stored,
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      const message = {
        id: snowflake(), channel, ...payload,
        edit: async (p) => { edits.push(p); Object.assign(message, p); return message; },
        delete: async () => { stored.delete(message.id); return message; },
      };
      stored.set(message.id, message);
      return message;
    },
    messages: {
      fetch: async (id) => stored.get(String(id)) || Promise.reject(new Error('Unknown Message')),
    },
    permissionsFor: extra.permissionsFor || (() => null),
  };
  if (extra.fetchRejects) {
    channel.messages.fetch = async () => null;
  }
  return channel;
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = rules.cfgOf ? 'gV362' : 'gV362';

  // ==========================================================
  console.log('— 1. Réglages des deux modules —');
  const rZero = rules.cfgOf('gInedit');
  check('règles désactivées par défaut, rien d inventé', rZero.enabled === false && rZero.channel === '' && rZero.role === '' && rZero.body === '');
  check('…et le panneau bascule sur un modèle livré tant que rien n est écrit', rZero.using_default === true);
  rules.saveCfg(G, { enabled: true, channel: 'ch1', role: 'r1', title: 'Règles du Carré', body: '**1.** Soyez courtois.', color: '#123456', button_label: "J'accepte", button_style: 'rouge', footer: 'Bon séjour', thanks: 'Merci {serveur}' });
  const rCfg = rules.cfgOf(G);
  check('enregistrement relu à l identique', rCfg.enabled && rCfg.channel === 'ch1' && rCfg.role === 'r1' && rCfg.title === 'Règles du Carré' && rCfg.color === '#123456');
  check('style de bouton inconnu ramené sur « vert »', (() => { rules.saveCfg(G, { button_style: 'arc-en-ciel' }); return rules.cfgOf(G).button_style === 'vert'; })());
  rules.saveCfg(G, { button_style: 'rouge' });
  check('couleur invalide remplacée par la couleur Discord par défaut', (() => { rules.saveCfg(G, { color: 'rouge clair' }); return rules.cfgOf(G).color === rules.COLOR_DEFAULT; })());
  rules.saveCfg(G, { color: '#123456' });
  check('le corps de la requête ne peut pas falsifier le message suivi', (() => {
    const bloc = lire('server/routes.js');
    const debut = bloc.indexOf("router.put('/bots/:id/guilds/:guildId/rules'");
    const route = bloc.slice(debut, bloc.indexOf('router.', debut + 10));
    return !/b\.panel_message|b\.panel_channel/.test(route) && /allowed|patch\.title/.test(route);
  })());
  const pZero = polls.cfgOf('gInedit');
  check('sondages désactivés par défaut, durée de 24 h (défaut de l API Discord)', pZero.enabled === false && pZero.duration === 24);
  polls.saveCfg(G, { enabled: true, channel: 'ch2', duration: 999, allow_multiselect: true, intro: 'On vote.' });
  check('durée hors bornes ramenée à 768 h (32 jours, maxi Discord)', polls.cfgOf(G).duration === polls.DURATION_MAX_H);
  polls.saveCfg(G, { duration: 48 });
  check('enregistrement du sondage relu', polls.cfgOf(G).channel === 'ch2' && polls.cfgOf(G).allow_multiselect === true && polls.cfgOf(G).duration === 48);

  // ==========================================================
  console.log('\n— 2. Les modèles de règles livrés —');
  const presets = rules.presets();
  check('quatre modèles, du plus court au plus complet', presets.length === 4, presets.map((p) => p.id).join(', '));
  check('chaque modèle tient dans le budget du panneau V2', presets.every((p) => p.length > 200 && p.length <= rules.BODY_MAX),
    presets.map((p) => `${p.id}:${p.length}`).join(' '));
  check('chaque modèle utilise le Markdown Discord (gras, citation, liste)', presets.every((p) => /\*\*.+\*\*/.test(p.text) && p.text.includes('> **') && (p.text.includes('- ') || p.text.includes('\n**'))));
  check('…et les séparateurs pleine largeur du style Hoxera', presets.every((p) => p.text.includes('━')));
  const TU = /(^|[\s(,;:!?'"«»])(tu|te|tes|ton|ta|toi)($|[\s.,;:!?'"»«])/im;
  check('aucun modèle ne tutoie (règle maison : vouvoiement)', presets.every((p) => !TU.test(p.text)));
  check('le placeholder {serveur} est présent et sera rempli', presets.every((p) => p.text.includes('{serveur}')));

  // ==========================================================
  console.log('\n— 3. Panneau de règles : payload et suivi du message —');
  const chRegles = textChannel({ id: 'ch1', name: 'regles' });
  const guild = guildMock({
    channels: { ch1: chRegles, chLog: textChannel({ id: 'chLog', name: 'journal' }) },
    roles: { r1: { id: 'r1', name: 'Membre', position: 2, managed: false } },
    me: { highest: { position: 10 }, permissions: { has: () => true } },
  });
  const out1 = await rules.sendPanel(BOT.id, guild, 'ch1');
  check('le premier envoi publie un message neuf', out1.mode === 'send' && chRegles.sent.length === 1 && !!out1.message.id);
  const json1 = JSON.stringify(chRegles.sent[0].components.map((c) => (c.toJSON ? c.toJSON() : c)));
  check('bouton avec le customId du module et l étiquette enregistrée', json1.includes(`hxrules:${BOT.id}:accept`) && json1.includes('J\'accepte'), json1.slice(0, 160));
  check('le texte des règles est bien dans le panneau', json1.includes('Soyez courtois'));
  check('le nom du serveur remplace {serveur}', !json1.includes('{serveur}'));
  check('payload Components V2 conforme aux plafonds Discord', v2Audit(chRegles.sent[0]).length === 0, v2Audit(chRegles.sent[0]).join(' | '));
  check('un séparateur pleine largeur structure le panneau', (chRegles.sent[0].components[0].toJSON().components || []).some((c) => c.type === 14));
  const out2 = await rules.sendPanel(BOT.id, guild, 'ch1');
  check('le second envoi MET À JOUR le panneau suivi (pas de doublon)', out2.mode === 'edit' && chRegles.sent.length === 1 && chRegles.edits.length === 1);
  check('le message suivi est enregistré dans la config', rules.cfgOf(G).panel_message === out1.message.id && rules.cfgOf(G).panel_channel === 'ch1');
  // Panneau supprimé à la main sur Discord → on republie au lieu d'échouer.
  chRegles.stored.delete(out1.message.id);
  const out3 = await rules.sendPanel(BOT.id, guild, 'ch1');
  check('panneau supprimé manuellement sur Discord → nouvel envoi', out3.mode === 'send' && chRegles.sent.length === 2);
  rules.saveCfg(G, { panel_message: '', panel_channel: '' });
  let noChan = '';
  try { await rules.sendPanel(BOT.id, guild, 'canal-perdu'); } catch (e) { noChan = e.code; }
  check('salon introuvable → erreur claire, rien n est envoyé', noChan === 'NO_CHANNEL');

  // {serveur}/{role}/{membres} doivent être remplacés DANS LE CORPS aussi : les
  // modèles livrés commencent par « Bienvenue sur {serveur} ». On vérifie le
  // message réelement fabriqué par sendPanel, pas une hypothèse.
  rules.saveCfg(G, { body: '> Bienvenue sur {serveur} · rôle {role} · {membres} acceptation(s).', role: 'r1', panel_message: '', panel_channel: '' });
  await rules.sendPanel(BOT.id, guild, 'ch1');
  const corpEnvoye = JSON.stringify(chRegles.sent[chRegles.sent.length - 1].components.map((c) => (c.toJSON ? c.toJSON() : c)));
  check('le corps publié remplace {serveur}, {role} et {membres}',
    corpEnvoye.includes('Bienvenue sur Carré RP') && corpEnvoye.includes('@Membre')
    && corpEnvoye.includes('0 acceptation(s)') && !corpEnvoye.includes('{serveur}')
    && !corpEnvoye.includes('{role}'), corpEnvoye.slice(0, 240));

  // ==========================================================
  console.log('\n— 4. Clic sur « J\u2019accepte les règles » —');
  // Fabrique d'interaction : `added` vit dans la MÊME portée que le `add` du
  // membre, sinon le test ne peut pas voir ce que le bot a vraiment donné.
  const mkItx = (over = {}) => {
    const replies = [];
    const added = [];
    const roles = new Map(over.hasRoles || []);
    const member = over.member === undefined
      ? {
        id: over.id || 'u1', displayName: 'Leo',
        roles: {
          cache: roles,
          add: async (role) => {
            if (over.grantThrows) throw new Error('403 Forbidden');
            added.push(role && role.id);
            roles.set(role.id, role);
          },
        },
      }
      : over.member;
    const itx = {
      customId: over.customId || `hxrules:${BOT.id}:accept`,
      guild: over.guild === undefined ? guild : over.guild,
      member,
      user: over.user || { id: (member && member.id) || 'u1', tag: ((member && member.id) || 'u1') + '#0001', username: (member && member.id) || 'u1' },
      reply: async (payload) => { replies.push(payload); return true; },
    };
    return { itx, replies, added };
  };

  {
    const { itx, replies, added } = mkItx();
    const handled = await rules.handleButton(BOT.id, itx);
    check('bouton reconnu et traité', handled === true && replies.length === 1);
    check('le rôle est donné au membre', added.length === 1 && added[0] === 'r1', JSON.stringify(added));
    check('réponse éphémère, avec les variables du texte perso remplies', replies[0].ephemeral === true && replies[0].content.includes('Carré RP'), replies[0].content);
    check('l acceptation est comptabilisée', rules.stateOf(G).count === 1 && rules.stateOf(G).members[0].id === 'u1');
  }
  {
    // Sans texte perso, le message par défaut doit citer le rôle donné.
    const saved = rules.cfgOf(G).thanks;
    rules.saveCfg(G, { thanks: '' });
    const { itx, replies, added } = mkItx({ id: 'u1b' });
    await rules.handleButton(BOT.id, itx);
    check('le remerciement par défaut nomme le rôle accordé', /Membre/.test(replies[0].content) && added[0] === 'r1', replies[0].content);
    rules.saveCfg(G, { thanks: saved });
  }
  {
    const before = rules.stateOf(G).count;
    const { itx, added } = mkItx({ hasRoles: [['r1', { id: 'r1', name: 'Membre', position: 2 }]] });
    await rules.handleButton(BOT.id, itx);
    check('déjà vérifié → aucun second rôle ajouté', added.length === 0 && rules.stateOf(G).count === before, JSON.stringify(added));
  }
  {
    const { itx, replies } = mkItx({ guild: null, member: null });
    await rules.handleButton(BOT.id, itx);
    check('hors serveur (MP) → refus poli', replies[0].content.includes('serveur'));
  }
  {
    const { itx, replies, added } = mkItx({ id: 'u2' });
    rules.saveCfg(G, { enabled: false });
    await rules.handleButton(BOT.id, itx);
    check('module désactivé → le rôle n est pas donné', replies[0].content.includes('désactivé') && added.length === 0);
    rules.saveCfg(G, { enabled: true });
  }
  {
    const { itx, replies } = mkItx({ id: 'u3' });
    rules.saveCfg(G, { role: 'rPerdu' });
    await rules.handleButton(BOT.id, itx);
    check('rôle configuré mais supprimé sur Discord → avertissement', replies[0].content.includes('introuvable'));
    rules.saveCfg(G, { role: 'r1' });
  }
  {
    const meNoPerm = { id: 'botUser', permissions: { has: () => false }, roles: { highest: { position: 10 } } };
    const guildSansPerm = guildMock({
      channels: { ch1: textChannel({ id: 'ch1' }) },
      roles: { r1: { id: 'r1', name: 'Membre', position: 2 } },
      me: { highest: { position: 10 }, permissions: { has: () => false } },
    });
    guildSansPerm.members.me = meNoPerm;
    const { itx, replies } = mkItx({ guild: guildSansPerm, id: 'u4' });
    await rules.handleButton(BOT.id, itx);
    check('bot sans la permission « Gérer les rôles » → on le dit', /Gérer les rôles/.test(replies[0].content));
  }
  {
    const guildBas = guildMock({
      channels: { ch1: textChannel({ id: 'ch1' }) },
      roles: { r1: { id: 'r1', name: 'Membre', position: 40 } },
      me: { highest: { position: 3 }, permissions: { has: () => true } },
    });
    const { itx, replies } = mkItx({ guild: guildBas, id: 'u5', grantThrows: true });
    await rules.handleButton(BOT.id, itx);
    check('rôle au-dessus du bot → on explique la hiérarchie', /AU-DESSUS/.test(replies[0].content));
  }
  {
    const guildManaged = guildMock({
      channels: { ch1: textChannel({ id: 'ch1' }) },
      roles: { r1: { id: 'r1', name: 'Bot', position: 2, managed: true } },
      me: { highest: { position: 10 }, permissions: { has: () => true } },
    });
    const { itx, replies, added } = mkItx({ guild: guildManaged, id: 'u6' });
    await rules.handleButton(BOT.id, itx);
    check('rôle géré par une intégration → refus explicite', /intégration/.test(replies[0].content) && added.length === 0);
  }
  {
    const { itx } = mkItx({ customId: 'hxver:1:human' });
    check('un customId d un autre module n est pas volé', (await rules.handleButton(BOT.id, itx)) === false);
  }

  // ==========================================================
  console.log('\n— 5. Journal des acceptations et liste d appel —');
  {
    const before = rules.stateOf(G).count;
    rules.noteAcceptation(G, { id: 'u1', tag: 'leo#0001' });
    check('un même membre ne compte qu une fois', rules.stateOf(G).count === before);
    rules.noteAcceptation(G, { id: 'u9', tag: 'zoe#0009' });
    check('un nouveau membre incrémente le compteur', rules.stateOf(G).count === before + 1);
    for (let i = 0; i < rules.HISTORY_CAP + 40; i += 1) rules.noteAcceptation(G, { id: 'x' + i, tag: 'x' + i });
    check('historique plafonné (pas de croissance infinie de la base)', rules.stateOf(G).members.length <= rules.HISTORY_CAP,
      String(rules.stateOf(G).members.length));
    rules.resetAcceptations(G);
    check('remise à zéro vide le compteur', rules.stateOf(G).count === 0 && rules.stateOf(G).members.length === 0);
  }
  {
    const members = {
      m1: { id: 'm1', user: { id: 'm1', tag: 'a#1', bot: false }, roles: { cache: new Map() }, joinedTimestamp: 10 },
      m2: { id: 'm2', user: { id: 'm2', tag: 'b#2', bot: false }, roles: { cache: new Map([['r1', {}]]) }, joinedTimestamp: 20 },
      m3: { id: 'm3', user: { id: 'm3', tag: 'bot#3', bot: true }, roles: { cache: new Map() }, joinedTimestamp: 30 },
    };
    const g2 = guildMock({ roles: { r1: { id: 'r1', name: 'Membre', position: 2 } }, members });
    const out = await rules.missingMembers(BOT.id, g2);
    check('liste d appel : seulement les membres SANS le rôle, jamais les bots', out.total === 1 && out.members[0].id === 'm1', JSON.stringify(out));
    const g3 = guildMock({ roles: {} });
    const out3 = await rules.missingMembers(BOT.id, g3);
    check('rôle introuvable → message d erreur, pas de crash', typeof out3.error === 'string' && out3.error.length > 10);
    const out4 = await rules.missingMembers(BOT.id, g2);
    check('la liste relue utilise toujours le rôle configuré', out4.total === 1);
  }

  // ==========================================================
  console.log('\n— 6. Sondage : les limites sont celles de Discord —');
  check('constantes reprises de la doc (300 / 55 / 10 / 1-768 h)', polls.QUESTION_MAX === 300 && polls.ANSWER_MAX === 55
    && polls.ANSWER_LIMIT === 10 && polls.DURATION_MIN_H === 1 && polls.DURATION_MAX_H === 768);
  {
    const vide = polls.validate({ question: '', options: [] }, { channel: 'ch2', duration: 24 });
    check('question vide + pas assez de choix → erreurs sur les deux champs', !vide.ok && vide.errors.question && vide.errors.options);
    const long = polls.validate({ question: 'a'.repeat(400), options: ['oui', 'non'] }, { channel: 'ch2', duration: 24 });
    check('question tronquée à 300 caractères (jamais de rejet Discord)', long.value.question.length === 300);
    const many = polls.validate({ question: 'Q ?', options: Array.from({ length: 16 }, (_, i) => 'choix ' + i) }, { channel: 'ch2', duration: 24 });
    check('plus de 10 choix → on garde les 10 premiers, Discord est content', many.value.options.length === 10 && many.ok);
    const dup = polls.validate({ question: 'Q ?', options: ['Pizza', 'pizza ', 'Burger', '   ', ''] }, { channel: 'ch2', duration: 24 });
    check('doublons (majuscules/espaces) et lignes vides écartés', dup.value.options.length === 2, dup.value.options.join('|'));
    const longAns = polls.validate({ question: 'Q ?', options: ['b'.repeat(90), 'non'] }, { channel: 'ch2', duration: 24 });
    check('un choix trop long est coupé à 55, pas supprimé', longAns.value.options[0].length === 55);
    const noChan = polls.validate({ question: 'Q ?', options: ['a', 'b'], channel: '' }, { channel: '', duration: 24 });
    check('aucun salon → on refuse avant d appeler Discord', !noChan.ok && !!noChan.errors.channel);
  }
  {
    const v = polls.validate({ question: 'On joue à quoi ?', options: ['RP', 'Jeux'], duration: 72, allow_multiselect: true }, { channel: 'ch2', duration: 24, allow_multiselect: false, intro: '' });
    const payload = polls.buildPayload(v.value);
    check('le message porte le champ poll et rien d autre', Object.keys(payload).sort().join(',') === 'content,poll', Object.keys(payload).join(','));
    check('aucun embed ni composant : Discord les refuse avec un sondage', payload.embeds === undefined && payload.components === undefined);
    check('question et réponses au format API exact', payload.poll.question.text === 'On joue à quoi ?'
      && payload.poll.answers.length === 2 && payload.poll.answers.every((a) => typeof a.text === 'string' && a.text.length <= 55));
    check('durée en heures et multiselect transmis', payload.poll.duration === 72 && payload.poll.allowMultiselect === true);
    check('le texte annonce la date de fin réelle', /jusqu'au \d{2}\/\d{2} à \d{2}:\d{2}/.test(payload.content), payload.content);
    check('le texte reste sous la limite de 2000 caractères', payload.content.length <= 2000);
    const gros = polls.buildPayload({ question: 'Q'.repeat(300), intro: 'i'.repeat(2000), options: ['a', 'b'], duration: 24, allowMultiselect: false });
    check('intro démesurée → la question et l échéance passent quand même', gros.content.length <= 2000 && gros.content.includes('Q'.repeat(50)));
  }

  // ==========================================================
  console.log('\n— 7. Publication, résultats, clôture —');
  {
    const chPoll = textChannel({
      id: 'ch2', name: 'sondages',
      permissionsFor: () => ({ has: () => true }),
    });
    const g2 = guildMock({ channels: { ch2: chPoll }, roles: {}, me: { permissions: { has: () => true }, highest: { position: 5 } } });
    polls.saveCfg(G, { enabled: false });
    let off = '';
    try { await polls.sendPoll(BOT.id, g2, { question: 'Q ?', options: ['a', 'b'], channel: 'ch2' }); } catch (e) { off = e.code; }
    check('module désactivé → aucune publication (MODULE_OFF)', off === 'MODULE_OFF' && chPoll.sent.length === 0);
    polls.saveCfg(G, { enabled: true, channel: 'ch2', duration: 24, allow_multiselect: false, intro: '', results_channel: '' });
    const r = await polls.sendPoll(BOT.id, g2, { question: 'On mange quoi ?', options: ['Pizza', 'Burger', 'Sushi'], duration: 24, channel: 'ch2' });
    check('sondage publié via le champ poll', chPoll.sent.length === 1 && !!r.message.id && !!chPoll.sent[0].poll);
    check('l identifiant du message est un snowflake utilisable', /^\d{15,25}$/.test(r.message.id), r.message.id);
    check('l enregistrement garde la date de fin', (() => {
      const row = polls.find(G, r.message.id);
      return row && row.ends_at > Date.now() && row.options.length === 3 && row.closed === false;
    })());
    check('le sondage ouvert entre dans l index du scheduler', polls.openIndex().some((row) => row.message_id === r.message.id));
    check('la config se souvient du dernier message publié', polls.cfgOf(G).last_message === r.message.id);
  }
  {
    // Permissions : le bot ne peut pas créer de sondage dans ce salon.
    const chBloque = textChannel({ id: 'ch3', name: 'strict', permissionsFor: () => ({ has: (flag) => flag !== SEND_POLLS }) });
    const g3 = guildMock({ channels: { ch3: chBloque }, me: { permissions: { has: () => true } } });
    let err = null;
    try { await polls.sendPoll(BOT.id, g3, { question: 'Q ?', options: ['a', 'b'], channel: 'ch3' }); } catch (e) { err = e; }
    check('sans la permission « Créer des sondages » → on nomme la permission manquante',
      !!err && err.code === 'NO_PERMS' && /sondages/.test(err.message), err && err.message);
  }
  {
    // Résultats relus depuis Discord (pas depuis notre cache).
    const chPoll = textChannel({ id: 'ch2', name: 'sondages', permissionsFor: () => ({ has: () => true }) });
    const g4 = guildMock({ channels: { ch2: chPoll }, me: { permissions: { has: () => true } } });
    const r = await polls.sendPoll(BOT.id, g4, { question: 'Filtre ?', options: ['Oui', 'Non'], duration: 1, channel: 'ch2' });
    const message = chPoll.stored.get(r.message.id);
    message.poll = {
      question: { text: 'Filtre ?' }, allowMultiselect: false, resultsFinalized: false, expiresTimestamp: Date.now() + 3600000,
      answers: new Map([[1, { id: 1, text: 'Oui', voteCount: 7, voters: { fetch: async () => new Map([['u1', { id: 'u1', tag: 'leo#1', bot: false, displayAvatarURL: () => 'https://cdn/x.png' }]]) } }],
        [2, { id: 2, text: 'Non', voteCount: 3, voters: { fetch: async () => new Map() } }]]),
      end: async () => { message.poll.resultsFinalized = true; return message; },
    };
    const live = await polls.results(BOT.id, g4, r.message.id);
    check('comptages lus à la source, triés par answer_id', live.counts.join(',') === '7,3' && live.total === 10, JSON.stringify(live.counts));
    check('lien direct vers le message Discord', live.link.includes(`/channels/${g4.id}/ch2/${r.message.id}`));
    check('sondage encore ouvert = closed faux', live.closed === false && live.finalized === false);
    const voters = await polls.voters(BOT.id, g4, r.message.id, 1, 100);
    check('liste des votants d un choix', voters.length === 1 && voters[0].tag === 'leo#1');
    const noAnswer = await polls.voters(BOT.id, g4, r.message.id, 9);
    check('réponse inconnue → liste vide, jamais d exception', Array.isArray(noAnswer) && noAnswer.length === 0);
    const fin = await polls.endPoll(BOT.id, g4, r.message.id);
    check('clôture : poll.end() appelé, totaux conservés', fin.counts.join(',') === '7,3' && polls.find(G, r.message.id).closed === true);
    check('sondage clôturé sort de l index', !polls.openIndex().some((row) => row.message_id === r.message.id));
    let twice = '';
    try { await polls.endPoll(BOT.id, g4, r.message.id); } catch (e) { twice = e.code; }
    check('double clôture refusée proprement', twice === 'ALREADY_CLOSED');
    const bilan = polls.resultsMarkdown(polls.find(G, r.message.id), { counts: [7, 3], total: 10, closed: true, finalized: true });
    check('le bilan publié classe les choix et affiche les pourcentages', bilan.indexOf('Oui') < bilan.indexOf('Non') && bilan.includes('70 %') && bilan.length <= 2000, bilan.slice(0, 60));
  }
  {
    // Bilan automatique dans un salon de résultats.
    const chResults = textChannel({ id: 'ch4', name: 'resultats' });
    const chPoll = textChannel({ id: 'ch2', name: 'sondages', permissionsFor: () => ({ has: () => true }) });
    const g5 = guildMock({ channels: { ch2: chPoll, ch4: chResults }, me: { permissions: { has: () => true } } });
    polls.saveCfg(G, { results_channel: 'ch4', auto_report: true });
    const r = await polls.sendPoll(BOT.id, g5, { question: 'Récap ?', options: ['A', 'B'], duration: 1, channel: 'ch2' });
    const message = chPoll.stored.get(r.message.id);
    message.poll = {
      question: { text: 'Récap ?' }, allowMultiselect: false, resultsFinalized: true, expiresTimestamp: Date.now() - 1000,
      answers: new Map([[1, { id: 1, text: 'A', voteCount: 4, voters: { fetch: async () => new Map() } }], [2, { id: 2, text: 'B', voteCount: 1, voters: { fetch: async () => new Map() } }]]),
      end: async () => message,
    };
    // On fait avancer l'horloge pour le seul enregistrement du bilan : la
    // tâche périodique ne traite que les sondages dont l'échéance est passée.
    polls.patchEntry(G, r.message.id, { ends_at: Date.now() - 1000 });
    const nb = await polls.sweepExpired(BOT.id, g5);
    check('échéance dépassée → bilan envoyé dans le salon des résultats', nb === 1 && chResults.sent.length === 1, String(nb));
    check('le bilan cite la question et classe les choix', /Récap \?/.test(chResults.sent[0].content)
      && chResults.sent[0].content.indexOf('A') < chResults.sent[0].content.indexOf('B'), chResults.sent[0].content);
    check('le bilan annonce le décompte définitif', /Clôturé/.test(chResults.sent[0].content));
    // Message supprimé entre-temps : le bilan doit rester silencieux, pas fatal.
    const g6 = guildMock({ channels: { ch2: textChannel({ id: 'ch2', fetchRejects: true }) }, me: { permissions: { has: () => true } } });
    polls.remember(G, { message_id: '999999999999999999', channel_id: 'ch2', question: 'Fantôme', options: ['A', 'B'], ends_at: 1, closed: false, created_at: 1 });
    const nb2 = await polls.sweepExpired(BOT.id, g6);
    check('sondage dont le message a été supprimé → aucun plantage', nb2 === 0);
    polls.forget(G, '999999999999999999');
    check('oubli de l historique local', polls.find(G, '999999999999999999') === null);
  }

  // ==========================================================
  console.log('\n— 8. Câblage dans le projet —');
  const bm = lire('server/discord/botManager.js');
  check('botManager route le bouton des règles', bm.includes("startsWith('hxrules:')") && bm.includes("require('./rules').handleButton"));
  check('botManager expose les deux permissions utiles au diagnostic', /manageRoles: has\(F\.ManageRoles\)/.test(bm) && /sendPolls:/.test(bm));
  const inv = lire('server/discord/invite.js');
  check('le lien d invitation demande la permission « Créer des sondages »', inv.includes('F.SendPolls'));
  const tk = lire('server/discord/tasks.js');
  check('le scheduler vérifie les sondages échus (30 s)', tk.includes("require('./polls').sweepDue"));
  const rt = lire('server/routes.js');
  const ROUTES = ['guilds/:guildId/rules', 'guilds/:guildId/rules/panel', 'guilds/:guildId/rules/panel/delete',
    'guilds/:guildId/rules/missing', 'guilds/:guildId/rules/reset', 'guilds/:guildId/polls',
    'guilds/:guildId/polls/send', 'guilds/:guildId/polls/results', 'guilds/:guildId/polls/end',
    'guilds/:guildId/polls/voters', 'guilds/:guildId/polls/forget'];
  for (const route of ROUTES) {
    const bloc = rt.slice(rt.indexOf(`'/bots/:id/${route}'`) - 60, rt.indexOf(`'/bots/:id/${route}'`) + 700);
    check(`route ${route} : authentifiée ET réservée au gestionnaire du serveur`,
      rt.includes(`'/bots/:id/${route}'`) && bloc.includes('requireAuth') && bloc.includes('userCanManageGuild'), bloc.slice(0, 60));
  }
  check('publication plafonnée par un limiteur dédié', /rules\/panel', requireAuth, discordPublishRateLimit/.test(rt) && /polls\/send', requireAuth, discordPublishRateLimit/.test(rt));
  check('bot hors ligne → 503 explicite, pas de fausse promesse', (rt.match(/Bot hors ligne, réessayez dans une minute/g) || []).length >= 6);
  const KEYS_I18N = ['rules_title', 'rules_footer', 'rules_button', 'rules_off', 'rules_no_channel', 'rules_need_guild',
    'rules_already', 'rules_no_role', 'rules_no_manage_roles', 'rules_managed_role', 'rules_role_position',
    'rules_grant_failed', 'rules_thanks', 'polls_off', 'polls_no_channel'];
  for (const key of KEYS_I18N) {
    const fr = i18n.t('fr', key);
    const en = i18n.t('en', key);
    check(`i18n : ${key} existe en français et en anglais`, fr !== key && en !== key && fr !== en, `${fr} / ${en}`);
  }

  // ==========================================================
  console.log('\n— 9. Catalogue et émoticônes du dashboard —');
  const dash = lire('public/js/dashboard.js');
  const META = (dash.match(/Dashboard\.MODULE_META = \{([\s\S]*?)\n\};/) || [0, ''])[1];
  // Une fiche = du marqueur du module jusqu'au marqueur suivant (même découpage
  // que v361 : les fiches se terminent en ligne par « } }, », pas par « } » seul).
  const ficheDe = (id) => {
    const debut = META.indexOf(`\n  ${id}: { e:`);
    if (debut === -1) return '';
    const suite = META.slice(debut + 1);
    const suivant = suite.slice(1).search(/\n {2}[a-z]+: \{ e:/);
    return suivant === -1 ? suite : suite.slice(0, suivant + 1);
  };
  for (const id of ['polls', 'rules']) {
    const fiche = ficheDe(id);
    check(`le module ${id} a sa fiche au catalogue`, fiche.length > 60, `${fiche.length} caractères`);
    for (const champ of ['emote', 'cat', 'tag', 'aide', 'voit', 'slash']) {
      check(`  …avec le champ « ${champ} »`, fiche.includes(`${champ}: `));
    }
    check(`  …et une émoticône qui lui est propre`, /emote: 'hox_(poll|rules)'/.test(fiche));
    check(`  …et son renderer existe`, dash.includes(`Dashboard.renderers.${id} =`));
    check(`  …et une entrée dans le menu latéral`, new RegExp(`\\['${id}', '`).test(dash));
  }
  for (const nom of ['hox_poll', 'hox_rules']) {
    for (const dossier of ['public/emotes', 'server/assets/emotes']) {
      const p = path.join(__dirname, '..', dossier, `${nom}.png`);
      let buff = null;
      try { buff = fs.readFileSync(p); } catch {}
      check(`${dossier}/${nom}.png est un vrai PNG 128 × 128`,
        !!buff && buff.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        && buff.readUInt32BE(16) === 128 && buff.readUInt32BE(20) === 128);
      check(`…et sous la limite Discord de 256 Ko`, !!buff && buff.length < 256 * 1000, buff ? String(buff.length) : 'absent');
    }
  }
  check('les deux modules sont rangés dans une famille du menu', /cat: 'vie'/.test(META) && ['polls', 'rules'].every((id) => new RegExp(`\\n  ${id}: \\{[\\s\\S]*?cat: '`).test(META)));
  check('aucun texte du catalogue nouveau ne tutoie', !TU.test(META.slice(META.indexOf('\n  polls: {'), META.indexOf('\n  polls: {') + 1600))
    && !TU.test(META.slice(META.indexOf('\n  rules: {'), META.indexOf('\n  rules: {') + 1600)));

  // ---------- Le rendu réel, dans un navigateur simulé ----------
  // Les deux écrans sont montés pour de vrai (jsdom), et l'on vérifie ce qui
  // part au serveur quand on clique : le front doit parler aux routes réelles.
  console.log('\n— 10. Les deux écrans, rendus et branchés —');
  try {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
      url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window;
    global.window = w; global.document = w.document;
    Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true });
    global.location = w.location;
    w.fetch = async (url) => {
      const p = String(url).split('?')[0];
      const resp = (body) => ({ ok: true, status: 200, json: async () => body });
      if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', discord_username: 'a', is_admin: true } });
      if (p.endsWith('/api/hoxera')) return resp({ configured: true, bot: { id: 1, name: 'Hoxera', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Hoxera#1', guilds: [] } });
      if (p.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }] });
      return resp({ ok: true });
    };
    const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
      .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
    const snippet = String.raw`
  window.__r = (async () => {
    const out = { appels: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1600);
    if (typeof Dashboard === 'undefined' || !Dashboard.renderers) return { erreur: 'Dashboard absent' };
    const D = Dashboard;

    // 1. Le Markdown de l'aperçu : balises Discord, et rien d'autre.
    const brut = '# Titre\n## Sous-titre\n**gras** et *italique* et __soulign__ et ~~barr~~\n> citation\n- premier\n- second\n||secret|| avec \`code\`\n━\n<img src=x onerror="alert(1)"> <script>boom()</script>\n<@&123456789012345678> et <#234567890123456789>';
    out.md = D.discordMarkdownHtml(brut);
    out.mdVide = D.discordMarkdownHtml('   ');

    // 2. Le widget de sondage de l'aperçu.
    out.poll = D.discordPollHtml({ question: 'On mange quoi ?', options: ['Pizza', 'Sushi', 'Rien'], duration: 24, counts: [3, 1, 0], total: 4 });
    out.pollClos = D.discordPollHtml({ question: 'Q', options: ['a', 'b'], counts: [2, 1], closed: true, duration: 1 });

    // 3. Les aperçus du catalogue passent bien par ces deux rendus.
    out.catApercuPoll = D.discordPreviewHtml((D.MODULE_META.polls || {}).apercu);
    out.catApercuRules = D.discordPreviewHtml((D.MODULE_META.rules || {}).apercu);

    // 4. Écran « Règles » : montage, aperçu vivant, ce qui est envoyé.
    D.state.bot = { id: 1, name: 'Hoxera' };
    D.state.guildId = 'G1';
    const donnees = {
      guild: { name: 'Serveur Test' },
      channels: [{ id: 'C1', name: 'règles' }, { id: 'C2', name: 'bilans' }],
      roles: [{ id: 'R1', name: 'Membre' }, { id: 'R2', name: 'vérifié' }],
      rules: {
        enabled: true, channel: 'C1', role: 'R2', title: 'Règlement', body: '**1.** Poli.\n**2.** Gentil sur {serveur}.',
        color: '#5865F2', button_label: 'J’accepte les règles', button_style: 'vert',
        footer: 'Le rôle {role} est donné.', thanks: '', log_channel: 'C2', panel_message: '1712345678901234567',
        panel_channel: 'C1', accepts: 3, last_at: Date.now(), recent: [{ id: '9', tag: 'leo#0001', at: Date.now() }],
        presets: [{ id: 'essentiel', label: 'Lessentiel', text: '1. Respect' }, { id: 'gaming', label: 'Gaming', text: 'GG' }],
        using_default: false,
      },
      polls: {
        enabled: true, channel: 'C2', duration: 48, allow_multiselect: true, intro: 'Votez !',
        results_channel: '', auto_report: true,
        list: [{ message_id: '1712345678901234570', question: 'Quel film ?', channel_name: 'vie', created_at: Date.now(), ends_at: Date.now() + 3600000, closed: false, total: 5, counts: [3, 2], options: ['A', 'B'] }],
        open: 1,
      },
    };
    const fetchOriginal = window.fetch;
    window.fetch = async (url, options) => {
      out.appels.push({ url: String(url), methode: (options && options.method) || 'GET', corps: options && typeof options.body === 'string' ? JSON.parse(options.body) : null });
      return { ok: true, status: 200, json: async () => ({ cfg: {}, mode: 'send', message_id: '1712345678901234599', ok: true }) };
    };

    const c1 = document.createElement('div');
    document.body.appendChild(c1);
    await D.renderers.rules(c1, donnees);
    out.rulesCartes = c1.querySelectorAll('.dash-card').length;
    out.rulesEmbed = !!c1.querySelector('#rl-preview .dprev-embed');
    out.rulesTitre = (c1.querySelector('#rl-preview .dprev-title') || {}).textContent || '';
    out.rulesHtml = ((c1.querySelector('#rl-preview .dmd') || {}).innerHTML || '');
    out.rulesPied = ((c1.querySelector('#rl-preview .dprev-foot') || {}).textContent || '').trim();
    out.rulesBouton = ((c1.querySelector('#rl-preview .dprev-btn') || {}).textContent || '').trim();
    out.rulesCompteur = ((c1.querySelector('#rl-count') || {}).textContent || '').trim();
    out.rulesActiver = !!c1.querySelector('#rl-enabled');
    out.rulesSalon = c1.querySelector('#rl-channel').options.length;
    out.rulesRole = c1.querySelector('#rl-role').options.length;
    out.rulesModeles = c1.querySelectorAll('[data-preset]').length;
    out.rulesPublie = ((c1.querySelector('#rl-send') || {}).textContent || '').trim();
    out.rulesSuivi = ((c1.querySelector('#rl-etat') || {}).textContent || '');
    out.rulesSaveClasse = !!c1.querySelector('#rl-save.dash-save-action');
    // on change le titre : l'aperçu doit suivre
    c1.querySelector('#rl-title').value = 'Règlement du samedi';
    c1.querySelector('#rl-title').oninput();
    out.rulesApercuVivant = ((c1.querySelector('#rl-preview .dprev-title') || {}).textContent || '').trim();
    c1.querySelector('#rl-save').click();
    await wait(150);
    c1.querySelector('#rl-send').click();
    await wait(200);
    out.rulesAppels = out.appels.slice();

    // 5. Écran « Sondages » : construction, aperçu, publication.
    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    await D.renderers.polls(c2, donnees);
    out.pollsCartes = c2.querySelectorAll('.dash-card').length;
    out.pollsLignes = c2.querySelectorAll('.pp-row').length;
    out.pollsChoix = c2.querySelectorAll('#pp-opts input').length;
    c2.querySelector('#pp-add').click();
    {
      const cases = c2.querySelectorAll('#pp-opts input[data-idx]');
      cases[2].value = 'On s’en fiche';
      cases[2].oninput();
    }
    out.pollsChoixApres = c2.querySelectorAll('#pp-opts input').length;
    c2.querySelector('#pp-question').value = 'On mange quoi samedi ?';
    c2.querySelector('#pp-question').oninput();
    out.pollsQuestion = ((c2.querySelector('#pp-preview .dpp-question') || {}).textContent || '').trim();
    out.pollsBarres = c2.querySelectorAll('#pp-preview .dpp-row').length;
    out.pollsDuree = ((c2.querySelector('#pp-preview .dpp-foot') || {}).textContent || '');
    out.pollsMulti = !!c2.querySelector('#pp-multi').checked;
    out.pollsSaveClasse = !!c2.querySelector('#pp-save.dash-save-action');
    c2.querySelector('#pp-duration').value = '72';
    c2.querySelector('#pp-duration').onchange();
    out.pollsDureeApres = ((c2.querySelector('#pp-preview .dpp-foot') || {}).textContent || '');
    c2.querySelector('#pp-send').click();
    await wait(200);
    c2.querySelector('#pp-save').click();
    await wait(200);
    out.pollsAppels = out.appels.slice(out.rulesAppels.length);
    window.fetch = fetchOriginal;
    return out;
  })();
  `;
    w.eval(code + '\n;\n' + snippet);
    await new Promise((r) => setTimeout(r, 12000));
    const res = await w.__r;
    check('le navigateur simulé a rendu les deux écrans', !!res && !res.erreur, res && res.erreur);
    if (res && !res.erreur) {
      check('le Markdown de l’aperçu rend gras, italique, souligné, barré',
        /<b>gras<\/b>/.test(res.md) && /<i>italique<\/i>/.test(res.md) && /<u>soulign<\/u>/.test(res.md) && /<s>barr<\/s>/.test(res.md), res.md.slice(0, 160));
      check('…code, citation, liste, titres, séparateur et spoiler',
        /<code>code<\/code>/.test(res.md) && /<blockquote/.test(res.md)
        && /<ul class="dmd-list">[\s\S]*<li>premier<\/li><li>second<\/li>/.test(res.md)
        && /<div class="dmd-h1">Titre<\/div>/.test(res.md) && /<div class="dmd-h2">Sous-titre<\/div>/.test(res.md)
        && /<hr class="dmd-sep"/.test(res.md) && /dmd-spoiler">secret</.test(res.md), res.md.slice(0, 220));
      check('le HTML ennemi reste inoffensif dans l’aperçu',
        !/<img/i.test(res.md) && !/<script/i.test(res.md) && /&lt;img/.test(res.md), res.md.slice(0, 200));
      check('les mentions r\u00f4le et salon deviennent des pastilles',
        /dmd-mention">rôle sélectionné</.test(res.md) && /dmd-mention">#salon sélectionné</.test(res.md));
      check('une zone vide ne casse pas le rendu', /dmd-empty/.test(res.mdVide));
      check('l’aperçu du sondage dessine les choix, les votes et la durée',
        /dpp-row/.test(res.poll) && /On mange quoi \?/.test(res.poll) && /3 vote\(s\)|4 vote\(s\)/.test(res.poll)
        && /se termine dans 1 jour/.test(res.poll), res.poll.replace(/\s+/g, ' ').slice(0, 200));
      check('…et le décompte fermé affiche ses barres',
        /is-closed/.test(res.pollClos) && /dpp-bar/.test(res.pollClos) && /Sondage clôturé/.test(res.pollClos));
      check('la fiche du catalogue affiche le widget dans son aperçu',
        /dprev-poll/.test(res.catApercuPoll) && /Soirée cin/.test(res.catApercuPoll) && /dprev-btn/.test(res.catApercuRules));
      check('l’écran Règles monte ses deux cartes, son aperçu et son bouton',
        res.rulesCartes === 2 && res.rulesEmbed === true && /Règlement/.test(res.rulesTitre)
        && /J’accepte/.test(res.rulesBouton), `${res.rulesCartes} cartes · ${res.rulesTitre}`);
      check('le texte est rendu avec ses balises et son compteur',
        /<b>1\.<\/b>\s*Poli\./.test(res.rulesHtml) && /\/3000/.test(res.rulesCompteur), res.rulesCompteur + ' · ' + res.rulesHtml.slice(0, 80));
      check('l’aperçu remplace les marqueurs comme le serveur le fera',
        res.rulesHtml.includes('Serveur Test') && !/\{serveur\}/.test(res.rulesHtml)
        && /vérifié/.test(res.rulesPied) && !/\{role\}/.test(res.rulesPied), `${res.rulesHtml.slice(0, 90)} · ${res.rulesPied}`);
      check('l’aperçu suit la frappe, comme dans les tickets',
        /Règlement du samedi/.test(res.rulesApercuVivant), res.rulesApercuVivant);
      check('le module s’active par une case, les salons et rôles sont choisis ici',
        res.rulesActiver === true && res.rulesSalon >= 3 && res.rulesRole >= 3, `${res.rulesSalon} salons · ${res.rulesRole} rôles`);
      check('les modèles livrés sont propos\u00e9s au clic', res.rulesModeles >= 2, String(res.rulesModeles));
      check('un panneau d\u00e9j\u00e0 publi\u00e9 est suivi et propos\u00e9 \u00e0 la mise \u00e0 jour',
        /Mettre \u00e0 jour le panneau/.test(res.rulesPublie) && /identifiant|suivi/.test(res.rulesSuivi || ''), `${res.rulesPublie} · ${res.rulesSuivi}`);
      check('enregistrer et publier appellent les routes du serveur',
        res.rulesAppels.some((a) => a.url.endsWith('/bots/1/guilds/G1/rules') && a.methode === 'PUT')
        && res.rulesAppels.some((a) => a.url.endsWith('/rules/panel') && a.methode === 'POST'),
        res.rulesAppels.map((a) => `${a.methode} ${a.url}`).join(' | '));
      check('le corps envoy\u00e9 porte les r\u00e9glages du panneau',
        (res.rulesAppels.find((a) => a.methode === 'PUT') || {}).corps
        && res.rulesAppels.find((a) => a.methode === 'PUT').corps.title === 'R\u00e8glement du samedi'
        && res.rulesAppels.find((a) => a.methode === 'PUT').corps.role === 'R2', JSON.stringify((res.rulesAppels.find((a) => a.methode === 'PUT') || {}).corps));
      check('l’écran Sondage monte ses trois cartes et son historique',
        res.pollsCartes === 3 && res.pollsLignes === 1, `${res.pollsCartes} cartes · ${res.pollsLignes} lignes`);
      check('les choix s’ajoutent \u00e0 la demande, avec un minimum de deux',
        res.pollsChoix === 2 && res.pollsChoixApres === 3, `${res.pollsChoix} → ${res.pollsChoixApres}`);
      check('la question tapée apparaît dans l’aperçu du widget',
        /On mange quoi samedi/.test(res.pollsQuestion) && res.pollsBarres === 3, res.pollsQuestion + ' · ' + res.pollsBarres + ' lignes');
      check('la durée choisie est dite en clair sous le sondage',
        /se termine dans 3 jour/.test(res.pollsDureeApres) && /jour\(s\)/.test(res.pollsDureeApres), res.pollsDureeApres.replace(/\s+/g, ' '));
      check('le multi-réponse est proposé d\u00e8s la construction', res.pollsMulti === true);
      check('publier envoie question, choix, dur\u00e9e et salon',
        res.pollsAppels.some((a) => /\/polls\/send$/.test(a.url) && a.methode === 'POST'
          && a.corps && a.corps.question === 'On mange quoi samedi ?' && Array.isArray(a.corps.options)
          && a.corps.options.length === 3 && a.corps.duration === 72 && a.corps.channel === 'C2'),
        JSON.stringify((res.pollsAppels.find((a) => /\/polls\/send$/.test(a.url)) || {}).corps));
      check('les r\u00e9glages par défaut passent par la route du module',
        res.pollsAppels.some((a) => /\/polls$/.test(a.url) && a.methode === 'PUT' && a.corps && a.corps.duration === 48),
        res.pollsAppels.map((a) => `${a.methode} ${a.url}`).join(' | '));
      check('les deux \u00e9crans ont un bouton « Enregistrer » rep\u00e9rable par la barre',
        res.rulesSaveClasse === true && res.pollsSaveClasse === true);
    }
    try { dom.window.close(); } catch {}
  } catch (e) {
    check('le navigateur simulé a rendu les deux écrans', false, e.message);
  }
  console.log('');
  if (ko === 0) console.log(`🎉 v362 — ${ok} vérifications OK : règles et sondages tiennent debout.`);
  else { console.log(`❌ v362 — ${ko} échec(s) sur ${ok + ko}`); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
