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
        <div class="pub-hero-badge shimmer">⚡ Hoxera — synchronisé en direct avec Discord</div>
        <h1 class="hero-title">Le bot qui anime<br/><span class="grad grad-anim rot-word" id="pub-rot">ton serveur Discord</span></h1>
        <p class="pub-tagline">Tickets automatiques avec transcriptions, niveaux XP, boutique, giveaways, bienvenue et modération.
        Ajoute Hoxera à ton serveur, puis configure tout depuis le dashboard avec ton compte Discord.</p>
        <div class="pub-hero-actions">
          <button class="btn btn-primary" id="pub-invite-hero" style="padding:13px 22px;font-size:15px">➕ Ajouter Hoxera à ton serveur</button>
          ${user && user.discord_id
            ? `<button class="btn" id="pub-dash-hero" style="padding:13px 22px;font-size:15px">📊 Ouvrir mon dashboard</button>`
            : `<button class="btn btn-discord" id="pub-connect-hero" style="padding:13px 22px;font-size:15px;width:auto">🎮 Se connecter avec Discord</button>`}
        </div>
        <div class="pub-support-link"><a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">🆘 Rejoindre le serveur support officiel</a></div>
        <div class="pub-stats" id="pub-stats">
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Bots en ligne</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Serveurs Discord</div></div>
          <div class="pub-stat"><div class="val">—</div><div class="lbl">Membres touchés</div></div>
        </div>
      </div>

      <div class="pub-section reveal">
        <div class="pub-showcase">
          <div class="pub-sc-visual">
            <div class="dc-mock" aria-hidden="true">
              <div class="dcm-msg">
                <span class="dcm-ava">🤖</span>
                <div class="dcm-body">
                  <div class="dcm-head"><b>Nexora</b><span class="dcm-tag">BOT</span><span class="dcm-time">aujourd'hui à 14:02</span></div>
                  <div class="dcm-embed dcm-e-clay">
                    <span class="dcm-e-bar"></span>
                    <div class="dcm-e-body">
                      <b>Support — Besoin d'aide ?</b>
                      <p>Clique sur le bouton ci-dessous : un salon privé avec le staff s'ouvre instantanément.</p>
                      <span class="dcm-e-foot">Nexora · Tickets</span>
                    </div>
                  </div>
                  <div class="dcm-actions"><span class="dcm-btn">🎫 Ouvrir un ticket</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="pub-sc-copy">
            <span class="pub-sc-kicker">🎫 Tickets</span>
            <h3>Des tickets qui se gèrent tout seuls</h3>
            <p>Un membre clique, son salon privé apparaît avec le rôle staff invité. À la fermeture, la conversation repart en transcription propre, notée par le membre.</p>
            <ul class="pub-sc-list">
              <li>Panneaux à boutons et types de tickets personnalisés</li>
              <li>Transcriptions, journal staff et note d'expérience ⭐</li>
              <li>Catégories, questions et rôle staff automatiques</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="pub-section reveal">
        <div class="pub-showcase reverse">
          <div class="pub-sc-visual">
            <div class="xp-mock" aria-hidden="true">
              <div class="xp-card is-first">
                <span class="xp-rank">🥇</span>
                <span class="xp-ava">🐺</span>
                <div class="xp-info"><b>Léo</b><small>Niveau 24 · 12 480 XP</small><span class="xp-bar"><i style="width:72%"></i></span></div>
              </div>
              <div class="xp-card">
                <span class="xp-rank">🥈</span>
                <span class="xp-ava">🎧</span>
                <div class="xp-info"><b>Chloé</b><small>Niveau 19 · 8 950 XP</small><span class="xp-bar"><i style="width:54%"></i></span></div>
              </div>
              <div class="xp-card">
                <span class="xp-rank">🥉</span>
                <span class="xp-ava">🎮</span>
                <div class="xp-info"><b>Max</b><small>Niveau 17 · 7 210 XP</small><span class="xp-bar"><i style="width:47%"></i></span></div>
              </div>
            </div>
          </div>
          <div class="pub-sc-copy">
            <span class="pub-sc-kicker">📈 Niveaux & économie</span>
            <h3>Des membres qui reviennent chaque jour</h3>
            <p>XP par message, rôles-récompenses, coins quotidiens, métiers, paris et boutique : de vraies raisons de participer à la vie du serveur.</p>
            <ul class="pub-sc-list">
              <li>Classement du serveur et cartes de niveau</li>
              <li>Coins, travail, vols et boutique d'objets</li>
              <li>Anti-triche intégré et paliers configurables</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="pub-section reveal">
        <div class="pub-showcase">
          <div class="pub-sc-visual">
            <div class="dc-mock" aria-hidden="true">
              <div class="dcm-msg">
                <span class="dcm-ava">🛡️</span>
                <div class="dcm-body">
                  <div class="dcm-head"><b>Nexora</b><span class="dcm-tag">BOT</span><span class="dcm-time">aujourd'hui à 02:14</span></div>
                  <div class="dcm-embed dcm-e-red">
                    <span class="dcm-e-bar"></span>
                    <div class="dcm-e-body">
                      <b>🚫 Spam éliminé — anti-raid activé</b>
                      <p>10 comptes créés aujourd'hui ont été neutralisés en moins de 3 secondes. Le serveur reste calme.</p>
                      <span class="dcm-e-foot">Journal de modération</span>
                    </div>
                  </div>
                  <div class="dcm-actions"><span class="dcm-btn">🔴 Mode verrouillage</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="pub-sc-copy">
            <span class="pub-sc-kicker">🛡️ Modération</span>
            <h3>Un serveur protégé, jour et nuit</h3>
            <p>Auto-Mod officiel Discord, anti-raid, sanctions progressives et liste noire : Hoxera veille pendant que tu dors.</p>
            <ul class="pub-sc-list">
              <li>Liens, majuscules, mentions et spam filtrés en direct</li>
              <li>Sanctions progressives : rappel → silence → exclusion</li>
              <li>Verrouillage du serveur en un seul clic</li>
            </ul>
          </div>
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
        <b>⚡ Hoxera</b> — ton serveur mérite un bot à la hauteur
        <div class="pub-footer-links">
          <a href="https://discord.gg/X9hTdr9N3" target="_blank" rel="noopener">🆘 Serveur support</a>
          <span>·</span>
          <a href="#" id="pub-foot-dash">📊 Dashboard</a>
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

  // 🎠 Le mot du titre tourne (façon DraftBot) : ton serveur Discord → tes tickets → …
  const rotEl = page.querySelector('#pub-rot');
  if (rotEl) {
    const rotWords = ['ton serveur Discord', 'tes tickets', 'tes niveaux XP', 'ton économie', 'tes giveaways', 'ta communauté'];
    let rotI = 0;
    setInterval(() => {
      rotEl.classList.add('out');
      setTimeout(() => {
        rotI = (rotI + 1) % rotWords.length;
        rotEl.textContent = rotWords[rotI];
        rotEl.classList.remove('out');
      }, 260);
    }, 2800);
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
