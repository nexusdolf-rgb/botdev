#!/usr/bin/env node
// ============================================================
// Aperçu statique du tableau de bord (v361)
// ------------------------------------------------------------
// Le navigateur de test n'est pas disponible ici : ce script rend donc les
// VRAIS modules dans jsdom (même code, même CSS), récupère le HTML produit,
// et l'écrit dans un fichier autonome : CSS inliné, images en data URI.
// Le fichier s'ouvre tel quel, sans serveur ni réseau.
//
//   node scripts/render-preview.js
//   → maquette-v361-modules.html
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RACINE = path.join(__dirname, '..');
const lus = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const LARGEUR = Number(process.env.PREVIEW_LARGEUR || 1440);

// ---------- HTML → data URI (le visualiseur n'a pas d'accès réseau) ----------
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const enLigne = (html) => html.replace(/(?:src|href)="(\/[^"]+?)"/g, (tout, cible) => {
  const propre = cible.split('?')[0];
  const fichier = path.join(RACINE, 'public', propre.replace(/^\/+/, ''));
  const ext = path.extname(fichier);
  if (!fs.existsSync(fichier) || !MIME[ext]) return tout;
  const base64 = fs.readFileSync(fichier).toString('base64');
  return `src="data:${MIME[ext]};base64,${base64}"`;
});

// ---------- Données simulées : les mêmes que le banc d'audit mobile ----------
const canaux = ['général', 'annonces', 'règles', 'bienvenue', 'staff', 'logs', 'tickets']
  .map((n, i) => ({ id: 'C' + i, name: n, category: false, voice: false }));
canaux.push({ id: 'CAT0', name: 'Tickets', category: true, voice: false });
const roles = [
  { id: 'R1', name: 'Membre', color: '#3ba55d', position: 3, managed: false },
  { id: 'R2', name: 'Modérateur', color: '#fee75c', position: 8, managed: false },
];

