// ============================================================
// BotDev - Éditeur de commandes visuel par blocs
// ============================================================

// ---------------------- Définitions des blocs ----------------------
const BLOCK_CATEGORIES = [
  {
    name: 'Messages', blocks: [
      { type: 'send_message', icon: '💬', title: 'Envoyer un message' },
      { type: 'send_embed', icon: '🖼️', title: 'Envoyer un embed' },
      { type: 'send_buttons', icon: '🔘', title: 'Envoyer des boutons' },
      { type: 'random', icon: '🎲', title: 'Réponse aléatoire' },
      { type: 'dm_user', icon: '✉️', title: 'Envoyer un MP' },
      { type: 'delete_message', icon: '🗑️', title: 'Supprimer le message' },
    ],
  },
  {
    name: 'Modération', blocks: [
      { type: 'add_role', icon: '➕', title: 'Ajouter un rôle' },
      { type: 'remove_role', icon: '➖', title: 'Retirer un rôle' },
      { type: 'kick_user', icon: '👢', title: 'Expulser (kick)' },
      { type: 'ban_user', icon: '🔨', title: 'Bannir' },
      { type: 'timeout_user', icon: '⏳', title: 'Mettre en timeout' },
    ],
  },
  {
    name: 'Économie', blocks: [
      { type: 'give_coins', icon: '🪙', title: 'Donner des coins' },
    ],
  },
  {
    name: 'Logique', blocks: [
      { type: 'if', icon: '🔀', title: 'Si (condition)' },
    ],
  },
];

const VARIABLES = ['{user}', '{user.tag}', '{user.name}', '{user.id}', '{server}', '{server.id}', '{channel}', '{prefix}', '{args}', '{arg1}', '{arg2}', '{count}', '{coins}', '{random.user}', '{bot}'];

const BLOCK_META = {
  send_message: { icon: '💬', title: 'Envoyer un message', defaultParams: { text: 'Bonjour {user} !', reply: false } },
  send_embed: { icon: '🖼️', title: 'Envoyer un embed', defaultParams: { title: '', description: '', color: '#5865F2', footer: '', image: '', thumbnail: '', fields: [] } },
  send_buttons: { icon: '🔘', title: 'Envoyer des boutons', defaultParams: { content: '', buttons: [] } },
  random: { icon: '🎲', title: 'Réponse aléatoire', defaultParams: { options: ['Oui !', 'Non.', 'Peut-être…'] } },
  dm_user: { icon: '✉️', title: 'Envoyer un MP', defaultParams: { text: 'Salut {user.name} !' } },
  delete_message: { icon: '🗑️', title: 'Supprimer le message', defaultParams: {} },
  add_role: { icon: '➕', title: 'Ajouter un rôle', defaultParams: { role: '', target: 'author' } },
  remove_role: { icon: '➖', title: 'Retirer un rôle', defaultParams: { role: '', target: 'author' } },
  kick_user: { icon: '👢', title: 'Expulser (kick)', defaultParams: { target: 'args', reason: '' } },
  ban_user: { icon: '🔨', title: 'Bannir', defaultParams: { target: 'args', reason: '' } },
  timeout_user: { icon: '⏳', title: 'Mettre en timeout', defaultParams: { target: 'args', minutes: 5, reason: '' } },
  give_coins: { icon: '🪙', title: 'Donner des coins', defaultParams: { amount: 100, target: 'author' } },
  if: { icon: '🔀', title: 'Si (condition)', defaultParams: { left: '{args}', operator: 'contains', right: '' } },
};

let blockIdCounter = 1;
const newBlock = (type) => ({
  id: `b${Date.now()}_${blockIdCounter++}`,
  type,
  params: JSON.parse(JSON.stringify(BLOCK_META[type].defaultParams)),
  thenBlocks: [], elseBlocks: [],
});

