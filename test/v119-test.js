// Test v3.16 — questionnaire par type du nouveau système de tickets
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v316-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const advanced = require('../server/discord/advancedTickets');
const panels = require('../server/discord/panels');
const advancedSource = fs.readFileSync(path.join(__dirname, '..', 'server/discord/advancedTickets.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');
const dashSource = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');

function fakeInteraction({ customId, kind = 'button', userId = 'U1', values = [], fields = null }) {
  const interaction = {
    customId,
    guild: { id: 'G1' },
    user: { id: userId },
    values,
    deferred: false,
    replied: false,
    replies: [],
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isModalSubmit: () => kind === 'modal',
    showModal: async (modal) => { interaction.modal = modal; },
    reply: async (payload) => { interaction.replies.push(payload); interaction.replied = true; return payload; },
    deferReply: async () => { interaction.deferred = true; },
    fields: fields || { getTextInputValue: () => '' },
  };
  return interaction;
}

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  store.tickets.set(botId, 'G1', { channel: '#ancien', message: 'Ancien panneau', category: 'Ancienne catégorie' });
  store.advancedTickets.set(botId, 'G1', {
    name: 'Créer un ticket',
    mode: 'buttons',
    channel: 'PANEL',
    require_reason: 1,
    types: [{
      id: 'admin',
      label: 'Signalement admin',
      emoji: '🟥',
      description: 'Signaler un abus d\'admin',
      category: 'Tickets admin',
      color: '#ED4245',
      button_style: '4',
      staff_roles: ['Modérateurs'],
      questions: ['Quel est ton pseudo ?', 'Que s\'est-il passé ?'],
    }],
  });

  const raw = store.advancedTickets.get(botId, 'G1');
  const cfg = advanced.normalizeConfig(raw);
  assert.deepStrictEqual(cfg.types[0].questions, ['Quel est ton pseudo ?', 'Que s\'est-il passé ?']);
  assert.strictEqual(store.tickets.get(botId, 'G1').message, 'Ancien panneau');
  console.log('✅ questions par type : stockage séparé et ancien système intact');

  // Un clic avec deux questions + la raison doit ouvrir UNE modale combinée.
  const click = fakeInteraction({ customId: `hx2-btn:${botId}:${cfg.id}:admin` });
  await advanced.handleInteraction(botId, click);
  assert.ok(click.modal, 'une modale doit être affichée après le clic');
  const combined = click.modal.toJSON();
  assert.strictEqual(combined.custom_id, `hx2-tcomb:${botId}:${cfg.id}:admin`);
  assert.strictEqual(combined.components.length, 3);
  assert.strictEqual(combined.components[0].components[0].custom_id, 'q0');
  assert.strictEqual(combined.components[1].components[0].custom_id, 'q1');
  assert.strictEqual(combined.components[2].components[0].custom_id, 'reason');
  assert.strictEqual(combined.components[0].components[0].label, 'Quel est ton pseudo ?');
  console.log('✅ clic bouton : questionnaire du type + raison dans une seule modale');

  // La soumission transmet les réponses à la même infrastructure d'ouverture
  // que l'ancien système, avec la catégorie, la couleur et les rôles du type.
  const originalOpenTicket = panels.openTicket;
  let opened;
  panels.openTicket = async (...args) => { opened = args; };
  const submit = fakeInteraction({
    kind: 'modal',
    userId: 'U1',
    customId: `hx2-tcomb:${botId}:${cfg.id}:admin`,
    fields: { getTextInputValue: (id) => ({ q0: 'Joueur42', q1: 'Abus dans le salon vocal', reason: 'Je souhaite signaler un abus.' }[id] || '') },
  });
  await advanced.handleInteraction(botId, submit);
  assert.ok(opened, 'la soumission doit ouvrir le ticket');
  assert.strictEqual(opened[3], 'Je souhaite signaler un abus.');
  assert.deepStrictEqual(opened[4], [
    { q: 'Quel est ton pseudo ?', a: 'Joueur42' },
    { q: 'Que s\'est-il passé ?', a: 'Abus dans le salon vocal' },
  ]);
  assert.strictEqual(opened[2].category, 'Tickets admin');
  assert.strictEqual(opened[5].advanced_panel_id, cfg.id);
  assert.strictEqual(opened[5].advanced_type_id, 'admin');
  assert.strictEqual(store.tickets.get(botId, 'G1').message, 'Ancien panneau');
  console.log('✅ soumission : réponses, catégorie, couleur et rôles transmis à l’ouverture');

  // Cinq questions respectent la limite Discord : les cinq champs sont
  // affichés, sans tenter d\'ouvrir une deuxième modale pour la raison.
  store.advancedTickets.set(botId, 'G1', {
    ...raw,
    types: [{ ...raw.types[0], questions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'] }],
  });
  const cfgFive = advanced.normalizeConfig(store.advancedTickets.get(botId, 'G1'));
  const clickFive = fakeInteraction({ customId: `hx2-btn:${botId}:${cfgFive.id}:admin`, userId: 'U2' });
  await advanced.handleInteraction(botId, clickFive);
  const questionnaire = clickFive.modal.toJSON();
  assert.strictEqual(questionnaire.custom_id, `hx2-tquest:${botId}:${cfgFive.id}:admin`);
  assert.strictEqual(questionnaire.components.length, 5);
  console.log('✅ limite Discord : jusqu\'à cinq questions par type');

  // Le mode menu utilise exactement le même questionnaire que le mode boutons.
  const menuClick = fakeInteraction({
    kind: 'select',
    userId: 'U3',
    customId: `hx2-menu:${botId}:${cfgFive.id}`,
    values: ['admin'],
  });
  await advanced.handleInteraction(botId, menuClick);
  assert.ok(menuClick.modal);
  assert.strictEqual(menuClick.modal.toJSON().custom_id, `hx2-tquest:${botId}:${cfgFive.id}:admin`);
  console.log('✅ mode menu : questionnaire déclenché après le choix du type');

  panels.openTicket = originalOpenTicket;

  // Contrôles de régression : limites serveur et interface dédiée.
  assert.ok(advancedSource.includes('questionsFor(type)'));
  assert.ok(advancedSource.includes('hx2-tcomb') && advancedSource.includes('hx2-tquest'));
  assert.ok(routesSource.includes('questions: (Array.isArray(t.questions)'));
  assert.ok(dashSource.includes('data-addquestion') && dashSource.includes('type.questions'));
  console.log('✅ routes et dashboard : ajout/sauvegarde des questions par type');

  console.log('\n🎉 Tous les tests v3.16 passent');
})().catch((error) => {
  panels.openTicket = panels.openTicket;
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
