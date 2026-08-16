// ============================================================
// BotDev — Dashboard v2 (inspiré DraftBot)
// Shell à sidebar + sélecteur de serveur + modules par serveur.
// ============================================================
const Dashboard = {
  state: { bot: null, guildId: null, guildData: null, module: 'overview', discordGuilds: [] },
};

Dashboard.api = App.api;

// ---------------------- Shell ----------------------
Dashboard.mount = async (shell, bot) => {
  Dashboard.state.bot = bot;
  Dashboard.state.shell = shell;
  Dashboard.state.guildId = null;
  Dashboard.state.guildData = null;
  Dashboard.state.module = 'overview';
  shell.innerHTML = '';

  const { discordGuilds, needLink } = await Dashboard.loadDiscordGuilds();

  const layout = App.el(`
    <div class="dash-shell">
      <aside class="dash-side" id="dash-side"></aside>
      <main class="dash-main">
        <div class="dash-topbar" id="dash-topbar"></div>
        <div id="dash-content"><div class="spinner"></div></div>
      </main>
    </div>
  `);
  shell.appendChild(layout);

  Dashboard.renderSide(layout.querySelector('#dash-side'));
  Dashboard.renderTopbar(layout.querySelector('#dash-topbar'), discordGuilds, needLink);
  const content = layout.querySelector('#dash-content');

  if (needLink) {
    content.innerHTML = `
      <div class="dash-card" style="max-width:560px;margin:20px auto">
        <h3>🔗 Lie ton compte Discord</h3>
        <div class="desc">Pour configurer tes serveurs depuis le dashboard (comme DraftBot), connecte ton compte Discord. On vérifiera automatiquement tes serveurs et tes permissions.</div>
        <button class="dash-btn dash-btn-primary" id="d-link">🎮 Lier mon compte Discord</button>
      </div>`;
    content.querySelector('#d-link').onclick = async () => {
      try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
      catch (e) { App.toast(e.message, 'error'); }
    };
    return;
  }

  // Sélectionne le premier serveur configurable où le bot est présent
  const first = discordGuilds.find((g) => g.canManage && g.hasBot) || discordGuilds.find((g) => g.hasBot);
  if (first) {
    await Dashboard.selectGuild(first.id);
  } else {
    content.innerHTML = `
      <div class="dash-card" style="max-width:560px;margin:20px auto">
        <h3>🌍 Aucun serveur à configurer</h3>
        <div class="desc">Ajoute ${App.escapeHtml(bot.name)} à l'un de tes serveurs Discord (bouton « ➕ Ajouter le bot »), puis reviens ici pour tout configurer.</div>
        <button class="dash-btn dash-btn-primary" id="d-invite">➕ Ajouter le bot</button>
      </div>`;
    content.querySelector('#d-invite').onclick = () => App.openInvite(bot.invite_url);
  }
};

Dashboard.loadDiscordGuilds = async () => {
  try {
    const data = await App.api('/discord/guilds');
    Dashboard.state.discordGuilds = data.guilds || [];
    return { discordGuilds: data.guilds || [], needLink: false };
  } catch (e) {
    if (e.message === 'Compte Discord non lié') return { discordGuilds: [], needLink: true };
    throw e;
  }
};

// ---------------------- Sidebar ----------------------
Dashboard.MODULES = [
  ['overview', '📊', 'Vue d\'ensemble'],
  ['tickets', '🎫', 'Tickets'],
  ['welcome', '👋', 'Bienvenue'],
  ['levels', '📈', 'Niveaux'],
  ['economy', '💰', 'Économie'],
  ['shop', '🛒', 'Boutique'],
  ['moderation', '🛡️', 'Modération'],
  ['roles', '📋', 'Rôles'],
  ['suggestions', '💡', 'Suggestions'],
  ['giveaways', '🎁', 'Giveaways'],
  ['logs', '📜', 'Journaux'],
  ['server', '⚙️', 'Réglages serveur'],
];
Dashboard.BOT_MODULES = [
  ['commands', '🧩', 'Commandes'],
  ['modules', '📦', 'Modules'],
  ['botsettings', '🤖', 'Réglages du bot'],
];

Dashboard.renderSide = (aside) => {
  aside.innerHTML = '';

  // 👉 Serveurs Discord (comme DraftBot : liste en haut de la sidebar)
  const servers = (Dashboard.state.discordGuilds || []).slice(0, 25);
  if (servers.length) {
    aside.appendChild(App.el(`<div class="dash-side-section">Mes serveurs</div>`));
    servers.forEach((g) => {
      const selected = Dashboard.state.guildId === g.id;
      const item = App.el(`
        <button class="dash-side-item ${selected ? 'active' : ''}" title="${App.escapeHtml(g.name)}">
          ${g.icon
            ? `<img src="${App.escapeHtml(g.icon)}" style="width:20px;height:20px;border-radius:6px" alt="" />`
            : '<span class="ico">🌍</span>'}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.escapeHtml(g.name)}</span>
          <span class="dot ${g.hasBot ? 'dot-online' : 'dot-offline'}" title="${g.hasBot ? 'Bot présent' : 'Bot absent'}"></span>
        </button>`);
      item.onclick = async () => {
        if (g.hasBot && g.canManage) { await Dashboard.selectGuild(g.id); return; }
        if (!g.hasBot) { App.openInvite(Dashboard.state.bot.invite_url); App.toast('Ajoute le bot sur ce serveur pour le configurer !'); return; }
        App.toast('Lecture seule : il te faut la permission « Gérer le serveur ».', 'error');
      };
      aside.appendChild(item);
    });
    aside.appendChild(App.el(`<div style="height:1px;background:var(--d-border);margin:10px 14px"></div>`));
  }

  aside.appendChild(App.el(`<div class="dash-side-section">Serveur sélectionné</div>`));
  Dashboard.MODULES.forEach(([id, ico, label]) => {
    const b = App.el(`<button class="dash-side-item ${Dashboard.state.module === id ? 'active' : ''}" data-m="${id}"><span class="ico">${ico}</span>${label}</button>`);
    b.onclick = () => Dashboard.setModule(id);
    aside.appendChild(b);
  });
  // Section « Bot » (commandes/modules globales) : fondateur uniquement
  if (App.state.user && App.state.user.is_admin) {
    aside.appendChild(App.el(`<div class="dash-side-section">Bot</div>`));
    Dashboard.BOT_MODULES.forEach(([id, ico, label]) => {
      const b = App.el(`<button class="dash-side-item ${Dashboard.state.module === id ? 'active' : ''}" data-m="${id}"><span class="ico">${ico}</span>${label}</button>`);
      b.onclick = () => Dashboard.setModule(id);
      aside.appendChild(b);
    });
  }
  aside.appendChild(App.el(`<div class="dash-side-foot">⚡ ${App.escapeHtml(Dashboard.state.bot.name)}<br/>Synchronisé en temps réel avec Discord</div>`));
};

Dashboard.setModule = (id) => {
  Dashboard.state.module = id;
  Dashboard.refresh();
};

// Re-rend le module courant (après une sauvegarde)
Dashboard.refresh = () => {
  const shell = Dashboard.state.shell || document.querySelector('.bot-shell');
  if (!shell) return;
  const aside = shell.querySelector('.dash-side');
  if (aside) Dashboard.renderSide(aside);
  const topbar = shell.querySelector('.dash-topbar');
  if (topbar && Dashboard.state.discordGuilds) Dashboard.renderTopbar(topbar, Dashboard.state.discordGuilds);
  Dashboard.renderContent(shell.querySelector('#dash-content'));
};

