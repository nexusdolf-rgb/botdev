// ============================================================
// BotDev - Vues du dashboard (bot)
// ============================================================
const BotViews = {};

BotViews.setContent = (content, html) => {
  content.innerHTML = '';
  content.appendChild(App.el(html));
  return content.firstElementChild;
};

// ---------------------- Vue d'ensemble ----------------------
BotViews.renderOverview = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  try {
    const { bot: fresh } = await App.api(`/bots/${bot.id}`);
    App.state.bot = fresh;
    const enabledMods = Object.values(fresh.modules || {}).filter(Boolean).length;
    const enabledEvents = fresh.events_count || 0;

    const el = BotViews.setContent(content, `
      <div class="stats-grid">
        <div class="stat-card"><div class="val">${fresh.online ? fresh.guilds.length : '—'}</div><div class="lbl">Serveurs</div></div>
        <div class="stat-card"><div class="val">${fresh.commands_count}</div><div class="lbl">Commandes</div></div>
        <div class="stat-card"><div class="val">${enabledMods}/4</div><div class="lbl">Modules actifs</div></div>
        <div class="stat-card"><div class="val">${enabledEvents}/3</div><div class="lbl">Événements actifs</div></div>
      </div>
      ${fresh.last_error ? `<div class="card" style="border-color:rgba(254,231,92,.45);background:rgba(254,231,92,.04)">
        <h3>⚠️ À corriger</h3>
        <div class="card-sub" style="margin-bottom:0">${App.escapeHtml(fresh.last_error)}</div>
      </div>` : ''}
      <div class="card">
        <div class="card-head-row">
          <div>
            <h3>🌍 Serveurs</h3>
            <div class="card-sub">Les serveurs où ton bot est présent.</div>
          </div>
          <button class="btn btn-primary" id="invite2" ${fresh.invite_url ? '' : 'disabled'}>➕ Inviter sur un serveur</button>
        </div>
        <div id="guild-list">
          ${!fresh.online ? `<div class="empty-state"><div class="big">💤</div>Démarre le bot pour voir ses serveurs.</div>`
          : fresh.guilds.length === 0 ? `<div class="empty-state"><div class="big">🌱</div>Ton bot n'est encore sur aucun serveur.<br/>Clique sur « Inviter » pour l'ajouter.</div>`
          : fresh.guilds.map(g => `
            <div class="guild-row">
              ${g.icon ? `<img src="${App.escapeHtml(g.icon)}" alt="" />` : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23232333'/%3E%3Ctext x='50' y='62' font-size='40' text-anchor='middle' fill='%235865F2' font-family='sans-serif'%3E%3F%3C/text%3E%3C/svg%3E" alt="" />`}
              <div>
                <div class="gname">${App.escapeHtml(g.name)}</div>
                <div class="gmeta">ID : ${g.id}</div>
              </div>
              <div class="gmeta-r">👥 ${g.members} membres</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <h3>🚀 Démarrage rapide</h3>
        <div class="card-sub">Les étapes essentielles pour profiter de BotDev.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="go-cmds">🧩 Créer une commande</button>
          <button class="btn" id="go-mods">📦 Activer des modules</button>
          <button class="btn" id="go-servers">🌍 Configurer un serveur</button>
        </div>
      </div>
    `);
    el.querySelector('#invite2').onclick = () => navigator.clipboard.writeText(fresh.invite_url).then(() => App.toast('Lien d\'invitation copié !'));
    el.querySelector('#go-cmds').onclick = () => App.router.go(`/bots/${bot.id}/commands`);
    el.querySelector('#go-mods').onclick = () => App.router.go(`/bots/${bot.id}/modules`);
    el.querySelector('#go-servers').onclick = () => App.router.go(`/bots/${bot.id}/servers`);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Commandes ----------------------
BotViews.renderCommands = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  try {
    const { commands } = await App.api(`/bots/${bot.id}/commands`);
    const el = BotViews.setContent(content, `
      <div class="toolbar">
        <div>
          <h2 style="font-size:19px">🧩 Commandes</h2>
          <p class="card-sub" style="margin-bottom:0">Tes commandes personnalisées construites avec des blocs.</p>
        </div>
        <button class="btn btn-primary" id="new-cmd">＋ Nouvelle commande</button>
      </div>
      <div id="cmd-list">
        ${commands.length === 0 ? `<div class="empty-state"><div class="big">🧩</div>Aucune commande pour l'instant.<br/>Crée ta première commande en quelques clics !</div>` : ''}
      </div>
    `);
    const list = el.querySelector('#cmd-list');
    commands.forEach((cmd) => {
      const triggerChip = {
        prefix: `!${cmd.trigger_value || cmd.name}`,
        slash: `/${cmd.name}`,
        keyword: `mot-clé : ${cmd.trigger_value}`,
      }[cmd.trigger_type] || cmd.trigger_type;
      const blocks = JSON.parse(cmd.blocks || '[]');
      const row = App.el(`
        <div class="cmd-row">
          <div>
            <div class="cname">${App.escapeHtml(cmd.name)}</div>
            <div class="cdesc">${App.escapeHtml(cmd.description || 'Aucune description')}</div>
          </div>
          <div class="right">
            <span class="chip">${App.escapeHtml(triggerChip)}</span>
            <span class="chip">${blocks.length} bloc(s)</span>
            ${cmd.cooldown ? `<span class="chip">⏱ ${cmd.cooldown}s</span>` : ''}
            <label class="switch" title="Activer / désactiver">
              <input type="checkbox" data-toggle ${cmd.enabled ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
            <button class="icon-btn" data-edit title="Modifier">✏️</button>
            <button class="icon-btn" data-del title="Supprimer">🗑</button>
          </div>
        </div>
      `);
      row.onclick = (e) => {
        if (e.target.closest('[data-toggle], [data-del]')) return;
        Editor.open(bot, cmd, commands);
      };
      row.querySelector('[data-edit]').onclick = () => Editor.open(bot, cmd, commands);
      row.querySelector('[data-toggle]').onchange = async (e) => {
        try {
          await App.api(`/commands/${cmd.id}`, { method: 'PATCH', body: { enabled: e.target.checked } });
          App.toast(e.target.checked ? 'Commande activée' : 'Commande désactivée');
        } catch (err) { App.toast(err.message, 'error'); e.target.checked = !e.target.checked; }
      };
      row.querySelector('[data-del]').onclick = async () => {
        if (!(await App.confirm(`Supprimer la commande « ${cmd.name} » ?`))) return;
        try {
          await App.api(`/commands/${cmd.id}`, { method: 'DELETE' });
          App.toast('Commande supprimée.');
          BotViews.renderCommands(content, bot);
        } catch (err) { App.toast(err.message, 'error'); }
      };
      list.appendChild(row);
    });
    el.querySelector('#new-cmd').onclick = () => Editor.open(bot, null, commands);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Modules ----------------------
BotViews.renderModules = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  try {
    const { modules } = await App.api(`/bots/${bot.id}/modules`);
    const el = BotViews.setContent(content, `
      <h2 style="font-size:19px">📦 Modules</h2>
      <p class="card-sub">Active des commandes pré-faites en un clic — elles fonctionnent immédiatement.</p>
      <div class="modules-grid" id="mods-grid"></div>
    `);
    const grid = el.querySelector('#mods-grid');
    modules.forEach((mod) => {
      const card = App.el(`
        <div class="module-card">
          <div class="m-head">
            <span class="m-emoji">${mod.emoji}</span>
            <h3>${mod.label}</h3>
            <label class="switch">
              <input type="checkbox" ${mod.enabled ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
          <div class="m-desc">${App.escapeHtml(mod.description)}</div>
          <div class="m-cmds">
            ${mod.commands.map(c => `<span class="chip">${App.escapeHtml(bot.prefix)}${c.name}</span>`).join('')}
          </div>
        </div>
      `);
      card.querySelector('input').onchange = async (e) => {
        try {
          await App.api(`/bots/${bot.id}/modules/${mod.key}`, { method: 'PUT', body: { enabled: e.target.checked } });
          App.toast(`Module ${mod.label} ${e.target.checked ? 'activé' : 'désactivé'} !`);
        } catch (err) { App.toast(err.message, 'error'); e.target.checked = !e.target.checked; }
      };
      grid.appendChild(card);
    });
  } catch (e) {
    content.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Événements ----------------------
BotViews.renderEvents = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  try {
    const { defs, events } = await App.api(`/bots/${bot.id}/events`);
    const el = BotViews.setContent(content, `
      <h2 style="font-size:19px">👋 Événements</h2>
      <p class="card-sub">Réagis automatiquement à ce qui se passe sur le serveur.</p>
      <div id="ev-grid"></div>
    `);
    const grid = el.querySelector('#ev-grid');
    Object.entries(defs).forEach(([key, def]) => {
      const ev = events[key] || { enabled: false, config: {} };
      const card = App.el(`
        <div class="card">
          <div class="card-head-row">
            <div>
              <h3>${def.emoji} ${def.label}</h3>
              <div class="card-sub" style="margin-bottom:0">${App.escapeHtml(def.description)}</div>
            </div>
            <label class="switch">
              <input type="checkbox" ${ev.enabled ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
          <div class="ev-config" style="margin-top:14px;${ev.enabled ? '' : 'opacity:.45;pointer-events:none'}">
            ${def.config.map(f => {
              if (f.type === 'checkbox') {
                return `<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--text-dim);cursor:pointer">
                  <input type="checkbox" data-k="${f.key}" ${ev.config[f.key] ? 'checked' : ''} /> ${f.label}
                </label>`;
              }
              return `<label class="field-label">${f.label}</label>
                ${f.type === 'multiline'
                  ? `<textarea class="input" rows="2" data-k="${f.key}" placeholder="${f.placeholder || ''}">${App.escapeHtml(ev.config[f.key] ?? f.default ?? '')}</textarea>`
                  : `<input class="input" data-k="${f.key}" value="${App.escapeHtml(ev.config[f.key] ?? '')}" placeholder="${f.placeholder || ''}" />`}`;
            }).join('')}
            <button class="btn btn-primary" style="margin-top:14px">💾 Enregistrer</button>
          </div>
        </div>
      `);
      const toggle = card.querySelector('.switch input');
      const configEl = card.querySelector('.ev-config');
      const saveBtn = card.querySelector('.ev-config .btn');

      const collect = () => {
        const config = {};
        configEl.querySelectorAll('[data-k]').forEach(inp => {
          config[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value;
        });
        return config;
      };
      toggle.onchange = () => {
        configEl.style.opacity = toggle.checked ? '' : '.45';
        configEl.style.pointerEvents = toggle.checked ? '' : 'none';
      };
      saveBtn.onclick = async () => {
        try {
          await App.api(`/bots/${bot.id}/events/${key}`, { method: 'PUT', body: { enabled: toggle.checked, config: collect() } });
          App.toast('Événement enregistré !');
        } catch (err) { App.toast(err.message, 'error'); }
      };
      grid.appendChild(card);
    });
  } catch (e) {
    content.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Panneaux (tickets + menus de rôles) ----------------------
BotViews.renderPanels = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  let fresh;
  try {
    const r = await App.api(`/bots/${bot.id}`);
    fresh = r.bot;
    App.state.bot = fresh;
  } catch (e) {
    content.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
    return;
  }
  if (!fresh.online || !fresh.guilds.length) {
    content.innerHTML = `<div class="empty-state"><div class="big">🎛️</div>Démarre le bot et invite-le sur un serveur pour configurer les panneaux.</div>`;
    return;
  }

  const el = BotViews.setContent(content, `
    <h2 style="font-size:19px">🎛️ Panneaux</h2>
    <p class="card-sub">Configure tout ici OU directement sur Discord avec <b>/ticket</b> et <b>/roles</b> (comme Ticket Tool).</p>
    <div class="card" style="padding:16px 22px">
      <label class="field-label">Serveur</label>
      <select class="select" id="panel-guild" style="max-width:380px">
        ${fresh.guilds.map(g => `<option value="${g.id}">${App.escapeHtml(g.name)}</option>`).join('')}
      </select>
    </div>
    <div id="panels-wrap"></div>
  `);
  const guildPick = el.querySelector('#panel-guild');
  const wrap = el.querySelector('#panels-wrap');

  const load = async () => {
    const guildId = guildPick.value;
    wrap.innerHTML = '<div class="spinner"></div>';
    let data;
    try {
      data = await App.api(`/bots/${bot.id}/panels?guild_id=${guildId}`);
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
      return;
    }
    const { tickets, role_menus } = data;
    wrap.innerHTML = '';

    // ---------- Tickets ----------
    const tCard = App.el(`
      <div class="card">
        <div class="card-head-row">
          <div>
            <h3>🎫 Système de tickets</h3>
            <div class="card-sub">Un bouton dans un salon : chaque clic crée un salon privé réservé au membre (et au staff).</div>
          </div>
          <div style="max-width:320px">
            <div class="help-box" style="font-size:12px">💡 <b>Encore plus rapide sur Discord :</b><br/>
            <code>/ticket setup</code> — assistant pas à pas (nom → catégorie → salon → rôle)<br/>
            <code>/ticket panel</code> — envoie le panneau<br/>
            <code>/ticket config</code> — voir la configuration</div>
          </div>
        </div>
        <div style="max-width:560px">
          <label class="field-label">Nom du panel</label>
          <input class="input" id="t-name" value="${App.escapeHtml(tickets.name || '')}" placeholder="Support" />
          <label class="field-label">Salon du panneau (mention, ex : #support)</label>
          <input class="input" id="t-channel" value="${App.escapeHtml(tickets.channel || '')}" placeholder="#support" />
          <label class="field-label">Message du panneau</label>
          <textarea class="input" id="t-message" rows="2">${App.escapeHtml(tickets.message || '')}</textarea>
          <label class="field-label">Texte du bouton</label>
          <input class="input" id="t-label" value="${App.escapeHtml(tickets.button_label || '')}" />
          <label class="field-label">Rôle du staff (peut voir les tickets, optionnel)</label>
          <input class="input" id="t-role" value="${App.escapeHtml(tickets.support_role || '')}" placeholder="Staff" />
          <label class="field-label">Catégorie (créée automatiquement si absente)</label>
          <input class="input" id="t-cat" value="${App.escapeHtml(tickets.category || '')}" placeholder="Tickets" />
          <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
            <button class="btn btn-primary" id="t-save">💾 Enregistrer</button>
            <button class="btn" id="t-send">📨 Envoyer le panneau</button>
          </div>
        </div>
      </div>
    `);
    tCard.querySelector('#t-save').onclick = async () => {
      try {
        await App.api(`/bots/${bot.id}/tickets`, {
          method: 'PUT',
          body: {
            guild_id: guildId,
            name: tCard.querySelector('#t-name').value.trim(),
            channel: tCard.querySelector('#t-channel').value.trim(),
            message: tCard.querySelector('#t-message').value,
            button_label: tCard.querySelector('#t-label').value.trim() || '🎫 Ouvrir un ticket',
            support_role: tCard.querySelector('#t-role').value.trim(),
            category: tCard.querySelector('#t-cat').value.trim() || 'Tickets',
          },
        });
        App.toast('Configuration des tickets enregistrée !');
      } catch (e) { App.toast(e.message, 'error'); }
    };
    tCard.querySelector('#t-send').onclick = async () => {
      try {
        await App.api(`/bots/${bot.id}/tickets/send`, { method: 'POST', body: { guild_id: guildId } });
        App.toast('Panneau de tickets envoyé ! 🎫');
      } catch (e) { App.toast(e.message, 'error'); }
    };
    wrap.appendChild(tCard);

    // ---------- Menus de rôles ----------
    const rCard = App.el(`
      <div class="card">
        <div class="card-head-row">
          <div>
            <h3>📋 Menus de rôles</h3>
            <div class="card-sub" style="margin-bottom:0">Un menu déroulant où les membres choisissent leurs rôles. Envoie-le avec <b>/roles send</b> sur Discord.</div>
          </div>
          <button class="btn btn-primary" id="rm-new">＋ Nouveau menu</button>
        </div>
        <div id="rm-list" style="margin-top:14px"></div>
      </div>
    `);
    const rmList = rCard.querySelector('#rm-list');
    const renderMenus = () => {
      if (!role_menus.length) {
        rmList.innerHTML = `<div class="empty-state"><div class="big">📋</div>Aucun menu pour l'instant. Crée ton premier menu de rôles !</div>`;
      } else {
        rmList.innerHTML = '';
        role_menus.forEach((m) => {
          const row = App.el(`
            <div class="cmd-row">
              <div>
                <div class="cname">${App.escapeHtml(m.name)}</div>
                <div class="cdesc">${m.options.length} rôle(s) · ${m.channel ? 'salon : ' + App.escapeHtml(m.channel) : 'salon non défini'}</div>
              </div>
              <div class="right">
                <button class="btn btn-sm" data-send>📨 Envoyer</button>
                <button class="icon-btn" data-edit title="Modifier">✏️</button>
                <button class="icon-btn" data-del title="Supprimer">🗑</button>
              </div>
            </div>
          `);
          row.querySelector('[data-send]').onclick = async () => {
            try {
              await App.api(`/role-menus/${m.id}/send`, { method: 'POST' });
              App.toast('Menu envoyé ! 📋');
            } catch (e) { App.toast(e.message, 'error'); }
          };
          row.querySelector('[data-edit]').onclick = () => BotViews.openRoleMenuModal(bot, guildId, m);
          row.querySelector('[data-del]').onclick = async () => {
            if (!(await App.confirm(`Supprimer le menu « ${m.name} » ?`))) return;
            try {
              await App.api(`/role-menus/${m.id}`, { method: 'DELETE' });
              App.toast('Menu supprimé.');
              load();
            } catch (e) { App.toast(e.message, 'error'); }
          };
          rmList.appendChild(row);
        });
      }
    };
    renderMenus();
    rCard.querySelector('#rm-new').onclick = () => BotViews.openRoleMenuModal(bot, guildId, null);
    wrap.appendChild(rCard);
  };
  guildPick.onchange = load;
  load();
};

// Éditeur de menu de rôles (modale)
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
      <label class="field-label">Nom du menu</label>
      <input class="input" id="rm-name" maxlength="50" value="${App.escapeHtml(data.name)}" placeholder="Rôles & notifications" />
      <label class="field-label">Message au-dessus du menu (optionnel)</label>
      <textarea class="input" id="rm-content" rows="2" placeholder="Choisis tes rôles !">${App.escapeHtml(data.content)}</textarea>
      <label class="field-label">Texte d'attente du menu déroulant</label>
      <input class="input" id="rm-placeholder" maxlength="150" value="${App.escapeHtml(data.placeholder)}" />
      <label class="field-label">Salon où envoyer le menu (mention, ex : #rôles)</label>
      <input class="input" id="rm-channel" value="${App.escapeHtml(data.channel)}" placeholder="#rôles" />
      <label class="field-label">Options du menu</label>
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

  const renderOpts = () => {
    optWrap.innerHTML = '';
    data.options.forEach((o, i) => {
      const row = App.el(`
        <div class="row-item" style="margin-top:7px">
          <input class="input" data-k="emoji" placeholder="😀" value="${App.escapeHtml(o.emoji)}" style="max-width:56px;text-align:center" />
          <input class="input" data-k="label" placeholder="Texte affiché" value="${App.escapeHtml(o.label)}" style="max-width:170px" />
          <input class="input" data-k="role" placeholder="Nom exact du rôle" value="${App.escapeHtml(o.role)}" />
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
      BotViews.renderServerConfig(document.querySelector('.bot-content'), bot, guildId);
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------------------- Serveurs (façon DraftBot) ----------------------
// Liste des serveurs Discord de l'utilisateur (après connexion Discord)
BotViews.renderServers = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  const el = BotViews.setContent(content, `
    <h2 style="font-size:19px">🌍 Serveurs Discord</h2>
    <p class="card-sub">Configure ${App.escapeHtml(bot.name)} sur chacun de tes serveurs — tickets, bienvenue, rôles, modération…</p>
    <div id="srv-wrap"></div>
  `);
  const wrap = el.querySelector('#srv-wrap');

  // 1) Récupération des serveurs Discord de l'utilisateur
  let data;
  try {
    data = await App.api('/discord/guilds');
  } catch (e) {
    if (e.message === 'Compte Discord non lié') {
      wrap.innerHTML = `
        <div class="card" style="border-color:rgba(88,101,242,.45);background:rgba(88,101,242,.06)">
          <h3>🔗 Lie ton compte Discord</h3>
          <div class="card-sub">Pour configurer tes serveurs depuis le dashboard (comme DraftBot), connecte d'abord ton compte Discord. On vérifiera automatiquement que tu es bien propriétaire ou admin de chaque serveur.</div>
          <button class="btn btn-discord" id="link-discord">🎮 Lier mon compte Discord</button>
        </div>
        <div class="help-box" style="margin-top:12px">
          💡 <b>Sinon, tout est aussi configurable directement sur Discord</b> : <code>/ticket setup</code>, <code>/roles list</code>, etc. Le dashboard, c'est juste en plus.
        </div>`;
      wrap.querySelector('#link-discord').onclick = async () => {
        try {
          const { url } = await App.api('/auth/discord/url');
          window.location.href = url;
        } catch (err) { App.toast(err.message, 'error'); }
      };
      return;
    }
    wrap.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
    return;
  }

  const { guilds, discord } = data;
  const header = App.el(`
    <div class="card" style="display:flex;align-items:center;gap:13px;padding:16px 22px">
      <span style="font-size:26px">🎮</span>
      <div>
        <b>Connecté en tant que ${App.escapeHtml(discord ? discord.username : 'Discord')}</b>
        <div class="card-sub" style="margin:0">${guilds.length} serveur(s) trouvé(s). Les serveurs marqués « gérer » sont configurables ici.</div>
      </div>
    </div>
  `);
  wrap.appendChild(header);

  if (!guilds.length) {
    wrap.appendChild(App.el(`<div class="empty-state"><div class="big">🌱</div>Tu n'es sur aucun serveur Discord.</div>`));
    return;
  }

  guilds.forEach((g) => {
    const row = App.el(`
      <div class="cmd-row" style="cursor:default">
        ${g.icon
          ? `<img src="${App.escapeHtml(g.icon)}" style="width:44px;height:44px;border-radius:13px" alt="" />`
          : `<div style="width:44px;height:44px;border-radius:13px;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:18px">🌍</div>`}
        <div>
          <div class="cname">${App.escapeHtml(g.name)}</div>
          <div class="cdesc" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:5px">
            <span class="chip">${g.hasBot ? '🟢 ' + App.escapeHtml(bot.name) + ' présent' : '➕ ' + App.escapeHtml(bot.name) + ' absent'}</span>
            ${g.owner ? '<span class="chip">👑 Propriétaire</span>' : ''}
            ${g.canManage ? '<span class="chip">🛡️ Tu peux gérer</span>' : '<span class="chip">👀 Lecture seule</span>'}
          </div>
        </div>
        <div class="right">
          ${g.hasBot && g.canManage
            ? `<button class="btn btn-primary btn-sm" data-open>⚙️ Configurer</button>`
            : g.canManage
              ? `<button class="btn btn-sm" data-invite>➕ Ajouter le bot</button>`
              : `<button class="btn btn-sm" disabled>Accès limité</button>`}
        </div>
      </div>
    `);
    const openBtn = row.querySelector('[data-open]');
    if (openBtn) openBtn.onclick = () => App.router.go(`/bots/${bot.id}/servers/${g.id}`);
    const invBtn = row.querySelector('[data-invite]');
    if (invBtn) invBtn.onclick = () => navigator.clipboard.writeText(bot.invite_url).then(() => App.toast('Lien d\'invitation copié ! Ajoute le bot puis reviens ici.'));
    wrap.appendChild(row);
  });
};

// Page de configuration d'un serveur (façon DraftBot)
BotViews.renderServerConfig = async (content, bot, guildId) => {
  content.innerHTML = '<div class="spinner"></div>';
  let data;
  try {
    data = await App.api(`/bots/${bot.id}/guilds/${guildId}`);
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><div class="big">🔒</div>${App.escapeHtml(e.message)}<br/><br/>
      <button class="btn" id="back-list">← Retour aux serveurs</button></div>`;
    content.querySelector('#back-list').onclick = () => App.router.go(`/bots/${bot.id}/servers`);
    return;
  }
  const { guild, settings, tickets, events, role_menus } = data;
  const evState = events.state || {};

  const el = BotViews.setContent(content, `
    <div class="bot-header" style="margin-bottom:16px">
      <button class="btn btn-ghost btn-icon" id="back-servers" title="Retour">←</button>
      ${guild.icon ? `<img class="avatar" src="${App.escapeHtml(guild.icon)}" alt="" />` : '<div class="avatar fallback">🌍</div>'}
      <div>
        <h2>${App.escapeHtml(guild.name)}</h2>
        <div class="sub">👥 ${guild.members} membres · configuration de ${App.escapeHtml(bot.name)} sur ce serveur</div>
      </div>
    </div>
    <div id="cfg-wrap"></div>
  `);
  content.querySelector('#back-servers').onclick = () => App.router.go(`/bots/${bot.id}/servers`);
  const wrap = el.querySelector('#cfg-wrap');
  const toast = (msg) => App.toast(msg);
  const err = (e) => App.toast(e.message, 'error');

  // ---------- 1. Paramètres du serveur ----------
  const sCard = App.el(`
    <div class="card">
      <h3>⚙️ Paramètres du serveur</h3>
      <div class="card-sub">Le préfixe remplace celui du bot sur ce serveur uniquement. L'auto-modération agit après X avertissements.</div>
      <div class="grid2" style="max-width:640px">
        <div>
          <label class="field-label">Préfixe (vide = préfixe du bot « ${App.escapeHtml(bot.prefix)} »)</label>
          <input class="input" id="g-prefix" maxlength="5" value="${App.escapeHtml(settings.prefix || '')}" placeholder="${App.escapeHtml(bot.prefix)}" />
        </div>
        <div>
          <label class="field-label">Limite d'avertissements (0 = désactivé)</label>
          <input class="input" id="g-warnlimit" type="number" min="0" max="50" value="${settings.warn_limit || 0}" />
        </div>
        <div>
          <label class="field-label">Action à la limite</label>
          <select class="select" id="g-warnaction">
            <option value="none" ${settings.warn_action === 'none' ? 'selected' : ''}>Aucune</option>
            <option value="kick" ${settings.warn_action === 'kick' ? 'selected' : ''}>👢 Expulser (kick)</option>
            <option value="ban" ${settings.warn_action === 'ban' ? 'selected' : ''}>🔨 Bannir</option>
          </select>
        </div>
      </div>
      <div style="margin-top:14px"><button class="btn btn-primary" id="g-save">💾 Enregistrer</button></div>
    </div>
  `);
  sCard.querySelector('#g-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, {
        method: 'PUT',
        body: {
          prefix: sCard.querySelector('#g-prefix').value.trim(),
          warn_limit: parseInt(sCard.querySelector('#g-warnlimit').value, 10) || 0,
          warn_action: sCard.querySelector('#g-warnaction').value,
        },
      });
      toast('Paramètres du serveur enregistrés !');
    } catch (e) { err(e); }
  };
  wrap.appendChild(sCard);

  // ---------- 2. Tickets ----------
  const tCard = App.el(`
    <div class="card">
      <h3>🎫 Système de tickets</h3>
      <div class="card-sub">Un bouton dans un salon : chaque clic crée un salon privé pour le membre (et le staff).</div>
      <div class="grid2" style="max-width:640px">
        <div><label class="field-label">Salon du panneau</label><input class="input" id="t-channel" value="${App.escapeHtml(tickets.channel || '')}" placeholder="#support" /></div>
        <div><label class="field-label">Texte du bouton</label><input class="input" id="t-label" value="${App.escapeHtml(tickets.button_label || '')}" /></div>
        <div><label class="field-label">Rôle du staff</label><input class="input" id="t-role" value="${App.escapeHtml(tickets.support_role || '')}" placeholder="Staff" /></div>
        <div><label class="field-label">Catégorie (créée si absente)</label><input class="input" id="t-cat" value="${App.escapeHtml(tickets.category || '')}" placeholder="Tickets" /></div>
      </div>
      <label class="field-label">Message du panneau (vide = message automatique)</label>
      <textarea class="input" id="t-message" rows="2" style="max-width:640px">${App.escapeHtml(tickets.message || '')}</textarea>
      <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-primary" id="t-save">💾 Enregistrer</button>
        <button class="btn" id="t-send">📨 Envoyer le panneau</button>
      </div>
    </div>
  `);
  tCard.querySelector('#t-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/tickets`, {
        method: 'PUT',
        body: {
          guild_id: guildId,
          channel: tCard.querySelector('#t-channel').value.trim(),
          message: tCard.querySelector('#t-message').value,
          button_label: tCard.querySelector('#t-label').value.trim() || '🎫 Ouvrir un ticket',
          support_role: tCard.querySelector('#t-role').value.trim(),
          category: tCard.querySelector('#t-cat').value.trim() || 'Tickets',
        },
      });
      toast('Tickets enregistrés !');
    } catch (e) { err(e); }
  };
  tCard.querySelector('#t-send').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/tickets/send`, { method: 'POST', body: { guild_id: guildId } });
      toast('Panneau envoyé ! 🎫');
    } catch (e) { err(e); }
  };
  wrap.appendChild(tCard);

  // ---------- 3. Bienvenue / départ / auto-rôle ----------
  const defs = events.defs || {};
  const eCard = App.el(`<div class="card"><h3>👋 Accueil & auto-rôles</h3><div class="card-sub">Message de bienvenue, message de départ et rôle automatique pour les nouveaux membres.</div><div id="ev-zone"></div></div>`);
  const evZone = eCard.querySelector('#ev-zone');
  Object.entries(defs).forEach(([key, def]) => {
    const ev = evState[key] || { enabled: false, config: {} };
    const card = App.el(`
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:12px;background:var(--bg2)">
        <div style="display:flex;align-items:center;gap:10px">
          <b style="flex:1">${def.emoji} ${App.escapeHtml(def.label)}</b>
          <label class="switch"><input type="checkbox" ${ev.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="ev-cfg" style="margin-top:10px;${ev.enabled ? '' : 'opacity:.45;pointer-events:none'}">
          ${def.config.map((f) => {
            if (f.type === 'checkbox') {
              return `<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:var(--text-dim);cursor:pointer">
                <input type="checkbox" data-k="${f.key}" ${ev.config[f.key] ? 'checked' : ''} /> ${f.label}</label>`;
            }
            return `<label class="field-label">${f.label}</label>
              ${f.type === 'multiline'
                ? `<textarea class="input" rows="2" data-k="${f.key}" placeholder="${f.placeholder || ''}">${App.escapeHtml(ev.config[f.key] ?? f.default ?? '')}</textarea>`
                : `<input class="input" data-k="${f.key}" value="${App.escapeHtml(ev.config[f.key] ?? '')}" placeholder="${f.placeholder || ''}" />`}`;
          }).join('')}
          <button class="btn btn-primary btn-sm" style="margin-top:10px">💾 Enregistrer</button>
        </div>
      </div>
    `);
    const toggle = card.querySelector('.switch input');
    const cfgEl = card.querySelector('.ev-cfg');
    toggle.onchange = () => {
      cfgEl.style.opacity = toggle.checked ? '' : '.45';
      cfgEl.style.pointerEvents = toggle.checked ? '' : 'none';
    };
    card.querySelector('button').onclick = async () => {
      const config = {};
      cfgEl.querySelectorAll('[data-k]').forEach((inp) => {
        config[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value;
      });
      try {
        await App.api(`/bots/${bot.id}/guilds/${guildId}/events/${key}`, { method: 'PUT', body: { enabled: toggle.checked, config } });
        toast('Événement enregistré !');
      } catch (e) { err(e); }
    };
    evZone.appendChild(card);
  });
  wrap.appendChild(eCard);

  // ---------- 4. Menus de rôles ----------
  const rCard = App.el(`
    <div class="card">
      <div class="card-head-row">
        <div>
          <h3>📋 Menus de rôles</h3>
          <div class="card-sub" style="margin-bottom:0">Des menus déroulants où les membres choisissent leurs rôles.</div>
        </div>
        <button class="btn btn-primary btn-sm" id="rm-new">＋ Nouveau menu</button>
      </div>
      <div id="rm-list" style="margin-top:12px"></div>
    </div>
  `);
  const rmList = rCard.querySelector('#rm-list');
  const renderMenus = () => {
    if (!role_menus.length) {
      rmList.innerHTML = `<div class="empty-state"><div class="big">📋</div>Aucun menu pour l'instant.</div>`;
    } else {
      rmList.innerHTML = '';
      role_menus.forEach((m) => {
        const row = App.el(`
          <div class="cmd-row">
            <div>
              <div class="cname">${App.escapeHtml(m.name)}</div>
              <div class="cdesc">${m.options.length} rôle(s)</div>
            </div>
            <div class="right">
              <button class="btn btn-sm" data-send>📨 Envoyer</button>
              <button class="icon-btn" data-edit title="Modifier">✏️</button>
              <button class="icon-btn" data-del title="Supprimer">🗑</button>
            </div>
          </div>
        `);
        row.querySelector('[data-send]').onclick = async () => {
          try {
            await App.api(`/role-menus/${m.id}/send`, { method: 'POST' });
            toast('Menu envoyé ! 📋');
          } catch (e) { err(e); }
        };
        row.querySelector('[data-edit]').onclick = () => BotViews.openRoleMenuModal(bot, guildId, m);
        row.querySelector('[data-del]').onclick = async () => {
          if (!(await App.confirm(`Supprimer le menu « ${m.name} » ?`))) return;
          try {
            await App.api(`/role-menus/${m.id}`, { method: 'DELETE' });
            toast('Menu supprimé.');
            BotViews.renderServerConfig(content, bot, guildId);
          } catch (e) { err(e); }
        };
        rmList.appendChild(row);
      });
    }
  };
  renderMenus();
  rCard.querySelector('#rm-new').onclick = () => BotViews.openRoleMenuModal(bot, guildId, null);
  wrap.appendChild(rCard);
};

// ---------------------- Économie ----------------------
BotViews.renderEconomy = async (content, bot) => {
  content.innerHTML = '<div class="spinner"></div>';
  try {
    const { bot: fresh } = await App.api(`/bots/${bot.id}`);
    App.state.bot = fresh;
    if (!fresh.online) {
      content.innerHTML = `<div class="empty-state"><div class="big">💤</div>Démarre le bot pour consulter l'économie de ses serveurs.</div>`;
      return;
    }
    if (!fresh.guilds.length) {
      content.innerHTML = `<div class="empty-state"><div class="big">🌱</div>Ton bot n'est sur aucun serveur.</div>`;
      return;
    }
    const el = BotViews.setContent(content, `
      <h2 style="font-size:19px">💰 Économie</h2>
      <p class="card-sub">Le classement des coins par serveur.</p>
      <div class="card">
        <label class="field-label">Serveur</label>
        <select class="select" id="guild-pick" style="max-width:380px">
          ${fresh.guilds.map(g => `<option value="${g.id}">${App.escapeHtml(g.name)}</option>`).join('')}
        </select>
        <div id="lb" style="margin-top:16px"><div class="spinner"></div></div>
      </div>
    `);
    const pick = el.querySelector('#guild-pick');
    const lb = el.querySelector('#lb');
    const load = async () => {
      lb.innerHTML = '<div class="spinner"></div>';
      try {
        const { top } = await App.api(`/bots/${bot.id}/economy/leaderboard?guild_id=${pick.value}`);
        if (!top.length) { lb.innerHTML = `<div class="empty-state"><div class="big">🪙</div>Aucune transaction pour l'instant.<br/>Utilise la commande <b>daily</b> ou un bloc « Donner des coins » !</div>`; return; }
        const medal = ['🥇', '🥈', '🥉'];
        lb.innerHTML = `
          <table class="leaderboard-table">
            <thead><tr><th>#</th><th>Utilisateur</th><th>Coins</th></tr></thead>
            <tbody>
              ${top.map((r, i) => `<tr><td><span class="rank-badge">${medal[i] || i + 1}</span></td><td><@${r.user_id}></td><td>🪙 <b>${r.coins}</b></td></tr>`).join('')}
            </tbody>
          </table>`;
      } catch (e) { lb.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`; }
    };
    pick.onchange = load;
    load();
  } catch (e) {
    content.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Réglages ----------------------
BotViews.renderSettings = async (content, bot) => {
  const el = BotViews.setContent(content, `
    <h2 style="font-size:19px">⚙️ Réglages</h2>
    <p class="card-sub">Personnalise le comportement de ton bot.</p>
    <div class="card settings-form">
      <h3>🖊️ Général</h3>
      <label class="field-label">Préfixe des commandes</label>
      <input class="input" id="s-prefix" maxlength="5" value="${App.escapeHtml(bot.prefix)}" style="max-width:200px" />
      <label class="field-label">Application ID (invitations + commandes slash)</label>
      <input class="input" id="s-client" value="${App.escapeHtml(bot.client_id || '')}" placeholder="123456789012345678" />
      <label class="field-label">Token Discord (laisser vide pour ne pas changer)</label>
      <input class="input" id="s-token" type="password" autocomplete="off" placeholder="Colle un nouveau token uniquement si tu veux le remplacer" />
      <label class="field-label">Statut du bot (texte affiché)</label>
      <input class="input" id="s-status" maxlength="128" value="${App.escapeHtml(bot.status_text)}" placeholder="Joue à …" />
      <label class="field-label">Présence</label>
      <select class="select" id="s-type" style="max-width:200px">
        ${[['online', '🟢 En ligne'], ['idle', '🌙 Absent'], ['dnd', '⛔ Ne pas déranger'], ['invisible', '⚫ Invisible']].map(([v, l]) => `<option value="${v}" ${bot.status_type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <div style="margin-top:16px"><button class="btn btn-primary" id="s-save">💾 Enregistrer</button></div>
    </div>
    <div class="card danger-zone">
      <h3>⚠️ Zone dangereuse</h3>
      <div class="card-sub">Supprime définitivement ce bot de BotDev (il ne sera plus hébergé ici, mais existera toujours côté Discord).</div>
      <button class="btn btn-danger" id="s-delete">🗑 Supprimer ce bot</button>
    </div>
  `);

  // 💾 Carte d'état de la sauvegarde automatique
  const backupCard = App.el(`
    <div class="card">
      <h3>💾 Sauvegarde automatique</h3>
      <div class="card-sub" id="bk-status" style="margin-bottom:0">Vérification…</div>
    </div>
  `);
  try {
    const s = await App.api('/status/backup');
    backupCard.querySelector('#bk-status').innerHTML = s.enabled
      ? `✅ <b>Active</b> — comptes, bots et commandes sont sauvegardés automatiquement et restaurés à chaque mise à jour. Dépôt : <code>${App.escapeHtml(s.repo)}</code>${s.branch ? ' (branche ' + App.escapeHtml(s.branch) + ')' : ''}.`
      : `⚠️ <b>Désactivée</b> — pour que tes données survivent aux mises à jour, ajoute les variables d'environnement <code>BOTDEV_GH_TOKEN</code> et <code>BOTDEV_DATA_REPO</code> dans les réglages du service sur Render.`;
  } catch {}
  el.insertBefore(backupCard, el.firstChild);

  el.querySelector('#s-save').onclick = async () => {
    try {
      const body = {
        prefix: el.querySelector('#s-prefix').value.trim() || '!',
        status_text: el.querySelector('#s-status').value,
        status_type: el.querySelector('#s-type').value,
        client_id: el.querySelector('#s-client').value.trim(),
      };
      const newToken = el.querySelector('#s-token').value.trim();
      if (newToken) body.token = newToken;
      await App.api(`/bots/${bot.id}`, { method: 'PATCH', body });
      App.toast(newToken ? 'Réglages enregistrés ! Nouveau token actif après redémarrage du bot.' : 'Réglages enregistrés !');
      App.state.bot = { ...bot, prefix: el.querySelector('#s-prefix').value.trim() || '!' };
      el.querySelector('#s-token').value = '';
    } catch (e) { App.toast(e.message, 'error'); }
  };
  el.querySelector('#s-delete').onclick = async () => {
    if (!(await App.confirm(`Supprimer définitivement « ${bot.name} » de BotDev ?`))) return;
    try {
      await App.api(`/bots/${bot.id}`, { method: 'DELETE' });
      App.toast('Bot supprimé.');
      App.router.go('/dashboard');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};
