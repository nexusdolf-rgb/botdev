// ============================================================
// Hoxera — Application principale (SPA)
// Connexion 100 % Discord (OAuth2). Site public + dashboard
// pré-câblé à Hoxera : aucun compte email, aucune création de bot.
// ============================================================
const App = {
  state: { user: null, bot: null, loaded: false },
  router: {},
};

// ---------------------- Utilitaires ----------------------
// 🌊 Effet « ripple » Material sur TOUS les boutons (délégué global)
if (typeof document !== 'undefined' && !window.__hxRipple) {
  window.__hxRipple = true;
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.btn, .dash-btn, .dash-iconbtn, .hero-step, .srv-card') : null;
    if (!btn || btn.disabled) return;
    try {
      const r = btn.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 1.1;
      const s = document.createElement('span');
      s.className = 'hx-ripple';
      s.style.width = s.style.height = d + 'px';
      s.style.left = (e.clientX - r.left - d / 2) + 'px';
      s.style.top = (e.clientY - r.top - d / 2) + 'px';
      btn.appendChild(s);
      setTimeout(() => s.remove(), 550);
    } catch {}
  }, true);
}

App.el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

App.escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

App.api = async (path, options = {}) => {
  const opts = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  const res = await fetch(`/api${path}`, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401) throw new Error('Session expirée — reconnecte-toi avec Discord.');
    throw new Error(data.error || 'Une erreur est survenue');
  }
  return data;
};

App.toast = (message, type = 'success') => {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = App.el(`<div class="toast ${type}">${App.escapeHtml(message)}</div>`);
  box.appendChild(t);
  setTimeout(() => t.remove(), 4200);
};

App.confirm = (message) => new Promise((resolve) => {
  App.modal(`
    <div class="modal-header"><h3>Confirmation</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body"><p style="line-height:1.6">${App.escapeHtml(message)}</p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-danger" id="confirm-yes">Confirmer</button>
    </div>
  `);
  document.getElementById('confirm-yes').onclick = () => { App.closeModal(); resolve(true); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { App.closeModal(); resolve(false); });
});

App.prompt = (message, placeholder = '') => new Promise((resolve) => {
  App.modal(`
    <div class="modal-header"><h3>Saisie</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body">
      <p style="line-height:1.6;margin-bottom:10px">${App.escapeHtml(message)}</p>
      <input class="input" id="prompt-input" placeholder="${App.escapeHtml(placeholder)}" />
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="prompt-ok">OK</button>
    </div>
  `);
  const input = document.getElementById('prompt-input');
  setTimeout(() => input && input.focus(), 50);
  input.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('prompt-ok').click(); };
  document.getElementById('prompt-ok').onclick = () => { const v = input.value.trim(); App.closeModal(); resolve(v); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { App.closeModal(); resolve(''); });
});

App.modal = (innerHtml, large = false) => {
  const root = document.getElementById('modal-root');
  const overlay = App.el(`<div class="modal-overlay"><div class="modal ${large ? 'large' : ''}">${innerHtml}</div></div>`);
  root.innerHTML = '';
  root.appendChild(overlay);
  return overlay;
};

App.closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };

App.openInvite = (url) => {
  try { window.open(url, '_blank', 'noopener'); } catch {}
  navigator.clipboard.writeText(url)
    .then(() => App.toast('Fenêtre Discord ouverte : choisis ton serveur dans le sélecteur ! (lien aussi copié)'))
    .catch(() => App.toast('Choisis ton serveur dans la fenêtre Discord !'));
};

App.fmtNumber = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));

// Télécharge un tableau de lignes au format CSV (v190).
// rows: [{ col1: val, col2: val, ... }]
App.downloadCSV = (filename, rows) => {
  if (!rows || !rows.length) { App.toast('Rien à exporter.', 'error'); return; }
  const esc = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(esc).join(';')];
  rows.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(';')));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ---------------------- Router ----------------------
