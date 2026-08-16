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
  ['announcements', '📅', 'Annonces'],
  ['members', '👥', 'Membres'],
  ['stats', '📈', 'Statistiques'],
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
  const ts = data.tickets_stats || { total: 0, open: 0 };
  const root = Dashboard.header(content, '📊', `Vue d\'ensemble — ${App.escapeHtml(g.name)}`, `${g.members} membres · configuration de ${App.escapeHtml(bot.name)} sur ce serveur`);
  root.appendChild(App.el(`
    <div class="dash-stats">
      <div class="dash-stat"><div class="val">${g.members}</div><div class="lbl">Membres</div></div>
      <div class="dash-stat"><div class="val">${ts.open}</div><div class="lbl">Tickets ouverts</div></div>
      <div class="dash-stat"><div class="val">${data.tickets.types ? data.tickets.types.length : 0}</div><div class="lbl">Types de tickets</div></div>
      <div class="dash-stat"><div class="val">${(data.xp_roles || []).length}</div><div class="lbl">Récompenses de niveau</div></div>
      <div class="dash-stat"><div class="val">${(data.role_menus || []).length}</div><div class="lbl">Menus de rôles</div></div>
      <div class="dash-stat"><div class="val">${(data.scheduled || []).length}</div><div class="lbl">Annonces programmées</div></div>
    </div>`));
  const grid = App.el(`<div class="dash-grid"></div>`);
  const mods = [
    ['tickets', '🎫', 'Tickets', 'Types personnalisés, rôles staff multiples, transcriptions en MP'],
    ['welcome', '👋', 'Bienvenue', 'Message d\'accueil, départ, auto-rôles et anniversaires'],
    ['levels', '📈', 'Niveaux', 'XP en discutant, annonces, récompenses de rôles'],
    ['shop', '🛒', 'Boutique', 'Les membres achètent des rôles avec leurs coins'],
    ['moderation', '🛡️', 'Modération', 'Auto-mod, liste noire, sanctions, anti-raid'],
    ['suggestions', '💡', 'Suggestions', 'Les membres proposent, tout le monde vote'],
    ['giveaways', '🎁', 'Giveaways', 'Tirages automatiques par réaction'],
    ['announcements', '📅', 'Annonces', 'Messages automatiques à heure fixe'],
    ['members', '👥', 'Membres', 'Liste complète : coins, rôles, actions directes'],
    ['stats', '📈', 'Statistiques', 'Activité, nouveaux membres, top actifs'],
    ['logs', '📜', 'Journaux', 'Choisis ce que le bot trace'],
    ['roles', '📋', 'Rôles', 'Menus déroulants et boutons de rôles'],
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
  const ts = data.tickets_stats || { total: 0, open: 0 };
  root.appendChild(App.el(`
    <div class="dash-stats" style="margin-bottom:14px">
      <div class="dash-stat"><div class="val">${ts.open}</div><div class="lbl">🎫 Ouverts en ce moment</div></div>
      <div class="dash-stat"><div class="val">${ts.total}</div><div class="lbl">📦 Ouverts au total</div></div>
      <div class="dash-stat"><div class="val">${typesData.length}</div><div class="lbl">🗂️ Types configurés</div></div>
    </div>`));

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

  // 👀 Aperçu en direct du panneau (bouton + menu déroulant des types)
  const btnColors = { '1': '#5865F2', '2': '#4E5058', '3': '#3BA55D', '4': '#ED4245' };
  const preview = App.el(`<div id="t-preview" style="margin-top:16px;border:1px dashed var(--d-border);border-radius:12px;padding:14px 16px;background:var(--d-card2)"></div>`);
  c.appendChild(preview);
  const renderPreview = () => {
    const label = c.querySelector('#t-label').value.trim() || '🎫 Ouvrir un ticket';
    const style = c.querySelector('#t-style').value;
    const color = btnColors[style] || '#5865F2';
    const typesCount = typesData.filter((x) => x.label).length;
    preview.innerHTML = `
      <div class="dash-label" style="margin:0 0 8px">👀 Aperçu du panneau sur Discord</div>
      <div style="background:#313338;border-radius:10px;padding:14px;color:#DBDEE1;font-size:13px">
        <div style="margin-bottom:10px">🎫 ${App.escapeHtml(t.message || 'Besoin d\'aide ? Ouvre un ticket !')}</div>
        <span style="display:inline-flex;align-items:center;gap:6px;background:${color};color:#fff;font-weight:700;padding:7px 16px;border-radius:6px">${App.escapeHtml(label)}</span>
        ${typesCount
          ? `<div style="margin-top:12px;border:1px solid #1E1F22;border-radius:6px;padding:9px 12px;color:#A8ABAF">▾ ${typesData.filter((x) => x.label).map((x) => `${x.emoji || '🎫'} ${x.label}`).join('  ·  ')}</div>`
          : `<div style="margin-top:10px;color:#A8ABAF;font-size:11.5px">Aucun type → un simple bouton s\'affichera.</div>`}
      </div>`;
  };
  c.querySelector('#t-label').addEventListener('input', renderPreview);
  c.querySelector('#t-style').addEventListener('change', renderPreview);
  c.querySelector('#t-msg').addEventListener('input', renderPreview);
  renderPreview();

  const c2 = Dashboard.card(root, '🗂️ Types de tickets', 'Chaque type : emoji, catégorie et PLUSIEURS rôles staff — choisis dans des listes, comme sur Discord.');
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
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input class="dash-input" data-k="emoji" value="${App.escapeHtml(x.emoji)}" placeholder="🤝" style="max-width:64px;text-align:center" />
            <input class="dash-input" data-k="label" value="${App.escapeHtml(x.label)}" placeholder="Nom du type" style="flex:1;min-width:140px" />
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
          </div>
          <div data-emojierr style="color:#ff8a8d;font-size:11.5px;margin-top:3px;display:none">⚠️ Emoji invalide — utilise un vrai emoji (ex : 🤝)</div>
          <label class="dash-label">🗂️ Catégorie (menu déroulant)</label>
          <select class="dash-select" data-k="categorySel">
            <option value="">— Catégorie par défaut (Tickets) —</option>
            ${categories.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${x.category === ch.name ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
            ${x.category && !categories.some((ch) => ch.name === x.category) ? `<option value="${App.escapeHtml(x.category)}" selected>📁 ${App.escapeHtml(x.category)} (manuelle)</option>` : ''}
            <option value="__custom__">✏️ Autre… (écrire)</option>
          </select>
          <input class="dash-input" data-k="category" value="${App.escapeHtml(x.category)}" placeholder="Ou écris la catégorie" style="margin-top:6px;${x.category && !categories.some((ch) => ch.name === x.category) ? '' : 'display:none'}" />
          <label class="dash-label">🛡️ Rôles staff (plusieurs possibles — menus déroulants)</label>
          <div class="t-roles" style="display:flex;flex-direction:column;gap:6px"></div>
          <button class="dash-btn dash-btn-sm" data-addrole style="margin-top:6px">＋ Ajouter un rôle staff</button>
        </div>`);
      const emojiInp = row.querySelector('[data-k="emoji"]');
      const emojiErr = row.querySelector('[data-emojierr]');
      const emojiOk = (s) => {
        const str = String(s || '').trim();
        if (!str) return true;
        return /^<a?:[a-zA-Z0-9_]+:\d{15,21}>$/.test(str) || /^[\p{Extended_Pictographic}\u200D\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]+$/u.test(str);
      };
      emojiInp.addEventListener('input', () => {
        x.emoji = emojiInp.value.trim();
        emojiErr.style.display = emojiOk(x.emoji) ? 'none' : 'block';
        renderPreview();
      });
      const labelInp = row.querySelector('[data-k="label"]');
      labelInp.addEventListener('input', () => { x.label = labelInp.value; renderPreview(); });
      const catSel = row.querySelector('[data-k="categorySel"]');
      const catInp = row.querySelector('[data-k="category"]');
      catSel.addEventListener('change', () => {
        if (catSel.value === '__custom__') {
          catInp.style.display = '';
          x.category = catInp.value;
        } else {
          catInp.style.display = 'none';
          x.category = catSel.value;
        }
        renderPreview();
      });
      catInp.addEventListener('input', () => { x.category = catInp.value; });
      row.querySelector('[data-del]').onclick = () => { typesData.splice(i, 1); renderTypes(); renderPreview(); };
      const rolesEl = row.querySelector('.t-roles');
      const renderRoles = () => {
        rolesEl.innerHTML = '';
        x.staff_roles.forEach((r, j) => {
          const rr = App.el(`
            <div style="display:flex;gap:7px">
              <select class="dash-select t-role-sel">
                <option value="">— Choisir un rôle —</option>
                ${rolesList.map((role) => `<option value="${App.escapeHtml(role.name)}" ${r === role.name ? 'selected' : ''}>🛡️ ${App.escapeHtml(role.name)}</option>`).join('')}
                ${r && !rolesList.some((role) => role.name === r) ? `<option value="${App.escapeHtml(r)}" selected>🛡️ ${App.escapeHtml(r)} (introuvable ?)</option>` : ''}
              </select>
              <button class="dash-btn dash-btn-danger dash-btn-sm">🗑</button>
            </div>`);
          rr.querySelector('select').addEventListener('change', (e) => { x.staff_roles[j] = e.target.value; });
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

  const c2 = Dashboard.card(root, '🧾 Historique des achats', 'Les 15 derniers achats des membres.');
  try {
    const { purchases } = await App.api(`/bots/${bot.id}/guilds/${guildId}/shop/purchases`);
    if (!purchases.length) c2.appendChild(App.el(`<div class="dash-empty">Aucun achat pour l\'instant.</div>`));
    else {
      const table = App.el(`<table class="dash-table"><thead><tr><th>Membre</th><th>Article</th><th>Prix</th><th>Quand</th></tr></thead><tbody></tbody></table>`);
      const tb = table.querySelector('tbody');
      purchases.forEach((p) => {
        tb.appendChild(App.el(`<tr><td><@${p.user_id}></td><td>${App.escapeHtml(p.item)}</td><td>🪙 ${p.price}</td><td style="color:var(--d-dim);font-size:12px">${App.escapeHtml(p.ts)}</td></tr>`));
      });
      c2.appendChild(table);
    }
  } catch {}
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
  const root = Dashboard.header(content, '📋', 'Menus & boutons de rôles', 'Deux styles au choix : menu déroulant (plusieurs rôles d\'un coup) ou boutons (un clic = un rôle, re-clic = retiré).');
  const c = Dashboard.card(root, 'Panneaux', 'Envoie-les sur Discord avec /roles send (ou le bouton ci-dessous).');
  const menus = data.role_menus || [];
  if (!menus.length) c.appendChild(App.el(`<div class="dash-empty"><div class="big">📋</div>Aucun panneau pour l\'instant.</div>`));
  const list = App.el(`<div></div>`);
  menus.forEach((m) => {
    const modeLabel = m.mode === 'buttons' ? '🔘 Boutons' : '📋 Menu déroulant';
    const row = App.el(`
      <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--d-border);border-radius:10px;padding:10px 14px;margin-bottom:8px">
        <div style="flex:1"><b>${App.escapeHtml(m.name)}</b><div style="color:var(--d-dim);font-size:12px">${m.options.length} rôle(s) · ${modeLabel}</div></div>
        <button class="dash-btn dash-btn-sm" data-send="${m.id}">📨 Envoyer</button>
        <button class="dash-btn dash-btn-danger dash-btn-sm" data-del="${m.id}">🗑</button>
      </div>`);
    row.querySelector('[data-send]').onclick = async () => {
      try { await App.api(`/role-menus/${m.id}/send`, { method: 'POST' }); App.toast('Panneau envoyé !'); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    row.querySelector('[data-del]').onclick = async () => {
      if (!(await App.confirm(`Supprimer le panneau « ${m.name} » ?`))) return;
      try { await App.api(`/role-menus/${m.id}`, { method: 'DELETE' }); App.toast('Panneau supprimé.'); Dashboard.renderers.roles(content, data); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    list.appendChild(row);
  });
  c.appendChild(list);
  const newBtn = App.el(`<button class="dash-btn dash-btn-primary" style="margin-top:8px">＋ Nouveau panneau de rôles</button>`);
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
  const c2 = Dashboard.card(root, 'Liste', 'Change le statut (synchronisé avec Discord) ou supprime une suggestion.');
  if (!suggestions.length) c2.appendChild(App.el(`<div class="dash-empty">Aucune suggestion.</div>`));
  const table = App.el(`<table class="dash-table"><thead><tr><th>#</th><th>Texte</th><th>Votes</th><th>Statut</th><th></th></tr></thead><tbody></tbody></table>`);
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
      <td><button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button></td>
    </tr>`);
    tr.querySelector('select').onchange = async (e) => {
      try { await App.api(`/bots/${bot.id}/guilds/${guildId}/suggestions/${sg.id}`, { method: 'PUT', body: { status: e.target.value } }); App.toast('Statut mis à jour !'); }
      catch (err) { App.toast(err.message, 'error'); }
    };
    tr.querySelector('[data-del]').onclick = async () => {
      if (!(await App.confirm('Supprimer cette suggestion ?'))) return;
      try { await App.api(`/bots/${bot.id}/guilds/${guildId}/suggestions/${sg.id}`, { method: 'DELETE' }); App.toast('Suggestion supprimée.'); Dashboard.renderers.suggestions(content, data); }
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

// ---------- Membres (liste + actions) ----------
Dashboard.renderers.members = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '👥', 'Membres du serveur', 'La liste des membres avec leurs rôles, niveaux et coins — et des actions directes.');
  const rolesList = data.roles || [];
  const c = Dashboard.card(root, 'Recherche', '');
  c.innerHTML += `<input class="dash-input" id="m-search" placeholder="🔍 Rechercher un membre…" style="max-width:320px" />`;
  const listEl = App.el(`<div id="m-list" style="margin-top:12px"></div>`);
  root.appendChild(listEl);

  let members = [];
  try {
    const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/members`);
    members = r.members || [];
  } catch (e) { listEl.appendChild(App.el(`<div class="dash-empty">${App.escapeHtml(e.message)}</div>`)); return; }

  const render = (q = '') => {
    listEl.innerHTML = '';
    const filtered = members.filter((m) => !q || m.tag.toLowerCase().includes(q.toLowerCase()));
    if (!filtered.length) { listEl.appendChild(App.el(`<div class="dash-empty">Aucun membre trouvé.</div>`)); return; }
    filtered.forEach((m) => {
      const rolesHtml = m.roles.length
        ? m.roles.map((r) => `<span class="m-role" style="background:${r.color === '#000000' ? '#2f3136' : r.color}33;color:${r.color === '#000000' ? '#b9bbbe' : r.color};border:1px solid ${r.color === '#000000' ? '#2f3136' : r.color}55">${App.escapeHtml(r.name)}</span>`).join('')
        : '<span style="color:var(--d-dim);font-size:11px">aucun rôle</span>';
      const row = App.el(`
        <div class="dash-member">
          <img class="m-avatar" src="${App.escapeHtml(m.avatar)}" alt="" loading="lazy" />
          <div class="m-info">
            <b>${App.escapeHtml(m.username)}</b>${m.is_owner ? ' 👑' : ''}
            <div class="m-roles">${rolesHtml}</div>
            <div class="m-meta">🪙 ${m.coins} coins · ✨ ${m.level} (${m.xp} XP)</div>
          </div>
          <div class="m-actions">
            <button class="dash-btn dash-btn-sm" data-coins>🪙 Coins</button>
            <button class="dash-btn dash-btn-sm" data-role>🏷️ Rôle</button>
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-kick>👢</button>
          </div>
        </div>`);
      row.querySelector('[data-coins]').onclick = () => App.prompt('🪙 Coins à donner (ex : 500, ou -100 pour retirer) :', '500').then(async (val) => {
        if (!val) return;
        const amt = parseInt(val, 10);
        if (!amt) return App.toast('Montant invalide.', 'error');
        try {
          const r2 = await App.api(`/bots/${bot.id}/guilds/${guildId}/members/coins`, { method: 'POST', body: { user_id: m.id, amount: amt } });
          m.coins = r2.coins;
          App.toast(`${amt > 0 ? '+' : ''}${amt} coins pour ${m.username} !`);
          render(c.querySelector('#m-search').value);
        } catch (e) { App.toast(e.message, 'error'); }
      });
      row.querySelector('[data-role]').onclick = () => {
        App.modal(`
          <div class="modal-header"><h3>🏷️ Rôle — ${App.escapeHtml(m.username)}</h3><button class="x-btn" data-close>×</button></div>
          <div class="modal-body">
            <label class="field-label">Rôle</label>
            <select class="input" id="mr-role">${rolesList.map((r) => `<option value="${App.escapeHtml(r.id)}">${App.escapeHtml(r.name)}</option>`).join('')}</select>
            <div style="display:flex;gap:10px;margin-top:16px">
              <button class="btn btn-primary" id="mr-add" style="flex:1">✅ Ajouter</button>
              <button class="btn btn-danger" id="mr-remove" style="flex:1">➖ Retirer</button>
            </div>
          </div>`);
        document.querySelector('[data-close]').onclick = App.closeModal;
        document.querySelector('#mr-add').onclick = async () => {
          try { await App.api(`/bots/${bot.id}/guilds/${guildId}/members/role`, { method: 'POST', body: { user_id: m.id, role_id: document.querySelector('#mr-role').value, action: 'add' } }); App.closeModal(); App.toast('Rôle ajouté !'); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        document.querySelector('#mr-remove').onclick = async () => {
          try { await App.api(`/bots/${bot.id}/guilds/${guildId}/members/role`, { method: 'POST', body: { user_id: m.id, role_id: document.querySelector('#mr-role').value, action: 'remove' } }); App.closeModal(); App.toast('Rôle retiré !'); }
          catch (e) { App.toast(e.message, 'error'); }
        };
      };
      row.querySelector('[data-kick]').onclick = async () => {
        if (!(await App.confirm(`Expulser ${m.username} du serveur ?`))) return;
        try { await App.api(`/bots/${bot.id}/guilds/${guildId}/members/kick`, { method: 'POST', body: { user_id: m.id, reason: 'Expulsé depuis le dashboard Hoxera' } }); App.toast(`${m.username} a été expulsé.`); members = members.filter((x) => x.id !== m.id); render(c.querySelector('#m-search').value); }
        catch (e) { App.toast(e.message, 'error'); }
      };
      listEl.appendChild(row);
    });
  };
  c.querySelector('#m-search').addEventListener('input', (e) => render(e.target.value));
  render();
};

// ---------- Statistiques ----------
Dashboard.renderers.stats = async (content) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '📈', 'Statistiques du serveur', 'Activité des 7 derniers jours — mesurée automatiquement par le bot.');
  let s;
  try { s = await App.api(`/bots/${bot.id}/guilds/${guildId}/stats`); }
  catch (e) { root.appendChild(App.el(`<div class="dash-empty">${App.escapeHtml(e.message)}</div>`)); return; }

  const maxMsgs = Math.max(...s.activity.map((d) => d.messages), 1);
  const maxJoins = Math.max(...s.joins.map((d) => d.members), 1);
  const dayLabels = s.activity.map((d) => new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));

  const bars = (values, max, color, unit, labels) => values.map((v, i) => `
    <div class="bar-col">
      <div class="bar-val">${v}</div>
      <div class="bar" style="height:${Math.max(4, Math.round((v / max) * 90))}px;background:${color}"></div>
      <div class="bar-lbl">${App.escapeHtml(labels[i])}</div>
    </div>`).join('');

  const c1 = Dashboard.card(root, '💬 Messages par jour', '');
  c1.appendChild(App.el(`<div class="chart">${bars(s.activity.map((d) => d.messages), maxMsgs, 'linear-gradient(180deg,#5865F2,#4752c4)', 'msg', dayLabels)}</div>`));
  if (!s.activity.some((d) => d.messages)) c1.appendChild(App.el(`<div class="desc" style="margin-top:8px">📊 Les statistiques commencent à se remplir dès que les membres discutent !</div>`));

  const c2 = Dashboard.card(root, '🆕 Nouveaux membres par jour', '');
  c2.appendChild(App.el(`<div class="chart">${bars(s.joins.map((d) => d.members), maxJoins, 'linear-gradient(180deg,#57F287,#3ba55d)', 'mbr', dayLabels)}</div>`));

  const c3 = Dashboard.card(root, '🏆 Top actifs (7 jours)', 'Les membres qui discutent le plus.');
  if (!s.top_active.length) c3.appendChild(App.el(`<div class="dash-empty">Pas encore assez de messages.</div>`));
  else {
    s.top_active.forEach((t, i) => {
      c3.appendChild(App.el(`
        <div class="dash-member" style="border:none;padding:7px 2px">
          <img class="m-avatar" src="${App.escapeHtml(t.avatar)}" alt="" loading="lazy" />
          <div class="m-info"><b>${App.escapeHtml(t.tag)}</b><div class="m-meta">💬 ${t.messages} messages</div></div>
          <div class="m-actions"><span class="dash-badge ${i === 0 ? 'ok' : ''}">${['🥇','🥈','🥉'][i] || `#${i + 1}`}</span></div>
        </div>`));
    });
  }
};

// ---------- Annonces programmées ----------
Dashboard.renderers.announcements = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '📅', 'Annonces programmées', 'Des messages envoyés automatiquement aux jours et heures choisis (ex : le lundi à 18 h).');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const { scheduled } = await App.api(`/bots/${bot.id}/guilds/${guildId}/scheduled`);

  const c = Dashboard.card(root, 'Mes annonces', 'Jusqu\'à 20 annonces. Heure de Paris (Europe/Paris).');
  const list = App.el(`<div id="ann-list"></div>`);
  c.appendChild(list);
  const render = () => {
    list.innerHTML = '';
    if (!scheduled.length) list.appendChild(App.el(`<div class="dash-empty">Aucune annonce programmée.</div>`));
    scheduled.forEach((a) => {
      const days = String(a.days || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
      const dayNames = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      const row = App.el(`
        <div class="dash-member" style="border:1px solid var(--d-border);border-radius:11px;margin-bottom:9px">
          <div class="m-info" style="flex:1">
            <b>🕐 ${String(a.hour).padStart(2, '0')}h${String(a.minute).padStart(2, '0')}</b>
            <div class="m-meta">${days.length === 7 ? 'Tous les jours' : days.map((d) => dayNames[d]).join(' · ')} · <#${App.escapeHtml(a.channel_id)}></div>
            <div style="color:var(--d-dim);font-size:12.5px;margin-top:4px;max-width:520px">${App.escapeHtml(a.text.slice(0, 160))}${a.text.length > 160 ? '…' : ''}</div>
          </div>
          <div class="m-actions">
            <button class="dash-btn dash-btn-sm" data-toggle>${a.enabled ? '⏸ Désactiver' : '▶️ Activer'}</button>
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
          </div>
        </div>`);
      row.querySelector('[data-toggle]').onclick = async () => {
        try {
          await App.api(`/bots/${bot.id}/guilds/${guildId}/scheduled/${a.id}`, { method: 'PUT', body: { enabled: a.enabled ? 0 : 1 } });
          App.toast(a.enabled ? 'Annonce désactivée.' : 'Annonce activée !');
          Dashboard.renderers.announcements(content, data);
        } catch (e) { App.toast(e.message, 'error'); }
      };
      row.querySelector('[data-del]').onclick = async () => {
        if (!(await App.confirm('Supprimer cette annonce ?'))) return;
        try { await App.api(`/bots/${bot.id}/guilds/${guildId}/scheduled/${a.id}`, { method: 'DELETE' }); App.toast('Annonce supprimée.'); Dashboard.renderers.announcements(content, data); }
        catch (e) { App.toast(e.message, 'error'); }
      };
      list.appendChild(row);
    });
  };
  render();

  const c2 = Dashboard.card(root, '＋ Nouvelle annonce', '');
  c2.innerHTML += `
    <label class="dash-label">Salon</label>
    <select class="dash-select" id="a-channel">${textChannels.map((ch) => `<option value="${ch.id}">💬 #${App.escapeHtml(ch.name)}</option>`).join('')}</select>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <div style="flex:1;min-width:110px"><label class="dash-label">Heure (0-23)</label><input class="dash-input" id="a-hour" type="number" min="0" max="23" value="18" /></div>
      <div style="flex:1;min-width:110px"><label class="dash-label">Minute (0-59)</label><input class="dash-input" id="a-minute" type="number" min="0" max="59" value="0" /></div>
    </div>
    <label class="dash-label" style="margin-top:10px">Jours</label>
    <div class="dash-filter-grid" style="grid-template-columns:repeat(auto-fit,minmax(90px,1fr))">
      ${['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map((d, i) => `
        <label class="dash-filter"><input type="checkbox" data-day="${i + 1}" checked /><span><b>${d}</b></span></label>`).join('')}
    </div>
    <label class="dash-label" style="margin-top:10px">Message</label>
    <textarea class="dash-input" id="a-text" rows="3" placeholder="Ex : 📣 Rappel : réunion du staff ce soir à 20 h !"></textarea>
    <button class="dash-btn dash-btn-primary" style="margin-top:12px" id="a-add">📅 Programmer</button>`;
  c2.querySelector('#a-add').onclick = async () => {
    const days = [...c2.querySelectorAll('[data-day]')].filter((x) => x.checked).map((x) => Number(x.dataset.day));
    const text = c2.querySelector('#a-text').value.trim();
    if (!days.length || !text) return App.toast('Choisis au moins un jour et écris le message.', 'error');
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/scheduled`, { method: 'POST', body: {
        channel_id: c2.querySelector('#a-channel').value,
        hour: parseInt(c2.querySelector('#a-hour').value, 10) || 0,
        minute: parseInt(c2.querySelector('#a-minute').value, 10) || 0,
        days,
        text,
      }});
      App.toast('Annonce programmée ! 🎉');
      Dashboard.renderers.announcements(content, data);
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Journaux ----------
Dashboard.renderers.logs = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings;
  const ev = data.log_events || {};
  const root = Dashboard.header(content, '📜', 'Journaux de modération', 'Un salon où le bot trace ce que TU choisis.');
  const c = Dashboard.card(root, 'Configuration', 'Active avec /modlogs set #salon ou ici.');
  c.innerHTML += `
    <label class="dash-label">Salon des journaux (ex : #logs)</label>
    <input class="dash-input" id="l-channel" value="${App.escapeHtml(s.log_channel || '')}" placeholder="#logs" />
    <label class="dash-label" style="margin-top:12px">📂 Que dois-je tracer ?</label>
    <div class="dash-filter-grid">
      ${[
        ['tickets', '🎫 Tickets', 'ouverture, fermeture, suppression'],
        ['mod', '🛡️ Modération', 'kick, ban, warn, timeout, purge…'],
        ['automod', '🤖 Auto-mod', 'liens, spam, mots interdits…'],
        ['joinleave', '👋 Arrivées / départs', 'nouveaux membres'],
        ['other', '🛒 Boutique & divers', 'achats, verrouillages…'],
      ].map(([key, label, desc]) => `
        <label class="dash-filter">
          <input type="checkbox" data-ev="${key}" ${ev[key] === 1 || ev[key] === true || !Object.keys(ev).length ? 'checked' : ''} />
          <span><b>${label}</b><small>${desc}</small></span>
        </label>`).join('')}
    </div>
    <button class="dash-btn dash-btn-primary" style="margin-top:14px" id="l-save">💾 Enregistrer</button>`;
  c.querySelector('#l-save').onclick = async () => {
    try {
      const map = {};
      c.querySelectorAll('[data-ev]').forEach((inp) => { map[inp.dataset.ev] = inp.checked ? 1 : 0; });
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: { log_channel: c.querySelector('#l-channel').value.trim(), log_events: map } });
      App.toast('Journaux enregistrés !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Réglages serveur ----------
Dashboard.renderers.server = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings;
  const root = Dashboard.header(content, '⚙️', 'Réglages du serveur', 'Préfixe, anniversaires, salons vocaux temporaires et plus.');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const categories = (data.channels || []).filter((ch) => ch.category);
  const rolesList = data.roles || [];
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

  // 🎂 Anniversaires
  const c3 = Dashboard.card(root, '🎂 Anniversaires', 'Les membres enregistrent leur date avec /birthday set jour mois. Le jour J, le bot les souhaite (et peut donner un rôle).');
  c3.innerHTML += `
    <label class="dash-label">Salon des anniversaires</label>
    <select class="dash-select" id="bd-channel">
      <option value="">— Aucun (annonces désactivées) —</option>
      ${textChannels.map((ch) => `<option value="${ch.id}" ${String(s.birthday_channel || '') === ch.id ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <label class="dash-label">Rôle anniversaire (optionnel — donné 24 h)</label>
    <select class="dash-select" id="bd-role">
      <option value="">— Aucun —</option>
      ${rolesList.map((r) => `<option value="${r.id}" ${String(s.birthday_role || '') === r.id ? 'selected' : ''}>🎂 ${App.escapeHtml(r.name)}</option>`).join('')}
    </select>
    <div style="margin-top:12px"><button class="dash-btn dash-btn-primary" id="bd-save">💾 Enregistrer</button></div>`;
  c3.querySelector('#bd-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: {
        birthday_channel: c3.querySelector('#bd-channel').value,
        birthday_role: c3.querySelector('#bd-role').value,
      }});
      App.toast('Anniversaires enregistrés !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  // 🔊 Salons vocaux temporaires
  const vt = data.voicetemp || { creator_channel: '', category: '', name_template: '' };
  const voiceChannels = (data.channels || []).filter((ch) => ch.voice);
  const c4 = Dashboard.card(root, '🔊 Salons vocaux temporaires', 'Un salon « ➕ Créer un vocal » : le bot crée un vocal au nom du membre et le supprime quand il est vide.');
  c4.innerHTML += `
    <label class="dash-label">Salon de création (vocal)</label>
    <select class="dash-select" id="vt-channel">
      <option value="">— Désactivé —</option>
      ${voiceChannels.map((ch) => `<option value="${ch.id}" ${String(vt.creator_channel || '') === ch.id ? 'selected' : ''}>🔊 ${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <label class="dash-label">Catégorie des vocaux créés</label>
    <select class="dash-select" id="vt-cat">
      <option value="">— Catégorie du salon de création —</option>
      ${categories.map((ch) => `<option value="${ch.id}" ${String(vt.category || '') === ch.id ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <label class="dash-label">Nom des salons (optionnel)</label>
    <input class="dash-input" id="vt-name" value="${App.escapeHtml(vt.name_template || '')}" placeholder="🔊 {name}" style="max-width:300px" />
    <div style="margin-top:12px"><button class="dash-btn dash-btn-primary" id="vt-save">💾 Enregistrer</button></div>`;
  c4.querySelector('#vt-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/voicetemp`, { method: 'PUT', body: {
        creator_channel: c4.querySelector('#vt-channel').value,
        category: c4.querySelector('#vt-cat').value,
        name_template: c4.querySelector('#vt-name').value.trim() || '🔊 {name}',
      }});
      App.toast('Salons vocaux enregistrés !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
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
    const s = await App.api('/backup/status');
    const last = s.last_backup ? new Date(s.last_backup) : null;
    const lastStr = last && !isNaN(last) ? last.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'jamais';
    c2.appendChild(App.el(`<div class="desc" style="margin:0 0 10px">${s.enabled
      ? `✅ <b>Active</b> — dépôt <code>${App.escapeHtml(s.repo)}</code> · sauvegarde toutes les 10 minutes + restauration au démarrage.`
      : '⚠️ Désactivée — configure BOTDEV_GH_TOKEN et BOTDEV_DATA_REPO sur Render.'}</div>`));
    c2.appendChild(App.el(`<div class="dash-badge ${s.enabled ? 'ok' : 'warn'}" style="margin-bottom:10px">🕐 Dernière sauvegarde : ${lastStr}</div>`));
    const nowBtn = App.el(`<button class="dash-btn dash-btn-primary">💾 Sauvegarder maintenant</button>`);
    nowBtn.onclick = async () => {
      try { await App.api('/backup/now', { method: 'POST' }); App.toast('Sauvegarde faite ! 🎉'); Dashboard.renderers.botsettings(content); }
      catch (e) { App.toast(e.message, 'error'); }
    };
    c2.appendChild(nowBtn);
  } catch {}
};