// ---------------------- Éditeur ----------------------
const Editor = {
  blocks: [],
  command: null,
  canvasEl: null,
  commandPicker: [],
  currentBodyEl: null,
  currentBlockEl: null,
};

Editor.open = async (bot, command = null, existingCommands = []) => {
  Editor.command = command;
  Editor.commandPicker = existingCommands.filter(c => !command || c.id !== command.id);
  Editor.blocks = command ? JSON.parse(command.blocks || '[]') : [newBlock('send_message')];

  const triggerValueLabel = { prefix: 'Nom de la commande (ex : bonjour)', slash: 'Nom (ex : info)', keyword: 'Mot-clé exact (ex : salut)' };

  App.modal(`
    <div class="modal-header"><h3>${command ? '✏️ Modifier la commande' : '🧩 Nouvelle commande'}</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body" style="padding:0">
      <div style="padding:16px 22px 4px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:12px" id="cmd-settings"></div>
      <div class="editor-layout">
        <div class="editor-palette" id="palette"></div>
        <div class="editor-canvas" id="canvas"></div>
      </div>
    </div>
    <div class="modal-footer">
      <div style="margin-right:auto;color:var(--text-dim);font-size:12px">💡 Astuce : clique sur une variable pour l'insérer dans le champ en cours d'édition.</div>
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="editor-save">💾 Enregistrer</button>
    </div>
  `, true);
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = App.closeModal);
  const modal = document.querySelector('#modal-root .modal');

  // ---- Paramètres de la commande ----
  const settings = modal.querySelector('#cmd-settings');
  const cmd = command || { name: '', description: '', trigger_type: 'prefix', trigger_value: '', options: [], cooldown: 0 };
  const triggerTypes = [
    ['prefix', 'Préfixe (!commande)'],
    ['slash', 'Slash (/commande)'],
    ['keyword', 'Mot-clé (message exact)'],
  ];
  settings.innerHTML = `
    <div>
      <label class="field-label">Nom</label>
      <input class="input" id="c-name" maxlength="32" value="${App.escapeHtml(cmd.name)}" placeholder="bonjour" />
    </div>
    <div>
      <label class="field-label">Description</label>
      <input class="input" id="c-desc" maxlength="100" value="${App.escapeHtml(cmd.description)}" placeholder="Dit bonjour à l'utilisateur" />
    </div>
    <div>
      <label class="field-label">Déclencheur</label>
      <select class="select" id="c-trigger">${triggerTypes.map(([v, l]) => `<option value="${v}" ${cmd.trigger_type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="c-trigger-wrap" style="grid-column:1/3">
      <label class="field-label" id="c-trigger-label">${triggerValueLabel[cmd.trigger_type]}</label>
      <input class="input" id="c-trigger-value" maxlength="100" value="${App.escapeHtml(cmd.trigger_value)}" placeholder="bonjour" />
    </div>
    <div>
      <label class="field-label">Cooldown (s)</label>
      <input class="input" id="c-cooldown" type="number" min="0" value="${cmd.cooldown || 0}" />
    </div>
    <div style="grid-column:1/3" id="c-options-wrap"></div>
  `;

  const triggerSelect = settings.querySelector('#c-trigger');
  const getOptions = () => { try { return JSON.parse(cmd.options || '[]'); } catch { return []; } };

  Editor.renderOptionsEditor = () => {
    const wrap = settings.querySelector('#c-options-wrap');
    const type = triggerSelect.value;
    if (type !== 'slash') { wrap.innerHTML = ''; return; }
    const options = getOptions();
    wrap.innerHTML = `
      <label class="field-label">Options de la commande slash</label>
      <div id="opt-list">${options.length ? '' : '<div style="color:var(--text-dim);font-size:12.5px">Aucune option — la commande n\'aura pas d\'arguments.</div>'}</div>
      <button class="btn btn-sm btn-ghost" id="opt-add" style="margin-top:8px">＋ Ajouter une option</button>
    `;
    const list = wrap.querySelector('#opt-list');
    options.forEach((o, i) => list.appendChild(Editor.optionRow(o, i, options)));
    wrap.querySelector('#opt-add').onclick = () => {
      options.push({ name: 'option', description: '', type: 'string', required: false });
      Editor.renderOptionsEditor();
    };
  };

  Editor.optionRow = (o, i, options) => {
    const row = App.el(`
      <div class="row-item" style="margin-top:7px">
        <input class="input" data-k="name" placeholder="nom" value="${App.escapeHtml(o.name)}" style="max-width:130px" />
        <input class="input" data-k="description" placeholder="description" value="${App.escapeHtml(o.description)}" />
        <select class="select" data-k="type" style="max-width:110px">
          ${['string', 'user', 'channel', 'role', 'number', 'boolean'].map(t => `<option value="${t}" ${o.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-dim);white-space:nowrap">
          <input type="checkbox" data-k="required" ${o.required ? 'checked' : ''} /> requis
        </label>
        <button class="btn btn-danger btn-icon btn-sm" data-del>🗑</button>
      </div>
    `);
    row.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k;
      const evt = inp.type === 'checkbox' ? 'change' : 'input';
      inp.addEventListener(evt, () => { o[k] = inp.type === 'checkbox' ? inp.checked : inp.value; });
    });
    row.querySelector('[data-del]').onclick = () => {
      options.splice(i, 1);
      Editor.renderOptionsEditor();
    };
    return row;
  };

  triggerSelect.onchange = () => {
    settings.querySelector('#c-trigger-label').textContent = triggerValueLabel[triggerSelect.value];
    settings.querySelector('#c-trigger-value').placeholder = { prefix: 'bonjour', slash: 'info', keyword: 'salut' }[triggerSelect.value];
    Editor.renderOptionsEditor();
  };
  Editor.renderOptionsEditor();

  // ---- Palette ----
  const palette = modal.querySelector('#palette');
  palette.innerHTML = BLOCK_CATEGORIES.map(cat => `
    <h4>${cat.name}</h4>
    ${cat.blocks.map(b => `<button class="palette-item" data-type="${b.type}"><span>${b.icon}</span> ${b.title}</button>`).join('')}
  `).join('');
  palette.querySelectorAll('.palette-item').forEach(btn => btn.onclick = () => {
    Editor.blocks.push(newBlock(btn.dataset.type));
    Editor.renderCanvas();
  });

  // ---- Canvas ----
  Editor.canvasEl = modal.querySelector('#canvas');
  Editor.renderCanvas();

  // ---- Sauvegarde ----
  modal.querySelector('#editor-save').onclick = async () => {
    const name = settings.querySelector('#c-name').value.trim();
    const trigger_type = triggerSelect.value;
    const trigger_value = settings.querySelector('#c-trigger-value').value.trim();
    if (!name) return App.toast('Donne un nom à ta commande.', 'error');
    if (trigger_type === 'slash' && !/^[a-z0-9\-_]{1,32}$/.test(name.toLowerCase())) return App.toast('Nom slash invalide : minuscules, chiffres, tirets, underscores, 32 caractères max.', 'error');
    if (!trigger_value && trigger_type !== 'button') return App.toast('Précise la valeur du déclencheur.', 'error');
    const payload = {
      name,
      description: settings.querySelector('#c-desc').value.trim(),
      trigger_type,
      trigger_value,
      options: getOptions(),
      blocks: Editor.blocks,
      cooldown: parseInt(settings.querySelector('#c-cooldown').value, 10) || 0,
      enabled: true,
    };
    try {
      if (command) await App.api(`/commands/${command.id}`, { method: 'PATCH', body: payload });
      else await App.api(`/bots/${bot.id}/commands`, { method: 'POST', body: payload });
      App.closeModal();
      App.toast(command ? 'Commande mise à jour !' : 'Commande créée !');
      if (typeof Dashboard !== 'undefined' && Dashboard.refresh) Dashboard.refresh();
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------------------- Rendu du canvas ----------------------
Editor.renderCanvas = () => {
  Editor.canvasEl.innerHTML = '';
  const vars = App.el(`<div class="var-chips" style="margin-bottom:10px">${VARIABLES.map(v => `<span class="var-chip" data-v="${v}">${App.escapeHtml(v)}</span>`).join('')}</div>`);
  vars.querySelectorAll('.var-chip').forEach(chip => chip.onclick = () => {
    const v = chip.dataset.v;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      const start = active.selectionStart ?? active.value.length;
      active.value = active.value.slice(0, start) + v + active.value.slice(active.selectionEnd ?? start);
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.focus();
    } else {
      navigator.clipboard.writeText(v).then(() => App.toast(`${v} copié !`));
    }
  });
  Editor.canvasEl.appendChild(vars);

  Editor.canvasEl.appendChild(App.el(`<div style="color:var(--text-dim);font-size:12.5px;margin-bottom:8px">🧩 ${Editor.blocks.length} bloc(s) — ajoute des blocs depuis la palette, glisse les cartes pour les réordonner.</div>`));

  Editor.canvasEl.appendChild(Editor.renderZone(Editor.blocks, 'Racine de la commande', 'root'));
};

Editor.renderZone = (list, label, key) => {
  const zone = App.el(`<div class="editor-zone" data-zone="${key}"></div>`);
  if (label) zone.appendChild(App.el(`<div class="zone-label">${label}</div>`));
  zone.appendChild(Editor.dropSpacer(list, 0));
  if (!list.length) {
    zone.appendChild(App.el(`<div class="zone-empty">Dépose des blocs ici.</div>`));
  }
  list.forEach((block, index) => {
    zone.appendChild(Editor.renderBlockCard(block, list, index));
    zone.appendChild(Editor.dropSpacer(list, index + 1));
  });
  Editor.bindZoneDnD(zone, list);
  return zone;
};

Editor.dropSpacer = (list, index) => {
  const el = App.el(`<div style="height:8px;transition:.12s" class="zone-drop"></div>`);
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.style.height = '34px';
    el.style.background = 'rgba(88,101,242,.15)';
    el.style.borderRadius = '8px';
  });
  el.addEventListener('dragleave', () => { el.style.height = '8px'; el.style.background = ''; });
  el.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (Editor.moveBlock(id, list, index)) Editor.renderCanvas();
  });
  return el;
};

