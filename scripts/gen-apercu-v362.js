// ============================================================================
// v362 — Aperçu comparé des deux nouveaux modules (Règles, Sondages).
//
//   node scripts/gen-apercu-v362.js   →   /home/user/apercu-v362.html
//
// Tout vient du VRAI code :
//   • le payload du panneau de règles est celui que `rules.sendPanel()` remet
//     à Discord (capturé sur un canal fictif), dessiné par notre moteur
//     `scripts/lib/discord-preview.js` ;
//   • l'aperçu du tableau de bord est le HTML produit par le VRAI
//     `Dashboard.renderers.rules` / `.polls`, montés dans jsdom ;
//   • le sondage montre le JSON réellement envoyé à l'API (champ `poll`) :
//     le widget lui-même est dessiné par Discord, personne d'autre.
// ============================================================================
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-apercu362-'));

const RACINE = path.join(__dirname, '..');
const rules = require('../server/discord/rules');
const polls = require('../server/discord/polls');
const { drawPayload, page, esc } = require('./lib/discord-preview');

const GUILD = '405843683950182401';
const CANAL_REGLES = '1712345678901234560';
const ROLE_VERIFIE = '1712345678901234561';
const BOT_ID = 1;

// ---------------------------------------------------------------------------
// 1. Le panneau de règles, côté serveur : ce qui part vraiment sur Discord.
// ---------------------------------------------------------------------------
rules.saveCfg(GUILD, {
  enabled: true,
  channel: CANAL_REGLES,
  role: ROLE_VERIFIE,
  title: 'Règlement du serveur',
  body: rules.PRESETS.gaming.text,
  color: '#B62F43',
  button_label: 'J’accepte les règles',
  button_style: 'vert',
  footer: 'En acceptant, vous rejoignez {role} et vous reconnaissez avoir lu ce règlement.',
  thanks: '✅ Règles acceptées ! Le rôle {roleMention} vient de vous être donné.',
});

const canalFictif = {
  id: CANAL_REGLES,
  name: 'règles',
  send: async (payload) => { envoi.payload = payload; return { id: '1712345678901234566', channel: canalFictif }; },
};
const envoi = { payload: null };
const roleFictif = {
  id: ROLE_VERIFIE, name: 'vérifié', position: 4, permissions: { has: () => true },
  comparePositions: () => 1, members: new Map(),
};
const guildFictif = {
  id: GUILD,
  name: 'Le Comptoir',
  memberCount: 214,
  channels: { cache: new Map([[CANAL_REGLES, canalFictif]]) },
  roles: { cache: new Map([[ROLE_VERIFIE, roleFictif], ['1', { id: '1', name: '@everyone', position: 0 }]]) },
  members: { cache: new Map(), fetch: async () => new Map() },
};

