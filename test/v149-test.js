// Test v8.1 — sélecteurs natifs pour les listes Discord multiples
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
global.window = w;
global.document = w.document;
global.navigator = w.navigator;
global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(
  fs.readFileSync('public/js/app.js', 'utf8') + '\n'
  + fs.readFileSync('public/js/dashboard.js', 'utf8')
  + '\nwindow.App=App;window.Dashboard=Dashboard;'
);

const { App, Dashboard } = w;
App.state = { user: { is_admin: true } };
Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: 'moderation' };
const calls = [];
App.api = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/sanctions')) return { sanctions: [] };
  if (url.endsWith('/members')) return { members: [{ id: 'U1', username: 'Membre sûr' }, { id: 'U2', username: 'Autre membre' }] };
  if (url.includes('/automod/summary')) return { total: 0, today: 0, observed: 0, enforced: 0, byRule: [], byAction: [] };
  if (url.includes('/automod/native')) return { ok: true, nativeRules: 0, badgeEligible: false };
  if (url.endsWith('/scheduled')) return { scheduled: [] };
  if (url.endsWith('/announcements/custom')) return { config: { id: 1, name: 'Annonce', title: '', message: 'Bonjour', color: '#5865F2', image_url: '', footer: '', channels: ['C1'], ping_roles: ['R1'] } };
  return { ok: true };
};

const data = {
  guild: { id: 'G1', name: 'Serveur test', members: 10 },
  settings: {
    am_enabled: 1, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, am_ignore_staff: 1,
    am_mode: 'observe', am_rule_actions: '{}',
    am_exempt_roles: JSON.stringify(['Staff']),
    am_exempt_channels: JSON.stringify(['C2']),
    am_exempt_users: JSON.stringify(['U1']),
    am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10,
    timezone: 'Europe/Paris',
  },
  channels: [{ id: 'C1', name: 'annonces' }, { id: 'C2', name: 'staff' }, { id: 'C3', name: 'general' }],
  roles: [{ id: 'R1', name: 'Staff' }, { id: 'R2', name: 'VIP' }, { id: 'R3', name: 'Modération' }],
  blacklist: [],
  automod_blacklist: [],
  events: {
    defs: {
      autorole: { emoji: '🏷️', label: 'Auto-rôle', description: 'Rôles', config: [
        { key: 'roles', label: 'Rôles automatiques', type: 'rolesmulti' },
      ] },
    },
    state: { autorole: { enabled: true, config: { roles: 'Staff' } } },
  },
};

(async () => {
  const moderation = w.document.createElement('div');
  await Dashboard.renderers.moderation(moderation, data);
  for (const id of ['am-exempt-roles', 'am-exempt-channels', 'am-exempt-users']) {
    assert.strictEqual(moderation.querySelector(`#${id} select.discord-multi-select`)?.tagName, 'SELECT', `${id} doit être un sélecteur natif`);
    assert.strictEqual(moderation.querySelectorAll(`#${id} input[type="checkbox"]`).length, 0, `${id} ne doit plus afficher de cases`);
    assert(moderation.querySelector(`#${id} .discord-multi-remove`), `${id} doit permettre de retirer un choix`);
  }
  assert.deepStrictEqual([...moderation.querySelector('#am-exempt-roles').__discordSelected], ['R1'], 'le rôle historique est converti vers son ID');
  assert.deepStrictEqual([...moderation.querySelector('#am-exempt-channels').__discordSelected], ['C2'], 'le salon historique est converti vers son ID');
  assert.deepStrictEqual([...moderation.querySelector('#am-exempt-users').__discordSelected], ['U1']);

  const roleSelect = moderation.querySelector('#am-exempt-roles select');
  roleSelect.value = 'R2';
  roleSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert([...moderation.querySelector('#am-exempt-roles').__discordSelected].includes('R2'), 'un rôle peut être ajouté avec le sélecteur');
  assert(![...roleSelect.options].some((option) => option.value === 'R2'), 'un rôle déjà ajouté disparaît des choix disponibles');
  moderation.querySelector('#am-exempt-roles .discord-multi-remove').click();
  assert(![...moderation.querySelector('#am-exempt-roles').__discordSelected].includes('R1'), 'un rôle peut être retiré');

  const saveButton = moderation.querySelector('#am-save');
  await saveButton.click();
  const saveCall = calls.reverse().find((call) => call.url.endsWith('/automod'));
  assert(saveCall, 'la sauvegarde Auto-Mod doit appeler la route existante');
  assert(saveCall.options.body.exempt_roles.includes('R2'), 'la sauvegarde conserve la sélection du sélecteur');
  assert(!saveCall.options.body.exempt_roles.includes('R1'), 'la suppression est prise en compte');
  console.log('1️⃣  Auto-Mod : rôles, salons et membres ignorés utilisent de vrais sélecteurs ✅');

  const announcements = w.document.createElement('div');
  Dashboard.state.module = 'announcements';
  await Dashboard.renderers.announcements(announcements, data);
  assert.strictEqual(announcements.querySelector('#ca-channels select.discord-multi-select')?.tagName, 'SELECT');
  assert.strictEqual(announcements.querySelector('#ca-roles select.discord-multi-select')?.tagName, 'SELECT');
  assert.strictEqual(announcements.querySelectorAll('#ca-channels input[type="checkbox"], #ca-roles input[type="checkbox"]').length, 0);
  assert.strictEqual(announcements.querySelector('#ca-channels').__discordSelected.has('C1'), true);
  assert.strictEqual(announcements.querySelector('#ca-roles').__discordSelected.has('R1'), true);
  console.log('2️⃣  Annonces : salons de publication et rôles à mentionner utilisent des sélecteurs ✅');

  const welcome = w.document.createElement('div');
  Dashboard.state.module = 'welcome';
  await Dashboard.renderers.welcome(welcome, data);
  const autorole = welcome.querySelector('[data-k="roles"]');
  assert(autorole);
  assert.strictEqual(autorole.querySelector('select.discord-multi-select')?.tagName, 'SELECT');
  assert.strictEqual(autorole.querySelectorAll('input[type="checkbox"]').length, 0);
  assert.strictEqual(autorole.__discordSelected.has('Staff'), true, 'la compatibilité des noms de rôles est conservée pour l’auto-rôle');
  console.log('3️⃣  Bienvenue / auto-rôle : la liste de rôles utilise un sélecteur ✅');

  const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
  const css = fs.readFileSync('public/css/dashboard.css', 'utf8');
  assert(source.includes('Dashboard.renderDiscordMultiSelect'));
  assert(css.includes('.discord-multi-select') && css.includes('.discord-multi-remove'));
  console.log('4️⃣  Composant commun et style responsive présents ✅');
  console.log('\n🎉 Tous les tests v8.1 passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
