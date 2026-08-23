// ============================================================
// BotDev - Vues utilitaires (dashboard v2)
// Seul l'éditeur de menus de rôles vit ici : tout le reste est
// rendu par Dashboard (dashboard.js).
// ============================================================
const BotViews = {};

// Éditeur de menu de rôles (modale) — utilisé par le module « Rôles »
BotViews.openRoleMenuModal = (bot, guildId, menu) => {
  const isEdit = !!menu;
  const data = menu ? JSON.parse(JSON.stringify(menu)) : { name: '', content: '', placeholder: 'Choisis tes rôles…', channel: '', options: [{ label: 'Notifications', emoji: '🔔', role: '' }] };

  App.modal(`
    <div class="modal-header"><h3>${isEdit ? '✏️ Modifier le menu' : '📋 Nouveau menu de rôles'}</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body">
      <div class="help-box" style="margin-bottom:14px">
        Chaque option attribue (ou retire) un rôle quand le membre la choisit.
        Saisis le <b>nom exact du rôle</b> tel qu'il existe sur ton serveur Discord.
      </div>
      <label class="field-label">Nom du panneau</label>
      <input class="input" id="rm-name" maxlength="50" value="${App.escapeHtml(data.name)}" placeholder="Rôles & notifications" />
      <label class="field-label">Style du panneau</label>
      <select class="input" id="rm-mode">
        <option value="menu" ${data.mode !== 'buttons' ? 'selected' : ''}>📋 Menu déroulant (plusieurs rôles d'un coup)</option>
        <option value="buttons" ${data.mode === 'buttons' ? 'selected' : ''}>🔘 Boutons (un clic = un rôle, re-clic = retiré)</option>
      </select>
      <label class="field-label">Message au-dessus du panneau (optionnel)</label>
      <textarea class="input" id="rm-content" rows="2" placeholder="Choisis tes rôles !">${App.escapeHtml(data.content)}</textarea>
      <label class="field-label">Texte d'attente du menu déroulant</label>
      <input class="input" id="rm-placeholder" maxlength="150" value="${App.escapeHtml(data.placeholder)}" />
      <label class="field-label">Salon où envoyer le panneau</label>
      <select class="input" id="rm-channel">
        <option value="">— Choisir un salon —</option>
      </select>
      <label class="field-label">Options du menu</label>
      <div id="rm-options"></div>
      <button class="btn btn-sm btn-ghost" id="rm-add-opt" style="margin-top:8px">＋ Ajouter un rôle</button>
      <datalist id="rm-roles-list"></datalist>
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
    chanSel.appendChild(App.el(`<option value="${App.escapeHtml(val)}" ${current === val ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  });
  if (current && ![...chanSel.options].some((o) => o.value === current)) {
    chanSel.appendChild(App.el(`<option value="${App.escapeHtml(current)}" selected>${App.escapeHtml(current)} (actuel)</option>`));
  }

  // 🏷️ Suggestions automatiques des noms de rôles (datalist)
  const rolesDl = document.querySelector('#rm-roles-list');
  (guildData.roles || []).filter((r) => r.name !== '@everyone').forEach((r) => {
    rolesDl.appendChild(App.el(`<option value="${App.escapeHtml(r.name)}"></option>`));
  });

  const renderOpts = () => {
    optWrap.innerHTML = '';
    data.options.forEach((o, i) => {
      const row = App.el(`
        <div class="row-item" style="margin-top:7px">
          <input class="input" data-k="emoji" placeholder="😀" value="${App.escapeHtml(o.emoji)}" style="max-width:56px;text-align:center" />
          <input class="input" data-k="label" placeholder="Texte affiché" value="${App.escapeHtml(o.label)}" style="max-width:170px" />
          <input class="input" data-k="role" placeholder="Nom exact du rôle" value="${App.escapeHtml(o.role)}" list="rm-roles-list" />
          <button class="btn btn-danger btn-icon btn-sm" data-del>🗑</button>
        </div>
      `);
      row.querySelectorAll('[data-k]').forEach(inp => {
        inp.addEventListener('input', () => { o[inp.dataset.k] = inp.value; });
      });
      row.querySelector('[data-del]').onclick = () => {
        data.options.splice(i, 1);
        renderOpts();
      };
      optWrap.appendChild(row);
    });
  };
  renderOpts();
  document.querySelector('#rm-add-opt').onclick = () => {
    data.options.push({ label: 'Nouveau rôle', emoji: '', role: '' });
    renderOpts();
  };

  document.querySelector('#rm-save').onclick = async () => {
    const payload = {
      guild_id: guildId,
      name: document.querySelector('#rm-name').value.trim() || 'Menu de rôles',
      mode: document.querySelector('#rm-mode').value === 'buttons' ? 'buttons' : 'menu',
      content: document.querySelector('#rm-content').value,
      placeholder: document.querySelector('#rm-placeholder').value.trim() || 'Choisis tes rôles…',
      channel: document.querySelector('#rm-channel').value.trim(),
      options: data.options.filter(o => String(o.role).trim()),
    };
    if (!payload.options.length) return App.toast('Renseigne au moins un nom de rôle.', 'error');
    try {
      if (isEdit) await App.api(`/role-menus/${menu.id}`, { method: 'PUT', body: payload });
      else await App.api(`/bots/${bot.id}/role-menus`, { method: 'POST', body: payload });
      App.closeModal();
      App.toast(isEdit ? 'Menu mis à jour !' : 'Menu créé !');
      if (typeof Dashboard !== 'undefined' && Dashboard.refresh) Dashboard.refresh();
    } catch (e) { App.toast(e.message, 'error'); }
  };
};