Editor.containsList = (block, targetList) => {
  if (block.thenBlocks === targetList || block.elseBlocks === targetList) return true;
  return [...(block.thenBlocks || []), ...(block.elseBlocks || [])].some(child => Editor.containsList(child, targetList));
};

Editor.moveBlock = (id, targetList, index) => {
  const found = Editor.findBlock(Editor.blocks, id);
  if (!found) return false;
  // Interdit de déposer un bloc dans son propre sous-arbre (ex : un IF dans lui-même)
  if (Editor.containsList(found.block, targetList)) return false;
  found.list.splice(found.index, 1);
  const idx = Math.min(index, targetList.length);
  targetList.splice(idx, 0, found.block);
  return true;
};

Editor.findBlock = (list, id) => {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { block: list[i], list, index: i };
    if (list[i].thenBlocks) {
      const f = Editor.findBlock(list[i].thenBlocks, id);
      if (f) return f;
    }
    if (list[i].elseBlocks) {
      const f = Editor.findBlock(list[i].elseBlocks, id);
      if (f) return f;
    }
  }
  return null;
};

Editor.bindZoneDnD = (zone, list) => {
  zone.addEventListener('dragover', (e) => { e.preventDefault(); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (Editor.moveBlock(id, list, list.length)) Editor.renderCanvas();
  });
};