(async () => {
  try { await rules.sendPanel(BOT_ID, guildFictif, ''); } catch (e) { console.error('sendPanel :', e.message); }
  const discordRules = drawPayload(envoi.payload);
  const audit = require('../server/discord/ui').v2Audit(envoi.payload);

  // -------------------------------------------------------------------------
  // 2. Le sondage : le message envoyé à l'API (le widget est dessiné par Discord).
  // -------------------------------------------------------------------------
  const demandePoll = {
    question: 'Soirée cinéma vendredi : quel film ?',
    options: ['Un film d’horreur', 'Un film de science-fiction', 'Un animé pour toute la famille', 'Peu importe, je viens pour l’ambiance'],
    duration: 48,
    allowMultiselect: false,
    intro: 'On doit trancher **jeudi soir** — répondez en un clic, c’est anonymes et ça compte pour tout le monde.',
  };
  const pollVerifie = polls.validate(demandePoll, { channel: '1712345678901234562' });
  if (!pollVerifie.ok) console.error('validation du sondage :', pollVerifie.errors);
  const payloadPoll = polls.buildPayload(pollVerifie.value);

  // -------------------------------------------------------------------------
  // 3. Les aperçus du tableau de bord : les vrais écrans, montés dans jsdom.
  // -------------------------------------------------------------------------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  global.window = w; global.document = w.document;
  Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true });
  global.location = w.location;
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
    .map((f) => fs.readFileSync(path.join(RACINE, 'public', 'js', f), 'utf8')).join('\n;\n');
  const cfgServeur = rules.cfgOf(GUILD);
  const snippet = String.raw`
  window.__r = (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1500);
    if (typeof Dashboard === 'undefined') return null;
    Dashboard.state.bot = { id: 1, name: 'Optimus Prime' };
    Dashboard.state.guildId = '${GUILD}';
    const donnees = ${JSON.stringify({
    guild: { name: 'Le Comptoir' },
    channels: [{ id: CANAL_REGLES, name: 'règles' }, { id: '1712345678901234562', name: 'bilans' }],
    roles: [{ id: '1712345678901234561', name: 'vérifié' }, { id: '1712345678901234563', name: 'Membre' }],
    rules: {
      enabled: true, channel: CANAL_REGLES, role: ROLE_VERIFIE,
      title: 'Règlement du serveur', body: '__corps__', color: '#B62F43',
      button_label: 'J’accepte les règles', button_style: 'vert',
      footer: 'En acceptant, vous rejoignez {role}…', thanks: '', log_channel: '',
      panel_message: '1712345678901234566', panel_channel: CANAL_REGLES,
      accepts: 137, last_at: Date.now(), recent: [{ id: '9', tag: 'nova#0007', at: Date.now() }],
      presets: [], using_default: false,
    },
    polls: {
      enabled: true, channel: '1712345678901234562', duration: 48, allow_multiselect: false,
      intro: '__intro__', results_channel: '', auto_report: true,
      list: [{ message_id: '1712345678901234570', question: demandePoll.question, channel_name: 'soirée',
        created_at: Date.now(), ends_at: Date.now() + 3600000 * 9, closed: false, total: 41,
        counts: [17, 12, 8, 4], options: ['Horreur', 'Science-fiction', 'Animé', 'Peu importe'] }],
      open: 1,
    },
  }).replace('"__corps__"', JSON.stringify(rules.PRESETS.gaming.text)).replace('"__intro__"', JSON.stringify(demandePoll.intro))};
    const out = {};
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    document.body.appendChild(c1); document.body.appendChild(c2);
    await Dashboard.renderers.rules(c1, donnees);
    await Dashboard.renderers.polls(c2, donnees);
    out.rules = c1.querySelector('#rl-preview').innerHTML;
    out.polls = c2.querySelector('#pp-preview').innerHTML;
    out.pollsCarte = c2.querySelector('.pp-liste').innerHTML;
    out.histo = { cartes: c1.querySelectorAll('.dash-card').length };
    return out;
  })();
  `;
  w.eval(code + '\n;\n' + snippet);
  await new Promise((r) => setTimeout(r, 13000));
  const rendu = await w.__r;
  if (!rendu) throw new Error('rendu dashboard indisponible');

  // -------------------------------------------------------------------------
  // 4. La page de comparaison.
  // -------------------------------------------------------------------------
  const titre = (texte, sous) => `<div style="margin:0 0 8px"><b style="color:#f2f3f5;font-size:15px">${esc(texte)}</b><div style="color:#949ba4;font-size:12.5px">${esc(sous)}</div></div>`;
  const bloc = (legende, note, html) => `
    <div style="flex:1 1 340px;min-width:280px;background:#1e1f22;border:1px solid #2b2d31;border-radius:12px;padding:14px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#878c9a;margin-bottom:8px">${esc(legende)}</div>
      ${html}
      <div style="margin-top:10px;color:#949ba4;font-size:11.5px;line-height:1.5">${note}</div>
    </div>`;
  const ligne = (html) => `<div style="display:flex;gap:14px;flex-wrap:wrap;margin:0 0 22px">${html}</div>`;
  const json = (o) => `<pre style="background:#11121a;border:1px solid #2b2d31;border-radius:8px;padding:10px;color:#c8f5d0;font-size:11px;line-height:1.5;overflow:auto;max-height:260px;margin:0">${esc(JSON.stringify(o, null, 2))}</pre>`;

  const corps = `
  <h1 style="color:#fff;font-size:22px;margin:0 0 4px">📜 Règles &nbsp;·&nbsp; 🗳️ Sondages</h1>
  <p style="color:#949ba4;font-size:13px;margin:0 0 20px">Deux modules du tableau de bord v362. À gauche ce que Discord dessinera d’après le payload produit par le serveur, à droite l’aperçu affiché sous les réglages.</p>

  ${titre('1. Le panneau de règles', 'Publié dans #règles par le bot. Le texte vient du modèle « gaming », les balises Markdown sont conservées telles quelles.')}
  ${ligne(bloc('Rendu Discord (payload réel)',
    `message suivi : <code>${esc(cfgServeur.panel_message || '—')}</code> · audit v2 : ${audit.length ? '<b style="color:#e07a5f">' + esc(JSON.stringify(audit)) + '</b>' : '<b style="color:#3ba55d">aucun dépassement</b>'}`,
    discordRules))}
  ${ligne(bloc('Aperçu du tableau de bord',
    'Dessiné par <code>Dashboard.renderers.rules</code> à partir des champs du formulaire — il se met à jour à chaque frappe.',
    `<div style="background:#313338;border-radius:12px;padding:12px 14px">${rendu.rules}</div>`))}

  <div style="height:26px"></div>
  ${titre('2. Le message privé après un clic', 'Réponse éphémère, visible par le membre seul (i18n français).')}
  ${ligne(bloc('Texte de confirmation',
    'Le rôle est mentionné, donc cliquable, comme sur Discord.',
    `<div style="color:#dbdee1;font-size:14px">✅ Règles acceptées ! Le rôle <span style="background:#5865F23D;color:#dee0fc;border-radius:4px;padding:0 4px">@vérifié</span> vient de vous être donné.</div>`))}

  <div style="height:26px"></div>
  ${titre('3. Le sondage natif', 'Un seul message, un champ <code>poll</code>. Pas d’embed, pas de boutons : le widget appartient à Discord.')}
  ${ligne(bloc('Ce que le bot envoie à l’API',
    'Limites reprises de Discord : 300 caractères de question, 10 choix de 55 caractères, durée de 1 à 768 heures.',
    json(payloadPoll)))}
  ${ligne(bloc('Aperçu du tableau de bord',
    'Imitation du widget, alimentée par les champs : la question, les choix, la durée. Les barres n’apparaissent qu’une fois le vote clos, comme sur Discord.',
    `<div style="background:#313338;border-radius:12px;padding:12px 14px">${rendu.polls}</div>`))}

  <div style="height:26px"></div>
  ${titre('4. Les résultats relus à la source', 'Bouton « Actualiser les résultats » de la carte « Sondages publiés ».')}
  ${ligne(bloc('Historique du module',
    'Le décompte vient de <code>poll.answers[].voteCount</code> ; les votants de <code>answer.voters.fetch()</code>.',
    `<div style="background:#313338;border-radius:12px;padding:12px 14px">${rendu.pollsCarte}</div>`))}

  <p style="color:#878c9a;font-size:12px;margin-top:24px">Généré par <code>scripts/gen-apercu-v362.js</code> — données de démonstration, aucun élément du serveur réel.</p>`;


  // Le CSS des aperçus est relu dans la vraie feuille du tableau de bord :
  // on ne redessine pas une deuxième version « à la main » de ce que voit l’utilisateur.
  const feuille = fs.readFileSync(path.join(RACINE, 'public/css/dashboard.css'), 'utf8');
  const depuisMarker = (marqueur, garde = 0) => {
    const i = feuille.indexOf(marqueur);
    return i < 0 ? -1 : i - garde;
  };
  const dprev = (() => {
    const a = depuisMarker('.dprev { background');
    if (a < 0) return '';
    const b = feuille.indexOf('/* ---------- 5. Familles', a);
    return feuille.slice(a, b < 0 ? feuille.length : b);
  })();
  const v362 = (() => {
    const a = depuisMarker('v362 \u2014 R\u00e8gles & Sondages', 60);
    return a < 0 ? '' : feuille.slice(a);
  })();
  if (!dprev || !v362) console.error('coupe du CSS imparfaite :', { dprev: dprev.length, v362: v362.length });
  const style = `<style>:root{--d-accent:#e07a5f;--d-accent-rgb:224,122,95;--d-dim:#8b8fa3;--d-border:#2a2d3d;--d-text:#e9eaf2;}
  body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}
  ${dprev}
  ${v362}</style>`;
  const entete = `<meta name="color-scheme" content="dark">${style}`;
  const htmlFinal = page('Aperçu v362 — Règles & Sondages', 'Les deux nouveaux modules, payload réel et aperçus du tableau de bord.', corps)
    .replace('</head>', `${entete}</head>`);
  const sortie = '/home/user/apercu-v362.html';
  fs.writeFileSync(sortie, htmlFinal);
  console.log('aperçu écrit :', sortie, `(${(htmlFinal.length / 1024).toFixed(0)} Ko)`);
  console.log('audit v2 du panneau :', audit.length ? JSON.stringify(audit) : 'aucun dépassement');
  try { dom.window.close(); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
