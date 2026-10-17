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
App.renderPublicNavbar = (withLandingLinks = false) => {
  const user = App.state.user;
  const nav = App.el(`
    <div class="navbar">
      <div class="logo-row" style="cursor:pointer" id="pub-logo"><img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar d’Hoxera" style="border-radius:50%;object-fit:cover" /> Hoxera</div>
      ${withLandingLinks ? `
      <nav class="navbar-links" aria-label="Navigation de la page d'accueil">
        <a href="#hp-about" data-anchor="hp-about">Hoxera</a>
        <a href="#hp-features" data-anchor="hp-features">Fonctionnalités</a>
        <a href="#hp-preview" data-anchor="hp-preview">Aperçu</a>
        <a href="#hp-faq" data-anchor="hp-faq">FAQ</a>
      </nav>` : ''}
      <div class="navbar-right" id="pub-nav-right">
        ${user && user.discord_id
          ? `<div class="user-pill">
               ${user.discord_avatar
                 ? `<img class="user-avatar" style="border-radius:50%" src="/api/img?u=${encodeURIComponent(`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=64`)}" alt="" data-fb-text="${App.escapeHtml((user.discord_username || user.email || '?').trim().slice(0, 1).toUpperCase())}" />`
                 : `<div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>`}
               <span>${App.escapeHtml(user.discord_username || user.email)}</span>
               <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10.2 13.8a3.6 3.6 0 0 0 5.2.2l2.6-2.6a3.7 3.7 0 0 0-5.2-5.2l-1.4 1.4"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.2-.2L6 12.6a3.7 3.7 0 0 0 5.2 5.2l1.4-1.4"/></svg></span>
             </div>
             <button class="btn btn-primary btn-sm" id="pub-dash">Mon dashboard</button>`
          : `<button class="btn btn-discord btn-sm" id="pub-connect" style="width:auto">Se connecter avec Discord</button>`}
      </div>
    </div>
  `);
  nav.querySelector('#pub-logo').onclick = () => App.router.go(user ? '/dashboard' : '/');
  if (withLandingLinks) {
    nav.querySelectorAll('[data-anchor]').forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        const el = document.getElementById(a.dataset.anchor);
        if (el) {
          const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch { el.scrollIntoView(); }
        }
      };
    });
  }
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
  root.appendChild(App.renderPublicNavbar(true));

  const page = App.el(`
    <div id="public-landing">
      <div class="pub-hero">
        <div class="pub-blob b1"></div><div class="pub-blob b2"></div><div class="pub-blob b3"></div>
        <div class="pub-hero-badge shimmer">Hoxera · synchronisé en direct avec Discord</div>
        <h1 class="hero-title">Le bot qui anime<br/><span class="grad grad-anim">votre serveur Discord</span></h1>
        <p class="pub-tagline">Tickets automatiques avec transcriptions, niveaux XP, boutique, giveaways, bienvenue et modération.
        Ajoutez Hoxera à votre serveur, puis configurez tout depuis le dashboard avec votre compte Discord.</p>
        <div class="pub-hero-actions">
          <button class="btn btn-primary" id="pub-invite-hero" style="padding:13px 22px;font-size:16px">Ajouter Hoxera à votre serveur</button>
          ${user && user.discord_id
            ? `<button class="btn" id="pub-dash-hero" style="padding:13px 22px;font-size:16px">Ouvrir mon dashboard</button>`
            : `<button class="btn btn-discord" id="pub-connect-hero" style="padding:13px 22px;font-size:16px;width:auto">Se connecter avec Discord</button>`}
        </div>
        <div class="pub-support-link"><a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">Rejoindre le serveur support officiel</a></div>
        <div class="pub-stats" id="pub-stats">
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Bots en ligne</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Serveurs Discord</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Membres touchés</div></div>
        </div>
      </div>

      <!-- 🎯 Présentation Hoxera -->
      <div class="pub-section reveal hp-section" id="hp-about">
        <div class="hp-kicker">Hoxera en bref</div>
        <h2>Le robot d'animation, pensé comme un produit</h2>
        <p class="pub-sub">Pas juste une liste de commandes : une expérience complète, du premier message d'accueil au journal d'audit, en passant par un dashboard qui vous fait gagner du temps.</p>
        <div class="hp-about-grid">
          <div class="hp-about-card">
            <div class="hp-robot" aria-hidden="true"><img src="/api/public/bot-avatar" alt="Hoxera" /></div>
            <div>
              <h3>Le bot et le dashboard sont le même service</h3>
              <p>Le bot dans Discord et le tableau de bord lisent la même configuration : ce que vous réglez ici s'applique au serveur, sans étape intermédiaire.</p>
            </div>
          </div>
          <div class="hp-pillars">
            <div class="hp-pillar"><div class="hp-pillar-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M13.4 2.6 5.6 13.4h4.8L9 21.4l8.6-11.2h-5l.8-7.6Z"/></svg></div><div><b>Immédiat</b><p>Configuré en quelques minutes, fonctionne dès l'ajout.</p></div></div>
            <div class="hp-pillar"><div class="hp-pillar-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l7 2.8v5.6c0 4.2-2.9 7.3-7 8.6-4.1-1.3-7-4.4-7-8.6V6l7-2.8Z"/><path d="M9 12.1l2 2 4-4"/></g></svg></div><div><b>Sûr</b><p>Le bot ne demande que les permissions dont il a besoin, et chaque action tenue dans le dashboard reste écrite dans le journal.</p></div></div>
            <div class="hp-pillar"><div class="hp-pillar-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6.6" y="2.8" width="10.8" height="18.4" rx="2.4"/><path d="M10.4 18.2h3.2"/></svg></div><div><b>Partout</b><p>Dashboard complet sur téléphone comme sur PC.</p></div></div>
            <div class="hp-pillar"><div class="hp-pillar-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4.6l9 4.4-9 4.4-9-4.4 9-4.4Z"/><path d="M7 11.4v4.2c0 1.6 2.4 2.8 5 2.8s5-1.2 5-2.8v-4.2"/></svg></div><div><b>Simple</b><p>Menus et aides intégrés : pas besoin d'être expert.</p></div></div>
          </div>
        </div>
        <div class="hp-steps">
          <div class="hp-step"><span class="hp-step-n">1</span><b>Ajoutez le bot</b><p>Un clic sur « Ajouter Hoxera », choisissez votre serveur.</p></div>
          <div class="hp-step"><span class="hp-step-n">2</span><b>Connectez-vous</b><p>Identifiez-vous avec Discord pour accéder à votre dashboard.</p></div>
          <div class="hp-step"><span class="hp-step-n">3</span><b>Configurez</b><p>Activez les modules et personnalisez votre serveur en direct.</p></div>
        </div>
      </div>

      <div class="pub-section reveal hp-section" id="hp-features">
        <span class="hp-kicker">Fonctionnalités</span>
        <h2>Tout ce que Hoxera sait faire</h2>
        <div class="pub-features">
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 9a3 3 0 0 0 0 6v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a3 3 0 0 1 0-6V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/></svg></div><b>Tickets automatiques</b><p>Bouton → salon privé créé instantanément, avec rôle staff, types personnalisés et transcription en MP.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="4.6" width="14" height="16.2" rx="2.2"/><path d="M9 4.6V3.2h6v1.4"/><path d="M8.4 11h7.2M8.4 15h5"/></svg></div><b>Rôles en menus & boutons</b><p>Menus déroulants ou boutons : chaque membre choisit ses rôles tout seul.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l7 2.8v5.6c0 4.2-2.9 7.3-7 8.6-4.1-1.3-7-4.4-7-8.6V6l7-2.8Z"/><path d="M9 12.1l2 2 4-4"/></g></svg></div><b>Modération & anti-raid</b><p>Kick, ban, timeout, avertissements, liste noire et verrouillage du serveur en 1 clic.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="2.6" y="6.6" width="18.8" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.6M17.4 12h.6"/></svg></div><b>Économie</b><p>Coins quotidiens, travail, paris, boutique et classement du serveur.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 8.4v7.2M9.6 10.2a2.4 1.8 0 0 1 4.8 0c0 1.8-4.8 1.2-4.8 3a2.4 1.8 0 0 0 4.8 0"/></g></svg></div><b>Jeux & fun</b><p>Pendu, morpion, pierre-feuille-ciseaux, mariages et actions entre membres.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3.8" y="5.6" width="16.4" height="15" rx="2.2"/><path d="M3.8 10h16.4M8.4 3.8v3.2M15.6 3.8v3.2"/><path d="M7.6 13.6h2v2h-2zM14.4 13.6h2v2h-2z"/></svg></div><b>Anniversaires & rappels</b><p>Le bot souhaite les anniversaires et envoie des rappels en message privé.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.4h16M5.4 15.4l4-4.6 3.2 2.6 5.6-5.8"/></g></svg></div><b>Sondages & suggestions</b><p>Votes en direct avec boutons, suggestions approuvées depuis le dashboard.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4.4 9.6h3l4.4-3.8v12.4l-4.4-3.8h-3V9.6Z"/><path d="M16.4 8.6a5.2 5.2 0 0 1 0 6.8M18.8 6.2a8.6 8.6 0 0 1 0 11.6"/></svg></div><b>Salons vocaux temporaires</b><p>Un clic pour créer votre vocal, supprimé automatiquement quand il est vide.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3.8" y="5.6" width="16.4" height="15" rx="2.2"/><path d="M3.8 10h16.4M8.4 3.8v3.2M15.6 3.8v3.2"/><path d="M7.6 13.6h2v2h-2zM14.4 13.6h2v2h-2z"/></svg></div><b>Annonces programmées</b><p>Messages automatiques aux jours et heures choisis, configurés depuis le dashboard.</p></div>
          <div class="pub-feature reveal"><div class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="9" cy="8.6" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.2 5.9a3.2 3.2 0 0 1 0 5.5M17.6 14.6A6 6 0 0 1 21 20"/></svg></div><b>Dashboard complet</b><p>Membres gérables, statistiques, coins, rôles et kick se règlent depuis le téléphone.</p></div>
        </div>
      </div>

      <div class="pub-section reveal">
        <h2>Hoxera en direct</h2>
        <p class="pub-sub">Statistiques en temps réel, lues directement depuis Discord.</p>
        <div class="bots-grid" id="pub-bots"><div class="spinner"></div></div>
      </div>

      <div class="pub-section reveal hp-section" id="hp-preview">
        <span class="hp-kicker">Aperçu</span>
        <h2>Un dashboard digne des plus grands</h2>
        <p class="pub-sub">Configurez tout depuis votre téléphone ou votre PC — design pro, sauvegarde intelligente, flux d'activité en direct.</p>
        <div class="pub-mock">
          <div class="mock-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="mock-url">hoxera.is-a.dev</span></div>
          <div class="mock-body">
            <div class="mock-side">
              <div class="mock-srv"><span class="ms-ico">H</span><span class="ms-lines"><i></i><i></i></span></div>
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

      <!-- ❓ FAQ -->
      <div class="pub-section reveal hp-section" id="hp-faq">
        <span class="hp-kicker">FAQ</span>
        <h2>Questions fréquentes</h2>
        <div class="hp-faq">
          <details class="hp-faq-item" open>
            <summary>Est-ce que Hoxera est gratuit ?</summary>
            <p>Oui. Toutes les fonctions sont incluses, sans abonnement et sans compte à séparer du compte Discord.</p>
          </details>
          <details class="hp-faq-item">
            <summary>Quelles permissions Discord sont nécessaires ?</summary>
            <p>Le bot demande les permissions « Administrateur » lors de l'ajout pour pouvoir créer des salons (tickets), gérer les rôles (auto-rôles, giveaways) et modérer (kick, ban, timeout). Vous pouvez les ajuster ensuite dans les réglages de votre serveur.</p>
          </details>
          <details class="hp-faq-item">
            <summary>Comment fonctionne la connexion au dashboard ?</summary>
            <p>Uniquement avec votre compte Discord (OAuth2). Aucun mot de passe à retenir : vous vous connectez, on vérifie vos serveurs et votre permission, et vous configurez vos serveurs en quelques clics.</p>
          </details>
          <details class="hp-faq-item">
            <summary>Le bot fonctionne-t-il sur mobile ?</summary>
            <p>Oui. Le dashboard est entièrement responsive : navigation en bas d'écran, menus glissants, et toutes les fonctions sont accessibles depuis un téléphone.</p>
          </details>
          <details class="hp-faq-item">
            <summary>Mes données sont-elles en sécurité ?</summary>
            <p>Oui. Le token du bot n'est jamais renvoyé au navigateur, les transcriptions de tickets utilisent des liens difficiles à deviner (128 bits), et un journal de sécurité trace les actions sensibles.</p>
          </details>
          <details class="hp-faq-item">
            <summary>Comment obtenir de l'aide ?</summary>
            <p>Rejoins le serveur support officiel (lien dans le menu et le pied de page) : la communauté et l'équipe répondent rapidement, en français.</p>
          </details>
        </div>
      </div>

      <!-- 🚀 CTA final -->
      <div class="hp-cta reveal">
        <div class="hp-cta-inner">
          <h2>Prêt à donner vie à votre serveur ?</h2>
          <p>Ajoutez Hoxera maintenant : c'est gratuit, sans compte à créer côté Hoxera et sans engagement.</p>
          <div class="hp-cta-actions">
            <button class="btn btn-primary" id="pub-invite-cta" style="padding:13px 22px;font-size:16px">Ajouter Hoxera à votre serveur</button>
            ${user && user.discord_id
              ? `<button class="btn" id="pub-dash-cta" style="padding:13px 22px;font-size:16px">Ouvrir mon dashboard</button>`
              : `<button class="btn btn-discord" id="pub-connect-cta" style="padding:13px 22px;font-size:16px;width:auto">Se connecter avec Discord</button>`}
          </div>
        </div>
      </div>

      <div class="pub-footer hp-footer">
        <div class="hp-footer-cols">
          <div class="hp-footer-col">
            <div class="hp-footer-brand"><b>Hoxera</b><p>Modération, tickets, niveaux, bienvenue : un bot et son tableau de bord pour un serveur Discord.</p></div>
          </div>
          <div class="hp-footer-col">
            <b>Produit</b>
            <a href="#hp-about" data-anchor="hp-about">Présentation</a>
            <a href="#hp-features" data-anchor="hp-features">Fonctionnalités</a>
            <a href="#hp-preview" data-anchor="hp-preview">Aperçu du dashboard</a>
            <a href="#hp-faq" data-anchor="hp-faq">FAQ</a>
          </div>
          <div class="hp-footer-col">
            <b>Accès</b>
            <a href="#" id="pub-foot-dash">Dashboard</a>
            <a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">Serveur support</a>
          </div>
        </div>
        <div class="hp-footer-bottom">
          <span>© ${new Date().getFullYear()} Hoxera — Optimus Prime</span>
          <div class="pub-footer-links">
            <a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">Serveur support</a>
            <span>·</span>
            <a href="#" id="pub-foot-dash-2">Dashboard</a>
          </div>
        </div>
      </div>
    </div>
  `);
  root.appendChild(page);

  const invite = (url) => App.openInvite(url);
  const heroInvite = page.querySelector('#pub-invite-hero');
  heroInvite.onclick = () => App.fetchFirstInviteUrl().then((url) => url ? invite(url) : App.toast('Aucun bot disponible pour l\'instant.', 'error'));
  const ctaInvite = page.querySelector('#pub-invite-cta');
  if (ctaInvite) ctaInvite.onclick = () => App.fetchFirstInviteUrl().then((url) => url ? invite(url) : App.toast('Aucun bot disponible pour l\'instant.', 'error'));
  const dashHero = page.querySelector('#pub-dash-hero');
  if (dashHero) dashHero.onclick = () => App.router.go('/dashboard');
  const dashCta = page.querySelector('#pub-dash-cta');
  if (dashCta) dashCta.onclick = () => App.router.go('/dashboard');
  const connectHero = page.querySelector('#pub-connect-hero');
  if (connectHero) connectHero.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };
  const connectCta = page.querySelector('#pub-connect-cta');
  if (connectCta) connectCta.onclick = async () => {
    try { const { url } = await App.api('/auth/discord/url'); window.location.href = url; }
    catch (e) { App.toast(e.message, 'error'); }
  };

  const footDash = page.querySelector('#pub-foot-dash');
  if (footDash) footDash.onclick = (e) => { e.preventDefault(); App.router.go('/dashboard'); };
  const footDash2 = page.querySelector('#pub-foot-dash-2');
  if (footDash2) footDash2.onclick = (e) => { e.preventDefault(); App.router.go('/dashboard'); };
  page.querySelectorAll('[data-anchor]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      const el = document.getElementById(a.dataset.anchor);
      if (el) {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch { el.scrollIntoView(); }
      }
    };
  });

  // Révélation au défilement (dégradation propre si non supporté)
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

  // Compteur animé (chiffres qui montent)
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
        botsEl.innerHTML = `<div class="empty-state"><div class="big">${App.glyphe('robot', { taille: 26 })}</div>Aucun bot public pour l'instant.</div>`;
        return;
      }
      bots.forEach((b) => {
        const avatar = b.avatar_url
          ? `<img class="bot-avatar" src="${App.escapeHtml(b.avatar_url)}" alt="" />`
          : `<div class="bot-avatar fallback">${App.glyphe('robot', { taille: 16 })}</div>`;
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
      shell.innerHTML = `<div class="empty-state"><div class="big">${App.glyphe('robot', { taille: 26 })}</div>${App.escapeHtml(e.message === 'Session expirée' ? 'Bot introuvable.' : e.message)}<br/><br/><button class="btn" onclick="location.hash='#/'">← Retour</button></div>`;
      return;
    }
    const b = data.bot;
    const avatar = b.avatar_url
      ? `<img class="pub-avatar" src="${App.escapeHtml(b.avatar_url)}" alt="" />`
      : `<div class="pub-avatar fallback">${App.glyphe('robot', { taille: 16 })}</div>`;

    shell.innerHTML = `
      <div class="pub-bot-hero">
        <button class="btn btn-ghost btn-icon" id="pub-back" title="Retour">←</button>
        ${avatar}
        <div style="flex:1;min-width:0">
          <h2 style="font-size:22px">${App.escapeHtml(b.name)}</h2>
          <div class="sub">${b.username ? '@' + App.escapeHtml(b.username) : 'Bot non connecté'}</div>
          <div class="pub-bot-status" style="margin-top:8px">
            <span class="status-pill"><span class="dot ${b.online ? 'dot-online' : 'dot-offline'}"></span>${b.online ? 'En ligne' : 'Hors ligne'}</span>
            ${b.public_url ? `<span class="chip">${App.escapeHtml(b.public_url)}</span>` : ''}
          </div>
        </div>
        <div class="pub-bot-actions">
          <button class="btn btn-primary" id="pub-invite" ${b.invite_url ? '' : 'disabled'}>Ajouter à votre serveur</button>
          <button class="btn" id="pub-refresh">Actualiser</button>
        </div>
      </div>

      <div class="stats-grid" style="margin-top:18px">
        <div class="stat-card"><div class="val">${b.online ? App.fmtNumber(b.servers) : '—'}</div><div class="lbl">Serveurs</div></div>
        <div class="stat-card"><div class="val">${b.online ? App.fmtNumber(b.members) : '—'}</div><div class="lbl">Membres touchés</div></div>
        <div class="stat-card"><div class="val">${b.online ? b.ping + ' ms' : '—'}</div><div class="lbl">Latence</div></div>
        <div class="stat-card"><div class="val">${b.online ? App.fmtUptime(b.uptime) : '—'}</div><div class="lbl">Uptime</div></div>
      </div>

      <div class="card">
        <h3>Commandes</h3>
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
            <div class="zone-label">Commandes personnalisées</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${b.custom.map((c) => `<span class="chip" title="${App.escapeHtml(c.desc)}">${App.escapeHtml(c.trigger)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${!b.categories.length && !b.custom.length ? `<div class="empty-state">Aucune commande activée pour le moment.</div>` : ''}
        <div style="margin-top:14px;color:var(--text-dim);font-size:12px">Une fois le bot sur votre serveur, tapez <b>/help</b> pour le guide complet, et <b>/ticket setup</b> pour installer les tickets.</div>
      </div>

      <div class="pub-footer" style="text-align:left"><b>Hoxera</b>. Ajoutez-le à votre serveur, puis configurez-le avec votre compte Discord.</div>
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
