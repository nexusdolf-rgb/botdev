// ============================================================
// BotDev - Application principale (SPA)
// ============================================================
const App = {
  state: { user: null, bots: [], bot: null, botId: null, tab: 'overview', loaded: false },
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
    if (res.status === 401) { App.router.go('#/login'); throw new Error('Session expirée'); }
    throw new Error(data.error || 'Une erreur est survenue');
  }
  return data;
};

App.toast = (message, type = 'success') => {
  const box = document.getElementById('toasts');
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

App.modal = (innerHtml, large = false) => {
  const root = document.getElementById('modal-root');
  const overlay = App.el(`<div class="modal-overlay"><div class="modal ${large ? 'large' : ''}">${innerHtml}</div></div>`);
  root.innerHTML = '';
  root.appendChild(overlay);
  return overlay;
};

App.closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };

// ---------------------- Router ----------------------
const routes = {
  '': () => App.renderDashboard(),
  'dashboard': () => App.renderDashboard(),
  'login': () => App.renderAuth('login'),
  'register': () => App.renderAuth('register'),
  'bots': () => App.renderBot(),
  'bots/:id': () => App.renderBot(),
  'bots/:id/:tab': () => App.renderBot(),
};

App.router.parse = () => {
  const hash = (location.hash || '#/').replace(/^#\//, '');
  const parts = hash.split('/').filter(Boolean);
  return { parts };
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

  const { parts } = App.router.parse();
  const user = App.state.user;

  if (!user) {
    App.renderAuth(parts[0] === 'register' ? 'register' : 'login');
    return;
  }

  if (parts[0] === 'bots' && parts[1]) {
    App.state.botId = Number(parts[1]);
    App.state.tab = parts[2] || 'overview';
    App.renderBot();
    return;
  }
  App.state.botId = null;
  App.renderDashboard();
};

// ---------------------- Auth ----------------------
App.renderAuth = (mode) => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.el(`
    <div class="auth-wrap">
      <div class="auth-left">
        <div class="logo-row"><span class="logo">🤖</span> BotDev</div>
        <h1 style="margin-top:52px">Créez vos bots Discord<br/><span>sans écrire de code</span></h1>
        <p class="tagline">Concevez, hébergez et gérez vos bots Discord depuis une interface visuelle. Glissez des blocs, activez des modules, c'est tout.</p>
        <ul class="auth-features">
          <li><span class="f-ico">🧩</span> Éditeur de commandes visuel par blocs</li>
          <li><span class="f-ico">📦</span> +20 commandes pré-faites en un clic</li>
          <li><span class="f-ico">👋</span> Événements de bienvenue et auto-rôles</li>
          <li><span class="f-ico">💰</span> Système d'économie intégré</li>
          <li><span class="f-ico">☁️</span> Hébergement 24/7 — rien à installer</li>
        </ul>
      </div>
      <div class="auth-right">
        <div class="auth-card">
          <div class="logo-row"><span class="logo">🤖</span> BotDev</div>
          <div class="auth-tabs" style="margin-top:26px">
            <button data-mode="login" class="${mode === 'login' ? 'active' : ''}">Connexion</button>
            <button data-mode="register" class="${mode === 'register' ? 'active' : ''}">Inscription</button>
          </div>
          <div class="form-error" id="auth-error"></div>
          <label class="field-label">Adresse email</label>
          <input class="input" id="auth-email" type="email" placeholder="toi@exemple.fr" autocomplete="email" />
          <label class="field-label">Mot de passe</label>
          <input class="input" id="auth-password" type="password" placeholder="••••••••" autocomplete="current-password" />
          <button class="btn btn-primary" id="auth-submit">${mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
          <p style="color:var(--text-dim);font-size:12px;margin-top:16px;text-align:center">${mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}<a href="${mode === 'login' ? '#/register' : '#/login'}">${mode === 'login' ? 'Inscris-toi' : 'Connecte-toi'}</a></p>
        </div>
      </div>
    </div>
  `));

  root.querySelectorAll('.auth-tabs button').forEach(b => b.onclick = () => App.router.go(b.dataset.mode === 'login' ? '/login' : '/register'));
  const showErr = (msg) => { const e = root.querySelector('#auth-error'); e.textContent = msg; e.classList.add('show'); };
  const submit = async () => {
    const email = root.querySelector('#auth-email').value.trim();
    const password = root.querySelector('#auth-password').value;
    if (!email || !password) return showErr('Remplis tous les champs.');
    const btn = root.querySelector('#auth-submit');
    btn.disabled = true; btn.textContent = 'Chargement…';
    try {
      await App.api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: { email, password } });
      App.state.loaded = false;
      App.router.go('/dashboard');
      location.reload();
    } catch (err) { showErr(err.message); }
    btn.disabled = false; btn.textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
  };
  root.querySelector('#auth-submit').onclick = submit;
  root.querySelector('#auth-password').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
};

