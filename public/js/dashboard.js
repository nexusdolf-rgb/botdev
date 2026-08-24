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
      <nav class="dash-bnav" id="dash-bnav"></nav>
    </div>
  `);
  shell.appendChild(layout);

  Dashboard.renderSide(layout.querySelector('#dash-side'));
  Dashboard.renderBottomNav(layout.querySelector('#dash-bnav'));
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

  // 🌍 Dernier serveur utilisé mémorisé → on y retourne directement.
  // Sinon : GRILLE DE CARTES SERVEURS (le pattern signature des dashboards pro).
  let saved = null;
  try { saved = localStorage.getItem('hx-guild'); } catch {}
  const savedGuild = discordGuilds.find((g) => g.id === saved && g.hasBot && g.canManage);
  const usable = discordGuilds.filter((g) => g.hasBot);
  if (savedGuild) {
    await Dashboard.selectGuild(savedGuild.id);
  } else if (usable.length === 1 && usable[0].canManage) {
    await Dashboard.selectGuild(usable[0].id);
  } else if (discordGuilds.length) {
    Dashboard.renderServerGrid(content);
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
  ['community', '⭐', 'Communauté & Lives'],
  ['announcements', '📅', 'Annonces'],
  ['members', '👥', 'Membres'],
  ['stats', '📈', 'Statistiques'],
  ['logs', '📜', 'Journaux'],
  ['server', '⚙️', 'Réglages serveur'],
];
Dashboard.BOT_MODULES = [
  ['commands', '🧩', 'Commandes'],
  ['modules', '📦', 'Modules'],
  ['health', '🩺', 'Santé du bot'],
  ['botsettings', '🤖', 'Réglages du bot'],
];

// 🎛️ Composant partagé : carte de sélection du serveur (style DraftBot).
// Le vrai <select> natif est superposé en invisible : look custom, ergonomie native.
Dashboard.serverPicker = () => {
  const guilds = Dashboard.state.discordGuilds || [];
  const cur = guilds.find((g) => g.id === Dashboard.state.guildId);
  const initial = cur ? (cur.name || '?').trim()[0].toUpperCase() : '🌍';
  const pick = App.el(`
    <div class="dash-server-card" title="Changer de serveur">
      ${cur && cur.icon
        ? `<img src="${App.escapeHtml(cur.icon)}" alt="" />`
        : `<span class="srv-fallback">${App.escapeHtml(initial)}</span>`}
      <div class="srv-txt">
        <span class="srv-label">Serveur</span>
        <b>${cur ? App.escapeHtml(cur.name) : 'Choisir un serveur…'}</b>
      </div>
      <span class="srv-caret">⌄</span>
      <select aria-label="Changer de serveur">
        <option value="">— Choisir un serveur —</option>
        ${guilds.map((g) => `<option value="${g.id}" ${g.id === Dashboard.state.guildId ? 'selected' : ''}>${App.escapeHtml(g.name)}${g.hasBot ? '' : ' · bot absent'}${!g.canManage ? ' · lecture seule' : ''}</option>`).join('')}
      </select>
    </div>`);
  pick.querySelector('select').onchange = async (e) => {
    const g = guilds.find((x) => x.id === e.target.value);
    if (!g) return;
    if (!g.hasBot) { App.openInvite(Dashboard.state.bot.invite_url); App.toast('Ajoute le bot sur ce serveur pour le configurer !'); return; }
    if (!g.canManage) { App.toast('Lecture seule : il te faut la permission « Gérer le serveur ».', 'error'); return; }
    await Dashboard.selectGuild(g.id);
  };
  return pick;
};

Dashboard.renderSide = (aside) => {
  aside.innerHTML = '';
  aside.appendChild(Dashboard.serverPicker());

  aside.appendChild(App.el(`<div class="dash-side-section">Gestion du serveur</div>`));
  Dashboard.MODULES.forEach(([id, ico, label]) => {
    const b = App.el(`<button class="dash-side-item ${Dashboard.state.module === id ? 'active' : ''}" data-m="${id}"><span class="ico">${ico}</span>${label}</button>`);
    b.onclick = () => Dashboard.setModule(id);
    aside.appendChild(b);
  });
  // Section « Bot » (commandes/modules globales) : fondateur uniquement
  if (App.state.user && App.state.user.is_admin) {
    aside.appendChild(App.el(`<div class="dash-side-section">Administration du bot</div>`));
    Dashboard.BOT_MODULES.forEach(([id, ico, label]) => {
      const b = App.el(`<button class="dash-side-item ${Dashboard.state.module === id ? 'active' : ''}" data-m="${id}"><span class="ico">${ico}</span>${label}</button>`);
      b.onclick = () => Dashboard.setModule(id);
      aside.appendChild(b);
    });
  }
  aside.appendChild(App.el(`<div class="dash-side-foot">
    <div style="display:flex;align-items:center;gap:10px">
      ${Dashboard.state.bot.avatar_url ? `<img src="${App.escapeHtml(Dashboard.state.bot.avatar_url)}" style="width:34px;height:34px;border-radius:50%;box-shadow:0 0 0 2px rgba(88,101,242,.4)" alt=""/>` : '<span style="font-size:22px">⚡</span>'}
      <div>
        <b style="color:var(--d-text)">${App.escapeHtml(Dashboard.state.bot.name)}</b><br/>
        <span style="font-size:11px">Synchronisé en temps réel</span>
      </div>
    </div>
  </div>`));
};

Dashboard.setModule = (id) => {
  Dashboard.state.module = id;
  Dashboard.refresh();
};

// ---------------------- Navigation basse (mode Android) ----------------------
// 4 destinations principales + « Plus » qui ouvre la liste complète
// des modules dans une feuille glissante (comme une app Android).
Dashboard.BNav = [
  ['overview', '📊', 'Accueil'],
  ['tickets', '🎫', 'Tickets'],
  ['members', '👥', 'Membres'],
  ['stats', '📈', 'Stats'],
];

Dashboard.renderBottomNav = (nav) => {
  if (!nav) return;
  nav.innerHTML = '';
  const cur = Dashboard.state.module;
  Dashboard.BNav.forEach(([id, ico, label]) => {
    const b = App.el(`
      <button class="bnav-item ${cur === id ? 'active' : ''}" data-bnav="${id}">
        <span class="bnav-ico">${ico}</span>
        <span class="bnav-label">${label}</span>
      </button>`);
    b.onclick = () => Dashboard.setModule(id);
    nav.appendChild(b);
  });
  const more = App.el(`
    <button class="bnav-item" data-more>
      <span class="bnav-ico">☰</span>
      <span class="bnav-label">Plus</span>
    </button>`);
  more.onclick = () => Dashboard.openMoreSheet();
  nav.appendChild(more);
};

// Feuille « Plus » : tous les modules, groupés, en bas de l'écran.
Dashboard.openMoreSheet = () => {
  const bot = Dashboard.state.bot;
  const isAdmin = App.state.user && App.state.user.is_admin;
  App.modal(`
    <div class="modal-header" style="border:none">
      <h3>⚡ Modules</h3>
      <button class="x-btn" data-close>×</button>
    </div>
    <div class="modal-body" style="padding-top:0">
      <div class="dash-label" style="margin-top:0">Serveur sélectionné</div>
      <div class="sheet-grid">
        ${Dashboard.MODULES.map(([id, ico, label]) => `
          <button class="sheet-item ${Dashboard.state.module === id ? 'active' : ''}" data-sheet="${id}">
            <span class="sheet-ico">${ico}</span><span>${label}</span>
          </button>`).join('')}
      </div>
      ${isAdmin ? `
        <div class="dash-label" style="margin-top:16px">🤖 Bot</div>
        <div class="sheet-grid">
          ${Dashboard.BOT_MODULES.map(([id, ico, label]) => `
            <button class="sheet-item ${Dashboard.state.module === id ? 'active' : ''}" data-sheet="${id}">
              <span class="sheet-ico">${ico}</span><span>${label}</span>
            </button>`).join('')}
        </div>` : ''}
    </div>
  `);
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = App.closeModal; });
  document.querySelectorAll('[data-sheet]').forEach((b) => {
    b.onclick = () => {
      App.closeModal();
      Dashboard.setModule(b.dataset.sheet);
    };
  });
};

// Re-rend le module courant (après une sauvegarde)
Dashboard.refresh = () => {
  const shell = Dashboard.state.shell || document.querySelector('.bot-shell');
  if (!shell) return;
  const aside = shell.querySelector('.dash-side');
  if (aside) Dashboard.renderSide(aside);
  const bnav = shell.querySelector('.dash-bnav');
  if (bnav) Dashboard.renderBottomNav(bnav);
  const topbar = shell.querySelector('.dash-topbar');
  if (topbar && Dashboard.state.discordGuilds) Dashboard.renderTopbar(topbar, Dashboard.state.discordGuilds);
  Dashboard.renderContent(shell.querySelector('#dash-content'));
};

// ---------------------- 🔍 Palette de commandes (Ctrl+K) ----------------------
// Le raccourci des pros : cherche un module ou un serveur et saute dessus.
Dashboard.openPalette = () => {
  if (document.querySelector('#dash-palette')) return;
  const guilds = (Dashboard.state.discordGuilds || []).filter((g) => g.hasBot && g.canManage);
  const entries = [
    ...Dashboard.MODULES.map(([id, ico, label]) => ({ kind: 'module', id, ico, label, sub: 'Module' })),
    ...((App.state.user && App.state.user.is_admin) ? Dashboard.BOT_MODULES.map(([id, ico, label]) => ({ kind: 'module', id, ico, label, sub: 'Administration' })) : []),
    ...guilds.map((g) => ({ kind: 'guild', id: g.id, ico: '🌍', label: g.name, sub: 'Changer de serveur' })),
  ];
  const ov = App.el(`
    <div id="dash-palette" class="dash-palette-overlay">
      <div class="dash-palette">
        <input type="text" placeholder="Chercher un module ou un serveur…" />
        <div class="dp-list"></div>
        <div class="dp-hint">↑↓ naviguer · Entrée ouvrir · Échap fermer</div>
      </div>
    </div>`);
  document.body.appendChild(ov);
  const input = ov.querySelector('input');
  const list = ov.querySelector('.dp-list');
  let sel = 0; let shown = [];
  const close = () => ov.remove();
  const go = (e) => {
    close();
    if (!e) return;
    if (e.kind === 'guild') Dashboard.selectGuild(e.id);
    else Dashboard.setModule(e.id);
  };
  const renderList = () => {
    const q = input.value.trim().toLowerCase();
    shown = entries.filter((e) => !q || e.label.toLowerCase().includes(q)).slice(0, 9);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    if (!shown.length) { list.appendChild(App.el(`<div class="dp-empty">Aucun résultat</div>`)); return; }
    shown.forEach((e, i) => {
      const row = App.el(`<button class="dp-item ${i === sel ? 'sel' : ''}"><span class="dp-ico">${e.ico}</span><span class="dp-label">${App.escapeHtml(e.label)}</span><span class="dp-sub">${e.sub}</span></button>`);
      row.onclick = () => go(e);
      row.onmouseenter = () => { sel = i; renderList(); };
      list.appendChild(row);
    });
  };
  input.oninput = () => { sel = 0; renderList(); };
  input.onkeydown = (ev) => {
    if (ev.key === 'Escape') { close(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); renderList(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(sel - 1, 0); renderList(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); go(shown[sel]); }
  };
  ov.onclick = (ev) => { if (ev.target === ov) close(); };
  renderList();
  setTimeout(() => input.focus(), 30);
};
if (!window.__hxPaletteKey) {
  window.__hxPaletteKey = true;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && Dashboard.state && Dashboard.state.shell) {
      e.preventDefault();
      Dashboard.openPalette();
    }
  });
}

// ---------------------- 🎨 Accent personnalisable ----------------------
Dashboard.ACCENTS = [
  ['Blurple', '#5865F2', '#8B5CF6'],
  ['Océan', '#3B82F6', '#06B6D4'],
  ['Émeraude', '#10B981', '#34D399'],
  ['Sunset', '#F59E0B', '#EF4444'],
  ['Rose', '#EC4899', '#8B5CF6'],
  ['Rouge', '#EF4444', '#F97316'],
];
Dashboard.applyAccent = (name) => {
  const acc = Dashboard.ACCENTS.find((a) => a[0] === name) || Dashboard.ACCENTS[0];
  const r = document.documentElement;
  r.style.setProperty('--d-accent', acc[1]);
  r.style.setProperty('--d-accent2', acc[2]);
  r.style.setProperty('--d-glow', acc[1] + '59');
  try { localStorage.setItem('hx-accent', acc[0]); } catch {}
};
try { Dashboard.applyAccent(localStorage.getItem('hx-accent') || 'Blurple'); } catch {}

// ---------------------- 🌍 Grille de serveurs (choix visuel) ----------------------
Dashboard.renderServerGrid = (content) => {
  const guilds = Dashboard.state.discordGuilds || [];
  content.innerHTML = '';
  const wrap = App.el(`
    <div class="srv-grid-page">
      <div class="srv-grid-head">
        <h2>🌍 Choisis un serveur</h2>
        <p>Sélectionne le serveur à configurer — ou invite ${App.escapeHtml(Dashboard.state.bot.name)} sur un nouveau.</p>
      </div>
      <div class="srv-grid"></div>
    </div>`);
  const grid = wrap.querySelector('.srv-grid');
  guilds.forEach((g) => {
    const initial = (g.name || '?').trim()[0].toUpperCase();
    const card = App.el(`
      <button class="srv-card ${g.hasBot ? '' : 'no-bot'}">
        ${g.icon ? `<img src="${App.escapeHtml(g.icon)}" alt="" />` : `<span class="srv-card-fallback">${App.escapeHtml(initial)}</span>`}
        <b>${App.escapeHtml(g.name)}</b>
        ${g.hasBot
          ? (g.canManage ? '<span class="srv-badge ok">✅ Configurer</span>' : '<span class="srv-badge">🔒 Lecture seule</span>')
          : '<span class="srv-badge invite">➕ Inviter le bot</span>'}
      </button>`);
    card.onclick = () => {
      if (!g.hasBot) { App.openInvite(Dashboard.state.bot.invite_url); App.toast('Ajoute le bot puis reviens — le serveur sera configurable !'); return; }
      if (!g.canManage) { App.toast('Il te faut la permission « Gérer le serveur ».', 'error'); return; }
      Dashboard.selectGuild(g.id);
    };
    grid.appendChild(card);
  });
  content.appendChild(wrap);
};

// ---------------------- 🔔 Centre de notifications ----------------------
Dashboard.loadNotifications = async () => {
  const { bot, guildId } = Dashboard.state;
  if (!guildId) return { warnings: [], infos: [] };
  try { return await App.api(`/bots/${bot.id}/guilds/${guildId}/notifications`); }
  catch { return { warnings: [], infos: [] }; }
};

// ---------------------- Barre du haut ----------------------
Dashboard.renderTopbar = (topbar, discordGuilds) => {
  const bot = Dashboard.state.bot;
  const cur = discordGuilds.find((g) => g.id === Dashboard.state.guildId);
  const needsInvite = discordGuilds.some((g) => g.canManage && !g.hasBot);
  const all = [...Dashboard.MODULES, ...Dashboard.BOT_MODULES];
  const mod = all.find(([id]) => id === Dashboard.state.module) || ['', '📊', 'Vue d\'ensemble'];
  topbar.innerHTML = `
    <div class="dash-crumb">
      <span class="crumb-ico">${mod[1]}</span>
      <div class="crumb-txt">
        <b>${App.escapeHtml(mod[2])}</b>
        <span>${cur ? App.escapeHtml(cur.name) : 'Aucun serveur sélectionné'}</span>
      </div>
    </div>
    <div class="dash-topbar-actions">
      <div class="dash-accent-wrap">
        <button class="dash-iconbtn" id="d-bell" data-tip="Notifications">🔔<span class="bell-badge" hidden></span></button>
        <div class="dash-bell-pop" hidden><div class="bp-list"><div class="dp-empty">Chargement…</div></div></div>
      </div>
      <button class="dash-iconbtn" id="d-theme" data-tip="Mode clair / sombre">🌓</button>
      <button class="dash-iconbtn" id="d-palette" data-tip="Recherche rapide (Ctrl+K)">🔍</button>
      <button class="dash-iconbtn" id="d-refresh" data-tip="Actualiser le module">🔄</button>
      <div class="dash-accent-wrap">
        <button class="dash-iconbtn" id="d-accent" data-tip="Couleur du dashboard">🎨</button>
        <div class="dash-accent-pop" hidden>
          ${Dashboard.ACCENTS.map(([n, c1, c2]) => `<button class="acc-dot" data-acc="${n}" title="${n}" style="background:linear-gradient(135deg,${c1},${c2})"></button>`).join('')}
        </div>
      </div>
      ${needsInvite ? `<button class="dash-btn" id="d-invite2">➕ Ajouter le bot</button>` : ''}
      <div class="dash-bot-chip" title="${App.escapeHtml(bot.bot_username || bot.name)}">
        ${bot.avatar_url ? `<img src="${App.escapeHtml(bot.avatar_url)}" alt="" />` : '<span class="chip-fallback">🤖</span>'}
        <div class="chip-txt">
          <b>${App.escapeHtml(bot.name)}</b>
          <span class="${bot.online ? 'on' : 'off'}">${bot.online ? '● En ligne' : '● Hors ligne'}</span>
        </div>
      </div>
    </div>
  `;
  // 📱 Sur mobile la sidebar est masquée : le sélecteur de serveur vit ici
  const mobilePick = Dashboard.serverPicker();
  mobilePick.classList.add('topbar-pick');
  topbar.appendChild(mobilePick);
  const inviteBtn = topbar.querySelector('#d-invite2');
  if (inviteBtn) inviteBtn.onclick = () => App.openInvite(bot.invite_url);
  topbar.querySelector('#d-palette').onclick = () => Dashboard.openPalette();
  // 🌓 Mode clair / sombre
  topbar.querySelector('#d-theme').onclick = () => {
    const light = !document.documentElement.classList.contains('hx-light');
    document.documentElement.classList.toggle('hx-light', light);
    try { localStorage.setItem('hx-theme', light ? 'light' : 'dark'); } catch {}
    App.toast(light ? '☀️ Mode clair activé' : '🌙 Mode sombre activé');
  };
  // 🔔 Notifications : badge + panneau
  const bellBtn = topbar.querySelector('#d-bell');
  const bellPop = topbar.querySelector('.dash-bell-pop');
  const bellBadge = topbar.querySelector('.bell-badge');
  Dashboard.loadNotifications().then(({ warnings = [], infos = [] }) => {
    if (warnings.length) { bellBadge.textContent = warnings.length; bellBadge.hidden = false; }
    const list = bellPop.querySelector('.bp-list');
    list.innerHTML = '';
    if (!warnings.length && !infos.length) { list.appendChild(App.el(`<div class="dp-empty">✅ Tout va bien — aucune alerte !</div>`)); return; }
    warnings.forEach((w) => list.appendChild(App.el(`<div class="bp-item warn"><span>${w.icon || '⚠️'}</span><div>${App.escapeHtml(w.text)}</div></div>`)));
    infos.forEach((i2) => list.appendChild(App.el(`<div class="bp-item"><span>${i2.icon || 'ℹ️'}</span><div>${App.escapeHtml(i2.text)}</div></div>`)));
  });
  bellBtn.onclick = (e) => { e.stopPropagation(); bellPop.hidden = !bellPop.hidden; };
  topbar.querySelector('#d-refresh').onclick = () => { App.toast('Module actualisé !'); Dashboard.refresh(); };
  const accBtn = topbar.querySelector('#d-accent');
  const accPop = topbar.querySelector('.dash-accent-pop');
  accBtn.onclick = (e) => { e.stopPropagation(); accPop.hidden = !accPop.hidden; };
  accPop.querySelectorAll('[data-acc]').forEach((d) => {
    d.onclick = () => { Dashboard.applyAccent(d.dataset.acc); accPop.hidden = true; App.toast(`🎨 Thème « ${d.dataset.acc} » appliqué !`); };
  });
};

// ---------------------- Chargement serveur ----------------------
Dashboard.selectGuild = async (guildId) => {
  Dashboard.state.guildId = guildId;
  try { localStorage.setItem('hx-guild', guildId); } catch {}
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

// ============================================================
// 💾 Barre de sauvegarde intelligente (v2.7)
// Dès qu'un champ est modifié, une barre flottante apparaît :
// « Tout enregistrer » déclenche TOUS les boutons 💾 du module d'un
// coup (avec un seul récap), « Annuler » recharge le module.
// Plus JAMAIS de réglage perdu parce qu'un 💾 était resté oublié.
// ============================================================
Dashboard.saveBar = () => {
  let bar = document.querySelector('#dash-savebar');
  if (bar) return bar;
  bar = App.el(`
    <div id="dash-savebar" class="dash-savebar" hidden>
      <span class="sb-txt">✏️ Modifications non enregistrées</span>
      <div class="sb-actions">
        <button class="dash-btn dash-btn-sm" id="sb-cancel">↩️ Annuler</button>
        <button class="dash-btn dash-btn-primary dash-btn-sm" id="sb-save">💾 Tout enregistrer</button>
      </div>
    </div>`);
  document.body.appendChild(bar);
  bar.querySelector('#sb-cancel').onclick = () => { Dashboard.hideSaveBar(); Dashboard.refresh(); };
  bar.querySelector('#sb-save').onclick = async () => {
    const content = document.querySelector('#dash-content');
    if (!content) return;
    const btns = [...content.querySelectorAll('button')].filter((b) => /💾/.test(b.textContent || ''));
    if (!btns.length) { Dashboard.hideSaveBar(); return; }
    const saveBtn = bar.querySelector('#sb-save');
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Enregistrement…';
    // Les confirmations individuelles sont regroupées en UN seul récap
    const orig = App.toast;
    const msgs = [];
    App.toast = (m, t) => { msgs.push({ m, t }); };
    try {
      for (const b of btns) { b.click(); await new Promise((r) => setTimeout(r, 450)); }
      await new Promise((r) => setTimeout(r, 450));
    } finally { App.toast = orig; }
    const errs = msgs.filter((x) => x.t === 'error');
    if (errs.length) App.toast(`⚠️ ${errs[0].m}`, 'error');
    else App.toast('✅ Tout est enregistré !');
    saveBtn.disabled = false; saveBtn.textContent = '💾 Tout enregistrer';
    if (!errs.length) Dashboard.hideSaveBar();
  };
  return bar;
};
Dashboard.showSaveBar = () => { const b = Dashboard.saveBar(); b.hidden = false; requestAnimationFrame(() => b.classList.add('on')); };
Dashboard.hideSaveBar = () => { const b = document.querySelector('#dash-savebar'); if (b) { b.classList.remove('on'); b.hidden = true; } };
Dashboard.watchDirty = (content) => {
  const mark = (e) => {
    const t = e.target;
    if (!t || !(t.matches && (t.matches('input, select, textarea')))) return;
    Dashboard.showSaveBar();
  };
  content.addEventListener('input', mark);
  content.addEventListener('change', mark);
};

Dashboard.renderContent = async (content) => {
  if (!content) return;
  const { bot, guildId, module } = Dashboard.state;
  content.innerHTML = `
    <div class="dash-skeleton">
      <div class="sk-header"><div class="sk-ico"></div><div style="flex:1"><div class="sk-line w40"></div><div class="sk-line w60 thin"></div></div></div>
      <div class="sk-stats"><div class="sk-stat"></div><div class="sk-stat"></div><div class="sk-stat"></div></div>
      <div class="sk-card"><div class="sk-line w30"></div><div class="sk-line w90 thin"></div><div class="sk-line w75 thin"></div><div class="sk-line w50 thin"></div></div>
      <div class="sk-card"><div class="sk-line w25"></div><div class="sk-line w80 thin"></div></div>
    </div>`;
  // 💾 Nouveau module = page propre : barre de sauvegarde masquée + surveillance
  Dashboard.hideSaveBar();
  if (!content.dataset.dirtyWatched) { Dashboard.watchDirty(content); content.dataset.dirtyWatched = '1'; }

  // 🩺 On coupe l'actualisation automatique de la page Santé si on la quitte
  if (module !== 'health' && Dashboard.state.healthTimer) {
    clearInterval(Dashboard.state.healthTimer);
    Dashboard.state.healthTimer = null;
  }
  // 📰 Idem pour le flux d'activité de la Vue d'ensemble
  if (module !== 'overview' && Dashboard.state.feedTimer) {
    clearInterval(Dashboard.state.feedTimer);
    Dashboard.state.feedTimer = null;
  }

  const botLevel = ['commands', 'modules', 'health', 'botsettings'].includes(module);
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

  // ✅ Checklist de configuration (confort : tout voir d'un coup d'œil)
  const checklist = data.checklist || [];
  const doneCount = checklist.filter((i) => i.done).length;
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;

  // 👋 PREMIÈRE VISITE : si le serveur est encore (presque) vierge, on
  // accueille avec un héros clair : quoi faire, dans quel ordre, en 3 étapes.
  if (pct < 25) {
    const hero = App.el(`
      <div class="dash-hero">
        <div class="hero-badge">✨ Bienvenue !</div>
        <h2>Configurons <b>${App.escapeHtml(g.name)}</b> ensemble</h2>
        <p>Ton bot est en ligne et prêt. Trois étapes suffisent pour un serveur au top — clique sur une carte pour commencer :</p>
        <div class="hero-steps">
          <button class="hero-step" data-go="tickets"><span class="hs-num">1</span><span class="hs-emoji">🎫</span><b>Le support</b><span>Panneau de tickets + types + salon de logs staff</span></button>
          <button class="hero-step" data-go="welcome"><span class="hs-num">2</span><span class="hs-emoji">👋</span><b>L'accueil</b><span>Message de bienvenue (avec carte image !) + auto-rôles</span></button>
          <button class="hero-step" data-go="community"><span class="hs-num">3</span><span class="hs-emoji">⭐</span><b>La communauté</b><span>Starboard, invitations et annonces de live</span></button>
        </div>
      </div>`);
    hero.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => Dashboard.setModule(b.dataset.go); });
    root.appendChild(hero);
  }
  const clCard = Dashboard.card(root, '✅ Configuration du serveur', '');
  clCard.innerHTML = '';
  clCard.appendChild(App.el(`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="flex:1;height:12px;background:var(--d-card2);border-radius:20px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#5865F2,#8B5CF6);border-radius:20px;transition:width .5s"></div>
      </div>
      <b style="font-size:14px">${pct}%</b>
    </div>`));
  const clGrid = App.el(`<div class="dash-checklist"></div>`);
  clCard.appendChild(clGrid);
  checklist.forEach((item) => {
    const el = App.el(`
      <button class="check-item ${item.done ? 'done' : ''}" title="${item.done ? 'Configuré ✅' : 'À configurer'}">
        <span class="check-ico">${item.done ? '✅' : '⬜'}</span>
        <span class="check-label">${App.escapeHtml(item.label)}</span>
        <span class="check-go">Configurer →</span>
      </button>`);
    el.onclick = () => Dashboard.setModule(item.module);
    clGrid.appendChild(el);
  });

  root.appendChild(App.el(`
    <div class="dash-stats">
      <div class="dash-stat"><div class="val">${g.members}</div><div class="lbl">Membres</div></div>
      <div class="dash-stat"><div class="val">${ts.open}</div><div class="lbl">Tickets ouverts</div></div>
      <div class="dash-stat"><div class="val">${data.tickets.types ? data.tickets.types.length : 0}</div><div class="lbl">Types de tickets</div></div>
      <div class="dash-stat"><div class="val">${(data.xp_roles || []).length}</div><div class="lbl">Récompenses de niveau</div></div>
      <div class="dash-stat"><div class="val">${(data.role_menus || []).length}</div><div class="lbl">Menus de rôles</div></div>
      <div class="dash-stat"><div class="val">${(data.scheduled || []).length}</div><div class="lbl">Annonces programmées</div></div>
    </div>`));

  // 📰 Flux d'activité : le serveur vit sous tes yeux
  const feed = Dashboard.card(root, '📰 Activité récente', 'Tout ce que le bot fait pour toi, en direct — actualisé toutes les 30 secondes.');
  const feedList = App.el(`<div id="ov-feed"></div>`);
  feed.appendChild(feedList);
  const relTime = (iso) => {
    const t = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime();
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.floor(h / 24)} j`;
  };
  const loadFeed = async () => {
    try {
      const { items } = await App.api(`/bots/${bot.id}/guilds/${guildId}/activity`);
      feedList.innerHTML = '';
      if (!items.length) {
        feedList.appendChild(App.el(`<div class="dash-empty" style="padding:16px">Encore rien à raconter — le flux se remplit dès que le bot agit (tickets, lives, starboard, sanctions…).</div>`));
        return;
      }
      items.forEach((it) => {
        feedList.appendChild(App.el(`
          <div class="feed-item">
            <span class="feed-emoji">${it.emoji || '•'}</span>
            <span class="feed-text">${App.escapeHtml(it.text)}</span>
            <span class="feed-time">${relTime(it.created_at)}</span>
          </div>`));
      });
    } catch { /* silencieux */ }
  };
  loadFeed();
  if (Dashboard.state.feedTimer) clearInterval(Dashboard.state.feedTimer);
  Dashboard.state.feedTimer = setInterval(loadFeed, 30000);

  // 📈 En bref : l'activité réelle du serveur (7 derniers jours)
  const brief = Dashboard.card(root, '📈 Ton serveur en bref', 'Activité mesurée par le bot sur les 7 derniers jours.');
  try {
    const st = await App.api(`/bots/${bot.id}/guilds/${guildId}/stats`);
    const totalMsgs = st.activity.reduce((a, d) => a + d.messages, 0);
    const totalJoins = st.joins.reduce((a, d) => a + d.members, 0);
    const top3 = (st.top_active || []).slice(0, 3);
    brief.appendChild(App.el(`
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="dash-badge ok" style="padding:8px 14px">💬 ${totalMsgs} messages cette semaine</div>
        <div class="dash-badge" style="padding:8px 14px">🆕 ${totalJoins} nouveau(x) membre(s)</div>
        <div class="dash-badge warn" style="padding:8px 14px">🎫 ${ts.open} ticket(s) ouvert(s)</div>
      </div>`));
    if (top3.length) {
      brief.appendChild(App.el(`<div class="dash-label" style="margin-top:0">🏆 Membres les plus actifs</div>`));
      top3.forEach((t, i) => {
        brief.appendChild(App.el(`
          <div style="display:flex;align-items:center;gap:10px;padding:6px 2px;border-bottom:1px solid #222434">
            <img src="${App.escapeHtml(t.avatar)}" style="width:28px;height:28px;border-radius:50%;background:var(--d-card2)" alt="" />
            <span style="flex:1;font-size:13.5px">${App.escapeHtml(t.tag)}</span>
            <span class="dash-badge ${i === 0 ? 'ok' : ''}">${['🥇','🥈','🥉'][i]} ${t.messages} msg</span>
          </div>`));
      });
    } else {
      brief.appendChild(App.el(`<div class="desc" style="margin:0">📊 Les statistiques se remplissent dès que les membres discutent !</div>`));
    }
  } catch { brief.appendChild(App.el(`<div class="desc" style="margin:0">Bot hors ligne — les statistiques reviendront dès qu\'il se reconnecte.</div>`)); }

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
  const typesData = (t.types || []).map((x) => ({ label: x.label, emoji: x.emoji || '', description: x.description || '', category: x.category || '', questions: (Array.isArray(x.questions) && x.questions.length) ? [...x.questions] : [], staff_roles: (x.staff_roles && x.staff_roles.length) ? [...x.staff_roles] : [] }));
  const root = Dashboard.header(content, '🎫', 'Système de tickets', 'Bouton ou menu déroulant → salon privé automatique. Le tout est aussi configurable sur Discord avec /ticket.');
  const ts = data.tickets_stats || { total: 0, open: 0 };
  root.appendChild(App.el(`
    <div class="dash-stats" style="margin-bottom:14px">
      <div class="dash-stat"><div class="val">${ts.open}</div><div class="lbl">🎫 Ouverts en ce moment</div></div>
      <div class="dash-stat"><div class="val">${ts.total}</div><div class="lbl">📦 Ouverts au total</div></div>
      <div class="dash-stat"><div class="val">${typesData.length}</div><div class="lbl">🗂️ Types configurés</div></div>
      <div class="dash-stat"><div class="val" id="t-rating-val">…</div><div class="lbl">⭐ Note du support</div></div>
    </div>`));
  (async () => {
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/tickets/rating`);
      const el = document.getElementById('t-rating-val');
      if (el) el.textContent = r.count ? `${r.avg}/5 (${r.count} avis)` : '—';
    } catch {
      const el = document.getElementById('t-rating-val');
      if (el) el.textContent = '—';
    }
  })();

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

    <label class="dash-label">📔 Journal des tickets (salon staff — récapitulatif à la fermeture)</label>
    <select class="dash-select" id="t-logchan">
      <option value="">— Désactivé (choisir un salon pour activer) —</option>
      ${textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${String((data.settings || {}).ticket_log_channel || '') === '#' + ch.name ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <div style="font-size:12px;color:var(--d-dim);margin-top:6px">À chaque fermeture : panneau récap (qui a ouvert, staff en charge, raisons, durée, messages, lien transcription, note ⭐). Le MP du créateur ne change pas.</div>

    <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
      <button class="dash-btn dash-btn-primary" id="t-save">💾 Enregistrer</button>
      <button class="dash-btn" id="t-send">📨 Envoyer le panneau BOUTON</button>
    </div>
    <div style="font-size:12px;color:var(--d-dim);margin-top:8px">🔘 Le panneau BOUTON = un simple bouton (ouvre un ticket du premier type). Le panneau MENU déroulant se configure dans la carte dédiée en dessous.</div>`;

  // 🗂️ Carte PANNEAU MENU DÉROULANT — indépendante du panneau bouton :
  // son salon, son message, son 💾 et son 📨.
  const cm = Dashboard.card(root, '🗂️ Panneau MENU déroulant', 'Le panneau avec la liste des types de tickets (menu déroulant). Indépendant du panneau bouton : chacun son salon, son message, ses boutons.');
  const menuChanOpts = ['<option value="">— Même salon que le panneau bouton —</option>']
    .concat(textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${String(t.menu_channel || '') === '#' + ch.name ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  cm.innerHTML += `
    <label class="dash-label">Salon du panneau menu</label>
    <select class="dash-select" id="tm-channel">${menuChanOpts.join('')}</select>
    <label class="dash-label">📁 Catégorie où créer les salons de tickets du MENU</label>
    <select class="dash-select" id="tm-cat">
      <option value="">— Automatique (catégorie du type, sinon celle par défaut) —</option>
      ${categories.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${String(t.menu_category || '') === ch.name ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
    </select>
    <div style="font-size:12px;color:var(--d-dim);margin-top:4px">✅ Si tu choisis une catégorie ici, TOUS les tickets ouverts via le menu iront dedans — priorité absolue, zéro ambiguïté.</div>
    <label class="dash-label">Message du panneau menu (vide = même message que le panneau bouton)</label>
    <textarea class="dash-input" id="tm-msg" rows="3">${App.escapeHtml(t.menu_message || '')}</textarea>
    <div style="font-size:12px;color:var(--d-dim);margin-top:6px">🗂️ Les types affichés dans le menu se gèrent dans la carte « Types de tickets ». Les deux panneaux peuvent cohabiter, même dans le même salon.</div>
    <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
      <button class="dash-btn dash-btn-primary" id="tm-save">💾 Enregistrer</button>
      <button class="dash-btn" id="tm-send">📨 Envoyer le panneau MENU</button>
    </div>`;
  cm.querySelector('#tm-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/tickets`, { method: 'PUT', body: {
        guild_id: guildId,
        menu_channel: cm.querySelector('#tm-channel').value,
        menu_message: cm.querySelector('#tm-msg').value,
        menu_category: cm.querySelector('#tm-cat').value,
      }});
      App.toast('Panneau menu enregistré !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
  cm.querySelector('#tm-send').onclick = async () => {
    try { await App.api(`/bots/${bot.id}/tickets/send`, { method: 'POST', body: { guild_id: guildId, mode: 'menu' } }); App.toast('Panneau MENU envoyé !'); }
    catch (e) { App.toast(e.message, 'error'); }
  };

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
        types: typesData.filter((x) => x.label).map((x) => ({ label: x.label, emoji: x.emoji, description: x.description, category: x.category, questions: (x.questions || []).map((q) => String(q).slice(0, 45)).filter(Boolean).slice(0, 5), staff_roles: x.staff_roles.filter(Boolean) })),
      }});
      // 📔 Journal des tickets : réglage serveur (indépendant de la config du panneau)
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: {
        prefix: (data.settings || {}).prefix || '',
        warn_limit: (data.settings || {}).warn_limit || 0,
        warn_action: (data.settings || {}).warn_action || 'none',
        ticket_log_channel: c.querySelector('#t-logchan').value,
      }});
      App.toast('Tickets enregistrés !');
      renderStatus();
    } catch (e) { App.toast(e.message, 'error'); }
  };
  c.querySelector('#t-send').onclick = async () => {
    try { await App.api(`/bots/${bot.id}/tickets/send`, { method: 'POST', body: { guild_id: guildId, mode: 'button' } }); App.toast('Panneau BOUTON envoyé !'); }
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
          ? `<div style="margin-top:12px;border:1px solid #1E1F22;border-radius:6px;padding:9px 12px;color:#A8ABAF;text-align:left">${typesData.filter((x) => x.label).map((x) => `<div style="padding:4px 0">${App.escapeHtml(x.emoji || '🎫')} <b style="color:#DBDEE1">${App.escapeHtml(x.label)}</b>${(x.questions || []).length ? ` <span style="font-size:10px;background:rgba(88,101,242,.2);color:#aab1ff;padding:1px 7px;border-radius:8px">❓ ${x.questions.length} question(s)</span>` : ''}${x.description ? `<div style="font-size:11px;margin-left:20px;color:#949BA4">${App.escapeHtml(x.description.slice(0, 70))}${x.description.length > 70 ? '…' : ''}</div>` : ''}</div>`).join('')}</div>`
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
          <label class="dash-label">📝 Description (affichée sous le type dans le menu)</label>
          <input class="dash-input" data-k="description" maxlength="100" value="${App.escapeHtml(x.description)}" placeholder="Ex : signale un abus du staff, en toute confidentialité" />
          <div style="color:var(--d-dim);font-size:10.5px;margin-top:2px">${String(x.description || '').length}/100 — si vide, une description professionnelle est générée automatiquement.</div>
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
          <label class="dash-label" style="margin-top:12px">❓ Questionnaire (réponses OBLIGATOIRES à l'ouverture — max 5)</label>
          <div class="t-questions" style="display:flex;flex-direction:column;gap:6px"></div>
          <button class="dash-btn dash-btn-sm" data-addq style="margin-top:6px">＋ Ajouter une question</button>
          <div style="color:var(--d-dim);font-size:10.5px;margin-top:5px">Vide = par défaut (seule la raison est demandée).</div>
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
      const descInp = row.querySelector('[data-k="description"]');
      descInp.addEventListener('input', () => {
        x.description = descInp.value;
        const cnt = descInp.nextElementSibling;
        if (cnt) cnt.textContent = `${String(x.description || '').length}/100 — si vide, une description professionnelle est générée automatiquement.`;
        renderPreview();
      });
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
      const qEl = row.querySelector('.t-questions');
      const renderQs = () => {
        qEl.innerHTML = '';
        x.questions.forEach((q, j) => {
          const rq = App.el(`
            <div style="display:flex;gap:7px">
              <input class="dash-input" value="${App.escapeHtml(q)}" placeholder="Ex : Non RP ?" maxlength="45" />
              <button class="dash-btn dash-btn-danger dash-btn-sm">🗑</button>
            </div>`);
          rq.querySelector('input').addEventListener('input', (e) => { x.questions[j] = e.target.value; });
          rq.querySelector('button').onclick = () => { x.questions.splice(j, 1); renderQs(); };
          qEl.appendChild(rq);
        });
        if (!x.questions.length) qEl.appendChild(App.el(`<div style="color:var(--d-dim);font-size:12px">Aucune question — questionnaire par défaut (juste la raison).</div>`));
      };
      renderQs();
      row.querySelector('[data-addq]').onclick = () => {
        if (x.questions.length >= 5) return App.toast('Maximum 5 questions par type.', 'error');
        x.questions.push('');
        renderQs();
      };
      el.appendChild(row);
    });
  };
  renderTypes();
  c2.querySelector('#t-add').onclick = () => { typesData.push({ label: '', emoji: '', category: '', description: '', questions: [], staff_roles: [] }); renderTypes(); };
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
      if (f.type === 'rolesmulti') {
        // 🏷️ Sélection MULTIPLE de rôles (cases à cocher) — enregistrée en
        // liste séparée par des virgules.
        cfgZone.appendChild(App.el(`<label class="dash-label">${f.label}</label>`));
        const selected = String(ev.config[f.key] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        const box = App.el(`<div class="dash-roles-multi" data-k="${f.key}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px"></div>`);
        rolesList.filter((r) => r.name !== '@everyone').forEach((r) => {
          const on = selected.includes(r.name.toLowerCase());
          const chip = App.el(`<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid ${on ? 'rgba(88,101,242,.6)' : 'var(--d-border)'};border-radius:999px;cursor:pointer;font-size:12.5px;background:${on ? 'rgba(88,101,242,.14)' : 'transparent'}"><input type="checkbox" style="display:none" value="${App.escapeHtml(r.name)}" ${on ? 'checked' : ''}/><span style="width:9px;height:9px;border-radius:50%;background:${r.color && r.color !== '#000000' ? r.color : '#8b8fa3'}"></span>${App.escapeHtml(r.name)}</label>`);
          const input = chip.querySelector('input');
          input.onchange = () => {
            chip.style.borderColor = input.checked ? 'rgba(88,101,242,.6)' : 'var(--d-border)';
            chip.style.background = input.checked ? 'rgba(88,101,242,.14)' : 'transparent';
          };
          box.appendChild(chip);
        });
        cfgZone.appendChild(box);
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

    // 👀 Aperçu en direct : tu vois le message exactement comme sur Discord
    if (key === 'member_join' || key === 'member_leave') {
      const preview = App.el(`<div class="embed-preview"></div>`);
      cfgZone.appendChild(preview);
      const renderPreview = () => {
        const msgEl = cfgZone.querySelector('[data-k="message"]');
        const embedEl = cfgZone.querySelector('[data-k="embed"]');
        const colorEl = cfgZone.querySelector('input[type=color][data-k="color"]');
        const imageEl = cfgZone.querySelector('[data-k="image"]');
        const msg = (msgEl ? msgEl.value : '') || '';
        const isEmbed = embedEl ? embedEl.checked : false;
        const color = colorEl ? colorEl.value : (def.default ? def.default : '#5865F2');
        const image = imageEl ? imageEl.value.trim() : '';
        const text = msg
          .replace(/{user}/g, '@NouveauMembre')
          .replace(/{user\.name}/g, 'NouveauMembre')
          .replace(/{user\.tag}/g, 'NouveauMembre#1234')
          .replace(/{server}/g, data.guild ? data.guild.name : 'Mon serveur')
          .replace(/{count}/g, String(data.guild ? data.guild.members : 125));
        preview.innerHTML = `
          <div class="dash-label" style="margin:10px 0 6px">👀 Aperçu sur Discord</div>
          <div class="embed-box" style="border-left:4px solid ${isEmbed ? App.escapeHtml(color) : '#57F287'}">
            ${App.escapeHtml(text || 'Message vide…').replace(/\n/g, '<br/>')}
            ${isEmbed && image ? `<img src="${App.escapeHtml(image)}" style="max-width:100%;border-radius:6px;margin-top:8px" alt="" />` : ''}
          </div>`;
      };
      ['message', 'embed', 'color', 'image'].forEach((k) => {
        const el = cfgZone.querySelector(`[data-k="${k}"]`);
        if (el) {
          el.addEventListener('input', renderPreview);
          if (el.type === 'checkbox') el.addEventListener('change', renderPreview);
        }
      });
      const hexEl = cfgZone.querySelector('[data-k-hex="color"]');
      if (hexEl) hexEl.addEventListener('input', renderPreview);
      renderPreview();
    }

    // 👀 Aperçu Discord en direct (message de bienvenue uniquement)
    if (key === 'member_join') {
      const pv = App.el(`<div class="dc-preview" style="margin-top:12px"><div class="dash-label" style="margin:0 0 8px">👀 Aperçu sur Discord</div><div class="dc-msg"></div></div>`);
      const renderPv = () => {
        const msgEl = pv.querySelector('.dc-msg');
        const get = (k) => { const el = cfgZone.querySelector(`[data-k="${k}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
        const txt = String(get('message') || 'Bienvenue {user} !').replace('{user}', '@NouveauMembre').replace('{server}', 'Ton serveur').replace('{count}', '145');
        const color = get('color') || '#57F287';
        const isEmbed = !!get('embed');
        const hasCard = !!get('card');
        msgEl.innerHTML = `
          <div style="display:flex;gap:10px">
            <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#5865F2,#8B5CF6);flex-shrink:0"></div>
            <div style="min-width:0;flex:1">
              <div style="font-size:13px"><b style="color:#f2f3f5">${App.escapeHtml(Dashboard.state.bot.name)}</b> <span style="background:#5865F2;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;vertical-align:middle">✓ APP</span></div>
              ${isEmbed
                ? `<div style="border-left:4px solid ${App.escapeHtml(color)};background:#2B2D31;border-radius:4px;padding:10px 12px;margin-top:4px;font-size:13px;color:#dbdee1">${App.escapeHtml(txt)}${hasCard ? '<div style="margin-top:8px;height:74px;border-radius:8px;background:linear-gradient(135deg,#1b1e2e,#2b1e46);display:flex;align-items:center;justify-content:center;color:#8f93a8;font-size:12px">🖼️ Carte de bienvenue (avatar + pseudo)</div>' : ''}</div>`
                : `<div style="font-size:13.5px;color:#dbdee1;margin-top:2px">${App.escapeHtml(txt)}</div>${hasCard ? '<div style="margin-top:6px;height:74px;max-width:340px;border-radius:8px;background:linear-gradient(135deg,#1b1e2e,#2b1e46);display:flex;align-items:center;justify-content:center;color:#8f93a8;font-size:12px">🖼️ Carte de bienvenue (avatar + pseudo)</div>' : ''}`}
            </div>
          </div>`;
      };
      cfgZone.addEventListener('input', renderPv);
      cfgZone.addEventListener('change', renderPv);
      cfgZone.appendChild(pv);
      setTimeout(renderPv, 0);
    }
    const save = App.el(`<button class="dash-btn dash-btn-primary" style="margin-top:12px">💾 Enregistrer</button>`);
    cfgZone.appendChild(save);
    // 🧪 Bouton de test réel (arrivée / départ) : le bot envoie le vrai
    // message dans le vrai salon, avec TOI comme membre — vérification
    // instantanée sans quitter le serveur.
    if (key === 'member_join' || key === 'member_leave') {
      const testBtn = App.el(`<button class="dash-btn" style="margin-top:12px;margin-left:8px">🧪 Tester ${key === 'member_join' ? 'l\'arrivée' : 'le départ'}</button>`);
      testBtn.onclick = async () => {
        testBtn.disabled = true; testBtn.textContent = '⏳ Envoi…';
        try {
          await App.api(`/bots/${bot.id}/guilds/${guildId}/events/${key}/test`, { method: 'POST' });
          App.toast('🧪 Message de test envoyé — va voir le salon ! (Pense à 💾 Enregistrer d\'abord si tu viens de modifier.)');
        } catch (e) { App.toast(e.message, 'error'); }
        testBtn.disabled = false; testBtn.textContent = `🧪 Tester ${key === 'member_join' ? 'l\'arrivée' : 'le départ'}`;
      };
      cfgZone.appendChild(testBtn);
    }
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
      cfgZone.querySelectorAll('[data-k]').forEach((inp) => {
        if (inp.classList && inp.classList.contains('dash-roles-multi')) {
          // 🏷️ multi-rôles : liste des cases cochées, séparée par des virgules
          config[inp.dataset.k] = [...inp.querySelectorAll('input:checked')].map((x) => x.value).join(', ');
          return;
        }
        config[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value;
      });
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

  const c = Dashboard.card(root, 'Auto-modération', 'Le bot supprime automatiquement les liens, les MAJUSCULES, les mentions excessives, le spam et les mots interdits, puis gère les avertissements et sanctions comme un bot professionnel.');
  const blacklistData = blacklist.map((w) => ({ word: w }));
  c.innerHTML += `
    <label class="dash-label">Activer</label>
    <label class="switch"><input type="checkbox" id="am-on" ${s.am_enabled ? 'checked' : ''} /><span class="slider"></span></label>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--d-dim)"><input type="checkbox" id="am-links" ${s.am_links ? 'checked' : ''} /> Supprimer les liens</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--d-dim)"><input type="checkbox" id="am-caps" ${s.am_caps ? 'checked' : ''} /> Supprimer les MAJUSCULES</label>
      <div><label class="dash-label">Mentions max (0 = illimité)</label><input class="dash-input" id="am-men" type="number" value="${s.am_mentions ?? 5}" /></div>
      <div><label class="dash-label">Spam : messages / 5 s</label><input class="dash-input" id="am-spam" type="number" value="${s.am_spam ?? 5}" /></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--d-dim);margin-top:10px"><input type="checkbox" id="am-staff" ${s.am_ignore_staff !== 0 ? 'checked' : ''} /> Ignorer les admins et modérateurs</label>
    <div class="desc" style="margin:8px 0 0">💡 Pour tester : décoche « Ignorer les admins » — sinon tes propres messages ne sont jamais filtrés (protection par défaut).</div>
    <label class="dash-label" style="margin-top:12px">Message privé d'avertissement (vide = standard)</label>
    <input class="dash-input" id="am-warn" value="${App.escapeHtml(s.am_warn_text || '')}" placeholder="Vide = message standard traduit FR/EN. Variables : {reason} et {server}." />
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <div style="flex:1;min-width:110px"><label class="dash-label">Timeout spam (minutes)</label><input class="dash-input" id="am-timeout" type="number" min="1" max="1440" value="${s.am_timeout_min ?? 5}" /></div>
    </div>
    <div style="margin-top:16px;padding:14px;border:1px solid rgba(254,231,92,.28);border-radius:14px;background:linear-gradient(135deg,rgba(254,231,92,.08),rgba(237,66,69,.05))">
      <div style="font-weight:800;font-size:14px">⚠️ Avertissements progressifs</div>
      <div style="font-size:12.5px;color:var(--d-dim);margin:5px 0 12px">Chaque infraction auto-mod supprimée est enregistrée. Le 1er avertissement est affiché dans le salon ; au 2e, une sanction automatique peut être appliquée. Les paliers suivants sont 4, 6, 8…</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px">
        <div><label class="dash-label">Sanction tous les X avertissements (0 = désactivé)</label><input class="dash-input" id="am-warn-limit" type="number" min="0" max="50" value="${s.am_warn_limit ?? 2}" /></div>
        <div><label class="dash-label">Action automatique</label><select class="dash-select" id="am-warn-action">
          <option value="none" ${s.am_warn_action === 'none' ? 'selected' : ''}>🔕 Aucune (journal seulement)</option>
          <option value="timeout" ${(s.am_warn_action || 'timeout') === 'timeout' ? 'selected' : ''}>⏳ Timeout</option>
          <option value="kick" ${s.am_warn_action === 'kick' ? 'selected' : ''}>👢 Expulser</option>
          <option value="ban" ${s.am_warn_action === 'ban' ? 'selected' : ''}>🔨 Bannir</option>
        </select></div>
        <div><label class="dash-label">Durée du timeout (minutes)</label><input class="dash-input" id="am-warn-timeout" type="number" min="1" max="1440" value="${s.am_warn_timeout_min ?? 10}" /></div>
      </div>
      <div style="font-size:11.5px;color:var(--d-dim);margin-top:9px">💡 Réglage conseillé : <b>2</b> + <b>Timeout 10 min</b>. Le compteur communique avec les avertissements manuels `/warn`.</div>
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
        ignore_staff: c.querySelector('#am-staff').checked,
        warn_text: c.querySelector('#am-warn').value,
        timeout_min: parseInt(c.querySelector('#am-timeout').value, 10) || 5,
        warn_limit: parseInt(c.querySelector('#am-warn-limit').value, 10) || 0,
        warn_action: c.querySelector('#am-warn-action').value,
        warn_timeout_min: parseInt(c.querySelector('#am-warn-timeout').value, 10) || 10,
        blacklist: blacklistData.map((w) => w.word),
      }});
      App.toast('Auto-modération enregistrée !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  // 🛡️ Permissions réelles du bot sur ce serveur
  const cPerm = Dashboard.card(root, '🛡️ Permissions du bot sur ce serveur', 'Ce que Nexora peut réellement faire — vérifié en direct auprès de Discord.');
  const permBox = App.el(`<div class="desc">Vérification en cours…</div>`);
  cPerm.appendChild(permBox);
  (async () => {
    try {
      const p = await App.api(`/bots/${bot.id}/guilds/${guildId}/permissions`);
      if (!p.online) { permBox.innerHTML = `<div class="desc">Bot hors ligne — les permissions seront vérifiées à son retour.</div>`; return; }
      if (!p.perms) { permBox.innerHTML = `<div class="desc">Serveur introuvable pour le bot.</div>`; return; }
      const items = [
        ['manageMessages', '🗑 Supprimer les messages', 'l\'auto-mod peut effacer les messages'],
        ['moderateMembers', '⏱ Mettre en timeout', 'l\'anti-spam peut punir'],
        ['manageChannels', '⚙️ Gérer les salons', 'tickets et salons vocaux temporaires'],
        ['kickMembers', '👢 Expulser des membres', 'sanctions'],
        ['banMembers', '🔨 Bannir des membres', 'sanctions'],
        ['administrator', '👑 Administrateur', 'toutes les permissions'],
      ];
      permBox.innerHTML = items.map(([k, label, desc]) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #222434">
          <span style="font-size:16px">${p.perms[k] ? '✅' : '❌'}</span>
          <div style="flex:1;min-width:0"><b style="font-size:13.5px">${label}</b><div class="m-meta">${desc}</div></div>
          ${p.perms[k] ? '<span class="dash-badge ok">OK</span>' : '<span class="dash-badge bad">Manquante</span>'}
        </div>`).join('');
      if (!p.perms.manageMessages && !p.perms.administrator) {
        permBox.insertAdjacentHTML('beforeend', `<div class="desc" style="margin:10px 0 0;color:var(--d-yellow)">⚠️ Sans « Supprimer les messages », l'auto-mod ne peut pas effacer les messages : réinvite le bot avec les permissions demandées.</div>`);
      }
    } catch (e) { permBox.innerHTML = `<div class="desc">Vérification impossible : ${App.escapeHtml(e.message)}</div>`; }
  })();

  // 🧪 Test réel de l'auto-mod
  const textChannelsAm = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const cTest = Dashboard.card(root, '🧪 Tester l\'auto-mod', 'Envoie un vrai message piégé dans un salon : le bot doit le supprimer. Le résultat s\'affiche ici.');
  cTest.innerHTML += `
    <label class="dash-label">Salon du test</label>
    <select class="dash-select" id="am-test-ch">${textChannelsAm.map((ch) => `<option value="${ch.id}">💬 #${App.escapeHtml(ch.name)}</option>`).join('')}</select>
    <label class="dash-label">Type de piège</label>
    <select class="dash-select" id="am-test-type">
      <option value="link">🔗 Lien interdit</option>
      <option value="caps">🔠 MAJUSCULES</option>
      <option value="mentions">📣 Mentions en trop</option>
      <option value="word">🔇 Mot interdit</option>
      <option value="spam">💥 Rafale (spam)</option>
    </select>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="dash-btn dash-btn-primary" id="am-test-go" style="flex:1">🧪 Lancer le test</button>
    </div>
    <div id="am-test-result" style="margin-top:12px"></div>`;
  cTest.querySelector('#am-test-go').onclick = async () => {
    const resBox = cTest.querySelector('#am-test-result');
    const go = cTest.querySelector('#am-test-go');
    resBox.innerHTML = `<div class="desc">🧪 Test en cours… regarde le salon <#${cTest.querySelector('#am-test-ch').value}> !</div>`;
    go.disabled = true;
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/test`, { method: 'POST', body: {
        channel_id: cTest.querySelector('#am-test-ch').value,
        type: cTest.querySelector('#am-test-type').value,
      }});
      if (r.hint === 'mentions_off') resBox.innerHTML = `<div class="desc">ℹ️ La limite de mentions est à 0 (illimité) — rien à tester pour ce filtre.</div>`;
      else if (r.hint === 'no_words') resBox.innerHTML = `<div class="desc">ℹ️ Ajoute d'abord un mot dans la liste noire, puis relance le test.</div>`;
      else if (r.acted && r.deleted) resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(59,165,93,.4);border-radius:10px;background:rgba(59,165,93,.08)">✅ <b>L'auto-mod fonctionne !</b> Le message a été supprimé (raison : ${App.escapeHtml(r.reason || '—')}).</div>`;
      else if (r.acted) resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(254,231,92,.4);border-radius:10px;background:rgba(254,231,92,.08)">⚠️ <b>Détecté mais pas supprimé.</b> Vérifie la carte « Permissions du bot » ci-dessus : il lui faut « Supprimer les messages ».</div>`;
      else resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(237,66,69,.4);border-radius:10px;background:rgba(237,66,69,.08)">❌ <b>Le bot n'a pas réagi.</b> Vérifie que l'auto-mod est activé, que le filtre testé est coché, et que le salon du test n'est pas exclu.</div>`;
    } catch (e) { resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(237,66,69,.4);border-radius:10px;background:rgba(237,66,69,.08)">❌ ${App.escapeHtml(e.message)}</div>`; }
    go.disabled = false;
  };

  // ⚠️ Centre des avertissements : la progression reste visible même si le
  // message public est retiré après 15 secondes.
  const cWarnings = Dashboard.card(root, '⚠️ Centre des avertissements', 'Historique unifié des avertissements manuels et auto-mod : 1er avertissement, 2e palier et sanctions appliquées.');
  const warningBox = App.el(`<div class="desc">Chargement des avertissements…</div>`);
  cWarnings.appendChild(warningBox);
  const renderWarnings = async () => {
    try {
      const payload = await App.api(`/bots/${bot.id}/guilds/${guildId}/warnings`);
      const warningRows = payload.warnings || [];
      const summary = payload.summary || [];
      const cfg = payload.config || {};
      if (!warningRows.length) {
        warningBox.innerHTML = `<div class="dash-empty" style="padding:16px 4px">✅ Aucun avertissement enregistré pour le moment.</div>`;
        return;
      }
      const actionLabel = (action) => ({ timeout: '⏳ timeout', kick: '👢 expulsion', ban: '🔨 bannissement', warn: '⚠️ avertissement' }[action] || '⚠️ avertissement');
      const summaryHtml = summary.length ? `
        <div style="font-size:12px;color:var(--d-dim);margin-bottom:8px">👥 Membres concernés · palier configuré : <b>${cfg.limit || 'désactivé'}</b>${cfg.action && cfg.action !== 'none' ? ` → ${App.escapeHtml(actionLabel(cfg.action))}` : ''}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-bottom:14px">
          ${summary.slice(0, 8).map((s) => `<div style="display:flex;align-items:center;gap:8px;padding:10px 11px;border:1px solid var(--d-border);border-radius:12px;background:rgba(88,101,242,.06)">
            <span style="font-size:18px">⚠️</span><div style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.escapeHtml(s.user_tag)}</b><span style="font-size:11.5px;color:var(--d-dim)">${s.count} avertissement(s)</span></div>
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-clear-warnings="${App.escapeHtml(s.user_id)}" title="Réinitialiser">↺</button>
          </div>`).join('')}
        </div>` : '';
      const listHtml = warningRows.slice(0, 30).map((w) => {
        const isAuto = w.source === 'automod';
        const level = isAuto && w.warning_no ? `${w.warning_no}${cfg.limit ? '/' + cfg.limit : ''}` : 'staff';
        const origin = isAuto ? '🤖 Auto-mod' : '🛡️ Staff';
        const action = w.action && w.action !== 'warn' ? ` · ${actionLabel(w.action)}` : '';
        const channel = w.channel_name ? ` · #${w.channel_name}` : '';
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 4px;border-bottom:1px solid var(--d-border)">
          <span style="min-width:38px;text-align:center;padding:5px 4px;border-radius:8px;background:${isAuto && Number(w.warning_no) >= Number(cfg.limit || 999999) ? 'rgba(237,66,69,.18)' : 'rgba(254,231,92,.14)'};font-size:11px;font-weight:800">${App.escapeHtml(String(level))}</span>
          <div style="flex:1;min-width:0"><b>${App.escapeHtml(w.user_tag || w.user_id)}</b><div class="m-meta">${origin}${action}${channel} · ${App.escapeHtml(w.reason || 'Aucune raison')} · ${App.escapeHtml(String(w.created_at || '').replace('T', ' '))}</div></div>
        </div>`;
      }).join('');
      warningBox.innerHTML = summaryHtml + `<div style="font-size:12px;color:var(--d-dim);margin:4px 0 6px">🧾 Dernières actions</div>${listHtml}`;
      warningBox.querySelectorAll('[data-clear-warnings]').forEach((btn) => {
        btn.onclick = async () => {
          if (!(await App.confirm('Réinitialiser tous les avertissements de ce membre ?'))) return;
          try {
            await App.api(`/bots/${bot.id}/guilds/${guildId}/warnings/${btn.dataset.clearWarnings}`, { method: 'DELETE' });
            App.toast('Avertissements réinitialisés.');
            renderWarnings();
          } catch (e) { App.toast(e.message, 'error'); }
        };
      });
    } catch (e) {
      warningBox.innerHTML = `<div class="desc">Historique des avertissements indisponible : ${App.escapeHtml(e.message)}</div>`;
    }
  };
  renderWarnings();

  // 🛡️ Bouclier anti-raid automatique
  const cRaid = Dashboard.card(root, '🛡️ Bouclier anti-raid', 'Détecte un afflux anormal de nouveaux membres et protège le serveur tout seul.');
  const raidBox = App.el(`<div class="desc">Chargement…</div>`);
  cRaid.appendChild(raidBox);
  (async () => {
    try {
      const st = await App.api(`/bots/${bot.id}/guilds/${guildId}/antiraid/state`);
      const cfg = st.config || {};
      raidBox.innerHTML = `
        <label class="dash-label">Armer le bouclier</label>
        <label class="switch"><input type="checkbox" id="raid-on" ${cfg.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:10px">
          <div><label class="dash-label">Seuil (arrivées)</label><input class="dash-input" id="raid-th" type="number" min="2" max="100" value="${cfg.threshold ?? 10}" /></div>
          <div><label class="dash-label">Fenêtre (secondes)</label><input class="dash-input" id="raid-win" type="number" min="5" max="600" value="${cfg.window ?? 30}" /></div>
          <div><label class="dash-label">Action</label><select class="dash-select" id="raid-act">
            <option value="lockdown" ${cfg.action === 'lockdown' ? 'selected' : ''}>🔒 Verrouiller les salons</option>
            <option value="alert" ${cfg.action === 'alert' ? 'selected' : ''}>🔔 Alerter seulement</option>
          </select></div>
          <div><label class="dash-label">Réouverture auto (min, 0 = manuel)</label><input class="dash-input" id="raid-unlock" type="number" min="0" max="1440" value="${cfg.unlockMin ?? 0}" /></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="dash-btn dash-btn-primary" id="raid-save" style="flex:1">💾 Enregistrer</button>
          <button class="dash-btn" id="raid-test" style="flex:1">🧪 Tester (verrouille 1 min)</button>
        </div>
        <div id="raid-status" style="margin-top:10px"></div>`;
      const statusEl = cRaid.querySelector('#raid-status');
      if (st.raid) {
        const when = new Date(st.raid.triggeredAt).toLocaleString('fr-FR');
        statusEl.innerHTML = `<div style="padding:10px 12px;border:1px solid rgba(237,66,69,.4);border-radius:10px;background:rgba(237,66,69,.08);font-size:13px">🚨 <b>Raid détecté</b> le ${when} — ${st.raid.count} arrivées en ${st.raid.window}s (${st.raid.action === 'lockdown' ? st.raid.locked + ' salon(s) verrouillé(s)' : 'alerte'})${st.raid.unlockAt ? ' · réouverture auto programmée' : ''}<br/><button class="dash-btn dash-btn-sm" id="raid-unlock-now" style="margin-top:8px">🔓 Réouvrir maintenant</button></div>`;
        cRaid.querySelector('#raid-unlock-now').onclick = async () => {
          try { await App.api(`/bots/${bot.id}/guilds/${guildId}/antiraid/unlock`, { method: 'POST' }); App.toast('Serveur réouvert !'); Dashboard.renderers.moderation(content, data); }
          catch (e) { App.toast(e.message, 'error'); }
        };
      } else if (st.lockdown && st.lockdown.locked) {
        statusEl.innerHTML = `<div style="padding:10px 12px;border:1px solid rgba(254,231,92,.4);border-radius:10px;background:rgba(254,231,92,.08);font-size:13px">🔒 Le serveur est verrouillé (${st.lockdown.channels.length} salon(s)). <button class="dash-btn dash-btn-sm" id="raid-unlock-now" style="margin-top:8px">🔓 Réouvrir</button></div>`;
        cRaid.querySelector('#raid-unlock-now').onclick = async () => {
          try { await App.api(`/bots/${bot.id}/guilds/${guildId}/antiraid/unlock`, { method: 'POST' }); App.toast('Serveur réouvert !'); Dashboard.renderers.moderation(content, data); }
          catch (e) { App.toast(e.message, 'error'); }
        };
      } else {
        statusEl.innerHTML = `<div class="desc" style="margin:0">${cfg.enabled ? '✅ Bouclier armé — le serveur est protégé.' : '⚠️ Bouclier désarmé.'}</div>`;
      }
      cRaid.querySelector('#raid-save').onclick = async () => {
        try {
          await App.api(`/bots/${bot.id}/guilds/${guildId}/antiraid`, { method: 'PUT', body: {
            enabled: cRaid.querySelector('#raid-on').checked,
            threshold: parseInt(cRaid.querySelector('#raid-th').value, 10) || 10,
            window: parseInt(cRaid.querySelector('#raid-win').value, 10) || 30,
            action: cRaid.querySelector('#raid-act').value,
            unlock_min: parseInt(cRaid.querySelector('#raid-unlock').value, 10) || 0,
          }});
          App.toast('Bouclier anti-raid enregistré !');
          Dashboard.renderers.moderation(content, data);
        } catch (e) { App.toast(e.message, 'error'); }
      };
      cRaid.querySelector('#raid-test').onclick = async () => {
        try {
          App.toast('🧪 Raid simulé : le serveur se verrouille 1 minute…');
          const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/antiraid/test`, { method: 'POST' });
          App.toast(r.action === 'lockdown' ? `🚨 ${r.locked} salon(s) verrouillé(s) — réouverture auto dans 1 min !` : '🔔 Alerte de raid envoyée !');
          Dashboard.renderers.moderation(content, data);
        } catch (e) { App.toast(e.message, 'error'); }
      };
    } catch (e) { raidBox.innerHTML = `<div class="desc">Bouclier indisponible : ${App.escapeHtml(e.message)}</div>`; }
  })();

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

  // 🧭 Commandes utilisées (stats d'utilisation v88)
  try {
    const cs = await App.api(`/bots/${bot.id}/guilds/${guildId}/stats/commands`);
    const c4 = Dashboard.card(root, '🧭 Commandes utilisées', `${cs.total} commande(s) au total (30 derniers jours).`);
    if (!cs.total) {
      c4.appendChild(App.el(`<div class="desc" style="margin:0">Les compteurs se remplissent dès que les membres utilisent les commandes.</div>`));
    } else {
      const maxCmd = Math.max(...cs.byDay.map((d) => d.commands), 1);
      c4.appendChild(App.el(`<div class="chart">${bars(cs.byDay.map((d) => d.commands), maxCmd, 'linear-gradient(180deg,#8B5CF6,#6d28d9)', 'cmd', cs.byDay.map((d) => new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })))}</div>`));
      c4.appendChild(App.el(`<div class="dash-label" style="margin-top:12px">Top commandes (30 j)</div>`));
      cs.top.slice(0, 8).forEach((c5, i) => {
        c4.appendChild(App.el(`
          <div style="display:flex;align-items:center;gap:10px;padding:6px 2px;border-bottom:1px solid #222434">
            <span style="font-size:15px">${['🥇','🥈','🥉'][i] || `#${i + 1}`}</span>
            <span style="flex:1;font-size:13.5px">/${App.escapeHtml(c5.command)}</span>
            <span class="dash-badge">${c5.n} fois</span>
          </div>`));
      });
    }
  } catch { /* les stats de commandes s'affichent dès qu'elles existent */ }
};

// ---------- Annonces programmées ----------
const ANNOUNCEMENT_TZ_OPTIONS = [
  ['Europe/Paris', '🇫🇷 Paris (Europe/Paris)'],
  ['Europe/Brussels', '🇧🇪 Bruxelles (Europe/Brussels)'],
  ['Europe/London', '🇬🇧 Londres (Europe/London)'],
  ['Europe/Madrid', '🇪🇸 Madrid (Europe/Madrid)'],
  ['Europe/Zurich', '🇨🇭 Genève (Europe/Zurich)'],
  ['America/Toronto', '🇨🇦 Montréal (America/Toronto)'],
  ['America/New_York', '🇺🇸 New York (America/New_York)'],
  ['America/Los_Angeles', '🇺🇸 Los Angeles (America/Los_Angeles)'],
  ['America/Sao_Paulo', '🇧🇷 São Paulo (America/Sao_Paulo)'],
  ['America/Mexico_City', '🇲🇽 Mexico (America/Mexico_City)'],
  ['Africa/Casablanca', '🇲🇦 Casablanca (Africa/Casablanca)'],
  ['Africa/Dakar', '🇸🇳 Dakar (Africa/Dakar)'],
  ['Indian/Reunion', '🇷🇪 La Réunion (Indian/Reunion)'],
  ['Indian/Antananarivo', '🇲🇬 Antananarivo (Indian/Antananarivo)'],
  ['Asia/Tokyo', '🇯🇵 Tokyo (Asia/Tokyo)'],
  ['Australia/Sydney', '🇦🇺 Sydney (Australia/Sydney)'],
];
const ANNOUNCEMENT_TZ_LABEL = Object.fromEntries(ANNOUNCEMENT_TZ_OPTIONS.map(([tz, label]) => [tz, label.split(' (')[0]]));

Dashboard.renderers.announcements = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '📅', 'Annonces programmées', 'Des messages envoyés automatiquement aux jours et heures choisis (ex : le lundi à 18 h).');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const { scheduled } = await App.api(`/bots/${bot.id}/guilds/${guildId}/scheduled`);
  const currentTz = ((data.settings || {}).timezone) || 'Europe/Paris';

  const c = Dashboard.card(root, 'Mes annonces', `Jusqu'à 20 annonces. Envoi à l'heure de : ${ANNOUNCEMENT_TZ_LABEL[currentTz] || currentTz}.`);
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
    <label class="dash-label">Fuseau horaire (heure d'envoi)</label>
    <select class="dash-select" id="a-tz">${ANNOUNCEMENT_TZ_OPTIONS.map(([tz, label]) => `<option value="${tz}" ${tz === currentTz ? 'selected' : ''}>${label}</option>`).join('')}</select>
    <label class="dash-label" style="margin-top:10px">Salon</label>
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
      const chosenTz = c2.querySelector('#a-tz').value;
      if (chosenTz !== currentTz) {
        await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: { timezone: chosenTz } });
      }
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
        ['messages', '💬 Messages', 'supprimés, modifiés, purge massive'],
        ['roles', '🏷️ Rôles', 'créés, supprimés, modifiés, rôles des membres'],
        ['channels', '📂 Salons', 'créés, supprimés, modifiés, fils'],
        ['server', '⚙️ Serveur', 'réglages modifiés, webhooks'],
        ['voice', '🔊 Vocal', 'connexions, déconnexions, déplacements'],
        ['security', '🚨 Sécurité', 'raids, verrouillages, bouclier'],
        ['joinleave', '👋 Arrivées / départs', 'nouveaux membres'],
        ['other', '🛒 Boutique & divers', 'achats…'],
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

  // 🛡️ Historique des actions d'auto-mod (visible même sans salon #logs)
  const hc = Dashboard.card(root, '🛡️ Auto-modération — dernières actions', 'Les 20 dernières suppressions automatiques sur ce serveur.');
  const hList = App.el(`<div class="desc">Chargement…</div>`);
  hc.appendChild(hList);
  (async () => {
    try {
      const { logs } = await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/logs`);
      if (!logs.length) { hList.innerHTML = `<div class="desc">Aucune action pour l'instant. Les suppressions de l'auto-mod apparaîtront ici.</div>`; return; }
      hList.innerHTML = logs.slice(0, 20).map((l) => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid #222434">
          <span style="font-size:15px">🛡️</span>
          <div style="flex:1;min-width:0">
            <b style="font-size:13px">${App.escapeHtml(l.user_tag || 'membre inconnu')}</b>
            <div class="m-meta">${App.escapeHtml(l.reason)} · ${App.escapeHtml(String(l.created_at || '').replace('T', ' '))}</div>
          </div>
        </div>`).join('');
    } catch { hList.innerHTML = `<div class="desc">Historique indisponible pour le moment.</div>`; }
  })();
};

// ---------- ⭐ Starboard & 📨 Invitations ----------
Dashboard.renderers.community = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const s = data.settings || {};
  const root = Dashboard.header(content, '⭐', 'Communauté & Lives', 'Starboard, classement des recruteurs et annonces automatiques de live.');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);

  // ---- 🔴 Carte Annonces de live ----
  const cl = Dashboard.card(root, '🔴 Annonces de live', 'Enregistre le lien TikTok / Twitch / YouTube / Kick d\'un membre : dès qu\'il lance un live, le bot l\'annonce automatiquement (pseudo + photo de profil + bouton Regarder) dans le salon choisi.');
  const liveChanOpts = ['<option value="">— Désactivé (choisir un salon pour activer) —</option>']
    .concat(textChannels.map((ch) => `<option value="#${ch.name}" ${String(s.live_channel || '') === `#${ch.name}` ? 'selected' : ''}>💬 #${ch.name}</option>`));
  cl.innerHTML += `
    <div id="lv-status" style="margin-bottom:10px">${s.live_channel
      ? `<span class="dash-badge ok">✅ Annonces ACTIVES dans ${App.escapeHtml(s.live_channel)}</span>`
      : `<span class="dash-badge warn">⚠️ AUCUN salon choisi — les annonces sont DÉSACTIVÉES ! Choisis un salon ci-dessous.</span>`}</div>
    <label class="dash-label">Salon des annonces de live</label>
    <select class="dash-select" id="lv-chan" style="max-width:320px">${liveChanOpts.join('')}</select>
    <label class="dash-label">Mention envoyée avec l'annonce</label>
    <select class="dash-select" id="lv-ping" style="max-width:320px">
      <option value="everyone" ${(s.live_ping || 'everyone') === 'everyone' ? 'selected' : ''}>📣 @everyone (tout le monde)</option>
      <option value="here" ${s.live_ping === 'here' ? 'selected' : ''}>🔔 @here (membres connectés)</option>
      <option value="none" ${s.live_ping === 'none' ? 'selected' : ''}>🔕 Aucune mention</option>
    </select>
    <div style="margin-top:12px"><button class="dash-btn dash-btn-primary" id="lv-save">💾 Enregistrer</button></div>
    <div style="height:1px;background:var(--d-border);margin:16px 0"></div>
    <label class="dash-label">Ajouter un compte à suivre</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input class="dash-input" id="lv-link" placeholder="Lien complet (tiktok.com/@pseudo) ou @pseudo" style="flex:2;min-width:220px" />
      <select class="dash-select" id="lv-platform" style="flex:1;min-width:130px">
        <option value="tiktok">🎵 TikTok</option>
        <option value="twitch">🟣 Twitch</option>
        <option value="youtube">▶️ YouTube</option>
        <option value="kick">🟢 Kick</option>
      </select>
      <select class="dash-select" id="lv-member" style="flex:1;min-width:160px"><option value="">👤 Membre lié (optionnel)</option></select>
      <button class="dash-btn dash-btn-primary" id="lv-add">➕ Suivre</button>
    </div>
    <div class="dc-preview" style="margin-top:14px"><div class="dash-label" style="margin:0 0 8px">👀 Aperçu de l'annonce</div>
      <div style="font-size:12.5px;color:#dbdee1;margin-bottom:6px">@everyone</div>
      <div style="border-left:4px solid #FE2C55;background:#2B2D31;border-radius:4px;padding:12px 14px;max-width:430px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#FE2C55,#8B5CF6);display:inline-block"></span><b style="font-size:13px;color:#f2f3f5">93_vlz est en live !</b></div>
        <div style="font-weight:700;font-size:14px;color:#fff">🎵 🔴 LIVE sur TikTok</div>
        <div style="font-size:12.5px;color:#b5bac1;margin:6px 0">✨ Rejoins-le maintenant, il t'attend…</div>
        <div style="display:inline-block;background:#4E5058;color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:6px">▶️ Regarder le live TikTok</div>
      </div>
    </div>
    <div id="lv-list" style="margin-top:14px"></div>
    <div style="font-size:12px;color:var(--d-dim);margin-top:8px">💡 Vérification automatique toutes les 60 secondes · 20 comptes max · une annonce par session live (les faux hors-ligne sont confirmés).</div>`;

  // 💾 Enregistrement des réglages live (partagé : bouton 💾 ET ajout de compte)
  const saveLiveSettings = async () => {
    await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: {
      prefix: s.prefix || '', warn_limit: s.warn_limit || 0, warn_action: s.warn_action || 'none',
      live_channel: cl.querySelector('#lv-chan').value,
      live_ping: cl.querySelector('#lv-ping').value,
    }});
    const chosen = cl.querySelector('#lv-chan').value;
    cl.querySelector('#lv-status').innerHTML = chosen
      ? `<span class="dash-badge ok">✅ Annonces ACTIVES dans ${App.escapeHtml(chosen)}</span>`
      : `<span class="dash-badge warn">⚠️ AUCUN salon choisi — les annonces sont DÉSACTIVÉES !</span>`;
  };
  cl.querySelector('#lv-save').onclick = async () => {
    try { await saveLiveSettings(); App.toast('Annonces de live enregistrées !'); }
    catch (e) { App.toast(e.message, 'error'); }
  };

  const PLAT = { tiktok: ['🎵', 'TikTok'], twitch: ['🟣', 'Twitch'], youtube: ['▶️', 'YouTube'], kick: ['🟢', 'Kick'] };
  const renderSocials = async () => {
    const list = cl.querySelector('#lv-list');
    list.innerHTML = '';
    try {
      const { socials } = await App.api(`/bots/${bot.id}/guilds/${guildId}/livesocials`);
      if (!socials.length) { list.appendChild(App.el(`<div class="dash-empty" style="padding:14px">Aucun compte suivi pour l'instant.</div>`)); return; }
      socials.forEach((so) => {
        const [emo, lab] = PLAT[so.platform] || ['🌐', so.platform];
        const checkedLabel = so.last_checked_at
          ? ` · contrôle ${new Date(Number(so.last_checked_at)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
          : '';
        const errorLine = so.last_error
          ? `<div style="font-size:11.5px;color:#faa61a;margin-top:5px">⚠️ ${App.escapeHtml(so.last_error)}</div>`
          : '';
        const row = App.el(`
          <div style="padding:9px 4px;border-bottom:1px solid var(--d-border)">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:17px">${emo}</span>
              <div style="flex:1;min-width:0">
                <b>@${App.escapeHtml(so.handle)}</b> <span style="color:var(--d-dim);font-size:12px">· ${lab}${so.user_id ? ` · lié à un membre` : ''}${checkedLabel}</span>
              </div>
              <span class="dash-badge ${so.last_status === 'live' ? 'ok' : ''}">${so.last_status === 'live' ? '🔴 EN LIVE' : '⚫ hors ligne'}</span>
              <button class="dash-btn dash-btn-sm" data-test>🧪 Tester</button>
              <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>✕</button>
            </div>
            ${errorLine}
          </div>`);
        row.querySelector('[data-test]').onclick = async () => {
          const btn = row.querySelector('[data-test]');
          btn.disabled = true; btn.textContent = '⏳…';
          try {
            const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/livesocials/${so.id}/test`, { method: 'POST' });
            if (!r.ok) App.toast(`🧪 ${r.error}`, 'error');
            else {
              const channelHint = r.channelSet ? ` · salon #${r.channelName || 'configuré'} prêt` : ` — ⚠️ ${r.channelIssue || 'salon d\'annonces introuvable'}`;
              App.toast(`🧪 ${r.name} : ${r.live ? '🔴 EN LIVE en ce moment' : '⚫ pas en live actuellement'}${channelHint}`, r.channelSet && !r.channelIssue ? undefined : 'error');
            }
          } catch (e) { App.toast(e.message, 'error'); }
          btn.disabled = false; btn.textContent = '🧪 Tester';
        };
        row.querySelector('[data-del]').onclick = async () => {
          try { await App.api(`/bots/${bot.id}/guilds/${guildId}/livesocials/${so.id}`, { method: 'DELETE' }); App.toast('Compte retiré.'); renderSocials(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        list.appendChild(row);
      });
    } catch (e) { list.appendChild(App.el(`<div class="dash-empty">${App.escapeHtml(e.message)}</div>`)); }
  };
  cl.querySelector('#lv-add').onclick = async () => {
    try {
      // 💾 L'ajout enregistre AUSSI le salon/mention sélectionnés : une seule
      // action suffit, plus jamais d'annonces silencieusement désactivées.
      await saveLiveSettings();
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/livesocials`, { method: 'POST', body: {
        link: cl.querySelector('#lv-link').value,
        platform: cl.querySelector('#lv-platform').value,
        user_id: cl.querySelector('#lv-member').value,
      }});
      const chanOk = !!cl.querySelector('#lv-chan').value;
      App.toast(`Compte @${r.handle} (${r.platform}) suivi !${chanOk ? '' : ' ⚠️ Choisis aussi un salon d\'annonces !'}`, chanOk ? undefined : 'error');
      cl.querySelector('#lv-link').value = '';
      renderSocials();
    } catch (e) { App.toast(e.message, 'error'); }
  };
  renderSocials();
  // Liste des membres pour lier un compte (asynchrone, non bloquant)
  App.api(`/bots/${bot.id}/guilds/${guildId}/members`).then(({ members }) => {
    const sel = cl.querySelector('#lv-member');
    (members || []).slice(0, 100).forEach((m) => sel.appendChild(App.el(`<option value="${m.id}">👤 ${App.escapeHtml(m.username || m.tag)}</option>`)));
  }).catch(() => {});

  // ---- Carte Starboard ----
  const c1 = Dashboard.card(root, '⭐ Starboard', 'Quand un message reçoit assez d\'étoiles (réaction ⭐), il est épinglé dans le salon choisi — le mur de la gloire de ton serveur.');
  const chanOpts = ['<option value="">— Désactivé (choisir un salon pour activer) —</option>']
    .concat(textChannels.map((ch) => `<option value="#${ch.name}" ${String(s.starboard_channel || '') === `#${ch.name}` ? 'selected' : ''}>💬 #${ch.name}</option>`));
  c1.innerHTML += `
    <label class="dash-label">Salon du starboard</label>
    <select class="dash-select" id="sb-chan" style="max-width:320px">${chanOpts.join('')}</select>
    <label class="dash-label">Nombre d'étoiles minimum</label>
    <input class="dash-input" id="sb-min" type="number" min="1" max="50" value="${s.starboard_min || 3}" style="max-width:140px" />
    <div style="font-size:12.5px;color:var(--d-dim);margin-top:8px">💡 Astuce : 3 étoiles est un bon réglage pour un serveur de moins de 500 membres.</div>
    <div style="margin-top:14px"><button class="dash-btn dash-btn-primary" id="sb-save">💾 Enregistrer</button></div>`;
  c1.querySelector('#sb-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: {
        prefix: s.prefix || '', warn_limit: s.warn_limit || 0, warn_action: s.warn_action || 'none',
        starboard_channel: c1.querySelector('#sb-chan').value,
        starboard_min: parseInt(c1.querySelector('#sb-min').value, 10) || 3,
      }});
      App.toast('Starboard enregistré !');
    } catch (e) { App.toast(e.message, 'error'); }
  };

  // ---- Carte Invitations ----
  const c2 = Dashboard.card(root, '📨 Traqueur d\'invitations', 'Qui recrute le plus ? Le bot détecte automatiquement quelle invitation chaque nouveau membre a utilisée. Commande : /invites');
  try {
    const [{ invitesTop, starboardCount }, membersRes] = await Promise.all([
      App.api(`/bots/${bot.id}/guilds/${guildId}/community`),
      App.api(`/bots/${bot.id}/guilds/${guildId}/members`).catch(() => ({ members: [] })),
    ]);
    const byId = new Map((membersRes.members || []).map((m) => [String(m.id), m]));
    c2.appendChild(App.el(`<div style="font-size:12.5px;color:var(--d-dim);margin-bottom:10px">⭐ ${starboardCount} message(s) au starboard · ⚠️ Le bot doit avoir la permission « Gérer le serveur » pour lire les invitations.</div>`));
    if (!invitesTop.length) {
      c2.appendChild(App.el(`<div class="dash-empty">Aucune invitation traquée pour l'instant — le classement se remplit à chaque nouvelle arrivée.</div>`));
    } else {
      const medals = ['🥇', '🥈', '🥉'];
      invitesTop.forEach((r, idx) => {
        const m = byId.get(String(r.inviter_id));
        const name = m ? (m.displayName || m.username || m.tag || r.inviter_id) : r.inviter_id;
        const avatar = m && m.avatar ? `<img src="${App.escapeHtml(m.avatar)}" style="width:28px;height:28px;border-radius:50%" alt=""/>` : '<span style="width:28px;height:28px;border-radius:50%;background:var(--d-border);display:inline-block"></span>';
        c2.appendChild(App.el(`
          <div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid var(--d-border)">
            <span style="width:34px;text-align:center;font-size:${idx < 3 ? '20px' : '14px'}">${medals[idx] || (idx + 1) + '.'}</span>
            ${avatar}
            <span style="flex:1;font-weight:600">${App.escapeHtml(String(name))}</span>
            <span class="dash-badge">${r.n} invitation(s)</span>
          </div>`));
      });
    }
  } catch (e) {
    c2.appendChild(App.el(`<div class="dash-empty">${App.escapeHtml(e.message)}</div>`));
  }
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
    <div class="dash-tier-box" style="margin-top:14px;padding:14px;border:1px solid var(--d-border);border-radius:12px">
      <div style="font-weight:700;margin-bottom:2px">⚖️ Sanctions automatiques progressives</div>
      <div style="font-size:12.5px;color:var(--d-dim);margin-bottom:6px">Exemple pro : 3 avertissements → timeout, 5 → expulsion. La sanction la plus sévère atteinte s'applique.</div>
      <label class="dash-label">Palier 1 — timeout après X avertissements (0 = désactivé)</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input class="dash-input" id="g-warn-t1" type="number" min="0" value="${s.warn_timeout_limit || 0}" style="max-width:140px" />
        <div style="display:flex;align-items:center;gap:8px"><input class="dash-input" id="g-warn-t1min" type="number" min="1" max="10080" value="${s.warn_timeout_min || 60}" style="max-width:120px" /><span style="font-size:13px;color:var(--d-dim)">minutes de timeout</span></div>
      </div>
      <label class="dash-label">Palier 2 — sanction finale après X avertissements (0 = désactivé)</label>
      <input class="dash-input" id="g-warn" type="number" min="0" value="${s.warn_limit || 0}" style="max-width:140px" />
      <label class="dash-label">Action du palier 2</label>
      <select class="dash-select" id="g-action" style="max-width:220px">
        <option value="none" ${s.warn_action === 'none' ? 'selected' : ''}>Aucune</option>
        <option value="timeout" ${s.warn_action === 'timeout' ? 'selected' : ''}>⏳ Timeout</option>
        <option value="kick" ${s.warn_action === 'kick' ? 'selected' : ''}>👢 Expulser</option>
        <option value="ban" ${s.warn_action === 'ban' ? 'selected' : ''}>🔨 Bannir</option>
      </select>
    </div>
    <div style="margin-top:14px"><button class="dash-btn dash-btn-primary" id="g-save">💾 Enregistrer</button></div>`;
  c.querySelector('#g-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/settings`, { method: 'PUT', body: {
        prefix: c.querySelector('#g-prefix').value.trim(),
        warn_limit: parseInt(c.querySelector('#g-warn').value, 10) || 0,
        warn_action: c.querySelector('#g-action').value,
        warn_timeout_limit: parseInt(c.querySelector('#g-warn-t1').value, 10) || 0,
        warn_timeout_min: parseInt(c.querySelector('#g-warn-t1min').value, 10) || 60,
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

  // 🚨 Anti-raid depuis le dashboard (verrouillage du serveur en 1 clic)
  const ld = data.lockdown || { locked: false, channels: [] };
  const c5 = Dashboard.card(root, '🚨 Anti-raid (verrouillage)', 'En cas d\'attaque : verrouille tous les salons en 1 clic, puis rouvre-les. Même chose sur Discord avec /lockdown.');
  c5.innerHTML += `<div id="ld-zone"></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="dash-btn dash-btn-danger" id="ld-on">🚨 Verrouiller le serveur</button>
      <button class="dash-btn" id="ld-off">🔓 Rouvrir le serveur</button>
    </div>`;
  const renderLock = () => {
    const zone = c5.querySelector('#ld-zone');
    if (ld.locked) {
      const names = (ld.channels || []).slice(0, 12).map((ch) => '#' + App.escapeHtml(ch.name)).join(', ');
      zone.innerHTML = `<div class="dash-badge bad" style="margin-bottom:8px">🔒 Serveur verrouillé — ${ld.channels.length} salon(s) en lecture seule</div>
        <div style="font-size:12px;color:var(--d-dim);margin-bottom:12px">${names}${ld.channels.length > 12 ? '…' : ''}</div>`;
    } else {
      zone.innerHTML = `<div class="dash-badge ok" style="margin-bottom:12px">🔓 Serveur ouvert — tout le monde peut écrire normalement</div>`;
    }
  };
  renderLock();
  c5.querySelector('#ld-on').onclick = async () => {
    if (!(await App.confirm('Verrouiller TOUS les salons du serveur ? Les membres ne pourront plus écrire (seuls les admins le pourront).'))) return;
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/lockdown`, { method: 'POST', body: { action: 'on' } });
      ld.locked = r.state.locked; ld.channels = r.state.channels;
      App.toast(r.already ? 'Le serveur était déjà verrouillé.' : `${r.channels} salon(s) verrouillés !`);
      renderLock();
    } catch (e) { App.toast(e.message, 'error'); }
  };
  c5.querySelector('#ld-off').onclick = async () => {
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/lockdown`, { method: 'POST', body: { action: 'off' } });
      ld.locked = r.state.locked; ld.channels = r.state.channels;
      App.toast(`${r.reopened} salon(s) rouverts !`);
      renderLock();
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

// ---------- Santé du bot (centre de santé, fondateur) ----------
Dashboard.renderers.health = async (content) => {
  const bot = Dashboard.state.bot;
  const root = Dashboard.header(content, '🩺', 'Santé du bot', 'État en direct du processus : mémoire, base, sauvegarde, garde-fous et erreurs des 24 h.');

  const render = async () => {
    let h = {};
    try { h = await App.api('/health/bot'); } catch (e) { root.innerHTML = `<div class="dash-empty">${App.escapeHtml(e.message)}</div>`; return; }
    const mem = h.memory || {};
    const heapPct = mem.heapTotalMb ? Math.min(100, Math.round((mem.heapUsedMb / mem.heapTotalMb) * 100)) : 0;
    const heapGlobalPct = Math.min(100, Math.round((mem.heapUsedMb || 0) / 512 * 100)); // instance 512 Mo
    const lastB = h.lastBackup ? new Date(h.lastBackup) : null;
    const lastBStr = lastB && !isNaN(lastB) ? lastB.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais';
    const errs = h.errors24h || { count: 0, last: [] };
    const uptime = Math.round((h.processUptimeMs || 0) / 1000);

    Dashboard.header(content, '🩺', 'Santé du bot', 'État en direct — actualisation automatique toutes les 30 secondes.');

    // 🟢 Statut global
    const statsEl = App.el(`
      <div class="dash-stats">
        <div class="dash-stat"><div class="val">${bot.online ? '🟢 En ligne' : '🔴 Hors ligne'}</div><div class="lbl">Bot</div></div>
        <div class="dash-stat"><div class="val">${(h.platform && h.platform.servers) ?? '-'}</div><div class="lbl">Serveurs</div></div>
        <div class="dash-stat"><div class="val">${(h.platform && h.platform.members) ?? '-'}</div><div class="lbl">Membres</div></div>
        <div class="dash-stat"><div class="val">${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m</div><div class="lbl">Processus en vie</div></div>
      </div>`);
    root.appendChild(statsEl);

    const grid = App.el(`<div class="dash-grid"></div>`);
    root.appendChild(grid);

    // 🧠 Mémoire
    const cMem = App.el(`<div class="dash-card"><h3>🧠 Mémoire</h3>
      <div class="desc">Sur l'instance (512 Mo) — alertes automatiques au-delà de 400 Mo.</div>
      <div class="dash-label">Utilisée : ${mem.heapUsedMb ?? '-'} Mo / ${mem.heapTotalMb ?? '-'} Mo</div>
      <div style="height:12px;background:var(--d-card2);border-radius:20px;overflow:hidden;margin:8px 0 4px">
        <div style="height:100%;width:${heapPct}%;background:linear-gradient(90deg,#5865F2,#8B5CF6);border-radius:20px"></div>
      </div>
      <div style="color:var(--d-dim);font-size:11.5px">${heapGlobalPct}% de l'instance · RSS ${mem.rssMb ?? '-'} Mo</div>
    </div>`);
    grid.appendChild(cMem);

    // 💾 Base + sauvegarde
    const cDb = App.el(`<div class="dash-card"><h3>💾 Base & sauvegarde</h3>
      <div class="desc">Limite de sécurité : 900 Ko (jamais dépassée grâce au nettoyage automatique).</div>
      <div class="dash-badge ${(h.db && h.db.fileSizeKo) < 700 ? 'ok' : 'warn'}">📦 Base : ${(h.db && h.db.fileSizeKo) ?? '-'} Ko</div>
      <div style="height:10px;background:var(--d-card2);border-radius:20px;overflow:hidden;margin:10px 0 4px">
        <div style="height:100%;width:${Math.min(100, ((h.db && h.db.fileSizeKo) || 0) / 900 * 100)}%;background:${(h.db && h.db.fileSizeKo) > 700 ? '#ED4245' : 'linear-gradient(90deg,#3BA55D,#57F287)'};border-radius:20px"></div>
      </div>
      <div style="color:var(--d-dim);font-size:11.5px;margin-bottom:10px">${h.db && h.db.tables ? Object.keys(h.db.tables).length + ' tables avec des données' : ''}</div>
      <div class="dash-badge ${h.backupEnabled ? 'ok' : 'warn'}">💾 Sauvegarde ${h.backupEnabled ? 'active' : 'désactivée'}</div>
      <div style="color:var(--d-dim);font-size:12px;margin-top:6px">🕐 Dernière : ${lastBStr} · démarrage : ${App.escapeHtml(h.bootRestore || '?')}</div>
    </div>`);
    grid.appendChild(cDb);

    // 🛡️ Garde-fous
    const guards = [
      ['🛟 Anti-base-vide (restauration + sauvegarde)', true],
      ['📏 Anti-dépassement 900 Ko', true],
      ['🐕 Reconnexion forcée (60 s)', true],
      ['⏱️ Anti-blocage des interactions (15 s)', true],
      ['💥 Anti-crash (réponses polies)', true],
      ['🧹 Nettoyage auto (24 h)', true],
    ];
    const cGuards = App.el(`<div class="dash-card"><h3>🛡️ Garde-fous actifs</h3>
      <div class="desc">Les protections installées — toutes actives en permanence.</div>
      ${guards.map(([label]) => `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid #222434;font-size:13px"><span>✅</span>${label}</div>`).join('')}
    </div>`);
    grid.appendChild(cGuards);

    // 📉 Alerte de résilience (si le mode dégradé est actif)
    const res = h.resilience || { state: 'ok', failuresInWindow: 0 };
    if (res.state !== 'ok') {
      root.appendChild(App.el(`
        <div class="dash-card" style="border-color:rgba(254,231,92,.5);background:rgba(254,231,92,.06);margin-bottom:14px">
          <h3>📉 Mode ${res.state === 'critique' ? 'critique' : 'dégradé'} — Discord ralentit</h3>
          <div class="desc" style="margin:0">${res.failuresInWindow} échec(s) en 1 minute. Le bot ralentit et retente automatiquement${res.state === 'critique' ? ' — certaines commandes répondent « très sollicité »' : ''}. Retour à la normale automatique dès que Discord récupère.</div>
        </div>`));
    }

    // 🚦 File d'attente (anti-limites Discord)
    const q = h.queue || { waiting: 0, active: 0, processed: 0, failed: 0, refused: 0 };
    const cQueue = App.el(`<div class="dash-card"><h3>🚦 File d'attente</h3>
      <div class="desc">Tous les envois vers Discord passent par ici : les rafales sont lissées pour ne jamais dépasser les limites.</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <div class="dash-stat" style="padding:10px"><div class="val">${q.waiting}</div><div class="lbl">En attente</div></div>
        <div class="dash-stat" style="padding:10px"><div class="val">${q.active}</div><div class="lbl">En cours</div></div>
        <div class="dash-stat" style="padding:10px"><div class="val">${q.processed}</div><div class="lbl">Traitées</div></div>
        <div class="dash-stat" style="padding:10px"><div class="val">${q.failed}</div><div class="lbl">Échecs</div></div>
        <div class="dash-stat" style="padding:10px"><div class="val">${q.refused}</div><div class="lbl">Refusées (file pleine)</div></div>
      </div>
    </div>`);
    grid.appendChild(cQueue);

    // ⚠️ Erreurs 24h
    const cErr = App.el(`<div class="dash-card"><h3>⚠️ Erreurs (24 h)</h3>
      <div class="desc">Les incidents récupérés automatiquement — le bot continue de tourner.</div>
      <div class="dash-badge ${errs.count === 0 ? 'ok' : 'bad'}">${errs.count} erreur(s)</div>
      ${errs.count === 0
        ? `<div class="dash-empty" style="padding:18px">Tout est calme 🎉</div>`
        : `<div style="margin-top:10px">${errs.last.map((e) => `
          <div style="background:var(--d-card2);border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:12px">
            <b>${App.escapeHtml(e.source)}</b> <span style="color:var(--d-dim)">· ${new Date(e.at).toLocaleTimeString('fr-FR')}</span>
            <div style="color:var(--d-dim);word-break:break-word">${App.escapeHtml(e.message)}</div>
          </div>`).join('')}</div>`}
    </div>`);
    grid.appendChild(cErr);
  };

  await render();
  // 🔄 Actualisation automatique tant que la page Santé est ouverte
  if (Dashboard.state.healthTimer) clearInterval(Dashboard.state.healthTimer);
  Dashboard.state.healthTimer = setInterval(() => render().catch(() => {}), 30000);
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