App.router.parse = () => {
  const raw = (location.hash || '#/').replace(/^#\//, '');
  const [pathPart, query] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return { parts, query: query ? new URLSearchParams(query) : null };
};

App.router.go = (path) => { location.hash = `#/${path}`; };

App.router.run = async () => {
  if (!App.state.loaded) {
    try {
      const me = await App.api('/auth/me');
      App.state.user = me.user;
    } catch { App.state.user = null; }
    App.state.loaded = true;
  }

  const { parts, query } = App.router.parse();
  const user = App.state.user;

  // Messages OAuth2
  if (query && query.get('oauth')) {
    const o = query.get('oauth');
    if (o === 'linked') App.toast('✅ Compte Discord lié — bienvenue !');
    else if (o === 'banned') App.toast('⛔ Ce compte est banni d’Optimus Prime.', 'error');
    else if (o === 'nosecret') App.toast("Le Client Secret Discord n'est pas configuré sur le serveur.", 'error');
    else App.toast('La connexion Discord a échoué. Réessaie.', 'error');
    history.replaceState(null, '', '#/dashboard');
  }

  // Page publique du bot (consultable par tous, sans connexion)
  if (parts[0] === 'bot' && parts[1]) {
    App.renderPublicBot(Number(parts[1]));
    return;
  }

  // Accueil public (racine) : le site de Hoxera, visible par tous
  if (parts.length === 0) {
    App.renderPublicLanding();
    return;
  }

  // Admin plateforme (propriétaire uniquement)
  if (parts[0] === 'admin') {
    if (!user || !user.is_admin) { App.router.go('/dashboard'); return; }
    App.renderAdminPage();
    return;
  }

  // Dashboard : connexion Discord OBLIGATOIRE (comme DraftBot)
  if (!user || !user.discord_id) {
    App.renderConnect();
    return;
  }

  App.renderHoxeraDashboard();
};

// ---------------------- Avatar public d’Optimus Prime ----------------------
// Les pages publiques utilisent une route locale qui sert l'avatar réel du
// bot. Cela évite qu'un blocage du CDN Discord laisse uniquement le logo ⚡.
App.loadPublicBotAvatar = (root) => {
  if (!root) return;
  root.querySelectorAll('[data-brand-logo]').forEach((oldLogo) => {
    // Le logo est déjà une image dans le HTML initial : on lui ajoute
    // seulement un fallback pour éviter un second chargement inutile.
    if (oldLogo.tagName === 'IMG') {
      oldLogo.onerror = () => { if (oldLogo.isConnected) oldLogo.replaceWith(App.el('<span class="logo" data-brand-logo>⚡</span>')); };
      return;
    }
    const image = App.el('<img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar d’Optimus Prime" style="border-radius:50%;object-fit:cover" />');
    image.onerror = () => { if (image.isConnected) image.replaceWith(App.el('<span class="logo" data-brand-logo>⚡</span>')); };
    if (oldLogo.isConnected) oldLogo.replaceWith(image);
  });
};

// ---------------------- Page « Connecte-toi avec Discord » ----------------------
App.renderConnect = () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  const page = App.el(`
    <div class="auth-wrap" id="connect-card">
      <div class="auth-left">
        <div class="logo-row"><img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar d’Optimus Prime" style="border-radius:50%;object-fit:cover" /> Hoxera</div>
        <h1 style="margin-top:52px">Configure ton serveur<br/><span>en quelques clics</span></h1>
        <p class="tagline">Tickets automatiques, niveaux, boutique, giveaways, bienvenue… Tout se règle ici, sans mot de passe : on vérifie simplement avec ton compte Discord.</p>
        <ul class="auth-features">
          <li><span class="f-ico">🎫</span> Tickets avec types personnalisés & transcriptions</li>
          <li><span class="f-ico">📈</span> Niveaux XP et récompenses de rôles</li>
          <li><span class="f-ico">🛒</span> Boutique, économie et giveaways</li>
          <li><span class="f-ico">👋</span> Bienvenue, auto-rôles et menus de rôles</li>
          <li><span class="f-ico">🛡️</span> Modération et journaux complets</li>
        </ul>
      </div>
      <div class="auth-right">
        <div class="auth-card auth-glass" style="text-align:center">
          <div class="auth-bot-ava">🤖</div>
          <h2>Connecte-toi avec Discord</h2>
          <p class="sub" style="margin:8px 0 20px">Aucun compte à créer, aucun mot de passe.<br/>Discord vérifie automatiquement tes serveurs et tes permissions.</p>
          <button class="btn btn-discord" id="connect-discord" style="padding:13px;font-size:15px">🎮 Se connecter avec Discord</button>
          <div class="auth-trust">
            <span>🔒 Connexion sécurisée OAuth2 — nous ne voyons <b>jamais</b> ton mot de passe</span>
            <span>👁️ Accès demandé : ton pseudo, ton avatar et ta liste de serveurs. Rien d'autre.</span>
            <span>🛡️ Seuls les <b>admins</b> des serveurs peuvent configurer.</span>
          </div>
          <a href="#/" style="font-size:12.5px">← Retour à l'accueil</a>
        </div>
      </div>
    </div>
  `);
  root.appendChild(page);
  App.loadPublicBotAvatar(page);
  page.querySelector('#connect-discord').onclick = async (ev) => {
    const b = ev.currentTarget;
    b.classList.add('loading'); b.disabled = true;
    b.innerHTML = '<span class="btn-spin"></span> Connexion à Discord…';
    try {
      const { url } = await App.api('/auth/discord/url');
      window.location.href = url;
    } catch (e) {
      App.toast(e.message, 'error');
      b.classList.remove('loading'); b.disabled = false;
      b.textContent = '🎮 Se connecter avec Discord';
    }
  };
};