// ---------------------- Layout général ----------------------
App.renderNavbar = () => {
  const user = App.state.user;
  const nav = App.el(`
    <div class="navbar">
      <div class="logo-row" style="cursor:pointer" id="nav-logo"><span class="logo">🤖</span> BotDev</div>
      <div class="navbar-right">
        <div class="user-pill">
          <div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>
          <span>${App.escapeHtml(user.email)}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="nav-logout">Déconnexion</button>
      </div>
    </div>
  `);
  nav.querySelector('#nav-logo').onclick = () => App.router.go('/dashboard');
  nav.querySelector('#nav-logout').onclick = async () => {
    await App.api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/login';
    location.reload();
  };
  return nav;
};

// ---------------------- Dashboard ----------------------
App.renderDashboard = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());

  const page = App.el(`<div class="page"><h1>Mes bots</h1><p class="sub">Gère tes bots Discord, ou crée-en un nouveau en moins de 2 minutes.</p><div class="bots-grid" id="grid"><div class="spinner"></div></div></div>`);
  root.appendChild(page);
  const grid = page.querySelector('#grid');

  try {
    const { bots } = await App.api('/bots');
    App.state.bots = bots;
    grid.innerHTML = '';

    bots.forEach((bot) => {
      const avatar = bot.avatar_url
        ? `<img class="bot-avatar" src="${App.escapeHtml(bot.avatar_url)}" alt="" />`
        : `<div class="bot-avatar fallback">🤖</div>`;
      const card = App.el(`
        <div class="bot-card">
          <div class="bot-card-top">
            ${avatar}
            <div>
              <h3>${App.escapeHtml(bot.name)}</h3>
              <div class="uname">${bot.bot_username ? '@' + App.escapeHtml(bot.bot_username) : 'jamais connecté'}</div>
            </div>
          </div>
          <div class="bot-card-status">
            <span class="dot ${bot.online ? 'dot-online' : 'dot-offline'}"></span>
            ${bot.online ? `En ligne — ${bot.guilds.length} serveur(s)` : 'Hors ligne'}
          </div>
          <div class="bot-card-actions">
            <button class="btn btn-primary" data-open>Ouvrir</button>
            <button class="btn" data-invite ${bot.invite_url ? '' : 'disabled'}>Inviter</button>
            <button class="btn btn-danger btn-icon" data-del title="Supprimer">🗑</button>
          </div>
        </div>
      `);
      card.querySelector('[data-open]').onclick = () => App.router.go(`/bots/${bot.id}`);
      card.querySelector('[data-invite]').onclick = () => {
        navigator.clipboard.writeText(bot.invite_url).then(() => App.toast('Lien d\'invitation copié !'));
      };
      card.querySelector('[data-del]').onclick = async () => {
        if (!(await App.confirm(`Supprimer définitivement le bot « ${bot.name} » ?`))) return;
        try {
          await App.api(`/bots/${bot.id}`, { method: 'DELETE' });
          App.toast('Bot supprimé.');
          App.renderDashboard();
        } catch (e) { App.toast(e.message, 'error'); }
      };
      grid.appendChild(card);
    });

    const newCard = App.el(`
      <div class="new-bot-card">
        <span class="plus">＋</span>
        <span>Créer un nouveau bot</span>
      </div>
    `);
    newCard.onclick = () => App.openCreateBotModal();
    grid.appendChild(newCard);
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>${App.escapeHtml(e.message)}</div>`;
  }
};

App.openCreateBotModal = () => {
  App.modal(`
    <div class="modal-header"><h3>➕ Créer un nouveau bot</h3><button class="x-btn" data-close>×</button></div>
    <div class="modal-body">
      <div class="help-box" style="margin-bottom:16px">
        <b>Il te faut un bot Discord :</b>
        <ol style="margin-top:6px">
          <li>Va sur <b>discord.com/developers/applications</b> → <b>New Application</b></li>
          <li>Onglet <b>Bot</b> → <b>Reset Token</b> puis <b>Copy</b> (le token)</li>
          <li>Copie aussi l'<b>Application ID</b> (onglet General Information)</li>
          <li>Dans l'onglet Bot, active <b>SERVER MEMBERS INTENT</b> et <b>MESSAGE CONTENT INTENT</b></li>
        </ol>
      </div>
      <label class="field-label">Nom du bot (affiché dans BotDev)</label>
      <input class="input" id="nb-name" placeholder="Mon super bot" maxlength="32" />
      <label class="field-label">Token du bot</label>
      <input class="input" id="nb-token" placeholder="Colle le token ici" />
      <label class="field-label">Application ID (Client ID)</label>
      <input class="input" id="nb-client" placeholder="123456789012345678" />
      <label class="field-label">Préfixe (optionnel)</label>
      <input class="input" id="nb-prefix" placeholder="!" maxlength="5" value="!" />
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="nb-submit">Créer le bot</button>
    </div>
  `);
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = App.closeModal);
  document.getElementById('nb-submit').onclick = async () => {
    const name = document.getElementById('nb-name').value.trim();
    const token = document.getElementById('nb-token').value.trim();
    const client_id = document.getElementById('nb-client').value.trim();
    const prefix = document.getElementById('nb-prefix').value.trim() || '!';
    if (!name || !token) return App.toast('Nom et token requis.', 'error');
    try {
      const { id } = await App.api('/bots', { method: 'POST', body: { name, token, client_id, prefix } });
      App.closeModal();
      App.toast('Bot créé ! Démarrons-le…');
      await App.api(`/bots/${id}/start`, { method: 'POST' }).catch(() => {});
      App.router.go(`/bots/${id}`);
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------------------- Shell bot ----------------------
App.renderBot = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const shell = App.el(`<div class="bot-shell"><div class="center-loading"><div class="spinner"></div></div></div>`);
  root.appendChild(shell);

  try {
    const { bot } = await App.api(`/bots/${App.state.botId}`);
    App.state.bot = bot;
    shell.innerHTML = '';
    App.renderBotHeader(shell, bot);
    App.renderBotBody(shell, bot);
  } catch (e) {
    shell.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>${App.escapeHtml(e.message)}<br/><br/><button class="btn" onclick="location.hash='#/dashboard'">← Retour au dashboard</button></div>`;
  }
};