Editor.renderBlockCard = (block, list, index) => {
  const meta = BLOCK_META[block.type] || { icon: '❔', title: block.type };
  const card = App.el(`
    <div class="block-card" draggable="true">
      <div class="block-head">
        <span class="b-ico">${meta.icon}</span>
        <span class="b-title">${meta.title}</span>
        <div class="b-actions">
          <button class="icon-btn" data-up title="Monter">↑</button>
          <button class="icon-btn" data-down title="Descendre">↓</button>
          <button class="icon-btn" data-dup title="Dupliquer">⧉</button>
          <button class="icon-btn" data-del title="Supprimer">🗑</button>
        </div>
      </div>
      <div class="block-body"></div>
    </div>
  `);

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', block.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.querySelector('[data-up]').onclick = () => { if (index > 0) { list.splice(index, 1); list.splice(index - 1, 0, block); Editor.renderCanvas(); } };
  card.querySelector('[data-down]').onclick = () => { if (index < list.length - 1) { list.splice(index, 1); list.splice(index + 1, 0, block); Editor.renderCanvas(); } };
  card.querySelector('[data-dup]').onclick = () => {
    const copy = JSON.parse(JSON.stringify(block));
    copy.id = `b${Date.now()}_${blockIdCounter++}`;
    list.splice(index + 1, 0, copy);
    Editor.renderCanvas();
  };
  card.querySelector('[data-del]').onclick = () => { list.splice(index, 1); Editor.renderCanvas(); };

  Editor.renderBlockBody(card.querySelector('.block-body'), block);
  return card;
};