// ---------------------- Barre du haut ----------------------
Dashboard.renderTopbar = (topbar, discordGuilds) => {
  const bot = Dashboard.state.bot;
  const manageable = discordGuilds.filter((g) => g.canManage);
  const cur = discordGuilds.find((g) => g.id === Dashboard.state.guildId);
  topbar.innerHTML = `
    <div class="dash-server-pick">
      ${cur && cur.icon ? `<img src="${App.escapeHtml(cur.icon)}" alt="" />` : '<span style="font-size:20px">🌍</span>'}
      <select id="d-guild">
        <option value="">— Choisir un serveur —</option>
        ${discordGuilds.map((g) => `<option value="${g.id}" ${g.id === Dashboard.state.guildId ? 'selected' : ''}>${App.escapeHtml(g.name)}${g.hasBot ? '' : ' (bot absent)'}${!g.canManage ? ' · lecture seule' : ''}</option>`).join('')}
      </select>
    </div>
    <div class="dash-topbar-actions">
      <span class="dash-badge ${bot.online ? 'ok' : 'bad'}">${bot.online ? '🟢 En ligne' : '🔴 Hors ligne'}</span>
      <button class="dash-btn dash-btn-primary" id="d-invite2">➕ Ajouter le bot</button>
    </div>
  `;
  topbar.querySelector('#d-guild').onchange = async (e) => {
    if (!e.target.value) return;
    await Dashboard.selectGuild(e.target.value);
  };
  topbar.querySelector('#d-invite2').onclick = () => App.openInvite(bot.invite_url);
};

// ---------------------- Chargement serveur ----------------------
Dashboard.selectGuild = async (guildId) => {
  Dashboard.state.guildId = guildId;
  const shell = Dashboard.state.shell || document.querySelector('.bot-shell');
  if (shell) {
    Dashboard.renderTopbar(shell.querySelector('.dash-topbar'), Dashboard.state.discordGuilds);
    Dashboard.renderSide(shell.querySelector('.dash-side'));
  }
  await Dashboard.renderContent(shell ? shell.querySelector('#dash-content') : null);
};

Dashboard.loadGuild = async () => {
  const { bot, guildId } = Dashboard.state;
  const data = await App.api(`/bots/${bot.id}/guilds/${guildId}`);
  Dashboard.state.guildData = data;
  return data;
};

Dashboard.renderContent = async (content) => {
  if (!content) return;
  const { bot, guildId, module } = Dashboard.state;
  content.innerHTML = '<div class="spinner"></div>';

  const botLevel = ['commands', 'modules', 'botsettings'].includes(module);
  if (!botLevel && !guildId) return;

  try {
    const data = botLevel ? null : await Dashboard.loadGuild();
    const fn = Dashboard.renderers[module];
    if (fn) await fn(content, data);
    else content.innerHTML = `<div class="dash-empty">Module introuvable.</div>`;
  } catch (e) {
    content.innerHTML = `<div class="dash-empty"><div class="big">⚠️</div>${App.escapeHtml(e.message)}<br/><br/>
      <button class="dash-btn" onclick="location.reload()">Actualiser</button></div>`;
  }
};

// ============================================================
// Modules
// ============================================================
Dashboard.header = (content, icon, title, sub) => {
  content.innerHTML = '';
  content.appendChild(App.el(`
    <div class="dash-module-header">
      <div class="m-icon">${icon}</div>
      <div><h1>${title}</h1><div class="sub">${sub}</div></div>
    </div>
  `));
  return content;
};

Dashboard.card = (content, title, desc, inner = '') => {
  const c = App.el(`<div class="dash-card"><div class="card-head"><div><h3>${title}</h3><div class="desc">${desc}</div></div></div>${inner}</div>`);
  content.appendChild(c);
  return c;
};

Dashboard.renderers = {};

// ---------- Vue d'ensemble ----------
Dashboard.renderers.overview = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const g = data.guild;
  const root = Dashboard.header(content, '📊', `Vue d\'ensemble — ${App.escapeHtml(g.name)}`, `${g.members} membres · configuration de ${App.escapeHtml(bot.name)} sur ce serveur`);
  root.appendChild(App.el(`
    <div class="dash-stats">
      <div class="dash-stat"><div class="val">${g.members}</div><div class="lbl">Membres</div></div>
      <div class="dash-stat"><div class="val">${data.tickets.types ? data.tickets.types.length : 0}</div><div class="lbl">Types de tickets</div></div>
      <div class="dash-stat"><div class="val">${(data.xp_roles || []).length}</div><div class="lbl">Récompenses de niveau</div></div>
      <div class="dash-stat"><div class="val">${(data.role_menus || []).length}</div><div class="lbl">Menus de rôles</div></div>
    </div>`));
  const grid = App.el(`<div class="dash-grid"></div>`);
  const mods = [
    ['tickets', '🎫', 'Tickets', 'Types personnalisés, rôles staff multiples, transcriptions en MP'],
    ['welcome', '👋', 'Bienvenue', 'Message d\'accueil, départ et auto-rôles'],
    ['levels', '📈', 'Niveaux', 'XP en discutant, annonces, récompenses de rôles'],
    ['shop', '🛒', 'Boutique', 'Les membres achètent des rôles avec leurs coins'],
    ['moderation', '🛡️', 'Modération', 'Auto-mod, liste noire, sanctions prédéfinies'],
    ['suggestions', '💡', 'Suggestions', 'Les membres proposent, tout le monde vote'],
    ['giveaways', '🎁', 'Giveaways', 'Tirages automatiques par réaction'],
    ['logs', '📜', 'Journaux', 'Toutes les actions tracées dans un salon'],
  ];
  mods.forEach(([id, ico, label, desc]) => {
    const c = App.el(`
      <div class="dash-card" style="cursor:pointer">
        <h3>${ico} ${label}</h3>
        <div class="desc">${desc}</div>
        <button class="dash-btn dash-btn-sm" data-go="${id}">Configurer →</button>
      </div>`);
    c.querySelector('[data-go]').onclick = () => Dashboard.setModule(id);
    grid.appendChild(c);
  });
  root.appendChild(grid);
};