App.renderBotHeader = (shell, bot) => {
  const avatar = bot.avatar_url
    ? `<img class="avatar" src="${App.escapeHtml(bot.avatar_url)}" alt="" />`
    : `<div class="avatar fallback">🤖</div>`;
  const header = App.el(`
    <div class="bot-header">
      <button class="btn btn-ghost btn-icon" id="back" title="Retour">←</button>
      ${avatar}
      <div>
        <h2>${App.escapeHtml(bot.name)}</h2>
        <div class="sub">${bot.bot_username ? '@' + App.escapeHtml(bot.bot_username) : 'Bot non connecté'} · ${bot.commands_count} commande(s)</div>
      </div>
      <div class="bot-header-actions">
        <span class="status-pill"><span class="dot ${bot.online ? 'dot-online' : 'dot-offline'}"></span>${bot.online ? 'En ligne' : 'Hors ligne'}</span>
        <button class="btn" id="start-stop">${bot.online ? '⏹ Arrêter' : '▶ Démarrer'}</button>
        <button class="btn btn-primary" id="invite" ${bot.invite_url ? '' : 'disabled'}>➕ Inviter</button>
      </div>
    </div>
  `);
  header.querySelector('#back').onclick = () => App.router.go('/dashboard');
  header.querySelector('#invite').onclick = () => {
    navigator.clipboard.writeText(bot.invite_url).then(() => App.toast('Lien d\'invitation copié !'));
  };
  const startStop = header.querySelector('#start-stop');
  startStop.onclick = async () => {
    startStop.disabled = true;
    try {
      if (bot.online) {
        await App.api(`/bots/${bot.id}/stop`, { method: 'POST' });
        App.toast('Bot arrêté.');
      } else {
        const r = await App.api(`/bots/${bot.id}/start`, { method: 'POST' });
        if (r.degraded) App.toast('Bot en ligne, mais mode réduit : active les intents ! (détails dans Vue d\'ensemble)', 'error');
        else App.toast('Bot démarré ! 🚀');
      }
    } catch (e) { App.toast(e.message, 'error'); }
    App.renderBot();
  };
  shell.appendChild(header);
};

App.renderBotBody = (shell, bot) => {
  const layout = App.el(`<div class="bot-layout"></div>`);
  const tabs = [
    ['overview', '📊', 'Vue d\'ensemble'],
    ['commands', '🧩', 'Commandes'],
    ['modules', '📦', 'Modules'],
    ['panels', '🎛️', 'Panneaux'],
    ['events', '👋', 'Événements'],
    ['economy', '💰', 'Économie'],
    ['settings', '⚙️', 'Réglages'],
  ];
  const sidebar = App.el(`<div class="bot-sidebar">${tabs.map(([id, ico, label]) =>
    `<button class="side-link ${App.state.tab === id ? 'active' : ''}" data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`
  ).join('')}</div>`);
  sidebar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => App.router.go(`/bots/${bot.id}/${b.dataset.tab}`));
  const content = App.el(`<div class="bot-content"></div>`);
  layout.appendChild(sidebar);
  layout.appendChild(content);
  shell.appendChild(layout);

  // Barre de navigation mobile (façon application)
  const mobileNav = App.el(`<nav class="mobile-nav">${tabs.map(([id, ico, label]) =>
    `<button class="${App.state.tab === id ? 'active' : ''}" data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`
  ).join('')}</nav>`);
  mobileNav.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => App.router.go(`/bots/${bot.id}/${b.dataset.tab}`));
  shell.appendChild(mobileNav);

  switch (App.state.tab) {
    case 'commands': BotViews.renderCommands(content, bot); break;
    case 'modules': BotViews.renderModules(content, bot); break;
    case 'panels': BotViews.renderPanels(content, bot); break;
    case 'events': BotViews.renderEvents(content, bot); break;
    case 'economy': BotViews.renderEconomy(content, bot); break;
    case 'settings': BotViews.renderSettings(content, bot); break;
    default: BotViews.renderOverview(content, bot);
  }
};

// ---------------------- Démarrage ----------------------
window.addEventListener('hashchange', () => App.router.run());
window.addEventListener('DOMContentLoaded', () => App.router.run());
if (document.readyState !== 'loading') App.router.run();