// ---------------------- Navbar (connecté) ----------------------
App.renderNavbar = () => {
  const user = App.state.user;
  const bot = App.state.bot;
  const brand = bot && bot.avatar_url
    ? `<img id="nav-brand-avatar" class="logo" src="${App.escapeHtml(bot.avatar_url)}" alt="Avatar d’Optimus Prime" style="border-radius:50%;object-fit:cover" />`
    : '<span class="logo">⚡</span>';
  const nav = App.el(`
    <div class="navbar">
      <div class="logo-row" style="cursor:pointer" id="nav-logo">${brand} Hoxera</div>
      <div class="navbar-right">
        ${user.is_admin ? `<button class="btn btn-ghost btn-sm" id="nav-admin">👑 Admin</button>` : ''}
        <div class="user-pill">
          ${user.discord_avatar
            ? `<img class="user-avatar" style="border-radius:50%" src="https://cdn.discordapp.com/avatars/${App.escapeHtml(user.discord_id)}/${App.escapeHtml(user.discord_avatar)}.png" alt="" />`
            : `<div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>`}
          <span>${App.escapeHtml(user.discord_username || user.email)}</span>
          <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">🔗</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="nav-logout" title="Déconnexion"><span class="nl-ico">⏻</span><span class="nl-lbl">Déconnexion</span></button>
      </div>
    </div>
  `);
  const brandImage = nav.querySelector('#nav-brand-avatar');
  if (brandImage) brandImage.onerror = () => brandImage.replaceWith(App.el('<span class="logo">⚡</span>'));
  nav.querySelector('#nav-logo').onclick = () => App.router.go('/dashboard');
  const adminBtn = nav.querySelector('#nav-admin');
  if (adminBtn) adminBtn.onclick = () => App.router.go('/admin');
  nav.querySelector('#nav-logout').onclick = async () => {
    await App.api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/';
    location.reload();
  };
  return nav;
};

