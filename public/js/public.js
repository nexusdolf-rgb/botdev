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
    <div id="public-landing" class="dh">
      <div class="dh-hero">
        <canvas id="dh-particles" class="dh-particles"></canvas>
        <div class="dh-bot-part">
          <div class="dh-logo"><img src="/api/public/bot-avatar" alt="Avatar de Nexora" /></div>
          <div class="dh-title">
            <div class="dh-description">Hoxera, ton bot Discord français multitâche</div>
            <div class="dh-activities">Un bot pour&nbsp;<span class="dh-rot visible" id="dh-rot">La Modération</span></div>
          </div>
          <button class="dh-invite" id="pub-invite-hero">
            <svg viewBox="0 0 127.14 96.36" width="22" height="24" fill="currentColor" aria-hidden="true"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.03A97.68,97.68,0,0,0,49,6.03,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            Ajouter à Discord
          </button>
        </div>
        <div class="dh-wave-container" aria-hidden="true"><div class="dh-wave"></div></div>
      </div>

      <div class="dh-features">
        <div class="dh-features-content">
          <div class="dh-feature reveal">
            <div class="dh-image" aria-hidden="true">
              <div class="dbv-discord">
                <div class="dbv-msg">
                  <span class="dbv-ava">🤖</span>
                  <div class="dbv-body">
                    <div class="dbv-head"><b>Hoxera</b><span class="dbv-tag">BOT</span></div>
                    <div class="dbv-embed"><b>Choisis tes rôles</b><small>Un clic, et le rôle est à toi.</small><span class="dbv-foot">Rôles à la carte</span></div>
                    <div class="dbv-btns"><span>🎨 Graphiste</span><span>🎮 Joueur</span><span>📢 Annonces</span></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="dh-content">
              <div class="dh-f-title"><h2>Action Réaction</h2></div>
              <p>Un clic, un émoji et Hoxera réagit.</p>
              <p>Utilisez les menus de rôles à boutons, réactions ou sélections, jusque dans les moindres détails.</p>
              <p>Tout est facile, accessible, intuitif. Alors réagissez !</p>
            </div>
          </div>

          <div class="dh-feature reveal">
            <div class="dh-image" aria-hidden="true">
              <div class="dbv-rank">
                <div class="dbv-rank-card">
                  <span class="dbv-medal">🥇</span>
                  <div class="dbv-rank-info">
                    <b>Niveau 24</b>
                    <span class="dbv-bar"><i style="width:72%"></i></span>
                    <small>12 480 / 17 300 XP</small>
                  </div>
                </div>
                <div class="dbv-rank-row"><span class="dbv-coin">🪙</span><b>2 450</b><small>coins</small><span class="dbv-chip">🏅 Rôle « Actif »</span></div>
                <div class="dbv-rank-row"><span class="dbv-coin">🛒</span><b>Boutique</b><small>objets & bonus</small></div>
              </div>
            </div>
            <div class="dh-content">
              <div class="dh-f-title"><h2>Niveaux &amp; économie</h2></div>
              <p>Laissez vos membres se démarquer sur votre serveur grâce aux systèmes de niveaux et d'économie personnalisables.</p>
              <p>Vous pourrez afficher le classement, proposer des récompenses, une boutique et bien plus encore !</p>
            </div>
          </div>

          <div class="dh-feature reveal">
            <div class="dh-image" aria-hidden="true">
              <div class="dbv-mod">
                <div class="dbv-mod-row"><span>⚠️</span><b>Avertissement</b><i>accumulés</i></div>
                <div class="dbv-mod-row"><span>🔇</span><b>Sourdine</b><i>temporisée</i></div>
                <div class="dbv-mod-row"><span>👢</span><b>Expulsion</b><i>avec motif</i></div>
                <div class="dbv-mod-row"><span>🔨</span><b>Bannissement</b><i>définitif</i></div>
                <div class="dbv-mod-foot">une seule commande de sanction</div>
              </div>
            </div>
            <div class="dh-content">
              <div class="dh-f-title"><h2>Modération</h2></div>
              <p>Qui osera vous tenir tête avec Hoxera à vos côtés ?</p>
              <p>Avertissements, sourdine, expulsion ou bannissement, tous ces outils individuels ou regroupés dans une seule commande de sanction seront votre meilleure arme.</p>
            </div>
          </div>

          <div class="dh-feature reveal">
            <div class="dh-image" aria-hidden="true">
              <div class="dbv-stats">
                <div class="dbv-stats-head"><b>Activité du serveur</b><span>7 jours</span></div>
                <div class="dbv-chart"><i style="height:34%"></i><i style="height:52%"></i><i style="height:41%"></i><i style="height:68%"></i><i style="height:59%"></i><i style="height:84%"></i><i style="height:72%"></i></div>
                <div class="dbv-stats-foot"><span>Messages</span><span>Arrivées</span><span>Commandes</span></div>
              </div>
            </div>
            <div class="dh-content">
              <div class="dh-f-title"><h2>Statistiques</h2></div>
              <p>Messages, arrivées, commandes les plus utilisées : Hoxera enregistre la vie de votre serveur.</p>
              <p>Consultez, partagez et comparez l'activité de votre communauté, jour après jour, depuis le dashboard.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="dh-footer">
        <div class="dh-footer-content">
          <div class="dh-footer-item dh-footer-logo">
            <div class="dh-logo-mini">⚡</div>
            <b>Hoxera</b>
          </div>
          <div class="dh-footer-item">
            <div class="item-title">Navigation</div>
            <a href="#" id="pub-foot-home">Accueil</a>
            <a href="#" id="pub-foot-dash">Dashboard</a>
            <a href="https://hoxera.is-a.dev/api/health/bot" target="_blank" rel="noopener">Statut du service</a>
          </div>
          <div class="dh-footer-item">
            <div class="item-title">Communauté</div>
            <a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">Serveur support</a>
            <a href="https://discord.com/oauth2/authorize?client_id=1537443352281088000&scope=bot+applications.commands&permissions=8" target="_blank" rel="noopener">Ajouter le bot</a>
          </div>
        </div>
        <div class="dh-footer-legal"><a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">Support Discord</a></div>
        <div class="dh-footer-copyright"><span class="text">Copyright © 2026 Hoxera — Tous droits réservés</span></div>
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

  // 🎠 « Un bot pour … » — fondu push-in/push-out (façon DraftBot)
  const rotEl = page.querySelector('#dh-rot');
  if (rotEl) {
    const rotWords = ['La Modération', 'Les Niveaux', 'L\'Économie', 'Les Réactions', 'L\'Automatisation', 'Les Statistiques', 'Les Conversations', 'Les Informations', 'Des Outils', 'Le Contrôle'];
    let rotI = 0;
    setInterval(() => {
      rotEl.classList.remove('visible');
      setTimeout(() => {
        rotI = (rotI + 1) % rotWords.length;
        rotEl.textContent = rotWords[rotI];
        rotEl.classList.add('visible');
      }, 450);
    }, 2800);
  }

  // ✨ Particules reliées (façon DraftBot)
  const canvas = page.querySelector('#dh-particles');
  if (canvas && canvas.getContext) {
    try {
      const ctx = canvas.getContext('2d');
      const resize = () => { canvas.width = canvas.offsetWidth || 600; canvas.height = canvas.offsetHeight || 600; };
      resize();
      const N = Math.max(18, Math.min(40, Math.floor(canvas.width / 30)));
      const pts = [];
      for (let k = 0; k < N; k++) pts.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5 });
      const tick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pts.forEach((p) => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
          if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        });
        ctx.strokeStyle = 'rgba(205,110,87,.16)'; ctx.lineWidth = 1;
        for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
          const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130) { ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke(); }
        }
        ctx.fillStyle = 'rgba(205,110,87,.5)';
        pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill(); });
        requestAnimationFrame(tick);
      };
      tick();
      window.addEventListener('resize', resize);
    } catch {}
  }

  // 🎬 Révélation au défilement (dégradation propre si non supporté)
  try {
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      page.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 6, 4) * 60}ms`; io.observe(el); });
      page.querySelectorAll('.dh-feature').forEach((el) => io.observe(el));
    } else {
      page.querySelectorAll('.reveal, .dh-feature').forEach((el) => el.classList.add('in'));
    }
  } catch {}

};
