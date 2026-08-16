// ============================================================
// BotDev - Pages publiques (dashboard public de Nexora)
// Stats synchronisées en direct depuis le processus du bot.
// ============================================================

App.fmtUptime = (seconds) => {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m} min`;
  return `${seconds}s`;
};

App.fmtNumber = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));

// ---------------------- Navbar publique ----------------------
App.renderPublicNavbar = () => {
  const user = App.state.user;
  const nav = App.el(`
    <div class="navbar">
      <div class="logo-row" style="cursor:pointer" id="pub-logo"><span class="logo">🤖</span> BotDev</div>
      <div class="navbar-right" id="pub-nav-right">
        ${user
          ? `<div class="user-pill">
               ${user.discord_avatar
                 ? `<img class="user-avatar" style="border-radius:50%" src="https://cdn.discordapp.com/avatars/${App.escapeHtml(user.discord_id)}/${App.escapeHtml(user.discord_avatar)}.png" alt="" />`
                 : `<div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>`}
               <span>${App.escapeHtml(user.discord_username || user.email)}</span>
               ${user.discord_id ? '<span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">🔗 Discord lié</span>' : ''}
             </div>
             ${user.discord_id
               ? `<button class="btn btn-primary btn-sm" id="pub-dash">📊 Mon dashboard</button>`
               : `<button class="btn btn-discord btn-sm" id="pub-link" style="width:auto">🎮 Lier mon Discord</button>
                  <button class="btn btn-ghost btn-sm" id="pub-dash">Dashboard</button>`}`
          : `<button class="btn btn-ghost btn-sm" id="pub-login">Se connecter</button>
             <button class="btn btn-primary btn-sm" id="pub-register">Créer un compte</button>`}
      </div>
    </div>
  `);
  nav.querySelector('#pub-logo').onclick = () => App.router.go(user ? '/dashboard' : '/');
  const dash = nav.querySelector('#pub-dash');
  if (dash) dash.onclick = () => App.router.go('/dashboard');
  const link = nav.querySelector('#pub-link');
  if (link) link.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };
  const login = nav.querySelector('#pub-login');
  if (login) login.onclick = () => App.router.go('/login');
  const register = nav.querySelector('#pub-register');
  if (register) register.onclick = () => App.router.go('/register');
  return nav;
};

// ---------------------- Page d'accueil publique ----------------------
App.renderPublicLanding = () => {
  const user = App.state.user;
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderPublicNavbar());

  const page = App.el(`
    <div id="public-landing">
      <div class="pub-hero">
        <div class="pub-hero-badge">🌐 Le dashboard public de Nexora — synchronisé en direct</div>
        <h1>Créez vos bots Discord<br/><span class="grad">sans écrire une ligne de code</span></h1>
        <p class="pub-tagline">Tickets automatiques, menus de rôles, modération, économie et bien plus.
        Tout se configure en quelques clics, directement depuis Discord ou depuis le dashboard.</p>
        <div class="pub-hero-actions">
          <button class="btn btn-primary" id="pub-invite-hero" style="padding:13px 22px;font-size:15px">➕ Ajouter Nexora à ton serveur</button>
          ${user
            ? (user.discord_id
                ? `<button class="btn" id="pub-dash-hero" style="padding:13px 22px;font-size:15px">📊 Ouvrir mon dashboard</button>`
                : `<button class="btn btn-discord" id="pub-link-hero" style="padding:13px 22px;font-size:15px;width:auto">🎮 Lier mon Discord</button>
                   <button class="btn" id="pub-dash-hero" style="padding:13px 22px;font-size:15px">Mon dashboard</button>`)
            : `<button class="btn" id="pub-register-hero" style="padding:13px 22px;font-size:15px">Créer mon compte gratuit</button>`}
        </div>
        <div class="pub-stats" id="pub-stats">
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Bots en ligne</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Serveurs Discord</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Membres touchés</div></div>
        </div>
      </div>

      <div class="pub-section">
        <h2>🤖 Nos bots</h2>
        <p class="pub-sub">Chaque bot a sa page publique avec ses statistiques en temps réel.</p>
        <div class="bots-grid" id="pub-bots"><div class="spinner"></div></div>
      </div>

      <div class="pub-section">
        <h2>✨ Tout ce que Nexora sait faire</h2>
        <div class="pub-features">
          <div class="pub-feature"><div class="f-ico">🎫</div><b>Tickets automatiques</b><p>Bouton → salon privé créé instantanément, avec rôle staff et fermeture en un clic.</p></div>
          <div class="pub-feature"><div class="f-ico">📋</div><b>Menus de rôles</b><p>Des menus déroulants où chaque membre choisit ses rôles tout seul.</p></div>
          <div class="pub-feature"><div class="f-ico">🛡️</div><b>Modération</b><p>Kick, ban, timeout, avertissements, purge de messages — réservé aux admins.</p></div>
          <div class="pub-feature"><div class="f-ico">💰</div><b>Économie</b><p>Coins quotidiens, soldes et classement du serveur.</p></div>
          <div class="pub-feature"><div class="f-ico">👋</div><b>Bienvenue & auto-rôles</b><p>Accueille les nouveaux membres et donne les rôles automatiquement.</p></div>
          <div class="pub-feature"><div class="f-ico">🧩</div><b>Commandes personnalisées</b><p>Construis tes propres commandes par blocs, sans coder.</p></div>
        </div>
      </div>

      <div class="pub-footer">
        Propulsé par <b>BotDev</b> — ${user ? '' : '<a href="#/login">Se connecter</a> · '}<a href="https://discord.com/developers/docs" target="_blank" rel="noopener">Documentation Discord</a>
      </div>
    </div>
  `);
  root.appendChild(page);

  const invite = (url) => App.openInvite(url);
  const heroInvite = page.querySelector('#pub-invite-hero');
  heroInvite.onclick = () => App.fetchFirstInviteUrl().then((url) => url ? invite(url) : App.toast('Aucun bot disponible pour l\'instant.', 'error'));
  const dashHero = page.querySelector('#pub-dash-hero');
  if (dashHero) dashHero.onclick = () => App.router.go('/dashboard');
  const linkHero = page.querySelector('#pub-link-hero');
  if (linkHero) linkHero.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };
  const regHero = page.querySelector('#pub-register-hero');
  if (regHero) regHero.onclick = () => App.router.go('/register');

  const statsEl = page.querySelector('#pub-stats');
  const botsEl = page.querySelector('#pub-bots');

  const loadStats = async () => {
    try {
      const s = await App.api('/public/stats');
      const vals = statsEl.querySelectorAll('.val');
      vals[0].textContent = `${s.onlineBots}/${s.totalBots}`;
      vals[1].textContent = App.fmtNumber(s.servers);
      vals[2].textContent = App.fmtNumber(s.members);
    } catch {}
  };

  const loadBots = async () => {
    try {
      const { bots } = await App.api('/public/bots');
      botsEl.innerHTML = '';
      if (!bots.length) {
        botsEl.innerHTML = `<div class="empty-state"><div class="big">🤖</div>Aucun bot public pour l'instant.</div>`;
        return;
      }
      bots.forEach((b) => {
        const avatar = b.avatar_url
          ? `<img class="bot-avatar" src="${App.escapeHtml(b.avatar_url)}" alt="" />`
          : `<div class="bot-avatar fallback">🤖</div>`;
        const card = App.el(`
          <div class="bot-card">
            <div class="bot-card-top">
              ${avatar}
              <div>
                <h3>${App.escapeHtml(b.name)}</h3>
                <div class="uname">${b.username ? '@' + App.escapeHtml(b.username) : 'jamais connecté'}</div>
              </div>
            </div>
            <div class="bot-card-status">
              <span class="dot ${b.online ? 'dot-online' : 'dot-offline'}"></span>
              ${b.online ? `En ligne — ${App.fmtNumber(b.servers)} serveur(s) · ${App.fmtNumber(b.members)} membres` : 'Hors ligne'}
            </div>
            <div class="bot-card-actions">
              <button class="btn btn-primary" data-view>Voir la page</button>
              <button class="btn" data-invite ${b.invite_url ? '' : 'disabled'}>Inviter</button>
            </div>
          </div>
        `);
        card.querySelector('[data-view]').onclick = () => App.router.go(`/bot/${b.id}`);
        card.querySelector('[data-invite]').onclick = () => { if (b.invite_url) invite(b.invite_url); };
        botsEl.appendChild(card);
      });
    } catch {}
  };

  loadStats();
  loadBots();
  const timer = setInterval(() => { loadStats(); loadBots(); }, 30000);
  App.currentPublicTimer && clearInterval(App.currentPublicTimer);
  App.currentPublicTimer = timer;
};