const fetchSimule = async (url) => {
  const p = String(url).split('?')[0];
  const resp = (body) => ({ ok: true, status: 200, json: async () => body });
  if (p.endsWith('/api/auth/me')) {
    return resp({ user: { id: 1, email: 'fondateur@exemple.fr', discord_id: 'D1', discord_username: 'Fondateur', is_admin: true } });
  }
  if (p.endsWith('/api/hoxera')) {
    return resp({ configured: true, bot: { id: 1, name: 'Optimus Prime', prefix: '!', online: true, invite_url: 'https://discord.com/oauth2/authorize', status_text: '', avatar_url: '', bot_username: 'Optimus Prime#0001', guilds: [] } });
  }
  if (p.endsWith('/api/discord/guilds')) {
    return resp({ guilds: [{ id: 'G1', name: 'Carré RP', owner: true, canManage: true, hasBot: true, icon: '', members: 1248, banner: '' }] });
  }
  if (p.endsWith('/guilds/G1/advanced-tickets')) return resp({ config: null });
  if (p.endsWith('/guilds/G1/tickets/rating')) return resp({ avg: 4.6, count: 27 });
  if (p.endsWith('/guilds/G1/activity')) return resp({ items: [
    { emoji: '🎫', text: 'Ticket #182 ouvert par Léa — « Problème de rôle »', created_at: new Date(Date.now() - 4 * 60000).toISOString().replace('T', ' ').slice(0, 19) },
    { emoji: '🛡️', text: 'Auto-Mod : message supprimé dans #général (liens)', created_at: new Date(Date.now() - 26 * 60000).toISOString().replace('T', ' ').slice(0, 19) },
    { emoji: '📈', text: 'Nathan a atteint le niveau 12', created_at: new Date(Date.now() - 68 * 60000).toISOString().replace('T', ' ').slice(0, 19) },
  ] });
  if (p.endsWith('/guilds/G1/stats')) return resp({ activity: [{ day: '2026-10-09', messages: 412, members: 3 }, { day: '2026-10-08', messages: 388, members: 1 }], joins: [{ day: '2026-10-09', members: 3 }], top_active: [{ tag: 'lea', messages: 96 }, { tag: 'nathan', messages: 71 }, { tag: 'sofia', messages: 54 }] });
  if (p.endsWith('/guilds/G1/temproles')) return resp({ roles: [] });
  if (p.endsWith('/guilds/G1/shop')) return resp({ items: [] });
  if (p.endsWith('/guilds/G1/shop/purchases')) return resp({ purchases: [] });
  if (p.endsWith('/guilds/G1/suggestions')) return resp({ suggestions: [] });
  if (p.endsWith('/guilds/G1/scheduled')) return resp({ scheduled: [] });
  if (p.endsWith('/guilds/G1/giveaways')) return resp({ giveaways: [] });
  if (p.endsWith('/guilds/G1/modules')) return resp({ modules: [] });
  if (p.endsWith('/guilds/G1')) {
    return resp({
      name: 'Carré RP',
      guild: { id: 'G1', name: 'Carré RP', members: 1248 },
      channels: canaux,
      roles,
      settings: {
        prefix: '!', warn_limit: 2, warn_action: 'timeout', warn_timeout_min: 60,
        xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60,
        xp_message: 'Bravo {user}, niveau {level} !', xp_channel: 'C0',
        am_enabled: 1, am_mode: 'enforce', am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5,
        am_ignore_staff: 1, am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10,
        am_native_enabled: 1, am_exempt_roles: '[]', am_exempt_channels: '[]', am_exempt_users: '[]',
        am_rule_actions: '{}', am_blacklist_rules: '{}', am_blacklist_thresholds: '{}',
        am_escalation: '{"rules":{}}', am_phishing: 1, am_phishing_allow: '', am_blacklist_duration_min: 0,
        am_blacklist_channel: '', am_blacklist_title: '', am_blacklist_color_text: '', am_blacklist_footer: '',
        am_sticky: '', log_channel: 'C5', log_events: '', suggestion_channel: 'C6',
        birthday_channel: '', birthday_role: '', welcome_channel: 'C3', welcome_message: '',
      },
      tickets: { channel: 'C6', types: [], button_label: 'Ouvrir un ticket', button_style: '1', require_reason: 1 },
      tickets_stats: { total: 182, open: 3 },
      events: { defs: {}, state: {} },
      role_menus: [], xp_roles: [{ level: 5, role: 'R1' }, { level: 12, role: 'R2' }],
      profile: {}, blacklist: ['lien-rapide', 'spam'],
      voicetemp: { creator_channel: '', category: '', name_template: '' },
      applications: {}, scheduled: [], shop_items: [], log_events: {},
      linkpanel: {}, transcripts: {}, modmail: {}, automod: {},
      lockdown: { locked: false, channels: [] }, checklist: [],
    });
  }
  return resp({ ok: true });
};