// ---------------------- Dashboard Hoxera ----------------------
App.renderHoxeraDashboard = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const shell = App.el(`<div class="bot-shell"><div class="center-loading"><div class="spinner"></div></div></div>`);
  root.appendChild(shell);

  try {
    const { bot, configured } = await App.api('/hoxera');
    if (!configured || !bot) {
      shell.innerHTML = `
        <div class="dash-card" style="max-width:560px;margin:24px auto">
          <h3>⚡ Hoxera n'est pas encore branché</h3>
          <div class="desc">Ajoute la variable d'environnement <b>HOXERA_TOKEN</b> (token du bot) dans les réglages du service sur Render, puis redémarre. La connexion se fait automatiquement.</div>
        </div>`;
      return;
    }
    App.state.bot = bot;
    // La barre a été créée avant le chargement de /hoxera : on la reconstruit
    // maintenant pour afficher l'avatar Discord réel du bot.
    const currentNav = root.querySelector('.navbar');
    if (currentNav) currentNav.replaceWith(App.renderNavbar());
    shell.innerHTML = '';
    await Dashboard.mount(shell, bot);
  } catch (e) {
    shell.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Administration Optimus Prime (fondateur uniquement) ----------------------
App.ADMIN_TAB = App.ADMIN_TAB || 'overview';

// 👑 HUB FONDATEUR (v199) — espace privé du créateur d'Optimus Prime.
// Onglets : Vue d'ensemble (stats + santé + activité + actions rapides),
// Comptes (recherche + gestion), Bots (démarrer/arrêter), Journal de
// sécurité (filtrable), Réglages plateforme (URL publique, bannière, sauvegarde).
App.renderAdminPage = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const page = App.el(`
    <div class="page admin-platform-page">
      <div class="admin-head">
        <div>
          <h1>👑 Espace fondateur</h1>
          <p class="sub">Administration privée d'Optimus Prime — statistiques, comptes, bots et protection de la plateforme.</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="a-refresh">🔄 Rafraîchir</button>
      </div>
      <div class="admin-tabs" id="a-tabs"></div>
      <div id="a-body"></div>
    </div>`);
  root.appendChild(page);

  const TABS = [
    ['overview', '👑', 'Vue d\'ensemble'],
    ['users', '👥', 'Comptes'],
    ['bots', '🤖', 'Bots'],
    ['audit', '🛡️', 'Journal'],
    ['settings', '⚙️', 'Réglages'],
  ];
  const tabsEl = page.querySelector('#a-tabs');
  const bodyEl = page.querySelector('#a-body');
  page.querySelector('#a-refresh').onclick = () => renderBody();

  const renderTabs = () => {
    tabsEl.innerHTML = '';
    TABS.forEach(([id, ico, label]) => {
      const b = App.el(`<button class="admin-tab ${App.ADMIN_TAB === id ? 'active' : ''}" data-tab="${id}"><span class="t-ico">${ico}</span>${label}</button>`);
      b.onclick = () => { App.ADMIN_TAB = id; renderTabs(); renderBody(); };
      tabsEl.appendChild(b);
    });
  };

  const renderBody = async () => {
    bodyEl.innerHTML = `<div class="admin-loading"><div class="spinner"></div></div>`;
    try {
      if (App.ADMIN_TAB === 'overview') await renderOverview();
      else if (App.ADMIN_TAB === 'users') await renderUsers();
      else if (App.ADMIN_TAB === 'bots') await renderBots();
      else if (App.ADMIN_TAB === 'audit') await renderAudit();
      else if (App.ADMIN_TAB === 'settings') await renderSettings();
    } catch (e) {
      bodyEl.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
    }
  };

  // ─────────────────── Vue d'ensemble ───────────────────
  const renderOverview = async () => {
    const [stats, system, activityRes] = await Promise.all([
      App.api('/admin/stats'),
      App.api('/admin/system'),
      App.api('/admin/activity?limit=40'),
    ]);
    const uptime = Math.floor((system.uptimeMs || 0) / 1000);
    const upStr = uptime > 86400 ? Math.floor(uptime / 86400) + ' j ' + Math.floor((uptime % 86400) / 3600) + ' h'
      : uptime > 3600 ? Math.floor(uptime / 3600) + ' h ' + Math.floor((uptime % 3600) / 60) + ' min'
      : Math.max(1, Math.floor(uptime / 60)) + ' min';
    bodyEl.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="val">${stats.users}</div><div class="lbl">👤 Comptes</div></div>
        <div class="stat-card"><div class="val">${stats.linked ?? 0}</div><div class="lbl">🔗 Liés à Discord</div></div>
        <div class="stat-card"><div class="val">${stats.banned ?? 0}</div><div class="lbl">⛔ Bannis</div></div>
        <div class="stat-card"><div class="val">${stats.servers ?? 0}</div><div class="lbl">🖥️ Serveurs</div></div>
        <div class="stat-card"><div class="val">${stats.members ?? 0}</div><div class="lbl">👥 Membres suivis</div></div>
        <div class="stat-card"><div class="val">${(stats.tickets ?? 0) + (stats.openTickets ?? 0)}</div><div class="lbl">🎫 Tickets traités</div></div>
        <div class="stat-card"><div class="val">${stats.messages24h ?? 0}</div><div class="lbl">💬 Messages 24 h</div></div>
        <div class="stat-card"><div class="val">${stats.online ? '🟢' : '🔴'}</div><div class="lbl">Bot Hoxera</div></div>
      </div>

      <div class="card">
        <h3>🩺 Santé du système</h3>
        <div class="card-sub">État du serveur, du bot et des sauvegardes.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ Serveur en ligne — ${App.escapeHtml(upStr)}</span>
          <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ ${stats.online ? 'Bot connecté' : 'Bot hors ligne'}</span>
          <span class="chip" style="color:${system.backupEnabled ? '#57F287' : '#ff8a8d'};border-color:${system.backupEnabled ? 'rgba(87,242,135,.4)' : 'rgba(237,66,69,.45)'}">${system.backupEnabled ? '✅ Sauvegardes automatiques actives' : '⚠️ Sauvegardes désactivées'}</span>
          <span class="chip">💾 Dernière sauvegarde : ${system.lastBackup ? App.escapeHtml(String(system.lastBackup).slice(0, 16)) : 'jamais'}</span>
        </div>
        <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-sm" id="a-backup-now">💾 Sauvegarder maintenant</button>
          <button class="btn btn-sm" id="a-restart-bot">🔄 Redémarrer le bot</button>
        </div>
      </div>

      <div class="card">
        <h3>🌍 Activité récente</h3>
        <div class="card-sub">Ce qui se passe sur tous les serveurs en ce moment.</div>
        <div id="a-feed">${!activityRes.items.length ? '<div class="empty-state">Aucune activité pour l\'instant.</div>' : activityRes.items.map((it) => `
          <div class="activity-item">
            <span class="a-emoji">${App.escapeHtml(it.emoji || '•')}</span>
            <span class="a-text">${App.escapeHtml(it.text)}</span>
            <span class="a-meta">${it.guild_name ? App.escapeHtml(it.guild_name) : ''}${it.bot_name ? ' · ' + App.escapeHtml(it.bot_name) : ''} · ${App.escapeHtml(String(it.created_at || '').slice(5, 16))}</span>
          </div>`).join('')}</div>
      </div>`;

    bodyEl.querySelector('#a-backup-now').onclick = async () => {
      const b = bodyEl.querySelector('#a-backup-now');
      b.disabled = true; b.textContent = '⏳ Sauvegarde…';
      try {
        const r = await App.api('/backup/now', { method: 'POST' });
        App.toast(r.ok ? '✅ Sauvegarde terminée !' : (r.error || 'Erreur'));
      } catch (e) { App.toast(e.message, 'error'); }
      finally { b.disabled = false; b.textContent = '💾 Sauvegarder maintenant'; renderBody(); }
    };
    bodyEl.querySelector('#a-restart-bot').onclick = async () => {
      if (!(await App.confirm('Redémarrer le bot Optimus Prime ? Il sera indisponible ~10 secondes.'))) return;
      try {
        await App.api('/bots/1/stop', { method: 'POST' });
        await new Promise((r) => setTimeout(r, 800));
        await App.api('/bots/1/start', { method: 'POST' });
        App.toast('🔄 Bot redémarré !');
        renderBody();
      } catch (e) { App.toast(e.message, 'error'); }
    };
  };

  // ─────────────────── Comptes ───────────────────
  const renderUsers = async () => {
    const query = (App.ADMIN_Q = App.ADMIN_Q || '');
    bodyEl.innerHTML = `
      <div class="card">
        <h3>👥 Comptes Optimus Prime liés à Discord</h3>
        <div class="card-sub">Délier Discord, bannir ou supprimer un compte. Ton propre compte est toujours protégé.</div>
        <div class="admin-toolbar">
          <input class="dash-input" id="a-search" placeholder="🔎 Rechercher (nom, ID Discord, email)…" value="${App.escapeHtml(query)}" style="max-width:340px" />
          <button class="btn btn-sm" id="a-search-go">Rechercher</button>
          ${query ? '<button class="btn btn-sm btn-ghost" id="a-search-clear">✕ Réinitialiser</button>' : ''}
        </div>
        <div id="a-users"><div class="spinner" style="margin:20px auto"></div></div>
      </div>`;
    const res = await App.api('/admin/users' + (query ? '?q=' + encodeURIComponent(query) : ''));
    const usersEl = bodyEl.querySelector('#a-users');
    if (!res.users || !res.users.length) {
      usersEl.innerHTML = `<div class="empty-state">${query ? 'Aucun compte trouvé pour « ' + App.escapeHtml(query) + ' ».' : 'Aucun compte utilisateur.'}</div>`;
    } else {
      usersEl.innerHTML = `<div style="overflow-x:auto"><table class="leaderboard-table admin-users-table"><thead><tr><th>Compte</th><th>Discord lié</th><th>Serveurs</th><th>Statut</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
      const tb = usersEl.querySelector('tbody');
      res.users.forEach((u) => {
        const isCurrent = Number(u.id) === Number(App.state.user && App.state.user.id);
        const avatar = u.discord_avatar && u.discord_id
          ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png?size=64` : '';
        const guildNames = (u.guilds || []).slice(0, 5).map((g) => App.escapeHtml(g.name)).join(', ');
        const moreGuilds = (u.guilds || []).length > 5 ? ` +${u.guilds.length - 5}` : '';
        const discordCell = u.discord_linked
          ? `<span style="display:flex;align-items:center;gap:8px">${avatar ? `<img src="${avatar}" style="width:28px;height:28px;border-radius:50%" alt=""/>` : '<span style="width:28px;height:28px;border-radius:50%;background:var(--panel);display:inline-flex;align-items:center;justify-content:center">🎭</span>'}<span><b>${App.escapeHtml('@' + (u.discord_username || u.discord_id))}</b><small style="display:block;color:var(--text-dim)">ID ${App.escapeHtml(u.discord_id)}</small></span></span>`
          : `<span style="color:var(--text-dim)">Non lié</span><small style="display:block;color:var(--text-dim)">${App.escapeHtml(u.email)}</small>`;
        const statusCell = u.banned
          ? `<span class="chip" style="color:#ff8a8d;border-color:rgba(237,66,69,.45)">⛔ Banni</span><small style="display:block;color:var(--text-dim);max-width:180px">${App.escapeHtml(u.ban_reason || 'Aucune raison')}</small>`
          : `<span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ Actif</span>`;
        const actions = isCurrent
          ? `<span style="font-size:12px;color:var(--text-dim)">👑 Compte protégé</span>`
          : `<div style="display:flex;gap:6px;flex-wrap:wrap">
              ${u.discord_linked ? '<button class="btn btn-ghost btn-sm" data-unlink>🔗 Délier</button>' : ''}
              ${u.banned ? '<button class="btn btn-ghost btn-sm" data-unban>✅ Débannir</button>' : '<button class="btn btn-ghost btn-sm" data-ban>⛔ Bannir</button>'}
              <button class="btn btn-danger btn-sm" data-delete>🗑 Supprimer</button>
            </div>`;
        const row = App.el(`<tr>
          <td><b>#${u.id}</b>${Number(u.bots_count) ? `<small style="display:block;color:var(--text-dim)">${u.bots_count} bot(s)</small>` : ''}</td>
          <td>${discordCell}</td>
          <td title="${App.escapeHtml(guildNames)}">${u.guild_count || 0}${guildNames ? `<small style="display:block;color:var(--text-dim);max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${guildNames}${moreGuilds}</small>` : ''}</td>
          <td>${statusCell}</td>
          <td>${actions}</td>
        </tr>`);

        const reload = async () => { await renderBody(); };
        const unlink = row.querySelector('[data-unlink]');
        if (unlink) unlink.onclick = async () => {
          if (!(await App.confirm('Délier le compte Discord de cet utilisateur ? Son compte Optimus Prime sera conservé, mais il devra relier Discord pour revenir.'))) return;
          try { await App.api(`/admin/users/${u.id}/unlink-discord`, { method: 'POST' }); App.toast('Compte Discord délié.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const ban = row.querySelector('[data-ban]');
        if (ban) ban.onclick = async () => {
          if (!(await App.confirm('Bannir cet utilisateur d\'Optimus Prime ? Ses données seront conservées et le bannissement pourra être retiré.'))) return;
          const reason = await App.prompt('Raison du bannissement (optionnelle)', 'Abus de la plateforme');
          try { await App.api(`/admin/users/${u.id}/ban`, { method: 'POST', body: { reason } }); App.toast('Utilisateur banni d\'Optimus Prime.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const unban = row.querySelector('[data-unban]');
        if (unban) unban.onclick = async () => {
          if (!(await App.confirm('Débannir cet utilisateur d\'Optimus Prime ?'))) return;
          try { await App.api(`/admin/users/${u.id}/ban`, { method: 'DELETE' }); App.toast('Utilisateur débanni.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const del = row.querySelector('[data-delete]');
        if (del) del.onclick = async () => {
          if (!(await App.confirm('Supprimer définitivement ce compte et toutes ses données Optimus Prime ? Cette action est irréversible.'))) return;
          try { await App.api(`/admin/users/${u.id}`, { method: 'DELETE' }); App.toast('Compte et données supprimés.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        tb.appendChild(row);
      });
    }
    bodyEl.querySelector('#a-search-go').onclick = () => { App.ADMIN_Q = bodyEl.querySelector('#a-search').value.trim(); renderBody(); };
    bodyEl.querySelector('#a-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { App.ADMIN_Q = bodyEl.querySelector('#a-search').value.trim(); renderBody(); } });
    const clear = bodyEl.querySelector('#a-search-clear');
    if (clear) clear.onclick = () => { App.ADMIN_Q = ''; renderBody(); };
  };

  // ─────────────────── Bots ───────────────────
  const renderBots = async () => {
    bodyEl.innerHTML = `<div class="card"><h3>🤖 Bots de la plateforme</h3><div class="card-sub">Contrôle complet en tant que fondateur : démarrer, arrêter, redémarrer.</div><div id="a-bots"><div class="spinner" style="margin:20px auto"></div></div></div>`;
    const res = await App.api('/admin/bots');
    const botsEl = bodyEl.querySelector('#a-bots');
    if (!res.bots || !res.bots.length) {
      botsEl.innerHTML = `<div class="empty-state">Aucun bot enregistré.</div>`;
    } else {
      botsEl.innerHTML = `<div style="overflow-x:auto"><table class="leaderboard-table"><thead><tr><th>Bot</th><th>État</th><th>Serveurs</th><th>Propriétaire</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
      const tb = botsEl.querySelector('tbody');
      res.bots.forEach((b) => {
        const statusCell = b.online
          ? `<span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">🟢 En ligne</span>`
          : `<span class="chip" style="color:#ff8a8d;border-color:rgba(237,66,69,.45)">🔴 Hors ligne</span>`;
        const row = App.el(`<tr>
          <td><b>${App.escapeHtml(b.name || 'Sans nom')}</b>${b.bot_username ? `<small style="display:block;color:var(--text-dim)">${App.escapeHtml(b.bot_username)}</small>` : ''}</td>
          <td>${statusCell}</td>
          <td>${b.servers ?? 0}</td>
          <td style="color:var(--text-dim);font-size:12.5px">${App.escapeHtml(b.owner_email || '—')}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap">
            ${b.online
              ? '<button class="btn btn-ghost btn-sm" data-restart>🔄 Redémarrer</button><button class="btn btn-danger btn-sm" data-stop>⏹ Arrêter</button>'
              : '<button class="btn btn-sm" data-start>▶️ Démarrer</button>'}
          </div></td>
        </tr>`);
        const doRestart = async (btn) => {
          if (!(await App.confirm('Redémarrer ce bot ? Il sera indisponible ~10 secondes.'))) return;
          btn.disabled = true;
          try {
            await App.api(`/bots/${b.id}/stop`, { method: 'POST' });
            await new Promise((r) => setTimeout(r, 800));
            await App.api(`/bots/${b.id}/start`, { method: 'POST' });
            App.toast('🔄 Bot redémarré !');
            renderBody();
          } catch (e) { App.toast(e.message, 'error'); btn.disabled = false; }
        };
        const start = row.querySelector('[data-start]');
        if (start) start.onclick = async () => {
          start.disabled = true;
          try { await App.api(`/bots/${b.id}/start`, { method: 'POST' }); App.toast('▶️ Bot démarré !'); renderBody(); }
          catch (e) { App.toast(e.message, 'error'); start.disabled = false; }
        };
        const stop = row.querySelector('[data-stop]');
        if (stop) stop.onclick = async () => {
          if (!(await App.confirm('Arrêter ce bot ? Il sera hors ligne sur tous ses serveurs.'))) return;
          stop.disabled = true;
          try { await App.api(`/bots/${b.id}/stop`, { method: 'POST' }); App.toast('⏹ Bot arrêté.'); renderBody(); }
          catch (e) { App.toast(e.message, 'error'); stop.disabled = false; }
        };
        const restart = row.querySelector('[data-restart]');
        if (restart) restart.onclick = () => doRestart(restart);
        tb.appendChild(row);
      });
    }
  };

  // ─────────────────── Journal de sécurité ───────────────────
  const renderAudit = async () => {
    const filter = App.ADMIN_AUDIT_FILTER = App.ADMIN_AUDIT_FILTER || '';
    const actionLabels = {
      unlink_discord: '🔗 Discord délié',
      ban_user: '⛔ Compte banni',
      unban_user: '✅ Compte débanni',
      delete_user: '🗑 Compte supprimé',
    };
    bodyEl.innerHTML = `
      <div class="card">
        <h3>🛡️ Journal de sécurité</h3>
        <div class="card-sub">Historique des actions sensibles réalisées dans l'administration globale.</div>
        <div class="admin-toolbar">
          <select class="dash-select" id="a-audit-filter" style="max-width:240px">
            <option value="">— Toutes les actions —</option>
            ${Object.entries(actionLabels).map(([k, v]) => `<option value="${k}" ${filter === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div id="a-audit"><div class="spinner" style="margin:20px auto"></div></div>
      </div>`;
    const res = await App.api('/admin/audit' + (filter ? '?action=' + encodeURIComponent(filter) : ''));
    const auditEl = bodyEl.querySelector('#a-audit');
    const audit = res.audit || [];
    if (!audit.length) {
      auditEl.innerHTML = `<div class="empty-state">Aucune action sensible enregistrée.</div>`;
    } else {
      auditEl.innerHTML = `<div style="overflow-x:auto"><table class="leaderboard-table"><thead><tr><th>Date</th><th>Action</th><th>Par</th><th>Cible</th><th>Détail</th></tr></thead><tbody>${audit.slice(0, 50).map((entry) => `<tr><td>${App.escapeHtml(String(entry.created_at || '').slice(0, 16))}</td><td>${App.escapeHtml(actionLabels[entry.action] || entry.action)}</td><td>${App.escapeHtml(entry.actor || '')}</td><td>${App.escapeHtml(entry.target || '')}</td><td style="max-width:260px">${App.escapeHtml(entry.details || '')}</td></tr>`).join('')}</tbody></table></div>`;
    }
    bodyEl.querySelector('#a-audit-filter').onchange = (e) => { App.ADMIN_AUDIT_FILTER = e.target.value; renderBody(); };
  };

  // ─────────────────── Réglages plateforme ───────────────────
  const renderSettings = async () => {
    const cfg = await App.api('/admin/settings');
    bodyEl.innerHTML = `
      <div class="card">
        <h3>⚙️ Réglages plateforme</h3>
        <div class="card-sub">Ces réglages sont appliqués partout : liens de transcription, bannière du profil, sauvegardes.</div>
        <label class="dash-label">🌐 URL publique du site</label>
        <input class="dash-input" id="a-public-url" placeholder="https://hoxera.onrender.com" value="${App.escapeHtml(cfg.public_url || '')}" style="max-width:420px" />
        <div style="font-size:12px;color:var(--text-dim);margin-top:6px">Utilisée pour les liens de transcription envoyés en message privé. Laisse vide pour le défaut.</div>
        <label class="dash-label" style="margin-top:16px">🖼️ Bannière du profil du bot (MP de fermeture des tickets)</label>
        <input class="dash-input" id="a-banner-url" placeholder="https://…" value="${App.escapeHtml(cfg.profile_banner_url || '')}" style="max-width:420px" />
        <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-sm" id="a-settings-save">💾 Enregistrer</button>
        </div>
      </div>
      <div class="card">
        <h3>💾 Sauvegardes</h3>
        <div class="card-sub">La base de données est sauvegardée sur GitHub automatiquement (si configuré).</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="chip" style="color:${cfg.backup_enabled ? '#57F287' : '#ff8a8d'};border-color:${cfg.backup_enabled ? 'rgba(87,242,135,.4)' : 'rgba(237,66,69,.45)'}">${cfg.backup_enabled ? '✅ Sauvegarde configurée' : '⚠️ Non configurée'}</span>
          ${cfg.backup_repo ? `<span class="chip">📦 ${App.escapeHtml(cfg.backup_repo)}</span>` : ''}
          <span class="chip">💾 Dernière : ${cfg.last_backup ? App.escapeHtml(String(cfg.last_backup).slice(0, 16)) : 'jamais'}</span>
        </div>
        <div style="margin-top:12px"><button class="btn btn-sm" id="a-backup">💾 Sauvegarder maintenant</button></div>
      </div>`;
    bodyEl.querySelector('#a-settings-save').onclick = async () => {
      try {
        await App.api('/admin/settings', { method: 'PUT', body: {
          public_url: bodyEl.querySelector('#a-public-url').value.trim(),
          profile_banner_url: bodyEl.querySelector('#a-banner-url').value.trim(),
        }});
        App.toast('Réglages enregistrés !');
      } catch (e) { App.toast(e.message, 'error'); }
    };
    bodyEl.querySelector('#a-backup').onclick = async () => {
      const b = bodyEl.querySelector('#a-backup');
      b.disabled = true; b.textContent = '⏳ Sauvegarde…';
      try {
        const r = await App.api('/backup/now', { method: 'POST' });
        App.toast(r.ok ? '✅ Sauvegarde terminée !' : (r.error || 'Erreur'));
      } catch (e) { App.toast(e.message, 'error'); }
      finally { b.disabled = false; b.textContent = '💾 Sauvegarder maintenant'; renderBody(); }
    };
  };

  renderTabs();
  await renderBody();
};

// ---------------------- Démarrage ----------------------
window.addEventListener('hashchange', () => App.router.run());
window.addEventListener('DOMContentLoaded', () => App.router.run());
if (document.readyState !== 'loading') App.router.run();

// ============================================================
// 🖼️ Anti-images cassées (global, capture) — v206
// ------------------------------------------------------------
// Toute <img> qui échoue à charger (CDN Discord injoignable, avatar ou
// icône supprimé, URL devenue invalide…) est remplacée SUR PLACE par une
// pastille de secours propre (initiale sur fond doux). L'icône « image
// cassée » du navigateur ne doit JAMAIS apparaître — ni dans le dashboard,
// ni dans les menus déroulants, ni sur les pages publiques.
// Les images qui ont déjà leur propre onerror (logo public ⚡, etc.)
// restent gérées par leur code local : on ne les touche pas.
App.imgFallbackText = (img) => {
  if (!img) return '?';
  const named = img.dataset && (img.dataset.fbText || img.dataset.name);
  if (named && String(named).trim()) return [...String(named).trim()][0].toUpperCase();
  const alt = String(img.getAttribute && (img.getAttribute('alt') || '') || '').trim();
  if (alt && !/^(logo|avatar|ic[oô]ne|image|banni[eè]re|photo)/i.test(alt) && alt !== 'Logo Optimus Prime') return [...alt][0].toUpperCase();
  const title = String(img.title || '').trim();
  if (title) return [...title][0].toUpperCase();
  // Contexte : carte de serveur (le <b> voisin porte le nom), option de
  // menu déroulant (.dd-opt-txt b), pastille de membre…
  const host = img.closest('.sp-card, .srv-card, .dash-server-card, .dash-mobile-server-item, .ov-intro-server, .dd-option, .ov-top-member, .dash-mobile-drawer-account');
  if (host) {
    const nameEl = host.querySelector('b, .srv-txt b, .sp-txt b, .dd-opt-txt b, .ov-qa-txt b');
    const nm = (nameEl && nameEl.textContent || '').trim().replace(/^#/, '');
    if (nm) return [...nm][0].toUpperCase();
  }
  return '⚡';
};

App.imgFailed = (img) => {
  if (!img || !img.isConnected || (img.dataset && img.dataset.fbSafe)) return;
  img.dataset.fbSafe = '1';
  try {
    const cs = window.getComputedStyle(img);
    const rect = img.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || parseFloat(cs.width) || 40));
    const h = Math.max(1, Math.round(rect.height || parseFloat(cs.height) || 40));
    const round = /50%|100%/.test(cs.borderRadius) || img.classList.contains('round');
    const fb = document.createElement('span');
    fb.className = 'img-fb' + (round ? ' is-round' : '');
    fb.style.width = w + 'px';
    fb.style.height = h + 'px';
    fb.style.fontSize = Math.max(10, Math.min(20, Math.round(Math.min(w, h) * 0.42))) + 'px';
    fb.setAttribute('aria-hidden', 'true');
    fb.textContent = App.imgFallbackText(img);
    img.replaceWith(fb);
  } catch { /* ne jamais bloquer le rendu */ }
};

if (typeof document !== 'undefined' && !window.__hxImgFallback) {
  window.__hxImgFallback = true;
  // phase CAPTURE : « error » sur une image ne remonte pas (pas de bulle),
  // seule la descente depuis document permet de l'intercepter partout.
  document.addEventListener('error', (e) => {
    const img = e && e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fbSafe) return;
    if (img.onerror) return; // onerror local déjà prévu → il s'en charge
    App.imgFailed(img);
  }, true);
}
