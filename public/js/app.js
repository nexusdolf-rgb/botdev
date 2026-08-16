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

// ---------------------- Page « Connecte-toi avec Discord » ----------------------
App.renderConnect = () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  const page = App.el(`
    <div class="auth-wrap" id="connect-card">
      <div class="auth-left">
        <div class="logo-row"><span class="logo">⚡</span> Hoxera</div>
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
        <div class="auth-card" style="text-align:center">
          <div style="font-size:44px;margin-bottom:10px">🎮</div>
          <h2>Connecte-toi avec Discord</h2>
          <p class="sub" style="margin:8px 0 22px">Aucun compte à créer, aucun mot de passe.<br/>Discord vérifie automatiquement tes serveurs et tes permissions.</p>
          <button class="btn btn-discord" id="connect-discord" style="padding:13px;font-size:15px">🎮 Se connecter avec Discord</button>
          <p style="margin-top:18px;font-size:12.5px;color:var(--text-dim)">
            Seuls les <b>propriétaires</b> et <b>administrateurs</b> des serveurs où Hoxera est présent peuvent configurer.
          </p>
          <a href="#/" style="font-size:12.5px">← Retour à l'accueil</a>
        </div>
      </div>
    </div>
  `);
  root.appendChild(page);
  page.querySelector('#connect-discord').onclick = async () => {
    try {
      const { url } = await App.api('/auth/discord/url');
      window.location.href = url;
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------------------- Navbar (connecté) ----------------------
App.renderNavbar = () => {
  const user = App.state.user;
  const nav = App.el(`
    <div class="navbar">
      <div class="logo-row" style="cursor:pointer" id="nav-logo"><span class="logo">⚡</span> Hoxera</div>
      <div class="navbar-right">
        ${user.is_admin ? `<button class="btn btn-ghost btn-sm" id="nav-admin">👑 Admin</button>` : ''}
        <div class="user-pill">
          ${user.discord_avatar
            ? `<img class="user-avatar" style="border-radius:50%" src="https://cdn.discordapp.com/avatars/${App.escapeHtml(user.discord_id)}/${App.escapeHtml(user.discord_avatar)}.png" alt="" />`
            : `<div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>`}
          <span>${App.escapeHtml(user.discord_username || user.email)}</span>
          <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">🔗</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="nav-logout">Déconnexion</button>
      </div>
    </div>
  `);
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
          <div class="desc">Ajoute la variable d'environnement <b>NEXORA_TOKEN</b> (token du bot) dans les réglages du service sur Render, puis redémarre. La connexion se fait automatiquement.</div>
        </div>`;
      return;
    }
    App.state.bot = bot;
    shell.innerHTML = '';
    await Dashboard.mount(shell, bot);
  } catch (e) {
    shell.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Admin plateforme (propriétaire) ----------------------
App.renderAdminPage = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const page = App.el(`<div class="page">
    <h1>👑 Administration Hoxera</h1>
    <p class="sub">Vue d'ensemble de la plateforme : utilisateurs liés et statut du bot.</p>
    <div class="stats-grid" id="a-stats"><div class="spinner"></div></div>
    <div class="card"><h3>👥 Utilisateurs (liés avec Discord)</h3><div class="card-sub">Les personnes qui se sont connectées au dashboard.</div><div id="a-users"><div class="spinner"></div></div></div>
  </div>`);
  root.appendChild(page);

  try {
    const [stats, usersRes] = await Promise.all([App.api('/admin/stats'), App.api('/admin/users')]);
    page.querySelector('#a-stats').innerHTML = `
      <div class="stat-card"><div class="val">${stats.users}</div><div class="lbl">Utilisateurs liés</div></div>
      <div class="stat-card"><div class="val">${App.fmtNumber(stats.servers)}</div><div class="lbl">Serveurs Discord</div></div>
      <div class="stat-card"><div class="val">${App.fmtNumber(stats.members)}</div><div class="lbl">Membres touchés</div></div>
      <div class="stat-card"><div class="val">${stats.online ? '🟢' : '🔴'}</div><div class="lbl">Hoxera</div></div>`;

    const usersEl = page.querySelector('#a-users');
    if (!usersRes.users.length) usersEl.innerHTML = `<div class="empty-state">Aucun utilisateur.</div>`;
    else {
      usersEl.innerHTML = `<table class="leaderboard-table"><thead><tr><th>#</th><th>Discord</th><th>Inscrit le</th></tr></thead><tbody></tbody></table>`;
      const tb = usersEl.querySelector('tbody');
      usersRes.users.forEach((u) => {
        tb.appendChild(App.el(`<tr>
          <td>${u.id}${u.id === 1 ? ' <span class="chip">👑 fondateur</span>' : ''}</td>
          <td>${u.discord_username ? '@' + App.escapeHtml(u.discord_username) : App.escapeHtml(u.email)}</td>
          <td>${App.escapeHtml(String(u.created_at).slice(0, 10))}</td>
        </tr>`));
      });
    }
  } catch (e) {
    page.querySelector('#a-stats').innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Démarrage ----------------------
window.addEventListener('hashchange', () => App.router.run());
window.addEventListener('DOMContentLoaded', () => App.router.run());
if (document.readyState !== 'loading') App.router.run();