(async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  global.window = w; global.document = w.document;
  Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true });
  global.location = w.location;
  w.fetch = fetchSimule;

  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
    .map((f) => fs.readFileSync(path.join(RACINE, 'public', 'js', f), 'utf8')).join('\n;\n');
  // Liste de candidats : seuls ceux qui rendent réellement (en-tête présent,
  // pas une carte d'erreur) entrent dans la maquette.
  const attendu = ['tickets', 'levels', 'welcome', 'suggestions', 'giveaways', 'verification', 'shop', 'moderation'];
  const script = `
  window.__r = (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1600);
    const out = { aside: '', modules: {}, grille: '', noms: [] };
    const shell = document.querySelector('#app .bot-shell .dash-shell');
    out.aside = shell.querySelector('.dash-side').outerHTML;
    // La grille « Modules du serveur » de la vue d'ensemble, tronquée à 12 cartes.
    window.Dashboard_Ouvre('overview');
    await wait(1200);
    const g = document.querySelector('#dash-content .ov-module-grid');
    if (g) {
      [...g.children].slice(12).forEach((el) => el.remove());
      out.grille = g.outerHTML;
    }
    for (const module of ${JSON.stringify(attendu)}) {
      window.Dashboard_Ouvre(module);
      await wait(1000);
      const content = document.querySelector('#dash-content');
      // On écarte les modules qui n'ont pas pu rendre avec les données simulées
      // (carte d'erreur) : les états vides, eux, sont des rendus valides.
      if (!content.querySelector('.dash-module-header') || content.querySelector('.dash-state-card.is-error')) continue;
      out.noms.push(module);
      out.modules[module] = {
        head: content.querySelector('.dash-module-header').outerHTML,
        guide: (content.querySelector('[data-module-guide]') || { outerHTML: '' }).outerHTML,
        cards: [...content.querySelectorAll(':scope > .dash-card')].slice(0, 2).map((c) => c.outerHTML).join('\\n'),
      };
    }
    return out;
  })();
  `;
  // Les rendeurs sont internes au script : on les expose pour la capture.
  const expose = 'window.Dashboard_Ouvre = (id) => Dashboard.setModule(id);';
  w.eval(code + '\n;\n' + expose + '\n;\n' + script);
  await new Promise((r) => setTimeout(r, 14000));
  const res = await w.__r;
  if (!res) throw new Error('Rendu impossible dans jsdom (le dashboard n’a pas démarré).');

  const css = lus('public/css/style.css') + '\n' + lus('public/css/dashboard.css');
  const tuiles = Object.keys(res.modules).map((id) => {
    const m = res.modules[id];
    return [m.head, m.guide, m.cards].filter(Boolean).join('\n');
  }).join('\n<div class="preview-sep"></div>\n');

  const page = `<!DOCTYPE html>
<html lang="fr" class="hx-os-pc">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hoxera — aperçu statique v361 (modules, émoticônes, fiches et libellés)</title>
<style>
${css}
/* cadre de la maquette : uniquement pour la lecture de l'aperçu */
body { margin: 0; background: #0b0c11; color: #e9eaf2; font-family: Inter, system-ui, sans-serif; }
.preview-wrap { max-width: ${LARGEUR}px; margin: 0 auto; padding: 26px 20px 70px; }
.preview-note { border: 1px solid #2a2d3d; border-radius: 14px; padding: 14px 18px; margin-bottom: 22px; background: #14151f; color: #8b8fa3; font-size: 13px; line-height: 1.6; }
.preview-note b { color: #e9eaf2; }
.preview-row { display: grid; grid-template-columns: 262px minmax(0, 1fr); gap: 18px; align-items: start; }
.preview-side { position: sticky; top: 14px; }
.preview-side .dash-side { position: static; height: auto; max-height: 76vh; }
.preview-modules { min-width: 0; }
.preview-sep { height: 26px; }
.preview-titre { margin: 4px 0 14px; color: #8b8fa3; font-size: 11px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; }
.ov-module-grid-wrap .ov-module-card { scroll-snap-align: none; }
@media (max-width: 900px) { .preview-row { grid-template-columns: 1fr; } .preview-side { position: static; } }
</style>
</head>
<body>
<div class="preview-wrap">
  <div class="preview-note">
    <b>Aperçu statique — v361.</b> Ce fichier est produit par <code>node scripts/render-preview.js</code> :
    c'est le HTML <b>réellement rendu</b> par <code>public/js/dashboard.js</code> (barre latérale groupée par familles,
    émoticônes dessinées par module, fiche de lecture avec aperçu Discord, libellés de boutons unifiés),
    habillé du CSS officiel du dashboard. Les boutons sont inactifs ici : l'aperçu sert à juger la forme, pas à configurer.
  </div>
  <div class="preview-row">
    <div class="preview-side dashboard-shell-host"><div class="bot-shell"><div class="dash-shell">
      ${enLigne(res.aside)}
    </div></div></div>
    <div class="preview-modules dashboard-shell-host"><div class="bot-shell"><div class="dash-shell"><div id="dash-content">
      <div class="preview-titre">Vue d’ensemble — la grille des modules, par famille</div>
      <div class="dash-grid ov-module-grid-wrap">${enLigne(res.grille || '')}</div>
      <div class="preview-titre">Fiches de module — en-tête, fiche de lecture, aperçu Discord</div>
      ${enLigne(tuiles)}
    </div></div></div></div>
  </div>
</div>
</body>
</html>
`;
  const cible = path.join(RACINE, 'maquette-v361-modules.html');
  fs.writeFileSync(cible, page);
  const restants = (page.match(/src="\/[^"]+"/g) || []).length;
  console.log(`écrit : ${path.relative(RACINE, cible)} (${(page.length / 1024).toFixed(0)} Ko, images externes restantes : ${restants})`);
  console.log(`modules rendus dans la maquette : ${(res.noms || []).join(', ') || 'aucun'}`);
  if (res.why) console.log('rejets :\n  ' + res.why.join('\n  '));
})().catch((e) => { console.error(e); process.exit(1); });