// ---------------------- Corps des blocs ----------------------
Editor.bindInput = (el, obj, key, transform) => {
  const evt = el.type === 'checkbox' ? 'change' : 'input';
  el.addEventListener(evt, () => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (transform) v = transform(v, obj);
    obj[key] = v;
  });
};

Editor.bindDirect = (el, setter) => {
  const evt = el.type === 'checkbox' ? 'change' : 'input';
  el.addEventListener(evt, () => setter(el.type === 'checkbox' ? el.checked : el.value));
};

Editor.renderBlockBody = (body, block) => {
  Editor.currentBodyEl = body;
  Editor.currentBlockEl = block;
  const p = block.params;

  const addField = (label) => body.appendChild(App.el(`<label class="field-label">${label}</label>`));
  const addInput = (label, key, placeholder = '', type = 'text', transform = null) => {
    addField(label);
    const input = App.el(`<input class="input" type="${type}" value="${App.escapeHtml(p[key] ?? '')}" placeholder="${placeholder}" />`);
    Editor.bindInput(input, p, key, transform);
    body.appendChild(input);
    return input;
  };
  const addTextarea = (label, key, placeholder = '') => {
    addField(label);
    const ta = App.el(`<textarea class="input" rows="2" placeholder="${placeholder}">${App.escapeHtml(p[key] ?? '')}</textarea>`);
    Editor.bindInput(ta, p, key);
    body.appendChild(ta);
  };
  const targetSelect = (key) => {
    addField('Cible');
    const sel = App.el(`<select class="select">
      <option value="author" ${p[key] === 'author' ? 'selected' : ''}>L'utilisateur (auteur)</option>
      <option value="args" ${p[key] === 'args' ? 'selected' : ''}>L'utilisateur mentionné ({arg1})</option>
    </select>`);
    Editor.bindInput(sel, p, key);
    body.appendChild(sel);
  };
  const rerender = () => Editor.renderBlockBody(body, block);

  switch (block.type) {
    case 'send_message': {
      addTextarea('Message', 'text', 'Texte à envoyer…');
      const row = App.el(`<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12.5px;color:var(--text-dim);cursor:pointer"><input type="checkbox" ${p.reply ? 'checked' : ''} /> Répondre au message déclencheur</label>`);
      Editor.bindInput(row.querySelector('input'), p, 'reply');
      body.appendChild(row);
      break;
    }
    case 'send_embed': {
      const grid = App.el('<div class="grid2"></div>');
      const title = App.el(`<input class="input" value="${App.escapeHtml(p.title ?? '')}" placeholder="Titre" />`);
      Editor.bindInput(title, p, 'title');
      const color = App.el(`<input class="input" type="color" value="${App.escapeHtml(p.color || '#5865F2')}" style="height:37px;padding:3px" />`);
      Editor.bindInput(color, p, 'color');
      grid.appendChild(title); grid.appendChild(color);
      body.appendChild(grid);
      addTextarea('Description', 'description', 'Contenu de l\'embed…');
      addInput('Image (URL)', 'image', 'https://…');
      addInput('Miniature (URL)', 'thumbnail', 'https://…');
      addInput('Pied de page', 'footer', '');
      addField('Champs');
      const fieldsWrap = App.el('<div></div>');
      (p.fields || []).forEach((f, i) => {
        const row = App.el(`
          <div class="row-item">
            <input class="input" placeholder="Nom du champ" value="${App.escapeHtml(f.name)}" />
            <input class="input" placeholder="Valeur" value="${App.escapeHtml(f.value)}" />
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim);white-space:nowrap"><input type="checkbox" ${f.inline ? 'checked' : ''} /> inline</label>
            <button class="btn btn-danger btn-icon btn-sm">🗑</button>
          </div>
        `);
        Editor.bindInput(row.querySelectorAll('input')[0], f, 'name');
        Editor.bindInput(row.querySelectorAll('input')[1], f, 'value');
        Editor.bindInput(row.querySelectorAll('input')[2], f, 'inline');
        row.querySelector('button').onclick = () => { p.fields.splice(i, 1); rerender(); };
        fieldsWrap.appendChild(row);
      });
      body.appendChild(fieldsWrap);
      const addBtn = App.el(`<button class="btn btn-sm btn-ghost" style="margin-top:6px">＋ Ajouter un champ</button>`);
      addBtn.onclick = () => { p.fields = p.fields || []; p.fields.push({ name: '', value: '', inline: false }); rerender(); };
      body.appendChild(addBtn);
      break;
    }
    case 'send_buttons': {
      addTextarea('Message (au-dessus des boutons)', 'content', '');
      addField('Boutons');
      const wrap = App.el('<div></div>');
      (p.buttons || []).forEach((b, i) => {
        const picker = Editor.commandPicker.map(c => `<option value="${c.id}" ${String(b.commandId) === String(c.id) ? 'selected' : ''}>${App.escapeHtml(c.name)}</option>`).join('');
        const row = App.el(`
          <div class="row-item">
            <input class="input" placeholder="Texte du bouton" value="${App.escapeHtml(b.label)}" style="max-width:150px" />
            <select class="select" style="max-width:120px">
              <option value="command" ${b.kind !== 'url' ? 'selected' : ''}>Commande</option>
              <option value="url" ${b.kind === 'url' ? 'selected' : ''}>Lien (URL)</option>
            </select>
            <div class="b-val" style="flex:1;min-width:0">${b.kind === 'url'
              ? `<input class="input" placeholder="https://…" value="${App.escapeHtml(b.url)}" />`
              : `<select class="select"><option value="">— choisir une commande —</option>${picker}</select>`}</div>
            <select class="select" style="max-width:130px">
              ${[['1', 'Bleu'], ['2', 'Gris'], ['3', 'Vert'], ['4', 'Rouge']].map(([v, l]) => `<option value="${v}" ${String(b.style) === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <button class="btn btn-danger btn-icon btn-sm">🗑</button>
          </div>
        `);
        Editor.bindInput(row.querySelectorAll('input')[0], b, 'label');
        const kindSel = row.querySelectorAll('select')[0];
        Editor.bindInput(kindSel, b, 'kind');
        const styleSel = row.querySelectorAll('select')[2];
        Editor.bindInput(styleSel, b, 'style', v => parseInt(v, 10));
        const valueInp = row.querySelector('.b-val').querySelector('input, select');
        Editor.bindInput(valueInp, b, b.kind === 'url' ? 'url' : 'commandId', v => b.kind === 'url' ? v : (parseInt(v, 10) || ''));
        kindSel.addEventListener('change', rerender);
        row.querySelector('button').onclick = () => { p.buttons.splice(i, 1); rerender(); };
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
      const addBtn = App.el(`<button class="btn btn-sm btn-ghost">＋ Ajouter un bouton</button>`);
      addBtn.onclick = () => { p.buttons = p.buttons || []; p.buttons.push({ label: 'Bouton', kind: 'command', style: 1, url: '', commandId: '' }); rerender(); };
      body.appendChild(addBtn);
      break;
    }
    case 'random': {
      addField('Réponses possibles (une sera tirée au hasard)');
      const wrap = App.el('<div></div>');
      (p.options || []).forEach((opt, i) => {
        const row = App.el(`<div class="row-item"><input class="input" value="${App.escapeHtml(opt)}" /><button class="btn btn-danger btn-icon btn-sm">🗑</button></div>`);
        Editor.bindDirect(row.querySelector('input'), (v) => { p.options[i] = v; });
        row.querySelector('button').onclick = () => { p.options.splice(i, 1); rerender(); };
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
      const addBtn = App.el(`<button class="btn btn-sm btn-ghost">＋ Ajouter une réponse</button>`);
      addBtn.onclick = () => { p.options = p.options || []; p.options.push('Nouvelle réponse'); rerender(); };
      body.appendChild(addBtn);
      break;
    }
    case 'dm_user': {
      addTextarea('Message privé', 'text', 'Texte envoyé en MP…');
      break;
    }
    case 'delete_message': {
      body.appendChild(App.el(`<p style="color:var(--text-dim);font-size:12.5px">Supprime le message qui a déclenché la commande (si possible).</p>`));
      break;
    }
    case 'add_role':
    case 'remove_role': {
      addInput('Nom du rôle (ou {args}, ou ID)', 'role', 'Membre');
      targetSelect('target');
      break;
    }
    case 'kick_user':
    case 'ban_user':
    case 'timeout_user': {
      if (block.type === 'timeout_user') addInput('Durée (minutes)', 'minutes', '5', 'number', v => parseInt(v, 10) || 0);
      targetSelect('target');
      addInput('Raison (optionnel)', 'reason', '');
      break;
    }
    case 'give_coins': {
      addInput('Nombre de coins', 'amount', '100', 'number', v => parseInt(v, 10) || 0);
      targetSelect('target');
      break;
    }
    case 'if': {
      const cond = App.el('<div class="if-cond"></div>');
      const left = App.el(`<input class="input" value="${App.escapeHtml(p.left ?? '')}" placeholder="{args}" />`);
      Editor.bindInput(left, p, 'left');
      const op = App.el(`<select class="select">${['contains', '==', '!=', 'startswith', 'endswith', '>', '<', '>=', '<='].map(o => `<option value="${o}" ${p.operator === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`);
      Editor.bindInput(op, p, 'operator');
      const right = App.el(`<input class="input" value="${App.escapeHtml(p.right ?? '')}" placeholder="valeur" />`);
      Editor.bindInput(right, p, 'right');
      cond.appendChild(left); cond.appendChild(op); cond.appendChild(right);
      body.appendChild(cond);
      const wrap = App.el(`<div class="if-wrap" style="margin-top:10px"></div>`);
      wrap.appendChild(App.el(`<div class="zone-label">✅ Si vrai</div>`));
      wrap.appendChild(Editor.renderZone(block.thenBlocks || [], null, `then-${block.id}`));
      wrap.appendChild(App.el(`<div class="zone-label">❌ Sinon</div>`));
      wrap.appendChild(Editor.renderZone(block.elseBlocks || [], null, `else-${block.id}`));
      body.appendChild(wrap);
      break;
    }
  }
};
