// Test v3.14 — nouveau système de tickets personnalisés isolé
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v314-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const advanced = require('../server/discord/advancedTickets');
const panelsSource = fs.readFileSync(path.join(__dirname, '..', 'server/discord/panels.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');
const dashSource = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');

(async () => {
  // 1. Le nouveau stockage ne touche pas la configuration historique.
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  store.tickets.set(botId, 'G1', { channel: '#ancien', message: 'Ancien panneau', button_label: 'Ancien', category: 'Ancienne catégorie' });
  store.advancedTickets.set(botId, 'G1', {
    name: 'Support personnalisé', mode: 'buttons', channel: 'C-PANEL', message: 'Choisis ton service', require_reason: 1,
    types: [
      { id: 'bug', label: 'Signaler un bug', emoji: '🐛', description: 'Un problème technique ?', category: 'Support', color: '#ED4245', button_style: '4', staff_roles: ['Modérateurs'] },
      { id: 'help', label: 'Aide générale', emoji: '🆘', description: 'Une question ?', category: 'Support', color: '#5865F2', button_style: '1', staff_roles: [] },
      { id: 'part', label: 'Partenariat', emoji: '🤝', description: '', category: '', color: '#57F287', button_style: '3', staff_roles: [] },
      { id: 'other', label: 'Autre', emoji: '📩', description: '', category: '', color: '#A855F7', button_style: '2', staff_roles: [] },
      { id: 'five', label: 'Cinquième', emoji: '5️⃣', description: '', category: '', color: '#F59E0B', button_style: '1', staff_roles: [] },
      { id: 'six', label: 'Sixième', emoji: '6️⃣', description: '', category: '', color: '#10B981', button_style: '3', staff_roles: [] },
    ],
  });
  const old = store.tickets.get(botId, 'G1');
  const cfg = store.advancedTickets.get(botId, 'G1');
  assert.strictEqual(old.message, 'Ancien panneau');
  assert.strictEqual(old.category, 'Ancienne catégorie');
  assert.strictEqual(cfg.name, 'Support personnalisé');
  assert.strictEqual(cfg.types.length, 6);
  console.log('✅ stockage séparé : ancien système intact, nouveau système enregistré');

  // 2. Mode boutons : 5 boutons maximum par rangée, IDs séparés et styles.
  const buttonPayload = advanced.buildPanelPayload(cfg);
  assert.strictEqual(buttonPayload.components.length, 2);
  assert.strictEqual(buttonPayload.components[0].components.length, 5);
  assert.strictEqual(buttonPayload.components[1].components.length, 1);
  assert.ok(buttonPayload.components[0].components[0].data.custom_id.startsWith(`hx2-btn:${botId}:`));
  assert.strictEqual(buttonPayload.components[0].components[0].data.style, 4);
  assert.ok(buttonPayload.embeds[0].data.fields[0].value.includes('Signaler un bug'));
  console.log('✅ mode boutons : plusieurs types, rangées Discord valides et IDs indépendants');

  // 3. Mode menu : options, descriptions et valeurs stables.
  store.advancedTickets.set(botId, 'G1', { ...cfg, mode: 'menu' });
  const menuCfg = store.advancedTickets.get(botId, 'G1');
  const menuPayload = advanced.buildPanelPayload(menuCfg);
  assert.strictEqual(menuPayload.components.length, 1);
  const select = menuPayload.components[0].components[0];
  assert.ok(select.data.custom_id.startsWith(`hx2-menu:${botId}:`));
  assert.strictEqual(select.options.length, 6);
  assert.strictEqual(select.options[0].data.value, 'bug');
  assert.ok(select.options[0].data.description.includes('problème'));
  console.log('✅ mode menu : types sélectionnables avec description et valeur stable');

  // 4. La couleur est transmise à l'ouverture réutilisée par l'infrastructure
  // historique, sans remplacer la table tickets.
  const openCfg = advanced.advancedConfigForOpen(menuCfg, menuCfg.types[0]);
  assert.strictEqual(openCfg.advanced_panel_id, menuCfg.id);
  assert.strictEqual(openCfg.advanced_type_id, 'bug');
  assert.strictEqual(openCfg.category, 'Support');
  assert.strictEqual(openCfg.types.length, 0);
  assert.ok(panelsSource.includes('configOverride = null') && panelsSource.includes('chosenRaw.color'));
  assert.ok(panelsSource.includes('store.advancedTickets.bindChannel'));
  console.log('✅ ouverture : couleur/catégorie/rôles du nouveau type transmis sans toucher à l’ancien ticket');

  // 5. L'envoi remplace uniquement l'ancien panneau personnalisé et conserve
  // l'identifiant du message pour une future réédition propre.
  const panelChannel = {
    id: '123456789012345678', name: 'panneaux', isTextBased: () => true,
    messages: { fetch: async () => new Map() },
    send: async (payload) => ({ id: '987654321098765432', payload }),
  };
  const guild = { id: 'G1', channels: { cache: new Map([[panelChannel.id, panelChannel]]) } };
  const client = { guilds: { cache: new Map([['G1', guild]]) } };
  store.advancedTickets.set(botId, 'G1', { ...menuCfg, channel: panelChannel.id, mode: 'buttons' });
  const sent = await advanced.sendPanel(botId, 'G1', client);
  assert.strictEqual(sent.id, '987654321098765432');
  assert.strictEqual(store.advancedTickets.get(botId, 'G1').panel_message_id, sent.id);
  assert.strictEqual(store.tickets.get(botId, 'G1').message, 'Ancien panneau');
  console.log('✅ envoi : nouveau panneau mémorisé, ancien panneau non supprimé');

  // 6. Dashboard et routes : la carte est bien sous l'ancien renderer, avec
  // enregistrement et envoi séparés.
  assert.ok(dashSource.includes('Système de tickets personnalisés'));
  assert.ok(dashSource.includes('adv-mode') && dashSource.includes('adv-save') && dashSource.includes('adv-send'));
  assert.ok(routesSource.includes('advanced-tickets') && routesSource.includes('advanced.sendPanel'));
  console.log('✅ dashboard : carte nouvelle indépendante, mode boutons/menu, sauvegarde et envoi');

  console.log('\n🎉 Tous les tests v3.14 passent');
})().catch((e) => { console.error('❌', e.stack || e.message); process.exit(1); });