// ---------- Tickets ----------
Dashboard.renderers.tickets = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const t = data.tickets;
  const typesData = (t.types || []).map((x) => ({ label: x.label, emoji: x.emoji || '', category: x.category || '', staff_roles: (x.staff_roles && x.staff_roles.length) ? [...x.staff_roles] : [] }));
  const root = Dashboard.header(content, '🎫', 'Système de tickets', 'Bouton ou menu déroulant → salon privé automatique. Le tout est aussi configurable sur Discord avec /ticket.');

  const textChannels = (data.channels || []).filter((ch) => !ch.category);
  const categories = (data.channels || []).filter((ch) => ch.category);
  const rolesList = data.roles || [];
  const curStyle = String(t.button_style || '1');
  const reqReason = !(t.require_reason === 0 || t.require_reason === false);
  const channelName = String(t.channel || '').replace(/^#/, '');
  const channelFound = !!channelName && textChannels.some((ch) => ch.name === channelName);

  const c = Dashboard.card(root, 'Configuration', '');
  c.querySelector('.desc').outerHTML = `<div class="desc">💡 Sur Discord : <b>/ticket setup</b> (assistant) et <b>/ticket types setup</b> (types + rôles staff). Tout est synchronisé avec ce formulaire.</div>`;

  // 📊 État actuel (data-status pour le retrouver après innerHTML +=)
  c.appendChild(App.el(`<div data-status style="margin-bottom:12px"></div>`));

  c.innerHTML += `
    <label class="dash-label">Salon du panneau (sélecteur)</label>
    <select class="dash-select" id="t-channel">
      <option value="">— Choisir un salon —</option>
      ${textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${String(t.channel || '') === '#' + ch.name ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <input class="dash-input" id="t-channel-custom" value="${App.escapeHtml(t.channel || '')}" placeholder="…ou écris le salon (#support)" style="margin-top:6px" />

    <label class="dash-label">Texte du bouton</label>
    <input class="dash-input" id="t-label" value="${App.escapeHtml(t.button_label || '')}" placeholder="🎫 Ouvrir un ticket" />

    <label class="dash-label">🎨 Couleur du bouton</label>
    <select class="dash-select" id="t-style" style="max-width:240px">
      <option value="1" ${curStyle === '1' ? 'selected' : ''}>🔵 Bleu (défaut)</option>
      <option value="2" ${curStyle === '2' ? 'selected' : ''}>⚪ Gris</option>
      <option value="3" ${curStyle === '3' ? 'selected' : ''}>🟢 Vert</option>
      <option value="4" ${curStyle === '4' ? 'selected' : ''}>🔴 Rouge</option>
    </select>

    <label class="dash-label">📝 Questionnaire d'ouverture</label>
    <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;cursor:pointer">
      <label class="switch"><input type="checkbox" id="t-reason" ${reqReason ? 'checked' : ''} /><span class="slider"></span></label>
      <span style="color:var(--d-dim)">${reqReason ? '✅ Obligatoire : une raison est demandée avant l\'ouverture' : '❌ Désactivé : le ticket s\'ouvre directement'}</span>
    </label>

    <label class="dash-label">Rôle staff global (sélecteur)</label>
    <select class="dash-select" id="t-role">
      <option value="">— Choisir un rôle —</option>
      ${rolesList.map((r) => `<option value="${App.escapeHtml(r.name)}" ${String(t.support_role || '') === r.name ? 'selected' : ''}>🛡️ ${App.escapeHtml(r.name)}</option>`).join('')}
    </select>
    <input class="dash-input" id="t-role-custom" value="${App.escapeHtml(t.support_role || '')}" placeholder="…ou écris le rôle (Staff)" style="margin-top:6px" />

    <label class="dash-label">Catégorie par défaut (sélecteur)</label>
    <select class="dash-select" id="t-cat">
      <option value="">— Choisir une catégorie —</option>
      ${categories.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${String(t.category || '') === ch.name ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <input class="dash-input" id="t-cat-custom" value="${App.escapeHtml(t.category || '')}" placeholder="…ou écris la catégorie (Tickets)" style="margin-top:6px" />

    <label class="dash-label">Message du panneau (vide = automatique)</label>
    <textarea class="dash-input" id="t-msg" rows="3">${App.escapeHtml(t.message || '')}</textarea>

    <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
      <button class="dash-btn dash-btn-primary" id="t-save">💾 Enregistrer</button>
      <button class="dash-btn" id="t-send">📨 Envoyer le panneau</button>
    </div>`;

  // Rafraîchit l'état affiché (re-query : innerHTML += a recréé le DOM)
  const renderStatus = () => {
    const zone = c.querySelector('[data-status]');
    const chName = String(c.querySelector('#t-channel').value || c.querySelector('#t-channel-custom').value || '').replace(/^#/, '');
    const found = !!chName && textChannels.some((ch) => ch.name === chName);
    zone.innerHTML = found
      ? `<span class="dash-badge ok">📨 Panneau configuré dans #${App.escapeHtml(chName)} — salon trouvé ✅</span>`
      : (chName
          ? `<span class="dash-badge warn">⚠️ Salon « #${App.escapeHtml(chName)} » non trouvé parmi les salons du bot (vérifie le nom)</span>`
          : `<span class="dash-badge warn">⚠️ Aucun salon défini — choisis-en un puis « Envoyer le panneau »</span>`);
  };
  renderStatus();
  c.querySelector('#t-channel').onchange = renderStatus;
  c.querySelector('#t-channel-custom').addEventListener('input', renderStatus);
  c.querySelector('#t-reason').onchange = () => {
    const on = c.querySelector('#t-reason').checked;
    c.querySelector('#t-reason').nextElementSibling.nextElementSibling.textContent = on
      ? '✅ Obligatoire : une raison est demandée avant l\'ouverture'
      : '❌ Désactivé : le ticket s\'ouvre directement';
  };

  const pick = (selectId, customId, fallback) => {
    const s = c.querySelector(selectId).value.trim();
    const cust = c.querySelector(customId).value.trim();
    return s || cust || fallback;
  };

  c.querySelector('#t-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/tickets`, { method: 'PUT', body: {
        guild_id: guildId,
        channel: pick('#t-channel', '#t-channel-custom', ''),
        button_label: c.querySelector('#t-label').value.trim() || '🎫 Ouvrir un ticket',
        button_style: c.querySelector('#t-style').value,
        require_reason: c.querySelector('#t-reason').checked ? 1 : 0,
        support_role: pick('#t-role', '#t-role-custom', ''),
        category: pick('#t-cat', '#t-cat-custom', 'Tickets'),
        message: c.querySelector('#t-msg').value,
        types: typesData.filter((x) => x.label).map((x) => ({ label: x.label, emoji: x.emoji, category: x.category, staff_roles: x.staff_roles.filter(Boolean) })),
      }});
      App.toast('Tickets enregistrés !');
      renderStatus();
    } catch (e) { App.toast(e.message, 'error'); }
  };
  c.querySelector('#t-send').onclick = async () => {
    try { await App.api(`/bots/${bot.id}/tickets/send`, { method: 'POST', body: { guild_id: guildId } }); App.toast('Panneau envoyé !'); }
    catch (e) { App.toast(e.message, 'error'); }
  };

  const c2 = Dashboard.card(root, '🗂️ Types de tickets', 'Chaque type : emoji, catégorie et PLUSIEURS rôles staff.');
  c2.appendChild(App.el(`<div id="t-types"></div>`));
  const addBtn = App.el(`<button class="dash-btn dash-btn-sm" id="t-add">＋ Ajouter un type</button>`);
  c2.appendChild(addBtn);

  const renderTypes = () => {
    const el = c2.querySelector('#t-types');
    el.innerHTML = '';
    if (!typesData.length) el.appendChild(App.el(`<div class="dash-empty">Aucun type — le panneau n\'affichera qu\'un bouton.</div>`));
    typesData.forEach((x, i) => {
      const row = App.el(`
        <div style="border:1px solid var(--d-border);border-radius:11px;padding:12px 14px;margin-bottom:10px;background:var(--d-card2)">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="dash-input" data-k="emoji" value="${App.escapeHtml(x.emoji)}" placeholder="🤝" style="max-width:58px;text-align:center" />
            <input class="dash-input" data-k="label" value="${App.escapeHtml(x.label)}" placeholder="Nom du type" style="flex:1;min-width:130px" />
            <input class="dash-input" data-k="category" value="${App.escapeHtml(x.category)}" placeholder="Catégorie (optionnel)" style="flex:1;min-width:110px" />
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
          </div>
          <label class="dash-label">🛡️ Rôles staff (plusieurs possibles)</label>
          <div class="t-roles" style="display:flex;flex-direction:column;gap:6px"></div>
          <button class="dash-btn dash-btn-sm" data-addrole style="margin-top:6px">＋ Rôle staff</button>
        </div>`);
      row.querySelectorAll('input[data-k]').forEach((inp) => inp.addEventListener('input', () => { x[inp.dataset.k] = inp.value; }));
      row.querySelector('[data-del]').onclick = () => { typesData.splice(i, 1); renderTypes(); };
      const rolesEl = row.querySelector('.t-roles');
      const renderRoles = () => {
        rolesEl.innerHTML = '';
        x.staff_roles.forEach((r, j) => {
          const rr = App.el(`
            <div style="display:flex;gap:7px">
              <input class="dash-input" value="${App.escapeHtml(r)}" placeholder="Nom exact du rôle" />
              <button class="dash-btn dash-btn-danger dash-btn-sm">🗑</button>
            </div>`);
          rr.querySelector('input').addEventListener('input', (e) => { x.staff_roles[j] = e.target.value; });
          rr.querySelector('button').onclick = () => { x.staff_roles.splice(j, 1); renderRoles(); };
          rolesEl.appendChild(rr);
        });
        if (!x.staff_roles.length) rolesEl.appendChild(App.el(`<div style="color:var(--d-dim);font-size:12px">Aucun — rôle staff global utilisé.</div>`));
      };
      renderRoles();
      row.querySelector('[data-addrole]').onclick = () => { x.staff_roles.push(''); renderRoles(); };
      el.appendChild(row);
    });
  };
  renderTypes();
  c2.querySelector('#t-add').onclick = () => { typesData.push({ label: '', emoji: '', category: '', staff_roles: [] }); renderTypes(); };
};