// Récupère le lien d'invitation du premier bot public
App.fetchFirstInviteUrl = async () => {
  try {
    const { bots } = await App.api('/public/bots');
    const online = bots.find((b) => b.invite_url);
    return online ? online.invite_url : null;
  } catch { return null; }
};

// ---------------------- Page publique d'un bot ----------------------
App.renderPublicBot = async (id) => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderPublicNavbar());

  const shell = App.el(`<div class="bot-shell"><div class="center-loading"><div class="spinner"></div></div></div>`);
  root.appendChild(shell);

  const render = async () => {
    let data;
    try {
      data = await App.api(`/public/bots/${id}`);
    } catch (e) {
      shell.innerHTML = `<div class="empty-state"><div class="big">🤖</div>${App.escapeHtml(e.message === 'Session expirée' ? 'Bot introuvable.' : e.message)}<br/><br/><button class="btn" onclick="location.hash='#/'">← Retour</button></div>`;
      return;
    }
    const b = data.bot;
    const avatar = b.avatar_url
      ? `<img class="pub-avatar" src="${App.escapeHtml(b.avatar_url)}" alt="" />`
      : `<div class="pub-avatar fallback">🤖</div>`;

    shell.innerHTML = `
      <div class="pub-bot-hero">
        <button class="btn btn-ghost btn-icon" id="pub-back" title="Retour">←</button>
        ${avatar}
        <div style="flex:1;min-width:0">
          <h2 style="font-size:22px">${App.escapeHtml(b.name)}</h2>
          <div class="sub">${b.username ? '@' + App.escapeHtml(b.username) : 'Bot non connecté'}</div>
          <div class="pub-bot-status" style="margin-top:8px">
            <span class="status-pill"><span class="dot ${b.online ? 'dot-online' : 'dot-offline'}"></span>${b.online ? 'En ligne' : 'Hors ligne'}</span>
            ${b.public_url ? `<span class="chip">🌐 ${App.escapeHtml(b.public_url)}</span>` : ''}
          </div>
        </div>
        <div class="pub-bot-actions">
          <button class="btn btn-primary" id="pub-invite" ${b.invite_url ? '' : 'disabled'}>➕ Ajouter à ton serveur</button>
          <button class="btn" id="pub-refresh">🔄 Actualiser</button>
        </div>
      </div>

      <div class="stats-grid" style="margin-top:18px">
        <div class="stat-card"><div class="val">${b.online ? App.fmtNumber(b.servers) : '—'}</div><div class="lbl">Serveurs</div></div>
        <div class="stat-card"><div class="val">${b.online ? App.fmtNumber(b.members) : '—'}</div><div class="lbl">Membres touchés</div></div>
        <div class="stat-card"><div class="val">${b.online ? b.ping + ' ms' : '—'}</div><div class="lbl">Latence</div></div>
        <div class="stat-card"><div class="val">${b.online ? App.fmtUptime(b.uptime) : '—'}</div><div class="lbl">Uptime</div></div>
      </div>

      <div class="card">
        <h3>📚 Commandes</h3>
        <div class="card-sub">Toutes ces commandes fonctionnent automatiquement sur chaque serveur où le bot est ajouté.</div>
        ${b.categories.map((cat) => `
          <div style="margin-bottom:14px">
            <div class="zone-label">${cat.emoji} ${App.escapeHtml(cat.label)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${cat.commands.map((c) => `<span class="chip" title="${App.escapeHtml(c.desc)}">/${c.name}</span>`).join('')}
            </div>
          </div>
        `).join('')}
        ${b.custom.length ? `
          <div style="margin-bottom:6px">
            <div class="zone-label">🧩 Commandes personnalisées</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${b.custom.map((c) => `<span class="chip" title="${App.escapeHtml(c.desc)}">${App.escapeHtml(c.trigger)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${!b.categories.length && !b.custom.length ? `<div class="empty-state">Aucune commande activée pour le moment.</div>` : ''}
        <div style="margin-top:14px;color:var(--text-dim);font-size:12px">💡 Une fois le bot sur ton serveur, tape <b>/help</b> pour le guide complet, et <b>/ticket setup</b> pour installer les tickets.</div>
      </div>

      <div class="pub-footer" style="text-align:left">Propulsé par <b>BotDev</b></div>
    `;
    shell.querySelector('#pub-back').onclick = () => App.router.go(App.state.user ? '/dashboard' : '/');
    shell.querySelector('#pub-invite').onclick = () => { if (b.invite_url) App.openInvite(b.invite_url); };
    shell.querySelector('#pub-refresh').onclick = render;
  };

  await render();
  const timer = setInterval(render, 30000);
  App.currentPublicTimer && clearInterval(App.currentPublicTimer);
  App.currentPublicTimer = timer;
};
