// Test de fumée du frontend BotDev (jsdom)
// Les <script> d'un navigateur partagent la portée globale : on concatène tout.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:3000/#/', runScripts: 'outside-only', pretendToBeVisual: true });

const window = dom.window;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.location = window.location;

const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) window.__fail++;
};
window.__check = check;
window.__fail = 0;
window.__finish = (n) => process.exit(n === 0 ? 0 : 1);

window.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });

const scripts = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8'))
  .join('\n;\n');

const testCode = String.raw`
setTimeout(() => {
  const check = window.__check;
  check('App défini', typeof App === 'object');
  check('Editor défini', typeof Editor === 'object');
  check('BotViews défini', typeof BotViews === 'object');
  check('BLOCK_CATEGORIES', Array.isArray(BLOCK_CATEGORIES) && BLOCK_CATEGORIES.length === 4);
  check('Page publique rendue (landing)', !!document.querySelector('#public-landing'));
  check('Stats publiques présentes', !!document.querySelector('#pub-stats'));
  check('Section bots publiques', !!document.querySelector('#pub-bots'));
  App.renderAuth('login');
  check('Page auth rendue', !!document.querySelector('.auth-wrap'));
  check('Champ email présent', !!document.querySelector('#auth-email'));

  try {
    const blocks = [
      { id: 'b1', type: 'send_message', params: { text: 'Salut {user} !', reply: false }, thenBlocks: [], elseBlocks: [] },
      { id: 'b2', type: 'if', params: { left: '{args}', operator: 'contains', right: 'cool' }, thenBlocks: [{ id: 'b3', type: 'send_message', params: { text: 'cool !' }, thenBlocks: [], elseBlocks: [] }], elseBlocks: [] },
      { id: 'b4', type: 'send_embed', params: { title: 'T', description: '', color: '#5865F2', fields: [{ name: 'N', value: 'V', inline: true }] } },
      { id: 'b5', type: 'send_buttons', params: { content: '', buttons: [{ label: 'B', kind: 'command', style: 1, commandId: '1' }] } },
      { id: 'b6', type: 'random', params: { options: ['a', 'b'] } },
      { id: 'b7', type: 'give_coins', params: { amount: 10, target: 'author' } },
    ];
    Editor.blocks = blocks;
    Editor.canvasEl = document.createElement('div');
    document.body.appendChild(Editor.canvasEl);
    Editor.renderCanvas();
    check('Canvas : 7 cartes rendues (6 racine + 1 imbriquée)', Editor.canvasEl.querySelectorAll('.block-card').length === 7);
    check('Zone IF imbriquée', Editor.canvasEl.querySelectorAll('.if-wrap .block-card').length === 1);

    const moved = Editor.moveBlock('b6', Editor.blocks, 0);
    check('moveBlock fonctionne', moved && Editor.blocks[0].id === 'b6');
    const ifBlock = Editor.blocks.find(b => b.id === 'b2');
    check('moveBlock interdit dans sous-arbre', !Editor.moveBlock('b2', ifBlock.thenBlocks, 0));
  } catch (e) {
    check("Pas d'exception éditeur (" + e.message + ")", false);
  }

  const n = window.__fail;
  console.log(n === 0 ? '\n🎉 Smoke test réussi' : '\n⚠️ ' + n + ' échec(s)');
  window.__finish(n);
}, 400);
`;

window.eval(scripts + '\n;\n' + testCode);
