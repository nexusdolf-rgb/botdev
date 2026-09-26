// ============================================================
// BotDev - Vues utilitaires (dashboard v2)
// Seul l'éditeur de menus de rôles vit ici : tout le reste est
// rendu par Dashboard (dashboard.js).
// ============================================================
const BotViews = {};

// Discord : 25 options max par menu / 25 boutons max par message.
const ROLE_MENU_MAX = 25;

// Éditeur de menu de rôles (modale) — utilisé par le module « Rôles »
BotViews.openRoleMenuModal = (bot, guildId, menu) => {
  const isEdit = !!menu;
  const data = menu ? JSON.parse(JSON.stringify(menu)) : { name: '', content: '', placeholder: 'Choisissez vos rôles…', channel: '', options: [{ label: 'Notifications', emoji: '🔔', role: '' }] };
  if (Array.isArray(data.options) && data.options.length > ROLE_MENU_MAX) data.options = data.options.slice(0, ROLE_MENU_MAX);

  App.modal(`
    <div class="modal-header"><h3>${isEdit ? '✏️ Modifier le menu' : '📋 Nouveau menu de rôles'}</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body">
      <div class="help-box" style="margin-bottom:14px">
        Chaque option attribue (ou retire) un rôle quand le membre la choisit.
        Sur mobile comme sur PC, le sélecteur est le même menu que partout ailleurs.
        Discord accepte <b>25 rôles maximum</b> par panneau : au-delà, créez un second panneau.
      </div>
      <label class="field-label">Nom du panneau</label>
      <input class="input" id="rm-name" maxlength="50" value="${App.escapeHtml(data.name)}" placeholder="Rôles & notifications" />
      <label class="field-label">Style du panneau</label>
      <select class="dash-select" id="rm-mode">
        <option value="menu" ${data.mode !== 'buttons' ? 'selected' : ''}>📋 Menu déroulant (plusieurs rôles d'un coup)</option>
        <option value="buttons" ${data.mode === 'buttons' ? 'selected' : ''}>🔘 Boutons (un clic = un rôle, re-clic = retiré)</option>
      </select>
      <label class="field-label">Message au-dessus du panneau (optionnel)</label>
      <textarea class="input" id="rm-content" rows="2" placeholder="Choisissez vos rôles !">${App.escapeHtml(data.content)}</textarea>
      <label class="field-label">Texte d'attente du menu déroulant</label>
      <input class="input" id="rm-placeholder" maxlength="150" value="${App.escapeHtml(data.placeholder)}" />
      <label class="field-label">Salon où envoyer le panneau</label>
      <select class="dash-select" id="rm-channel">
        <option value="">— Choisir un salon —</option>
      </select>
      <label class="field-label">Options du menu <span id="rm-opt-count" style="font-weight:400;color:var(--d-dim)"></span></label>
      <div id="rm-options"></div>
      <button class="btn btn-sm btn-ghost" id="rm-add-opt" style="margin-top:8px">＋ Ajouter un rôle</button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="rm-save">💾 Enregistrer</button>
    </div>
  `);
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = App.closeModal);
  const optWrap = document.querySelector('#rm-options');

  // 📋 Sélecteur de salons : rempli avec les salons textuels du serveur
  // (fini la saisie à la main). L'ancienne valeur reste sélectionnée même
  // si le salon a été renommé/supprimé (option « actuelle » ajoutée).
  const chanSel = document.querySelector('#rm-channel');
  const guildData = (typeof Dashboard !== 'undefined' && Dashboard.state && Dashboard.state.guildData) || {};
  const chans = (guildData.channels || []).filter((ch) => !ch.category && !ch.voice);
  const current = String(data.channel || '');
  chans.forEach((ch) => {
    const val = `#${ch.name}`;
    const selected = typeof Dashboard !== 'undefined' && Dashboard.discordRefMatches
      ? Dashboard.discordRefMatches(current, ch)
      : current === val;
    chanSel.appendChild(App.el(`<option value="${App.escapeHtml(val)}" ${selected ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  });
  const channelKnown = chans.some((ch) => typeof Dashboard !== 'undefined' && Dashboard.discordRefMatches
    ? Dashboard.discordRefMatches(current, ch)
    : current === `#${ch.name}`);
  if (current && !channelKnown) {
    chanSel.appendChild(App.el(`<option value="${App.escapeHtml(current)}" selected>⚠️ ${App.escapeHtml(current)} (configuration actuelle — salon introuvable)</option>`));
  }

  const roleChoices = (guildData.roles || []).filter((r) => r.name !== '@everyone');
  const syncCount = () => {
    const n = (data.options || []).length;
    const el = document.querySelector('#rm-opt-count');
    if (el) el.textContent = `(${n}/${ROLE_MENU_MAX})`;
    const add = document.querySelector('#rm-add-opt');
    if (add) {
      add.disabled = n >= ROLE_MENU_MAX;
      add.textContent = n >= ROLE_MENU_MAX ? '✓ 25 rôles — maximum Discord' : '＋ Ajouter un rôle';
    }
  };
  const renderOpts = () => {
    optWrap.innerHTML = '';
    data.options.forEach((o, i) => {
      const roleOptions = [roleChoices.length ? '<option value="">— Choisir un rôle —</option>' : '<option value="" disabled>— Aucun rôle reçu de Discord —</option>']
        .concat(roleChoices.map((r) => {
          const selected = typeof Dashboard !== 'undefined' && Dashboard.discordRefMatches
            ? Dashboard.discordRefMatches(o.role, r)
            : o.role === r.name;
          return `<option value="${App.escapeHtml(r.name)}" ${selected ? 'selected' : ''}>🛡️ ${App.escapeHtml(r.name)}</option>`;
        }));
      const roleKnown = roleChoices.some((r) => typeof Dashboard !== 'undefined' && Dashboard.discordRefMatches
        ? Dashboard.discordRefMatches(o.role, r)
        : o.role === r.name);
      if (o.role && !roleKnown) {
        roleOptions.push(`<option value="${App.escapeHtml(o.role)}" selected>⚠️ ${App.escapeHtml(o.role)} (configuration actuelle — rôle introuvable)</option>`);
      }
      const roleControl = `<select class="dash-select" data-k="role">${roleOptions.join('')}</select>`;
      const row = App.el(`
        <div class="row-item" style="margin-top:7px">
          <input class="input" data-k="emoji" placeholder="😀" value="${App.escapeHtml(o.emoji)}" style="max-width:56px;text-align:center" />
          <input class="input" data-k="label" placeholder="Texte affiché" value="${App.escapeHtml(o.label)}" style="max-width:170px" />
          ${roleControl}
          <button class="btn btn-danger btn-icon btn-sm" data-del>🗑</button>
        </div>
      `);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        const event = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(event, () => { o[inp.dataset.k] = inp.value; });
      });
      row.querySelector('[data-del]').onclick = () => {
        data.options.splice(i, 1);
        renderOpts();
      };
      optWrap.appendChild(row);
    });
    syncCount();
  };
  renderOpts();
  document.querySelector('#rm-add-opt').onclick = () => {
    if (data.options.length >= ROLE_MENU_MAX) {
      return App.toast('Discord n’accepte que 25 rôles par panneau. Créez un second panneau pour les autres.', 'error');
    }
    data.options.push({ label: 'Nouveau rôle', emoji: '', role: '' });
    renderOpts();
  };

  document.querySelector('#rm-save').onclick = async () => {
    const payload = {
      guild_id: guildId,
      name: document.querySelector('#rm-name').value.trim() || 'Menu de rôles',
      mode: document.querySelector('#rm-mode').value === 'buttons' ? 'buttons' : 'menu',
      content: document.querySelector('#rm-content').value,
      placeholder: document.querySelector('#rm-placeholder').value.trim() || 'Choisissez vos rôles…',
      channel: document.querySelector('#rm-channel').value.trim(),
      options: data.options.filter(o => String(o.role).trim()),
    };
    if (!payload.options.length) return App.toast('Renseignez au moins un nom de rôle.', 'error');
    if (payload.options.length > ROLE_MENU_MAX) {
      return App.toast('Discord n’accepte que 25 rôles par panneau. Créez un second panneau pour les autres.', 'error');
    }
    const roleKeys = payload.options.map((o) => String(o.role).trim());
    if (new Set(roleKeys).size !== roleKeys.length) {
      return App.toast('Chaque rôle ne peut apparaître qu’une fois dans le panneau.', 'error');
    }
    try {
      if (isEdit) await App.api(`/role-menus/${menu.id}`, { method: 'PUT', body: payload });
      else await App.api(`/bots/${bot.id}/role-menus`, { method: 'POST', body: payload });
      // v219 : modifier un panneau DÉJÀ envoyé synchronise immédiatement le
      // message Discord en place (via /send qui édite au lieu de dupliquer).
      let synced = false, syncError = '';
      if (isEdit && menu.message_id) {
        try {
          const r = await App.api(`/role-menus/${menu.id}/send`, { method: 'POST' });
          synced = true;
          if (typeof Dashboard !== 'undefined' && Dashboard.state) {
            const target = (Dashboard.state.guildData && Dashboard.state.guildData.role_menus || []).find((x) => String(x.id) === String(menu.id));
            if (target && r) { target.message_id = r.message_id || target.message_id; target.message_channel = menu.message_channel; }
          }
        } catch (e) { syncError = (e && e.message) || 'impossible de joindre Discord'; }
      }
      App.closeModal();
      if (isEdit && menu.message_id) {
        if (synced) App.toast('Menu modifié et mis à jour sur Discord ✓');
        else App.toast('Menu modifié — mise à jour Discord impossible (' + syncError + ').', 'error');
      } else App.toast(isEdit ? 'Menu mis à jour !' : 'Menu créé !');
      if (typeof Dashboard !== 'undefined' && Dashboard.refresh) Dashboard.refresh();
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

const TICKET_EXTRA_MAX_TYPES = 25;

// v328 — éditeur d’un panneau MENU extra (ses propres types).
BotViews.openTicketMenuModal = (bot, guildId, menu) => {
  const isEdit = !!(menu && menu.id);
  const data = menu ? JSON.parse(JSON.stringify(menu)) : {
    name: 'Nouveau menu', channel: '', message: '', category: '',
    panel_texts: { title: '', welcome: '', menu_placeholder: '', info_title: '', rules: '', patience: '' },
    types: [{ label: 'Support', emoji: '🎫', description: '', category: '', staff_roles: [], questions: [] }],
  };
  if (typeof data.panel_texts === 'string') {
    try { data.panel_texts = JSON.parse(data.panel_texts || '{}') || {}; } catch { data.panel_texts = {}; }
  }
  if (!data.panel_texts || typeof data.panel_texts !== 'object') data.panel_texts = {};
  if (!Array.isArray(data.types) || !data.types.length) {
    data.types = [{ label: 'Support', emoji: '🎫', description: '', category: '', staff_roles: [], questions: [] }];
  }

  const guildData = (typeof Dashboard !== 'undefined' && Dashboard.state && Dashboard.state.guildData) || {};
  const chans = (guildData.channels || []).filter((ch) => !ch.category && !ch.voice);
  const cats = (guildData.channels || []).filter((ch) => ch.category);
  const rolesList = (guildData.roles || []).filter((r) => r.name !== '@everyone');
  const match = (ref, item) => (typeof Dashboard !== 'undefined' && Dashboard.discordRefMatches)
    ? Dashboard.discordRefMatches(ref, item) : String(ref) === String(item && item.name);

  const chanOpts = ['<option value="">— Choisir un salon —</option>']
    .concat(chans.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${match(data.channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  if (data.channel && !chans.some((ch) => match(data.channel, ch))) {
    chanOpts.push(`<option value="${App.escapeHtml(data.channel)}" selected>⚠️ ${App.escapeHtml(data.channel)}</option>`);
  }
  const catOpts = ['<option value="">— Catégorie du type, sinon celle par défaut —</option>']
    .concat(cats.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${match(data.category, ch) ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`));
  if (data.category && !cats.some((ch) => match(data.category, ch))) {
    catOpts.push(`<option value="${App.escapeHtml(data.category)}" selected>⚠️ ${App.escapeHtml(data.category)}</option>`);
  }
  const pt = data.panel_texts;

  App.modal(`
    <div class="modal-header"><h3>${isEdit ? '✏️ Modifier le panneau menu' : '📋 Nouveau panneau menu'}</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body">
      <div class="help-box" style="margin-bottom:14px">
        Ce panneau a <b>ses propres types</b>. Il n’utilise pas la liste du menu principal.
        Discord accepte 25 types maximum par menu.
      </div>
      <label class="field-label">Nom (pour vous, dans le dashboard)</label>
      <input class="input" id="xm-name" maxlength="80" value="${App.escapeHtml(data.name || '')}" placeholder="Recrutement, partenariats…" />
      <label class="field-label">Salon où envoyer le panneau</label>
      <select class="dash-select" id="xm-channel">${chanOpts.join('')}</select>
      <label class="field-label">Catégorie des tickets de CE menu</label>
      <select class="dash-select" id="xm-cat">${catOpts.join('')}</select>
      <label class="field-label">Message au-dessus du panneau (optionnel)</label>
      <textarea class="input" id="xm-msg" rows="2" placeholder="Choisissez le type de demande…">${App.escapeHtml(data.message || '')}</textarea>
      <label class="field-label">Texte du menu déroulant</label>
      <input class="input" id="xm-ph" maxlength="100" value="${App.escapeHtml(pt.menu_placeholder || '')}" placeholder="🗂️ Choisissez le type de ticket…" />
      <label class="field-label">Types de ce menu <span id="xm-count" style="font-weight:400;color:var(--d-dim)"></span></label>
      <div id="xm-types"></div>
      <button class="btn btn-sm btn-ghost" id="xm-add" style="margin-top:8px">＋ Ajouter un type</button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="xm-save">💾 Enregistrer</button>
    </div>
  `);
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = App.closeModal; });

  const typesEl = document.querySelector('#xm-types');
  const syncCount = () => {
    const n = data.types.length;
    const el = document.querySelector('#xm-count');
    if (el) el.textContent = `(${n}/${TICKET_EXTRA_MAX_TYPES})`;
    const add = document.querySelector('#xm-add');
    if (add) add.disabled = n >= TICKET_EXTRA_MAX_TYPES;
  };
  const roleSelect = (selected) => {
    const opts = [rolesList.length ? '<option value="">— Choisir un rôle —</option>' : '<option value="" disabled>— Aucun rôle —</option>']
      .concat(rolesList.map((r) => `<option value="${App.escapeHtml(r.name)}" ${match(selected, r) ? 'selected' : ''}>🛡️ ${App.escapeHtml(r.name)}</option>`));
    if (selected && !rolesList.some((r) => match(selected, r))) {
      opts.push(`<option value="${App.escapeHtml(selected)}" selected>⚠️ ${App.escapeHtml(selected)}</option>`);
    }
    return `<select class="dash-select" data-role>${opts.join('')}</select>`;
  };
  const catSelect = (selected) => {
    const opts = ['<option value="">— Catégorie du panneau —</option>']
      .concat(cats.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${match(selected, ch) ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`));
    if (selected && !cats.some((ch) => match(selected, ch))) {
      opts.push(`<option value="${App.escapeHtml(selected)}" selected>⚠️ ${App.escapeHtml(selected)}</option>`);
    }
    return `<select class="dash-select" data-k="category">${opts.join('')}</select>`;
  };
  const renderTypes = () => {
    typesEl.innerHTML = '';
    data.types.forEach((t, i) => {
      if (!Array.isArray(t.staff_roles)) t.staff_roles = [];
      if (!Array.isArray(t.questions)) t.questions = [];
      const row = App.el(`<div class="row-item" style="flex-wrap:wrap;margin-top:10px;padding:10px;border:1px solid var(--d-border,#333);border-radius:10px">
        <input class="input" data-k="emoji" placeholder="🎫" value="${App.escapeHtml(t.emoji || '')}" style="max-width:56px;text-align:center" />
        <input class="input" data-k="label" placeholder="Nom du type" value="${App.escapeHtml(t.label || '')}" style="flex:1;min-width:140px" />
        <button class="btn btn-danger btn-icon btn-sm" data-del>🗑</button>
        <input class="input" data-k="description" placeholder="Description (optionnel)" value="${App.escapeHtml(t.description || '')}" style="flex:1 1 100%;margin-top:6px" maxlength="100" />
        <div style="flex:1 1 100%;margin-top:6px"><label class="field-label">Catégorie de ce type</label>${catSelect(t.category)}</div>
        <div style="flex:1 1 100%;margin-top:6px" data-staff></div>
        <button class="btn btn-sm btn-ghost" data-addrole style="margin-top:4px">＋ Rôle staff</button>
        <div style="flex:1 1 100%;margin-top:6px" data-qs></div>
        <button class="btn btn-sm btn-ghost" data-addq style="margin-top:4px">＋ Question</button>
      </div>`);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ev, () => { t[inp.dataset.k] = inp.value; });
      });
      row.querySelector('[data-del]').onclick = () => { data.types.splice(i, 1); if (!data.types.length) data.types.push({ label: '', emoji: '🎫', description: '', category: '', staff_roles: [], questions: [] }); renderTypes(); };
      const staffEl = row.querySelector('[data-staff]');
      const paintStaff = () => {
        staffEl.innerHTML = t.staff_roles.length ? '' : '<div class="desc">Aucun rôle staff propre à ce type (le rôle global s’applique).</div>';
        t.staff_roles.forEach((ref, j) => {
          const line = App.el(`<div style="display:flex;gap:7px;margin-top:4px">${roleSelect(ref)}<button class="btn btn-danger btn-sm" data-rm>🗑</button></div>`);
          line.querySelector('[data-role]').addEventListener('change', (e) => { t.staff_roles[j] = e.target.value; });
          line.querySelector('[data-rm]').onclick = () => { t.staff_roles.splice(j, 1); paintStaff(); };
          staffEl.appendChild(line);
        });
      };
      paintStaff();
      row.querySelector('[data-addrole]').onclick = () => { t.staff_roles.push(''); paintStaff(); };
      const qsEl = row.querySelector('[data-qs]');
      const paintQs = () => {
        qsEl.innerHTML = '';
        t.questions.forEach((q, j) => {
          const line = App.el(`<div style="display:flex;gap:7px;margin-top:4px"><input class="input" value="${App.escapeHtml(q)}" placeholder="Question ${j + 1}" maxlength="45" /><button class="btn btn-danger btn-sm">🗑</button></div>`);
          line.querySelector('input').addEventListener('input', (e) => { t.questions[j] = e.target.value; });
          line.querySelector('button').onclick = () => { t.questions.splice(j, 1); paintQs(); };
          qsEl.appendChild(line);
        });
      };
      paintQs();
      row.querySelector('[data-addq]').onclick = () => {
        if (t.questions.length >= 5) return App.toast('5 questions maximum par type.', 'error');
        t.questions.push('');
        paintQs();
      };
      typesEl.appendChild(row);
    });
    syncCount();
  };
  renderTypes();
  document.querySelector('#xm-add').onclick = () => {
    if (data.types.length >= TICKET_EXTRA_MAX_TYPES) return App.toast('Discord n’accepte que 25 types par menu.', 'error');
    data.types.push({ label: '', emoji: '🎫', description: '', category: '', staff_roles: [], questions: [] });
    renderTypes();
  };

  document.querySelector('#xm-save').onclick = async () => {
    const payload = {
      guild_id: guildId,
      name: document.querySelector('#xm-name').value.trim() || 'Menu de tickets',
      channel: document.querySelector('#xm-channel').value.trim(),
      category: document.querySelector('#xm-cat').value.trim(),
      message: document.querySelector('#xm-msg').value,
      panel_texts: { menu_placeholder: document.querySelector('#xm-ph').value.trim() },
      types: data.types.map((t) => ({
        ...t,
        label: String(t.label || '').trim(),
        staff_roles: (t.staff_roles || []).map((r) => String(r || '').trim()).filter(Boolean),
        questions: (t.questions || []).map((q) => String(q || '').trim()).filter(Boolean),
      })).filter((t) => t.label),
    };
    if (!payload.types.length) return App.toast('Ajoutez au moins un type (avec un nom).', 'error');
    try {
      if (isEdit) await App.api(`/ticket-menus/${menu.id}`, { method: 'PUT', body: payload });
      else await App.api(`/bots/${bot.id}/ticket-menus`, { method: 'POST', body: payload });
      App.closeModal();
      App.toast(isEdit ? 'Panneau menu enregistré.' : 'Nouveau panneau menu créé.');
      if (typeof Dashboard !== 'undefined' && Dashboard.refresh) Dashboard.refresh();
    } catch (e) { App.toast(e.message, 'error'); }
  };
};
