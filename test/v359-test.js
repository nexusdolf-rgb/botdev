// v359 — hub fondateur unifié avec le centre serveur et responsive.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let ok = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { ok++; console.log(`✅ ${label}`); }
  else { failed++; console.error(`❌ ${label}`); }
}

const app = read('public/js/app.js');
const css = read('public/css/dashboard.css');
const index = read('public/index.html');
const sw = read('public/sw.js');
const changelog = require('../server/discord/changelog');

console.log('— Hub fondateur —');
check('vue d’ensemble dédiée avec indicateurs, santé et activité',
  app.includes('admin-overview-hero') && app.includes('admin-stat-grid')
    && app.includes('admin-health-panel') && app.includes('admin-activity-panel'));
check('actions sauvegarde et redémarrage conservées',
  app.includes("querySelector('#a-backup-now')") && app.includes("querySelector('#a-restart-bot')")
    && app.includes("App.api('/backup/now'") && app.includes("App.api('/bots/1/stop'"));
check('gestion des comptes préservée : délier, bannir, débannir et supprimer',
  app.includes('data-unlink') && app.includes('data-ban') && app.includes('data-unban')
    && app.includes('data-delete') && app.includes('/unlink-discord') && app.includes('/admin/users/'));
check('onglets bots, journal et réglages toujours présents',
  app.includes("App.ADMIN_TAB === 'bots'") && app.includes("App.ADMIN_TAB === 'audit'")
    && app.includes("App.ADMIN_TAB === 'settings'") && app.includes("App.api('/admin/settings')"));
check('état du bot principal fondé sur sa connexion réelle quand disponible',
  app.includes("App.api('/admin/bots').catch(() => ({ bots: [] }))")
    && app.includes('Number(bot.id) === 1') && app.includes('Boolean(primaryBot.online)'));
check('navigation vers le journal depuis les événements',
  app.includes("querySelector('#a-view-audit')") && app.includes("App.ADMIN_TAB = 'audit'"));
check('champs dynamiques de l’activité échappés avant rendu',
  app.includes('App.escapeHtml(String(it.text ||') && app.includes('App.escapeHtml(String(part))'));
check('style desktop et breakpoints mobile présents',
  css.includes('.admin-platform-page .admin-stat-grid')
    && css.includes('.admin-platform-page .admin-overview-grid')
    && css.includes('@media (max-width: 620px)')
    && css.includes('@media (max-width: 390px)'));
check('mode clair prévu pour la console fondatrice',
  css.includes('html.hx-light .admin-platform-page {'));
check('cache des sept assets et du Service Worker en v360',
  (index.match(/\?v=360/g) || []).length === 7 && sw.includes("const CACHE = 'botdev-v360';"));
check('v360 annoncée dans le journal, v359 conservée comme précédente',
  changelog.VERSION === 360 && changelog.VERSIONS[0].v === 360
    && changelog.VERSIONS[1].v === 359);

console.log(`\nRésultat v359 : ${ok} ✅ / ${failed} ❌`);
if (failed) process.exitCode = 1;
