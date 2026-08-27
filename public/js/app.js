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
    else if (o === 'banned') App.toast('⛔ Ce compte est banni de Nexora.', 'error');
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

// ---------------------- Avatar public de Nexora ----------------------
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
    const image = App.el('<img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar de Nexora" style="border-radius:50%;object-fit:cover" />');
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
        <div class="logo-row"><img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar de Nexora" style="border-radius:50%;object-fit:cover" /> Hoxera</div>
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
    ? `<img id="nav-brand-avatar" class="logo" src="${App.escapeHtml(bot.avatar_url)}" alt="Avatar de Nexora" style="border-radius:50%;object-fit:cover" />`
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
          <div class="desc">Ajoute la variable d'environnement <b>NEXORA_TOKEN</b> (token du bot) dans les réglages du service sur Render, puis redémarre. La connexion se fait automatiquement.</div>
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

// ---------------------- Administration Nexora (fondateur uniquement) ----------------------
App.renderAdminPage = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const page = App.el(`<div class="page admin-platform-page">
    <h1>👑 Administration Nexora</h1>
    <p class="sub">Espace privé du fondateur : comptes liés à Discord, accès à Nexora et protection de la plateforme.</p>
    <div class="card admin-security-status">
      <h3>🛡️ Protection active</h3>
      <div class="card-sub">Mode développeur sécurisé : diagnostics avancés sans contourner les permissions.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ Identité fondateur verrouillée</span>
        <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ Accès serveur contrôlé côté API</span>
        <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ Sessions et actions sensibles protégées</span>
        <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">✅ Aucun secret affiché</span>
      </div>
    </div>
    <div class="stats-grid" id="a-stats"><div class="spinner"></div></div>
    <div class="card">
      <h3>👥 Comptes Nexora liés à Discord</h3>
      <div class="card-sub">Tu peux délier Discord, bannir un compte ou supprimer définitivement ses données. Ton propre compte est toujours protégé.</div>
      <div id="a-users"><div class="spinner"></div></div>
    </div>
    <div class="card">
      <h3>🛡️ Journal de sécurité</h3>
      <div class="card-sub">Historique des actions sensibles réalisées dans l’administration globale.</div>
      <div id="a-audit"><div class="spinner"></div></div>
    </div>
  </div>`);
  root.appendChild(page);

  const render = async () => {
    const statsEl = page.querySelector('#a-stats');
    const usersEl = page.querySelector('#a-users');
    const auditEl = page.querySelector('#a-audit');
    try {
      const [stats, usersRes, auditRes] = await Promise.all([
        App.api('/admin/stats'),
        App.api('/admin/users'),
        App.api('/admin/audit'),
      ]);
      statsEl.innerHTML = `
        <div class="stat-card"><div class="val">${stats.users}</div><div class="lbl">Comptes Nexora</div></div>
        <div class="stat-card"><div class="val">${stats.linked ?? 0}</div><div class="lbl">Liés à Discord</div></div>
        <div class="stat-card"><div class="val">${stats.banned ?? 0}</div><div class="lbl">Bannis de Nexora</div></div>
        <div class="stat-card"><div class="val">${stats.online ? '🟢' : '🔴'}</div><div class="lbl">Hoxera</div></div>`;

      if (!usersRes.users || !usersRes.users.length) {
        usersEl.innerHTML = `<div class="empty-state">Aucun compte utilisateur.</div>`;
      } else {
        usersEl.innerHTML = `<div style="overflow-x:auto"><table class="leaderboard-table admin-users-table"><thead><tr><th>Compte</th><th>Discord lié</th><th>Serveurs</th><th>Statut</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
      const tb = usersEl.querySelector('tbody');
      usersRes.users.forEach((u) => {
        const isCurrent = Number(u.id) === Number(App.state.user && App.state.user.id);
        const guildNames = (u.guilds || []).slice(0, 5).map((g) => App.escapeHtml(g.name)).join(', ');
        const moreGuilds = (u.guilds || []).length > 5 ? ` +${u.guilds.length - 5}` : '';
        const discordCell = u.discord_linked
          ? `<b>${App.escapeHtml('@' + (u.discord_username || u.discord_id))}</b><small style="display:block;color:var(--text-dim)">ID ${App.escapeHtml(u.discord_id)}</small>`
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

        const reload = async () => { await render(); };
        const unlink = row.querySelector('[data-unlink]');
        if (unlink) unlink.onclick = async () => {
          if (!(await App.confirm('Délier le compte Discord de cet utilisateur ? Son compte Nexora sera conservé, mais il devra relier Discord pour revenir.'))) return;
          try { await App.api(`/admin/users/${u.id}/unlink-discord`, { method: 'POST' }); App.toast('Compte Discord délié.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const ban = row.querySelector('[data-ban]');
        if (ban) ban.onclick = async () => {
          if (!(await App.confirm('Bannir cet utilisateur de Nexora ? Ses données seront conservées et le bannissement pourra être retiré.'))) return;
          const reason = await App.prompt('Raison du bannissement (optionnelle)', 'Abus de la plateforme');
          try { await App.api(`/admin/users/${u.id}/ban`, { method: 'POST', body: { reason } }); App.toast('Utilisateur banni de Nexora.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const unban = row.querySelector('[data-unban]');
        if (unban) unban.onclick = async () => {
          if (!(await App.confirm('Débannir cet utilisateur de Nexora ?'))) return;
          try { await App.api(`/admin/users/${u.id}/ban`, { method: 'DELETE' }); App.toast('Utilisateur débanni.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const del = row.querySelector('[data-delete]');
        if (del) del.onclick = async () => {
          if (!(await App.confirm('Supprimer définitivement ce compte et toutes ses données Nexora ? Cette action est irréversible.'))) return;
          try { await App.api(`/admin/users/${u.id}`, { method: 'DELETE' }); App.toast('Compte et données supprimés.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        tb.appendChild(row);
      });
      }

      const audit = auditRes.audit || [];
      const actionLabels = {
        unlink_discord: '🔗 Discord délié',
        ban_user: '⛔ Compte banni',
        unban_user: '✅ Compte débanni',
        delete_user: '🗑 Compte supprimé',
      };
      if (!audit.length) {
        auditEl.innerHTML = `<div class="empty-state">Aucune action sensible enregistrée.</div>`;
      } else {
        auditEl.innerHTML = `<div style="overflow-x:auto"><table class="leaderboard-table"><thead><tr><th>Date</th><th>Action</th><th>Par</th><th>Cible</th><th>Détail</th></tr></thead><tbody>${audit.slice(0, 50).map((entry) => `<tr><td>${App.escapeHtml(String(entry.created_at || '').slice(0, 16))}</td><td>${App.escapeHtml(actionLabels[entry.action] || entry.action)}</td><td>${App.escapeHtml(entry.actor || '')}</td><td>${App.escapeHtml(entry.target || '')}</td><td style="max-width:260px">${App.escapeHtml(entry.details || '')}</td></tr>`).join('')}</tbody></table></div>`;
      }
    } catch (e) {
      statsEl.innerHTML = `<div class="empty-state">${App.escapeHtml(e.message)}</div>`;
      usersEl.innerHTML = '';
    }
  };

  await render();
};

// ---------------------- Démarrage ----------------------
window.addEventListener('hashchange', () => App.router.run());
window.addEventListener('DOMContentLoaded', () => App.router.run());
if (document.readyState !== 'loading') App.router.run();