// ---------- Bienvenue ----------
Dashboard.renderers.welcome = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '👋', 'Bienvenue & auto-rôles', 'Accueille les nouveaux membres et donne des rôles automatiquement.');
  const defs = data.events.defs;
  const state = data.events.state || {};
  const textChannels = (data.channels || []).filter((c) => !c.category);
  const categories = (data.channels || []).filter((c) => c.category);
  const rolesList = data.roles || [];

  Object.entries(defs).forEach(([key, def]) => {
    const ev = state[key] || { enabled: false, config: {} };
    const c = Dashboard.card(root, `${def.emoji} ${def.label}`, def.description);

    // Interrupteur Activer
    const toggleRow = App.el(`<div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 4px"><label class="dash-label" style="margin:0">Activer</label><label class="switch"><input type="checkbox" ${ev.enabled ? 'checked' : ''} /><span class="slider"></span></label></div>`);
    c.appendChild(toggleRow);
    const toggle = toggleRow.querySelector('input');
    const cfgZone = App.el(`<div style="${ev.enabled ? '' : 'opacity:.45;pointer-events:none'}"></div>`);

    def.config.forEach((f) => {
      if (f.type === 'checkbox') {
        cfgZone.appendChild(App.el(`<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--d-dim);cursor:pointer"><input type="checkbox" data-k="${f.key}" ${ev.config[f.key] ? 'checked' : ''} /> ${f.label}</label>`));
        return;
      }
      cfgZone.appendChild(App.el(`<label class="dash-label">${f.label}</label>`));

      if (f.type === 'channel') {
        // Sélecteur de salon (salons textuels + catégories)
        const current = String(ev.config[f.key] || '');
        const opts = ['<option value="">— Choisir un salon —</option>']
          .concat(categories.map((ch) => `<option value="#${ch.name}" ${current === `#${ch.name}` ? 'selected' : ''}>📁 ${ch.name} (catégorie)</option>`))
          .concat(textChannels.map((ch) => `<option value="#${ch.name}" ${current === `#${ch.name}` ? 'selected' : ''}>💬 #${ch.name}</option>`));
        cfgZone.appendChild(App.el(`<select class="dash-select" data-k="${f.key}">${opts.join('')}</select>`));
        if (!textChannels.length) {
          cfgZone.appendChild(App.el(`<input class="dash-input" data-k="${f.key}" value="${App.escapeHtml(current)}" placeholder="${f.placeholder || '#salon'}" style="margin-top:6px" />`));
        }
        return;
      }

      if (f.type === 'role') {
        const current = String(ev.config[f.key] || '');
        const opts = ['<option value="">— Choisir un rôle —</option>']
          .concat(rolesList.map((r) => `<option value="${App.escapeHtml(r.name)}" ${current === r.name ? 'selected' : ''}>🛡️ ${App.escapeHtml(r.name)}</option>`));
        cfgZone.appendChild(App.el(`<select class="dash-select" data-k="${f.key}">${opts.join('')}</select>`));
        if (!rolesList.length) {
          cfgZone.appendChild(App.el(`<input class="dash-input" data-k="${f.key}" value="${App.escapeHtml(current)}" placeholder="${f.placeholder || 'Membre'}" style="margin-top:6px" />`));
        }
        return;
      }

      if (f.type === 'color') {
        const current = String(ev.config[f.key] || f.default || '#5865F2');
        cfgZone.appendChild(App.el(`<div style="display:flex;gap:10px;align-items:center"><input type="color" data-k="${f.key}" value="${App.escapeHtml(current)}" style="width:52px;height:40px;border:1px solid var(--d-border);border-radius:9px;background:var(--d-card2);padding:3px" /><input class="dash-input" data-k-hex="${f.key}" value="${App.escapeHtml(current)}" style="max-width:110px" /></div>`));
        return;
      }

      if (f.type === 'multiline') {
        cfgZone.appendChild(App.el(`<textarea class="dash-input" rows="3" data-k="${f.key}">${App.escapeHtml(ev.config[f.key] ?? f.default ?? '')}</textarea>`));
        return;
      }

      cfgZone.appendChild(App.el(`<input class="dash-input" data-k="${f.key}" value="${App.escapeHtml(ev.config[f.key] ?? '')}" placeholder="${f.placeholder || ''}" />`));
    });

    const save = App.el(`<button class="dash-btn dash-btn-primary" style="margin-top:12px">💾 Enregistrer</button>`);
    cfgZone.appendChild(save);
    c.appendChild(cfgZone);

    // Synchronise le champ hex avec le sélecteur de couleur
    const colorPicker = cfgZone.querySelector('input[type=color]');
    if (colorPicker) {
      const hexInput = cfgZone.querySelector('[data-k-hex]');
      colorPicker.addEventListener('input', () => { if (hexInput) hexInput.value = colorPicker.value; });
      if (hexInput) hexInput.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) colorPicker.value = hexInput.value; });
    }

    toggle.onchange = () => {
      cfgZone.style.opacity = toggle.checked ? '' : '.45';
      cfgZone.style.pointerEvents = toggle.checked ? '' : 'none';
    };

    save.onclick = async () => {
      const config = {};
      cfgZone.querySelectorAll('[data-k]').forEach((inp) => { config[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; });
      try {
        await App.api(`/bots/${bot.id}/guilds/${guildId}/events/${key}`, { method: 'PUT', body: { enabled: toggle.checked, config } });
        App.toast('Événement enregistré !');
      } catch (e) { App.toast(e.message, 'error'); }
    };
  });
};

// ---------- Niveaux ----------
Dashboard.renderers.levels = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings;
  const rolesData = (data.xp_roles || []).map((r) => ({ level: r.level, role: r.role }));
  const root = Dashboard.header(content, '📈', 'Niveaux (XP)', 'Les membres gagnent de l\'XP en discutant, montent en niveau, et reçoivent des rôles en récompense.');

  const c = Dashboard.card(root, 'Gain d\'XP', '');
  const toggleRow = App.el(`<div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 4px"><label class="dash-label" style="margin:0">Activer les niveaux</label><label class="switch"><input type="checkbox" ${s.xp_enabled ? 'checked' : ''} /><span class="slider"></span></label></div>`);
  c.appendChild(toggleRow);
  c.innerHTML += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:10px">
      <div><label class="dash-label">XP min / message</label><input class="dash-input" id="xp-min" type="number" value="${s.xp_min ?? 10}" /></div>
      <div><label class="dash-label">XP max / message</label><input class="dash-input" id="xp-max" type="number" value="${s.xp_max ?? 25}" /></div>
      <div><label class="dash-label">Pause (secondes)</label><input class="dash-input" id="xp-cd" type="number" value="${s.xp_cooldown ?? 60}" /></div>
    </div>
    <label class="dash-label">Message de niveau (variables {user}, {level})</label>
    <input class="dash-input" id="xp-msg" value="${App.escapeHtml(s.xp_message || '')}" placeholder="{user} vient d\'atteindre le niveau {level} ! 🎉" />
    <label class="dash-label">Salon d\'annonce (vide = salon du message)</label>
    <input class="dash-input" id="xp-channel" value="${App.escapeHtml(s.xp_channel || '')}" placeholder="#niveaux" />
    <button class="dash-btn dash-btn-primary" style="margin-top:14px" id="xp-save">💾 Enregistrer</button>`;

  const c2 = Dashboard.card(root, '🏆 Récompenses de niveau', 'Rôle donné automatiquement quand le membre atteint le niveau.');
  c2.appendChild(App.el(`<div id="xp-roles"></div>`));
  c2.appendChild(App.el(`<button class="dash-btn dash-btn-sm" id="xp-add" style="margin-top:8px">＋ Ajouter une récompense</button>`));

  const renderRoles = () => {
    const el = c2.querySelector('#xp-roles');
    el.innerHTML = '';
    if (!rolesData.length) el.appendChild(App.el(`<div class="dash-empty">Aucune récompense.</div>`));
    rolesData.forEach((r, i) => {
      const row = App.el(`
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input class="dash-input" data-k="level" type="number" value="${r.level}" style="max-width:100px" />
          <input class="dash-input" data-k="role" value="${App.escapeHtml(r.role)}" placeholder="Nom exact du rôle" />
          <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
        </div>`);
      row.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => { r[inp.dataset.k] = inp.dataset.k === 'level' ? (parseInt(inp.value, 10) || 1) : inp.value; }));
      row.querySelector('[data-del]').onclick = () => { rolesData.splice(i, 1); renderRoles(); };
      el.appendChild(row);
    });
  };
  renderRoles();
  c2.querySelector('#xp-add').onclick = () => { rolesData.push({ level: 5, role: '' }); renderRoles(); };

  c.querySelector('#xp-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/xp`, { method: 'PUT', body: {
        enabled: c.querySelector('input[type=checkbox]').checked,
        min: parseInt(c.querySelector('#xp-min').value, 10) || 10,
        max: parseInt(c.querySelector('#xp-max').value, 10) || 25,
        cooldown: parseInt(c.querySelector('#xp-cd').value, 10) || 60,
        message: c.querySelector('#xp-msg').value,
        channel: c.querySelector('#xp-channel').value.trim(),
        roles: rolesData.filter((r) => String(r.role).trim()),
      }});
      App.toast('Niveaux enregistrés !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Économie ----------
Dashboard.renderers.economy = async (content, data) => {
  const root = Dashboard.header(content, '💰', 'Économie', 'Coins, transferts et classement du serveur. Les membres utilisent /daily, /balance, /pay et /leaderboard.');
  const lb = await App.api(`/bots/${Dashboard.state.bot.id}/economy/leaderboard?guild_id=${Dashboard.state.guildId}`);
  const c = Dashboard.card(root, '🏆 Classement', 'Les 25 membres les plus riches de ce serveur.');
  if (!lb.top.length) c.appendChild(App.el(`<div class="dash-empty"><div class="big">🪙</div>Aucune transaction pour l\'instant — les membres gagnent des coins avec /daily !</div>`));
  else {
    const table = App.el(`<table class="dash-table"><thead><tr><th>#</th><th>Membre</th><th>Coins</th></tr></thead><tbody></tbody></table>`);
    const tb = table.querySelector('tbody');
    lb.top.forEach((r, i) => tb.appendChild(App.el(`<tr><td>${['🥇','🥈','🥉'][i] || i + 1}</td><td><@${r.user_id}></td><td>🪙 ${r.coins}</td></tr>`)));
    c.appendChild(table);
  }
};

// ---------- Boutique ----------
Dashboard.renderers.shop = async (content) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🛒', 'Boutique', 'Les membres achètent des rôles avec leurs coins (/shop, /buy). Tu gères les articles ici.');
  const { items } = await App.api(`/bots/${bot.id}/guilds/${guildId}/shop`);
  const itemsData = items.map((i) => ({ id: i.id, name: i.name, description: i.description, price: i.price, role: i.role, emoji: i.emoji }));
  const c = Dashboard.card(root, 'Articles', 'Prix en coins. Le rôle est donné automatiquement à l\'achat.');
  c.appendChild(App.el(`<div id="shop-items"></div>`));
  c.appendChild(App.el(`<button class="dash-btn dash-btn-sm" id="shop-add" style="margin-top:8px">＋ Ajouter un article</button>`));
  const render = () => {
    const el = c.querySelector('#shop-items');
    el.innerHTML = '';
    if (!itemsData.length) el.appendChild(App.el(`<div class="dash-empty">Boutique vide.</div>`));
    itemsData.forEach((it, i) => {
      const row = App.el(`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <input class="dash-input" data-k="emoji" value="${App.escapeHtml(it.emoji)}" style="max-width:58px;text-align:center" />
          <input class="dash-input" data-k="name" value="${App.escapeHtml(it.name)}" placeholder="Nom" style="min-width:110px;flex:1" />
          <input class="dash-input" data-k="role" value="${App.escapeHtml(it.role)}" placeholder="Rôle exact" style="min-width:110px;flex:1" />
          <input class="dash-input" data-k="price" type="number" value="${it.price}" style="max-width:90px" />
          <input class="dash-input" data-k="description" value="${App.escapeHtml(it.description)}" placeholder="Description" style="min-width:130px;flex:1" />
          <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
        </div>`);
      row.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => { it[inp.dataset.k] = inp.dataset.k === 'price' ? (parseInt(inp.value, 10) || 1) : inp.value; }));
      row.querySelector('[data-del]').onclick = () => { itemsData.splice(i, 1); render(); };
      el.appendChild(row);
    });
  };
  render();
  c.querySelector('#shop-add').onclick = () => { itemsData.push({ name: '', description: '', price: 100, role: '', emoji: '🛒' }); render(); };
  const save = App.el(`<button class="dash-btn dash-btn-primary" style="margin-top:12px">💾 Enregistrer la boutique</button>`);
  c.appendChild(save);
  save.onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/shop`, { method: 'PUT', body: { items: itemsData.filter((i) => i.name && i.role) } });
      App.toast('Boutique enregistrée !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Modération ----------
Dashboard.renderers.moderation = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings;
  const blacklist = data.blacklist || [];
  const { sanctions } = await App.api(`/bots/${bot.id}/guilds/${guildId}/sanctions`);
  const root = Dashboard.header(content, '🛡️', 'Modération', 'Auto-modération, liste noire et sanctions prédéfinies (/sanction membre nom).');

  const c = Dashboard.card(root, 'Auto-modération', 'Le bot supprime automatiquement (les admins et modérateurs sont ignorés).');
  c.innerHTML += `
    <label class="dash-label">Activer</label>
    <label class="switch"><input type="checkbox" id="am-on" ${s.am_enabled ? 'checked' : ''} /><span class="slider"></span></label>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--d-dim)"><input type="checkbox" id="am-links" ${s.am_links ? 'checked' : ''} /> Supprimer les liens</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--d-dim)"><input type="checkbox" id="am-caps" ${s.am_caps ? 'checked' : ''} /> Supprimer les MAJUSCULES</label>
      <div><label class="dash-label">Mentions max (0 = illimité)</label><input class="dash-input" id="am-men" type="number" value="${s.am_mentions ?? 5}" /></div>
      <div><label class="dash-label">Spam : messages / 5 s</label><input class="dash-input" id="am-spam" type="number" value="${s.am_spam ?? 5}" /></div>
    </div>
    <button class="dash-btn dash-btn-primary" style="margin-top:12px" id="am-save">💾 Enregistrer</button>`;
  c.querySelector('#am-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/automod`, { method: 'PUT', body: {
        enabled: c.querySelector('#am-on').checked,
        links: c.querySelector('#am-links').checked,
        caps: c.querySelector('#am-caps').checked,
        mentions: parseInt(c.querySelector('#am-men').value, 10) || 0,
        spam: parseInt(c.querySelector('#am-spam').value, 10) || 0,
        blacklist: blacklistData.map((w) => w.word),
      }});
      App.toast('Auto-modération enregistrée !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  const blacklistData = blacklist.map((w) => ({ word: w }));
  const c2 = Dashboard.card(root, '🔇 Liste noire', 'Les messages contenant ces mots sont supprimés automatiquement.');
  c2.appendChild(App.el(`<div id="bl-list"></div>`));
  c2.appendChild(App.el(`<button class="dash-btn dash-btn-sm" id="bl-add" style="margin-top:8px">＋ Ajouter un mot</button>`));
  const renderBl = () => {
    const el = c2.querySelector('#bl-list');
    el.innerHTML = '';
    if (!blacklistData.length) el.appendChild(App.el(`<div class="dash-empty">Aucun mot interdit.</div>`));
    blacklistData.forEach((w, i) => {
      const row = App.el(`<div style="display:flex;gap:8px;margin-bottom:8px">
        <input class="dash-input" value="${App.escapeHtml(w.word)}" placeholder="mot interdit" />
        <button class="dash-btn dash-btn-danger dash-btn-sm">🗑</button></div>`);
      row.querySelector('input').addEventListener('input', (e) => { w.word = e.target.value; });
      row.querySelector('button').onclick = () => { blacklistData.splice(i, 1); renderBl(); };
      el.appendChild(row);
    });
  };
  renderBl();
  c2.querySelector('#bl-add').onclick = () => { blacklistData.push({ word: '' }); renderBl(); };

  const sanctionsData = sanctions.map((x) => ({ name: x.name, action: x.action, duration: x.duration, message: x.message }));
  const c3 = Dashboard.card(root, '⚖️ Sanctions prédéfinies', 'Applique-les sur Discord avec /sanction @membre nom.');
  c3.appendChild(App.el(`<div id="sanc-list"></div>`));
  c3.appendChild(App.el(`<button class="dash-btn dash-btn-sm" id="sanc-add" style="margin-top:8px">＋ Ajouter une sanction</button>`));
  const renderSanc = () => {
    const el = c3.querySelector('#sanc-list');
    el.innerHTML = '';
    if (!sanctionsData.length) el.appendChild(App.el(`<div class="dash-empty">Aucune sanction. Ex : « spam » → timeout 10 min.</div>`));
    sanctionsData.forEach((x, i) => {
      const row = App.el(`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <input class="dash-input" data-k="name" value="${App.escapeHtml(x.name)}" placeholder="Nom" style="max-width:110px" />
          <select class="dash-select" data-k="action" style="max-width:130px">
            ${['warn','timeout','kick','ban'].map((a) => `<option value="${a}" ${x.action === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
          <input class="dash-input" data-k="duration" type="number" value="${x.duration || 0}" placeholder="Minutes (timeout)" style="max-width:110px" />
          <input class="dash-input" data-k="message" value="${App.escapeHtml(x.message)}" placeholder="Message (envoyé en MP)" style="flex:1;min-width:140px" />
          <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
        </div>`);
      row.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => { x[inp.dataset.k] = inp.dataset.k === 'duration' ? (parseInt(inp.value, 10) || 0) : inp.value; }));
      row.querySelector('[data-del]').onclick = () => { sanctionsData.splice(i, 1); renderSanc(); };
      el.appendChild(row);
    });
  };
  renderSanc();
  c3.querySelector('#sanc-add').onclick = () => { sanctionsData.push({ name: '', action: 'warn', duration: 0, message: '' }); renderSanc(); };
  const saveSanc = App.el(`<button class="dash-btn dash-btn-primary" style="margin-top:12px">💾 Enregistrer les sanctions</button>`);
  c3.appendChild(saveSanc);
  saveSanc.onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/sanctions`, { method: 'PUT', body: { sanctions: sanctionsData.filter((x) => x.name) } });
      App.toast('Sanctions enregistrées !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Rôles (menus) ----------
Dashboard.renderers.roles = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '📋', 'Menus de rôles', 'Des menus déroulants où les membres choisissent leurs rôles eux-mêmes.');
  const c = Dashboard.card(root, 'Menus', 'Envoie-les sur Discord avec /roles send (ou le bouton ci-dessous).');
  const menus = data.role_menus || [];
  if (!menus.length) c.appendChild(App.el(`<div class="dash-empty"><div class="big">📋</div>Aucun menu pour l\'instant.</div>`));
  const list = App.el(`<div></div>`);
  menus.forEach((m) => {
    const row = App.el(`
      <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--d-border);border-radius:10px;padding:10px 14px;margin-bottom:8px">
        <div style="flex:1"><b>${App.escapeHtml(m.name)}</b><div style="color:var(--d-dim);font-size:12px">${m.options.length} rôle(s)</div></div>
        <button class="dash-btn dash-btn-sm" data-send="${m.id}">📨 Envoyer</button>
        <button class="dash-btn dash-btn-danger dash-btn-sm" data-del="${m.id}">🗑</button>
      </div>`);
    row.querySelector('[data-send]').onclick = async () => {
      try { await App.api(`/role-menus/${m.id}/send`, { method: 'POST' }); App.toast('Menu envoyé !'); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    row.querySelector('[data-del]').onclick = async () => {
      if (!(await App.confirm(`Supprimer le menu « ${m.name} » ?`))) return;
      try { await App.api(`/role-menus/${m.id}`, { method: 'DELETE' }); App.toast('Menu supprimé.'); Dashboard.renderers.roles(content, data); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    list.appendChild(row);
  });
  c.appendChild(list);
  const newBtn = App.el(`<button class="dash-btn dash-btn-primary" style="margin-top:8px">＋ Nouveau menu de rôles</button>`);
  newBtn.onclick = () => BotViews.openRoleMenuModal(bot, guildId, null);
  c.appendChild(newBtn);
};

// ---------- Suggestions ----------
Dashboard.renderers.suggestions = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '💡', 'Suggestions', 'Les membres proposent (/suggest), tout le monde vote, le staff tranche.');
  const s = data.settings;
  const c = Dashboard.card(root, 'Configuration', '');
  c.innerHTML += `
    <label class="dash-label">Salon des suggestions (ex : #suggestions)</label>
    <input class="dash-input" id="s-channel" value="${App.escapeHtml(s.suggestion_channel || '')}" placeholder="#suggestions" />
    <button class="dash-btn dash-btn-primary" style="margin-top:12px" id="s-save">💾 Enregistrer</button>`;
  c.querySelector('#s-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: { suggestion_channel: c.querySelector('#s-channel').value.trim() } });
      App.toast('Salon des suggestions enregistré !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  const { suggestions } = await App.api(`/bots/${bot.id}/guilds/${guildId}/suggestions`);
  const c2 = Dashboard.card(root, 'Liste', 'Clique pour changer le statut (✅/❌) — synchronisé avec les boutons du message Discord.');
  if (!suggestions.length) c2.appendChild(App.el(`<div class="dash-empty">Aucune suggestion.</div>`));
  const table = App.el(`<table class="dash-table"><thead><tr><th>#</th><th>Texte</th><th>Votes</th><th>Statut</th></tr></thead><tbody></tbody></table>`);
  const tb = table.querySelector('tbody');
  suggestions.forEach((sg) => {
    const tr = App.el(`<tr>
      <td>#${sg.id}</td>
      <td style="max-width:340px">${App.escapeHtml(sg.text.slice(0, 120))}${sg.text.length > 120 ? '…' : ''}</td>
      <td>👍 ${sg.upvotes} / 👎 ${sg.downvotes}</td>
      <td>
        <select class="dash-select" style="max-width:150px">
          <option value="pending" ${sg.status === 'pending' ? 'selected' : ''}>⏳ En attente</option>
          <option value="approved" ${sg.status === 'approved' ? 'selected' : ''}>✅ Approuvée</option>
          <option value="denied" ${sg.status === 'denied' ? 'selected' : ''}>❌ Refusée</option>
        </select>
      </td>
    </tr>`);
    tr.querySelector('select').onchange = async (e) => {
      try { await App.api(`/bots/${bot.id}/guilds/${guildId}/suggestions/${sg.id}`, { method: 'PUT', body: { status: e.target.value } }); App.toast('Statut mis à jour !'); }
      catch (err) { App.toast(err.message, 'error'); }
    };
    tb.appendChild(tr);
  });
  c2.appendChild(table);
};

// ---------- Giveaways ----------
Dashboard.renderers.giveaways = async (content) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🎁', 'Giveaways', 'Tirages automatiques par réaction 🎉 (/giveaway create durée prix gagnants).');
  const { giveaways } = await App.api(`/bots/${bot.id}/guilds/${guildId}/giveaways`);
  const active = giveaways.filter((g) => !g.drawn);
  const c = Dashboard.card(root, 'En cours', '');
  if (!active.length) c.appendChild(App.el(`<div class="dash-empty">Aucun giveaway en cours.</div>`));
  active.forEach((g) => {
    const row = App.el(`
      <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--d-border);border-radius:10px;padding:10px 14px;margin-bottom:8px">
        <div style="flex:1"><b>🎁 ${App.escapeHtml(g.prize)}</b><div style="color:var(--d-dim);font-size:12px">${g.winners} gagnant(s) · fin <t:${Math.floor(g.ends_at / 1000)}:R></div></div>
        <button class="dash-btn dash-btn-danger dash-btn-sm" data-end="${g.id}">⏹ Terminer maintenant</button>
      </div>`);
    row.querySelector('[data-end]').onclick = async () => {
      if (!(await App.confirm('Terminer ce giveaway et tirer les gagnants maintenant ?'))) return;
      try {
        const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/giveaways/${g.id}/end`, { method: 'POST' });
        App.toast(r.ok ? `Tirage terminé ! Gagnants : ${(r.winners || []).join(', ') || 'aucun participant'}` : (r.reason || 'Erreur'));
        Dashboard.renderers.giveaways(content);
      } catch (e) { App.toast(e.message, 'error'); }
    };
    c.appendChild(row);
  });
  const c2 = Dashboard.card(root, 'Historique', 'Les 30 derniers giveaways.');
  if (!giveaways.length) c2.appendChild(App.el(`<div class="dash-empty">Aucun historique.</div>`));
  else {
    const table = App.el(`<table class="dash-table"><thead><tr><th>Prix</th><th>Gagnants</th><th>Statut</th></tr></thead><tbody></tbody></table>`);
    const tb = table.querySelector('tbody');
    giveaways.slice(0, 15).forEach((g) => tb.appendChild(App.el(`<tr><td>${App.escapeHtml(g.prize)}</td><td>${g.winners}</td><td>${g.drawn ? '✅ Terminé' : '⏳ En cours'}</td></tr>`)));
    c2.appendChild(table);
  }
};

// ---------- Journaux ----------
Dashboard.renderers.logs = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings;
  const root = Dashboard.header(content, '📜', 'Journaux de modération', 'Un salon où le bot trace tout : sanctions, tickets, auto-mod, arrivées/départs.');
  const c = Dashboard.card(root, 'Configuration', 'Active avec /modlogs set #salon ou ici.');
  c.innerHTML += `
    <label class="dash-label">Salon des journaux (ex : #logs)</label>
    <input class="dash-input" id="l-channel" value="${App.escapeHtml(s.log_channel || '')}" placeholder="#logs" />
    <button class="dash-btn dash-btn-primary" style="margin-top:12px" id="l-save">💾 Enregistrer</button>
    <div class="desc" style="margin-top:12px">Tracés automatiquement : kicks, bans, timeouts, avertissements, purges, sanctions prédéfinies, achats boutique, rôles temporaires, tickets (ouverture/fermeture/suppression), auto-modération, arrivées et départs.</div>`;
  c.querySelector('#l-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: { log_channel: c.querySelector('#l-channel').value.trim() } });
      App.toast('Journaux enregistrés !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Réglages serveur ----------
Dashboard.renderers.server = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings;
  const root = Dashboard.header(content, '⚙️', 'Réglages du serveur', 'Préfixe propre au serveur et auto-modération par avertissements.');
  const c = Dashboard.card(root, 'Général', '');
  c.innerHTML += `
    <label class="dash-label">Préfixe (vide = « ${App.escapeHtml(bot.prefix)} »)</label>
    <input class="dash-input" id="g-prefix" maxlength="5" value="${App.escapeHtml(s.prefix || '')}" placeholder="${App.escapeHtml(bot.prefix)}" style="max-width:200px" />
    <label class="dash-label">Limite d\'avertissements (0 = désactivé)</label>
    <input class="dash-input" id="g-warn" type="number" min="0" value="${s.warn_limit || 0}" style="max-width:200px" />
    <label class="dash-label">Action à la limite</label>
    <select class="dash-select" id="g-action" style="max-width:220px">
      <option value="none" ${s.warn_action === 'none' ? 'selected' : ''}>Aucune</option>
      <option value="kick" ${s.warn_action === 'kick' ? 'selected' : ''}>👢 Expulser</option>
      <option value="ban" ${s.warn_action === 'ban' ? 'selected' : ''}>🔨 Bannir</option>
    </select>
    <div style="margin-top:14px"><button class="dash-btn dash-btn-primary" id="g-save">💾 Enregistrer</button></div>`;
  c.querySelector('#g-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: {
        prefix: c.querySelector('#g-prefix').value.trim(),
        warn_limit: parseInt(c.querySelector('#g-warn').value, 10) || 0,
        warn_action: c.querySelector('#g-action').value,
      }});
      App.toast('Réglages enregistrés !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  // Rôles temporaires actifs
  const { roles } = await App.api(`/bots/${bot.id}/guilds/${guildId}/temproles`);
  const c2 = Dashboard.card(root, '⏳ Rôles temporaires', 'Donnés avec /temprole — retirés automatiquement à l\'expiration.');
  if (!roles.length) c2.appendChild(App.el(`<div class="dash-empty">Aucun rôle temporaire actif.</div>`));
  roles.forEach((r) => {
    const row = App.el(`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="flex:1"><b>${App.escapeHtml(r.role)}</b> → <@${r.user_id}> <span style="color:var(--d-dim);font-size:12px">· expire <t:${Math.floor(r.expires_at / 1000)}:R></span></div>
        <button class="dash-btn dash-btn-danger dash-btn-sm" data-rev="${r.id}">Retirer</button>
      </div>`);
    row.querySelector('[data-rev]').onclick = async () => {
      try { await App.api(`/bots/${bot.id}/guilds/${guildId}/temproles/${r.id}`, { method: 'DELETE' }); App.toast('Rôle retiré de la liste (retiré du membre à l\'expiration).'); Dashboard.renderers.server(content, data); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    c2.appendChild(row);
  });
};

// ---------- Commandes (niveau bot) ----------
Dashboard.renderers.commands = async (content) => {
  const bot = Dashboard.state.bot;
  const root = Dashboard.header(content, '🧩', 'Commandes personnalisées', 'Construis tes propres commandes avec l\'éditeur de blocs (glisser-déposer).');
  const { commands } = await App.api(`/bots/${bot.id}/commands`);
  const c = Dashboard.card(root, 'Mes commandes', '');
  if (!commands.length) c.appendChild(App.el(`<div class="dash-empty"><div class="big">🧩</div>Aucune commande personnalisée.</div>`));
  const list = App.el(`<div></div>`);
  commands.forEach((cmd) => {
    const trigger = { prefix: `${bot.prefix}${cmd.trigger_value || cmd.name}`, slash: `/${cmd.name}`, keyword: `mot-clé « ${cmd.trigger_value} »` }[cmd.trigger_type] || cmd.trigger_type;
    const blocks = JSON.parse(cmd.blocks || '[]');
    const row = App.el(`
      <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--d-border);border-radius:10px;padding:10px 14px;margin-bottom:8px;cursor:pointer">
        <div style="flex:1"><b>${App.escapeHtml(cmd.name)}</b><div style="color:var(--d-dim);font-size:12px">${App.escapeHtml(cmd.description || '')} · ${blocks.length} bloc(s)</div></div>
        <span class="dash-badge">${App.escapeHtml(trigger)}</span>
        <button class="dash-btn dash-btn-sm" data-edit="${cmd.id}">✏️</button>
        <button class="dash-btn dash-btn-danger dash-btn-sm" data-del="${cmd.id}">🗑</button>
      </div>`);
    row.onclick = (e) => { if (e.target.closest('button')) return; Editor.open(bot, cmd, commands); };
    row.querySelector('[data-edit]').onclick = () => Editor.open(bot, cmd, commands);
    row.querySelector('[data-del]').onclick = async () => {
      if (!(await App.confirm(`Supprimer « ${cmd.name} » ?`))) return;
      try { await App.api(`/commands/${cmd.id}`, { method: 'DELETE' }); App.toast('Supprimée.'); Dashboard.renderers.commands(content); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    list.appendChild(row);
  });
  c.appendChild(list);
  const newBtn = App.el(`<button class="dash-btn dash-btn-primary">＋ Nouvelle commande</button>`);
  newBtn.onclick = () => Editor.open(bot, null, commands);
  c.appendChild(newBtn);
};

// ---------- Modules (niveau bot) ----------
Dashboard.renderers.modules = async (content) => {
  const bot = Dashboard.state.bot;
  const root = Dashboard.header(content, '📦', 'Modules pré-faits', 'Active des commandes en un clic — elles s\'enregistrent automatiquement sur tous les serveurs du bot.');
  const { modules } = await App.api(`/bots/${bot.id}/modules`);
  const grid = App.el(`<div class="dash-grid"></div>`);
  modules.forEach((m) => {
    const card = App.el(`
      <div class="dash-card">
        <div class="card-head">
          <div><h3>${m.emoji} ${m.label}</h3><div class="desc">${App.escapeHtml(m.description)}</div></div>
          <label class="switch"><input type="checkbox" ${m.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${m.commands.map((c) => `<span class="dash-badge">${App.escapeHtml(bot.prefix)}${c.name}</span>`).join('')}</div>
      </div>`);
    card.querySelector('input').onchange = async (e) => {
      try {
        await App.api(`/bots/${bot.id}/modules/${m.key}`, { method: 'PUT', body: { enabled: e.target.checked } });
        App.toast(`Module ${m.label} ${e.target.checked ? 'activé' : 'désactivé'} !`);
      } catch (err) { App.toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    };
    grid.appendChild(card);
  });
  root.appendChild(grid);
};

// ---------- Réglages du bot ----------
Dashboard.renderers.botsettings = async (content) => {
  const bot = Dashboard.state.bot;
  const root = Dashboard.header(content, '🤖', 'Réglages du bot', 'Préfixe global, statut, identité et sauvegarde.');
  const c = Dashboard.card(root, 'Général', '');
  c.innerHTML += `
    <label class="dash-label">Préfixe global</label>
    <input class="dash-input" id="b-prefix" maxlength="5" value="${App.escapeHtml(bot.prefix)}" style="max-width:200px" />
    <label class="dash-label">Statut affiché</label>
    <input class="dash-input" id="b-status" value="${App.escapeHtml(bot.status_text)}" style="max-width:300px" />
    <div style="margin-top:14px"><button class="dash-btn dash-btn-primary" id="b-save">💾 Enregistrer</button></div>`;
  c.querySelector('#b-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}`, { method: 'PATCH', body: { prefix: c.querySelector('#b-prefix').value.trim() || '!', status_text: c.querySelector('#b-status').value } });
      App.toast('Enregistré !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  const c2 = Dashboard.card(root, '💾 Sauvegarde automatique', 'Toutes les données (comptes, bots, configs) sont sauvegardées et restaurées à chaque mise à jour.');
  try {
    const s = await App.api('/status/backup');
    c2.appendChild(App.el(`<div class="desc" style="margin:0">${s.enabled
      ? `✅ <b>Active</b> — dépôt <code>${App.escapeHtml(s.repo)}</code> · sauvegarde toutes les 10 minutes + restauration au démarrage.`
      : '⚠️ Désactivée — configure BOTDEV_GH_TOKEN et BOTDEV_DATA_REPO sur Render.'}</div>`));
  } catch {}
};
