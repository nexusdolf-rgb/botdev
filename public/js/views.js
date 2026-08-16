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
    const enabledEvents = Object.values(fresh.events || {}).filter(e => e.enabled).length;

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
          <button class="btn" id="go-events">👋 Configurer la bienvenue</button>
        </div>
      </div>
    `);
    el.querySelector('#invite2').onclick = () => navigator.clipboard.writeText(fresh.invite_url).then(() => App.toast('Lien d\'invitation copié !'));
    el.querySelector('#go-cmds').onclick = () => App.router.go(`/bots/${bot.id}/commands`);
    el.querySelector('#go-mods').onclick = () => App.router.go(`/bots/${bot.id}/modules`);
    el.querySelector('#go-events').onclick = () => App.router.go(`/bots/${bot.id}/events`);
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
