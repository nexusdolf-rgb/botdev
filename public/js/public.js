// ============================================================
// BotDev - Pages publiques (dashboard public de Hoxera)
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
      <div class="logo-row" style="cursor:pointer" id="pub-logo"><img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar de Nexora" style="border-radius:50%;object-fit:cover" /> Hoxera</div>
      <div class="navbar-right" id="pub-nav-right">
        ${user && user.discord_id
          ? `<div class="user-pill">
               ${user.discord_avatar
                 ? `<img class="user-avatar" style="border-radius:50%" src="https://cdn.discordapp.com/avatars/${App.escapeHtml(user.discord_id)}/${App.escapeHtml(user.discord_avatar)}.png" alt="" />`
                 : `<div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>`}
               <span>${App.escapeHtml(user.discord_username || user.email)}</span>
               <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">🔗</span>
             </div>
             <button class="btn btn-primary btn-sm" id="pub-dash">📊 Mon dashboard</button>`
          : `<button class="btn btn-discord btn-sm" id="pub-connect" style="width:auto">🎮 Se connecter avec Discord</button>`}
      </div>
    </div>
  `);
  nav.querySelector('#pub-logo').onclick = () => App.router.go(user ? '/dashboard' : '/');
  App.loadPublicBotAvatar(nav);
  const dash = nav.querySelector('#pub-dash');
  if (dash) dash.onclick = () => App.router.go('/dashboard');
  const link = nav.querySelector('#pub-link');
  if (link) link.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };
  const connectBtn = nav.querySelector('#pub-connect');
  if (connectBtn) connectBtn.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };
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
        <div class="pub-blob b1"></div><div class="pub-blob b2"></div><div class="pub-blob b3"></div>
        <div class="pub-particles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="pub-hero-badge shimmer">⚡ Hoxera — synchronisé en direct avec Discord</div>
        <h1 class="hero-title">Hoxera, ton bot Discord<br/><span class="grad grad-anim">français multitâche</span></h1>
        <p class="pub-rotline">Un bot pour <span class="pub-rot" id="pub-rot">La Modération</span></p>
        <div class="pub-hero-actions">
          <button class="btn btn-primary pub-btn-discord" id="pub-invite-hero">
            <svg viewBox="0 0 127.14 96.36" width="22" height="17" fill="currentColor" aria-hidden="true"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.03A97.68,97.68,0,0,0,49,6.03,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            Ajouter à Discord
          </button>
          ${user && user.discord_id
            ? `<button class="btn" id="pub-dash-hero">📊 Ouvrir mon dashboard</button>`
            : `<button class="btn btn-discord" id="pub-connect-hero" style="width:auto">🎮 Se connecter avec Discord</button>`}
        </div>
        <div class="pub-support-link"><a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">🆘 Rejoindre le serveur support officiel</a></div>
        <div class="pub-stats" id="pub-stats">
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Bots en ligne</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Serveurs Discord</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Membres touchés</div></div>
        </div>
        <div class="pub-wave" aria-hidden="true"><svg viewBox="0 0 1440 120" preserveAspectRatio="none"><path d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,120L0,120Z" fill="var(--bg)"/></svg></div>
      </div>

      <div class="db-feature reveal">
        <div class="db-visual" aria-hidden="true">
          <div class="dbv-discord">
            <div class="dbv-msg">
              <span class="dbv-ava">🤖</span>
              <div class="dbv-body">
                <div class="dbv-head"><b>Hoxera</b><span class="dbv-tag">BOT</span></div>
                <div class="dbv-embed"><b>Choisis tes rôles</b><span class="dbv-foot">Rôles à la carte</span></div>
                <div class="dbv-btns"><span>🎨 Graphiste</span><span>🎮 Joueur</span><span>📢 Annonces</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="db-content">
          <h2>Action Réaction</h2>
          <p>Un clic, un émoji et Hoxera réagit.</p>
          <p>Utilisez l'ensemble des commandes grâce aux réactions et aux menus de rôles, jusque dans les moindres détails.</p>
          <p>Tout est facile, accessible, intuitif. Alors réagissez !</p>
        </div>
      </div>

      <div class="db-feature rev reveal">
        <div class="db-visual" aria-hidden="true">
          <div class="dbv-rank">
            <div class="dbv-rank-card">
              <span class="dbv-medal">🥇</span>
              <div class="dbv-rank-info">
                <b>Niveau 24</b>
                <span class="dbv-bar"><i style="width:72%"></i></span>
                <small>12 480 / 17 300 XP</small>
              </div>
            </div>
            <div class="dbv-rank-row"><span class="dbv-coin">🪙</span><b>2 450</b><small>coins</small><span class="dbv-chip">🏅 Rôle « Actif » offert</span></div>
            <div class="dbv-rank-row"><span class="dbv-coin">🛒</span><b>Boutique</b><small>objets & bonus</small></div>
          </div>
        </div>
        <div class="db-content">
          <h2>Niveaux &amp; économie</h2>
          <p>Laissez vos membres se démarquer sur votre serveur grâce aux systèmes de niveaux et d'économie personnalisables.</p>
          <p>Vous pourrez afficher le classement, proposer des récompenses, une boutique et bien plus encore !</p>
        </div>
      </div>

      <div class="db-feature reveal">
        <div class="db-visual" aria-hidden="true">
          <div class="dbv-mod">
            <div class="dbv-mod-row"><span>⚠️</span><b>Avertissement</b><i>accumulés</i></div>
            <div class="dbv-mod-row"><span>🔇</span><b>Sourdine</b><i>temporisée</i></div>
            <div class="dbv-mod-row"><span>👢</span><b>Expulsion</b><i>avec motif</i></div>
            <div class="dbv-mod-row"><span>🔨</span><b>Bannissement</b><i>définitif</i></div>
            <div class="dbv-mod-foot">une seule commande · sanction progressive</div>
          </div>
        </div>
        <div class="db-content">
          <h2>Modération</h2>
          <p>Qui osera vous tenir tête avec Hoxera à vos côtés ?</p>
          <p>Avertissements, sourdine, expulsion ou bannissement — tous ces outils, individuels ou regroupés dans une seule commande de sanction, seront votre meilleure arme.</p>
        </div>
      </div>

      <div class="db-feature rev reveal">
        <div class="db-visual" aria-hidden="true">
          <div class="dbv-stats">
            <div class="dbv-stats-head"><b>Activité du serveur</b><span>7 jours</span></div>
            <div class="dbv-chart"><i style="height:34%"></i><i style="height:52%"></i><i style="height:41%"></i><i style="height:68%"></i><i style="height:59%"></i><i style="height:84%"></i><i style="height:72%"></i></div>
            <div class="dbv-stats-foot"><span>Messages</span><span>Arrivées</span><span>Commandes</span></div>
          </div>
        </div>
        <div class="db-content">
          <h2>Statistiques</h2>
          <p>Messages, arrivées, commandes les plus utilisées : Hoxera enregistre la vie de votre serveur.</p>
          <p>Consultez, partagez et comparez l'activité de votre communauté, jour après jour, depuis le dashboard.</p>
        </div>
      </div>

      <div class="pub-section reveal">
        <h2>🤖 Hoxera en direct</h2>
        <p class="pub-sub">Statistiques en temps réel, lues directement depuis Discord.</p>
        <div class="bots-grid" id="pub-bots"><div class="spinner"></div></div>
      </div>

      <div class="pub-section reveal">
        <h2>📊 Un dashboard digne des plus grands</h2>
        <p class="pub-sub">Configure tout depuis ton téléphone ou ton PC — design pro, sauvegarde intelligente, flux d'activité en direct.</p>
        <div class="pub-mock">
          <div class="mock-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="mock-url">hoxera.is-a.dev</span></div>
          <div class="mock-body">
            <div class="mock-side">
              <div class="mock-srv"><span class="ms-ico">N</span><span class="ms-lines"><i></i><i></i></span></div>
              <div class="mock-item active"></div><div class="mock-item"></div><div class="mock-item"></div><div class="mock-item"></div><div class="mock-item"></div>
            </div>
            <div class="mock-main">
              <div class="mock-stats"><div class="mock-stat"></div><div class="mock-stat"></div><div class="mock-stat"></div></div>
              <div class="mock-card"><div class="mc-line w60"></div><div class="mc-line w90"></div><div class="mc-line w75"></div></div>
              <div class="mock-card"><div class="mc-line w40"></div><div class="mc-bar"></div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="pub-section reveal">
        <h2>✨ Tout ce que Hoxera sait faire</h2>
        <div class="pub-features">
          <div class="pub-feature reveal"><div class="f-ico">🎫</div><b>Tickets automatiques</b><p>Bouton → salon privé créé instantanément, avec rôle staff, types personnalisés et transcription en MP.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">📋</div><b>Rôles en menus & boutons</b><p>Menus déroulants ou boutons : chaque membre choisit ses rôles tout seul.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">🛡️</div><b>Modération & anti-raid</b><p>Kick, ban, timeout, avertissements, liste noire et verrouillage du serveur en 1 clic.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">💰</div><b>Économie</b><p>Coins quotidiens, travail, paris, boutique et classement du serveur.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">🕹️</div><b>Jeux & fun</b><p>Pendu, morpion, pierre-feuille-ciseaux, mariages et actions entre membres.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">🎂</div><b>Anniversaires & rappels</b><p>Le bot souhaite les anniversaires et envoie des rappels en message privé.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">🗳️</div><b>Sondages & suggestions</b><p>Votes en direct avec boutons, suggestions approuvées depuis le dashboard.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">🔊</div><b>Salons vocaux temporaires</b><p>Un clic pour créer ton vocal, supprimé automatiquement quand il est vide.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">📅</div><b>Annonces programmées</b><p>Messages automatiques aux jours et heures choisis, configurés depuis le dashboard.</p></div>
          <div class="pub-feature reveal"><div class="f-ico">👥</div><b>Dashboard complet</b><p>Membres gérables, statistiques, coins, rôles et kick — tout depuis ton téléphone.</p></div>
        </div>
      </div>

      <div class="pub-footer">
        <div class="pub-footer-grid">
          <div class="pub-footer-col pub-footer-brand">
            <b>⚡ Hoxera</b>
            <p>Le bot français qui anime ton serveur Discord : tickets, niveaux, économie et modération.</p>
          </div>
          <div class="pub-footer-col">
            <b>Navigation</b>
            <a href="#" id="pub-foot-home">Accueil</a>
            <a href="#" id="pub-foot-dash">Dashboard</a>
            <a href="https://hoxera.is-a.dev/api/health/bot" target="_blank" rel="noopener">Statut du service</a>
          </div>
          <div class="pub-footer-col">
            <b>Communauté</b>
            <a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">🆘 Serveur support</a>
            <a href="https://discord.com/oauth2/authorize?client_id=1537443352281088000&scope=bot+applications.commands&permissions=8" target="_blank" rel="noopener">➕ Ajouter le bot</a>
          </div>
        </div>
        <div class="pub-footer-bottom">
          <span>© 2026 Hoxera — fait avec ❤️ pour les communautés francophones</span>
        </div>
      </div>
    </div>
  `);
  root.appendChild(page);

  const invite = (url) => App.openInvite(url);
  const heroInvite = page.querySelector('#pub-invite-hero');
  heroInvite.onclick = () => App.fetchFirstInviteUrl().then((url) => url ? invite(url) : App.toast('Aucun bot disponible pour l\'instant.', 'error'));
  const dashHero = page.querySelector('#pub-dash-hero');
  if (dashHero) dashHero.onclick = () => App.router.go('/dashboard');
  const connectHero = page.querySelector('#pub-connect-hero');
  if (connectHero) connectHero.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };

  const footDash = page.querySelector('#pub-foot-dash');
  if (footDash) footDash.onclick = (e) => { e.preventDefault(); App.router.go('/dashboard'); };
  const footHome = page.querySelector('#pub-foot-home');
  if (footHome) footHome.onclick = (e) => { e.preventDefault(); App.router.go('/'); };

  // 🎠 « Un bot pour … » — le mot tourne (façon DraftBot)
  const rotEl = page.querySelector('#pub-rot');
  if (rotEl) {
    const rotWords = ['La Modération', 'Les Niveaux', 'L\'Économie', 'Les Réactions', 'L\'Automatisation', 'Les Statistiques', 'Les Conversations', 'Les Informations', 'Des Outils', 'Le Contrôle'];
    let rotI = 0;
    setInterval(() => {
      rotEl.classList.add('out');
      setTimeout(() => {
        rotI = (rotI + 1) % rotWords.length;
        rotEl.textContent = rotWords[rotI];
        rotEl.classList.remove('out');
      }, 240);
    }, 2600);
  }

  // 🎬 Révélation au défilement (dégradation propre si non supporté)
  try {
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      page.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 6, 4) * 60}ms`; io.observe(el); });
    } else {
      page.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    }
  } catch { page.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')); }

  // 🔢 Compteur animé (chiffres qui montent)
  const countUp = (el, text) => {
    const num = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
    if (!num || num < 10 || typeof requestAnimationFrame === 'undefined') { el.textContent = text; return; }
    const t0 = Date.now(); const dur = 900;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = App.fmtNumber(Math.round(num * eased));
      if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
    };
    tick();
  };

  const statsEl = page.querySelector('#pub-stats');
  const botsEl = page.querySelector('#pub-bots');

  const loadStats = async () => {
    try {
      const s = await App.api('/public/stats');
      const vals = statsEl.querySelectorAll('.val');
      vals[0].textContent = `${s.onlineBots}/${s.totalBots}`;
      countUp(vals[1], App.fmtNumber(s.servers));
      countUp(vals[2], App.fmtNumber(s.members));
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

      <div class="pub-footer" style="text-align:left"><b>⚡ Hoxera</b> — ajoute-le à ton serveur, puis configure-le avec ton compte Discord.</div>
    `;
    shell.querySelector('#pub-back').onclick = () => App.router.go(App.state.user && App.state.user.discord_id ? '/dashboard' : '/');
    shell.querySelector('#pub-invite').onclick = () => { if (b.invite_url) App.openInvite(b.invite_url); };
    shell.querySelector('#pub-refresh').onclick = render;
  };

  await render();
  const timer = setInterval(render, 30000);
  App.currentPublicTimer && clearInterval(App.currentPublicTimer);
  App.currentPublicTimer = timer;
};
