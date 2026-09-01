// ============================================================
// BotDev — Dashboard v2 (inspiré DraftBot)
// Shell à sidebar + sélecteur de serveur + modules par serveur.
// ============================================================
const Dashboard = {
  state: { bot: null, guildId: null, guildData: null, module: 'overview', moduleHistory: [], discordGuilds: [] },
};

Dashboard.moduleIds = () => [...Dashboard.MODULES, ...Dashboard.BOT_MODULES].map(([id]) => id);
Dashboard.persistedModule = () => {
  try {
    const saved = localStorage.getItem('hx-module');
    if (!Dashboard.moduleIds().includes(saved)) return 'overview';
    if (Dashboard.BOT_MODULES.some(([id]) => id === saved) && !(App.state.user && App.state.user.is_admin)) return 'overview';
    return saved;
  } catch { return 'overview'; }
};
Dashboard.scrollToTop = () => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); } catch { try { window.scrollTo(0, 0); } catch {} }
};

Dashboard.api = App.api;

// ---------------------- Références Discord ----------------------
// Les valeurs historiques peuvent être des noms (#salon, rôle, catégorie)
// alors que les modules récents utilisent parfois les IDs. Ces helpers
// reconnaissent les deux formats et affichent toujours une sélection native.
Dashboard.discordRefMatches = (current, item) => {
  const value = String(current || '').trim();
  if (!value || !item) return false;
  const id = String(item.id || '').trim();
  const name = String(item.name || '').trim();
  const lower = value.toLowerCase();
  return value === id || lower === name.toLowerCase() || lower === `#${name.toLowerCase()}`;
};

Dashboard.currentDiscordOption = (current, items, icon = '⚠️', label = 'configuration actuelle — élément introuvable') => {
  const value = String(current || '').trim();
  if (!value || (items || []).some((item) => Dashboard.discordRefMatches(value, item))) return '';
  return `<option value="${App.escapeHtml(value)}" selected>${icon} ${App.escapeHtml(value)} (${label})</option>`;
};

Dashboard.noDiscordChoice = (label) => `<option value="" disabled>— ${App.escapeHtml(label)} —</option>`;

// Sélecteur multi-valeurs commun aux réglages Discord.
// Un bouton « ＋ Ajouter » ouvre le menu déroulant custom (avec recherche
// dès que la liste est longue), puis chaque choix apparaît avec un bouton
// Retirer. Les anciennes références introuvables restent visibles avec un
// avertissement jusqu'à leur retrait explicite.
Dashboard.renderDiscordMultiSelect = (host, {
  items = [],
  selected = new Set(),
  icon = '•',
  placeholder = 'Ajouter un élément',
  emptyText = 'Aucun élément reçu de Discord.',
  selectedEmptyText = 'Aucun élément sélectionné.',
  getValue = (item) => item && (item.id || item.name),
  getLabel = (item) => item && (item.name || item.id),
  selectedClass = 'discord-multi-choice',
  onChange = () => {},
} = {}) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const chosen = selected instanceof Set ? selected : new Set(Array.isArray(selected) ? selected : []);
  const refFor = (item) => String(getValue(item) || '').trim();
  const labelFor = (item) => String(getLabel(item) || refFor(item));
  const findItem = (ref) => list.find((item) => Dashboard.discordRefMatches(ref, item));

  // Une valeur historique enregistrée avec le nom est convertie vers l'ID
  // quand Discord nous fournit l'élément. Les références absentes restent
  // intactes et seront affichées avec l'avertissement « introuvable ».
  const normalized = [...chosen].map((ref) => {
    const item = findItem(ref);
    return item ? refFor(item) : String(ref || '').trim();
  }).filter(Boolean);
  chosen.clear();
  [...new Set(normalized)].forEach((ref) => chosen.add(ref));

  host.innerHTML = '';
  host.classList.add('discord-multi-host');
  const picker = App.el(`<div class="discord-multi-picker"><button type="button" class="dd-add-btn" aria-label="${App.escapeHtml(placeholder)}">＋ ${App.escapeHtml(placeholder)}</button><div class="discord-multi-values" aria-live="polite"></div></div>`);
  const addBtn = picker.querySelector('.dd-add-btn');
  const values = picker.querySelector('.discord-multi-values');

  const availableItems = () => {
    const chosenKnown = new Set([...chosen].map((ref) => {
      const item = findItem(ref);
      return item ? refFor(item) : null;
    }).filter(Boolean));
    return list.filter((item) => !chosenKnown.has(refFor(item)));
  };

  const render = () => {
    const available = availableItems();
    addBtn.innerHTML = available.length
      ? `＋ ${App.escapeHtml(placeholder)}`
      : `✓ ${App.escapeHtml(list.length ? 'Tout est sélectionné' : emptyText)}`;
    addBtn.classList.toggle('is-done', !available.length);

    values.innerHTML = '';
    if (!chosen.size) {
      values.appendChild(App.el(`<span class="discord-multi-empty">${App.escapeHtml(selectedEmptyText)}</span>`));
      return;
    }
    [...chosen].forEach((ref) => {
      const item = findItem(ref);
      const known = !!item;
      const label = known ? labelFor(item) : `${ref} (introuvable)`;
      const chip = App.el(`<span class="${selectedClass} selected ${known ? '' : 'is-missing'}"><span class="discord-multi-icon">${known ? icon : '⚠️'}</span><b>${App.escapeHtml(label)}</b><button type="button" class="discord-multi-remove" aria-label="Retirer ${App.escapeHtml(label)}">×</button></span>`);
      chip.querySelector('.discord-multi-remove').onclick = () => {
        chosen.delete(ref);
        render();
        onChange(chosen);
      };
      values.appendChild(chip);
    });
  };

  Dashboard.dropdownMenu({
    trigger: addBtn,
    searchable: () => list.length > 7,
    getOptions: () => {
      const available = availableItems();
      if (!available.length) {
        const message = list.length ? 'Tous les éléments disponibles sont sélectionnés.' : emptyText;
        return [{ value: '', label: message, disabled: true }];
      }
      return available.map((item) => {
        const ref = refFor(item);
        return { value: ref || '', label: labelFor(item), icon: String(icon || '•'), selected: false };
      }).filter((o) => o.value);
    },
    onSelect: (ref) => {
      ref = String(ref || '').trim();
      if (!ref) return;
      chosen.add(ref);
      render();
      onChange(chosen);
    },
  });
  render();
  host.appendChild(picker);
  host.__discordSelected = chosen;
  host.__discordRender = render;
  return { host, picker, addBtn, values, selected: chosen, render };
};

// ---------------------- 🎛️ Menu déroulant custom (façon panel pro) ----------------------
// Un vrai dropdown comme les grands panels : options bien visibles (icône +
// libellé + indice), recherche instantanée, option courante cochée ✓ et
// navigation clavier. Le panneau vit en « portail » (position fixed sur
// <body>) : il n'est jamais rogné, ni par la sidebar scrollable ni par les
// cartes ; sur mobile il devient une feuille qui monte du bas.
Dashboard.ddCloseAll = () => {
  document.querySelectorAll('.dd-panel[data-open="1"]').forEach((p) => {
    p.hidden = true;
    p.dataset.open = '0';
    if (p._ddCleanup) { p._ddCleanup(); p._ddCleanup = null; }
  });
  document.querySelectorAll('[aria-expanded="true"][data-dd-trigger]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
};

// dropdownMenu({ trigger, getOptions, onSelect, searchable, minPanelWidth })
//   trigger    : élément cliquable qui ouvre le menu (bouton, carte…)
//   getOptions : () => [{ value, label, icon, img, fallback, hint, disabled, selected }]
//   onSelect   : (value) appelé quand l'utilisateur choisit une option
//   searchable : bool ou () => bool (affiche le champ de recherche)
Dashboard.dropdownMenu = ({ trigger, getOptions, onSelect, searchable = false, minPanelWidth = 0 }) => {
  const panel = App.el('<div class="dd-panel" role="listbox" aria-label="Options" hidden></div>');
  document.body.appendChild(panel);
  panel._ddTrigger = trigger;
  trigger.setAttribute('data-dd-trigger', 'true');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  let activeIndex = -1;

  const position = () => {
    const r = trigger.getBoundingClientRect();
    const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 700px)') : null;
    if (mq && mq.matches) {
      panel.classList.add('is-sheet');
      panel.style.left = panel.style.right = panel.style.top = panel.style.bottom = panel.style.width = '';
      return;
    }
    panel.classList.remove('is-sheet');
    const width = Math.max(minPanelWidth || 0, r.width, 236);
    const clamped = Math.min(width, 360);
    const spaceBelow = window.innerHeight - r.bottom;
    const est = Math.min(panel.offsetHeight || 300, 336);
    const up = spaceBelow < Math.min(est + 10, 240) && r.top > spaceBelow;
    panel.classList.toggle('is-up', up);
    panel.style.width = clamped + 'px';
    panel.style.left = Math.max(10, Math.min(r.left, window.innerWidth - clamped - 10)) + 'px';
    if (up) { panel.style.top = 'auto'; panel.style.bottom = (window.innerHeight - r.top + 8) + 'px'; }
    else { panel.style.bottom = 'auto'; panel.style.top = (r.bottom + 8) + 'px'; }
  };

  const renderList = (filter = '') => {
    const q = String(filter || '').trim().toLowerCase();
    let opts = getOptions() || [];
    if (q) opts = opts.filter((o) => String(o.label || '').toLowerCase().includes(q) || String(o.hint || '').toLowerCase().includes(q));
    panel.innerHTML = '';
    const wantSearch = (typeof searchable === 'function' ? searchable() : searchable) || (getOptions() || []).length > 7;
    if (wantSearch) {
      const search = App.el(`<div class="dd-search"><span aria-hidden="true">🔍</span><input type="text" placeholder="Rechercher…" aria-label="Rechercher une option" value="${App.escapeHtml(filter || '')}" /></div>`);
      const input = search.querySelector('input');
      input.oninput = () => renderList(input.value);
      input.onkeydown = (e) => {
        const rows = Array.from(panel.querySelectorAll('.dd-option:not(.is-disabled)'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          activeIndex = e.key === 'ArrowDown' ? Math.min(activeIndex + 1, rows.length - 1) : Math.max(activeIndex - 1, 0);
          rows.forEach((row, i) => row.classList.toggle('is-active', i === activeIndex));
          if (rows[activeIndex] && typeof rows[activeIndex].scrollIntoView === 'function') rows[activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const row = rows[activeIndex] || rows[0];
          if (row) choose(String(row.dataset.value));
        } else if (e.key === 'Escape') { e.stopPropagation(); close(); trigger.focus(); }
      };
      panel.appendChild(search);
    }
    const list = App.el('<div class="dd-list"></div>');
    if (!opts.length) list.appendChild(App.el('<div class="dd-empty">Aucun résultat</div>'));
    opts.forEach((o) => {
      const row = App.el(`<div class="dd-option${o.selected ? ' is-selected' : ''}${o.disabled ? ' is-disabled' : ''}" role="option" aria-selected="${o.selected ? 'true' : 'false'}" data-value="${App.escapeHtml(String(o.value))}">
        <span class="dd-opt-ico">${o.img ? `<img src="${App.escapeHtml(o.img)}" alt="" />` : (o.icon ? App.escapeHtml(String(o.icon)) : (o.fallback ? `<span class="dd-opt-fallback">${App.escapeHtml(String(o.fallback))}</span>` : ''))}</span>
        <span class="dd-opt-txt"><b>${App.escapeHtml(String(o.label))}</b>${o.hint ? `<small>${App.escapeHtml(String(o.hint))}</small>` : ''}</span>
        ${o.selected ? '<span class="dd-check" aria-hidden="true">✓</span>' : ''}
      </div>`);
      if (!o.disabled) row.onclick = () => choose(String(o.value));
      list.appendChild(row);
    });
    panel.appendChild(list);
    activeIndex = -1;
  };

  const open = () => {
    if (trigger.disabled || trigger.classList.contains('is-disabled')) return;
    Dashboard.ddCloseAll();
    renderList('');
    panel.hidden = false;
    panel.dataset.open = '1';
    trigger.setAttribute('aria-expanded', 'true');
    position();
    const searchInput = panel.querySelector('.dd-search input');
    if (searchInput) searchInput.focus();
    const reposition = () => { if (panel.dataset.open === '1') position(); };
    const onDocDown = (e) => {
      if (panel.dataset.open !== '1') return;
      if (panel.contains(e.target) || trigger.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    // pointerdown couvre souris ET tactile ; mousedown est conservé pour les
    // navigateurs anciens (iOS n'émet pas toujours d'événements souris).
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    panel._ddCleanup = () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  };
  const close = () => {
    panel.hidden = true;
    panel.dataset.open = '0';
    trigger.setAttribute('aria-expanded', 'false');
    if (panel._ddCleanup) { panel._ddCleanup(); panel._ddCleanup = null; }
  };
  const choose = (value) => { close(); onSelect(value); };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.dataset.open === '1') close(); else open();
  });
  trigger.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && panel.dataset.open !== '1') { e.preventDefault(); open(); }
    else if (e.key === 'ArrowDown' && panel.dataset.open !== '1') { e.preventDefault(); open(); }
    else if (e.key === 'Escape' && panel.dataset.open === '1') close();
  });
  return { open, close, panel, position };
};

// Améliore un <select> natif : le champ garde sa sémantique (valeur +
// handlers onchange existants intacts) mais s'ouvre désormais dans un vrai
// menu déroulant avec options visibles et recherche.
Dashboard.enhanceSelect = (select) => {
  if (!select || select.dataset.dd === '1' || select.closest('.dd-host')) return;
  select.dataset.dd = '1';
  const host = App.el('<div class="dd-host"></div>');
  select.parentNode.insertBefore(host, select);
  host.appendChild(select);
  const trigger = App.el('<button type="button" class="dd-trigger" aria-haspopup="listbox"></button>');
  host.appendChild(trigger);

  const currentLabel = () => {
    const o = select.options[select.selectedIndex];
    return o ? o.textContent.trim() : (select.dataset.ddPlaceholder || '—');
  };
  const renderTrigger = () => {
    trigger.innerHTML = `<span class="dd-value">${App.escapeHtml(currentLabel())}</span><span class="dd-caret" aria-hidden="true">⌄</span>`;
    trigger.classList.toggle('is-empty', !String(select.value || '').trim());
    trigger.classList.toggle('is-disabled', !!select.disabled);
    trigger.disabled = !!select.disabled;
  };

  Dashboard.dropdownMenu({
    trigger,
    searchable: () => select.options.length > 7,
    getOptions: () => Array.from(select.options).map((o) => ({
      value: o.value,
      label: o.textContent.trim(),
      disabled: o.disabled,
      selected: o.value === select.value,
    })),
    onSelect: (value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      renderTrigger();
    },
  });

  // Libellé toujours à jour : les options sont souvent régénérées en direct.
  const mo = new MutationObserver(renderTrigger);
  mo.observe(select, { childList: true, attributes: true, attributeFilter: ['disabled'] });
  select.addEventListener('change', renderTrigger);
  renderTrigger();
};

Dashboard.enhanceSelects = (root) => {
  if (!root) return;
  root.querySelectorAll('select.dash-select:not([data-dd])').forEach((s) => Dashboard.enhanceSelect(s));
};

// ---------------------- Shell ----------------------
Dashboard.mount = async (shell, bot) => {
  shell.classList.add('dashboard-shell-host');
  Dashboard.state.bot = bot;
  Dashboard.state.shell = shell;
  Dashboard.state.guildId = null;
  Dashboard.state.guildData = null;
  Dashboard.state.module = Dashboard.persistedModule();
  Dashboard.state.moduleHistory = [];
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

  // 🎛️ Sélecteurs façon panel pro : chaque <select> du contenu (et des
  // modales) devient un vrai menu déroulant dès qu'il apparaît dans le DOM,
  // y compris ceux rendus plus tard en asynchrone.
  [content, document.querySelector('#modal-root')].filter(Boolean).forEach((zone) => {
    Dashboard.enhanceSelects(zone);
    const ddObserver = new MutationObserver(() => Dashboard.enhanceSelects(zone));
    ddObserver.observe(zone, { childList: true, subtree: true });
  });

  if (needLink) {
    content.innerHTML = `
      <div class="dash-card" style="max-width:560px;margin:20px auto">
        <h3>🔗 Lie ton compte Discord</h3>
        <div class="desc">Pour configurer tes serveurs depuis le dashboard (comme DraftBot), connecte ton compte Discord. On vérifiera automatiquement tes serveurs et ta permission Discord « Administrateur ».</div>
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
  ['events', '🎮', 'Événements'],
  ['quiz', '🧠', 'Quiz'],
  ['community', '⭐', 'Communauté & Lives'],
  ['announcements', '📅', 'Annonces'],
  ['embeds', '🧱', 'Embed Builder'],
  ['members', '👥', 'Membres'],
  ['stats', '📈', 'Statistiques'],
  ['logs', '📜', 'Journaux'],
  ['transcripts', '🔎', 'Transcriptions'],
  ['modmail', '💬', 'Modmail'],
  ['server', '⚙️', 'Réglages serveur'],
  ['botprofile', '🤖', 'Identité du bot'],
];
Dashboard.BOT_MODULES = [
  ['commands', '🧩', 'Commandes'],
  ['modules', '📦', 'Modules'],
  ['health', '🩺', 'Santé du bot'],
  ['botsettings', '🤖', 'Réglages du bot'],
  ['help', '❓', 'Aide & Guide'],
];

// 🎛️ Composant partagé : carte de sélection du serveur (style DraftBot).
// 🗂️ Grille de sélection de serveurs (façon DraftBot) : grandes cartes avec
// bannière, icône en recouvrement, stats et état du bot. Recherche dès 9 serveurs.
Dashboard.openServerPicker = () => {
  const guilds = Dashboard.state.discordGuilds || [];
  const wantSearch = guilds.length > 8;
  const initialOf = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();
  App.modal(`
    <div class="sp-picker" id="sp-picker">
      <div class="sp-head">
        <div class="sp-head-copy">
          <h2>Choisis un serveur</h2>
          <p>${guilds.length} serveur${guilds.length > 1 ? 's' : ''} · ${guilds.filter((g) => g.hasBot).length} avec Optimus Prime</p>
        </div>
        ${wantSearch ? '<input type="text" class="sp-search" placeholder="🔍 Rechercher un serveur…" aria-label="Rechercher un serveur" />' : ''}
        <button type="button" class="sp-close" aria-label="Fermer">×</button>
      </div>
      <div class="sp-grid">
        ${guilds.map((g) => `
          <button type="button" class="sp-card${g.id === Dashboard.state.guildId ? ' is-current' : ''}" data-gid="${App.escapeHtml(g.id)}" data-name="${App.escapeHtml(String(g.name || '').toLowerCase())}">
            <span class="sp-banner" style="${g.banner ? `background-image:url('${App.escapeHtml(g.banner)}')` : ''}">
              ${g.banner ? '' : `<span class="sp-fallback">${App.escapeHtml(initialOf(g.name))}</span>`}
              ${g.id === Dashboard.state.guildId ? '<span class="sp-current-tag">✓ Serveur actif</span>' : ''}
              ${g.canManage ? '' : '<span class="sp-ro">Lecture seule</span>'}
            </span>
            <span class="sp-body">
              <span class="sp-ico">${g.icon ? `<img src="${App.escapeHtml(g.icon)}" alt="" />` : `<span>${App.escapeHtml(initialOf(g.name))}</span>`}</span>
              <span class="sp-txt">
                <b title="${App.escapeHtml(g.name)}">${App.escapeHtml(g.name)}</b>
                <small>${g.hasBot ? (g.members ? `${App.escapeHtml(String(g.members))} membres` : 'Optimus Prime présent') : 'Optimus Prime absent — inviter'}</small>
              </span>
              <span class="sp-mark">${g.hasBot ? '→' : '＋'}</span>
            </span>
          </button>`).join('')}
      </div>
    </div>`, true);
  const picker = document.querySelector('#sp-picker');
  if (!picker) return;
  picker.querySelector('.sp-close').onclick = () => App.closeModal();
  picker.closest('.modal-overlay')?.addEventListener('mousedown', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-overlay')) App.closeModal();
  });
  const search = picker.querySelector('.sp-search');
  if (search) {
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      picker.querySelectorAll('.sp-card').forEach((card) => {
        card.style.display = !q || (card.dataset.name || '').includes(q) ? '' : 'none';
      });
    };
  }
  picker.querySelectorAll('.sp-card').forEach((card) => {
    card.onclick = async () => {
      const g = guilds.find((x) => x.id === card.dataset.gid);
      if (!g) return;
      if (!g.hasBot) { App.openInvite(Dashboard.state.bot.invite_url); App.toast('Ajoute le bot sur ce serveur pour le configurer !'); return; }
      if (!g.canManage) { App.toast('Lecture seule : il te faut la permission Discord « Administrateur » ou être propriétaire du serveur.', 'error'); return; }
      App.closeModal();
      await Dashboard.selectGuild(g.id);
    };
  });
};

// La carte serveur de la sidebar ouvre la grande grille de sélection.
Dashboard.serverPicker = () => {
  const guilds = Dashboard.state.discordGuilds || [];
  const cur = guilds.find((g) => g.id === Dashboard.state.guildId);
  const initial = cur ? (cur.name || '?').trim()[0].toUpperCase() : '🌍';
  const pick = App.el(`
    <div class="dash-server-card" title="Changer de serveur" role="button" tabindex="0">
      ${cur && cur.icon
        ? `<img src="${App.escapeHtml(cur.icon)}" alt="" />`
        : `<span class="srv-fallback">${App.escapeHtml(initial)}</span>`}
      <div class="srv-txt">
        <span class="srv-label">Serveur</span>
        <b title="${cur ? App.escapeHtml(cur.name) : 'Choisir un serveur…'}">${cur ? App.escapeHtml(cur.name) : 'Choisir un serveur…'}</b>
      </div>
      <span class="srv-caret" aria-hidden="true">⌄</span>
    </div>`);
  const open = () => Dashboard.openServerPicker();
  pick.addEventListener('click', open);
  pick.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  return pick;
};

// ▼ v170 — Indicateur « la liste continue en dessous » : sans lui, une liste
// défilable (sidebar desktop, tiroir des modules mobile) paraît coupée net
// et les éléments du bas semblent « cachés ». Le bouton colle au bas de la
// zone visible, indique qu'il y a une suite et y amène d'un simple toucher.
Dashboard.mountScrollHint = (container, label) => {
  if (!container) return;
  let hint = null;
  for (const child of container.children) { if (child.classList && child.classList.contains('scroll-hint')) { hint = child; break; } }
  if (!hint) {
    hint = App.el('<button class="scroll-hint" type="button"></button>');
    hint.onclick = () => container.scrollTo({ top: container.scrollTop + container.clientHeight * 0.85, behavior: 'smooth' });
    container.appendChild(hint);
  }
  const update = () => {
    const reste = container.scrollHeight - container.clientHeight - container.scrollTop;
    hint.classList.toggle('on', reste > 60);
    hint.textContent = `▼ ${label}`;
  };
  if (!container.__scrollHintBound) {
    container.addEventListener('scroll', update, { passive: true });
    container.__scrollHintBound = true;
  }
  container.__scrollHintUpdate = update;
  update();
  setTimeout(update, 350);
};

Dashboard.renderSide = (aside) => {
  aside.innerHTML = '';
  const bot = Dashboard.state.bot || {};
  const brandAvatar = bot.avatar_url
    ? `<img class="dash-side-brand-avatar" src="${App.escapeHtml(bot.avatar_url)}" alt="" />`
    : '<img class="dash-side-brand-avatar fallback-logo" src="/icons/nexora-robot-mark.svg" alt="Logo Optimus Prime" />';
  aside.appendChild(App.el(`<div class="dash-side-brand">${brandAvatar}<div class="dash-side-brand-copy"><b>${App.escapeHtml(bot.name || 'Hoxera')}</b><span>Control Center</span></div><span class="dash-side-brand-status" title="${bot.online ? 'Bot en ligne' : 'Bot hors ligne'}"></span></div>`));
  const sideBrandImage = aside.querySelector('.dash-side-brand-avatar:not(.fallback)');
  if (sideBrandImage) sideBrandImage.onerror = () => sideBrandImage.replaceWith(App.el('<span class="dash-side-brand-avatar fallback">⚡</span>'));
  aside.appendChild(Dashboard.serverPicker());

  aside.appendChild(App.el(`<div class="dash-side-section">Gestion du serveur</div>`));
  Dashboard.MODULES.forEach(([id, ico, label]) => {
    const b = App.el(`<button class="dash-side-item ${Dashboard.state.module === id ? 'active' : ''}" data-m="${id}"><span class="ico">${ico}</span>${label}</button>`);
    b.onclick = () => Dashboard.setModule(id);
    aside.appendChild(b);
  });
  // Administrateur global : reste tout en bas de la gestion du serveur.
  // Ce bouton dépend du compte fondateur, jamais du serveur sélectionné.
  if (App.state.user && App.state.user.is_admin) {
    const platformAdmin = App.el(`<button class="dash-side-item dash-global-admin" data-platform-admin="true" title="Administration globale d’Optimus Prime"><span class="ico">👑</span>Administrateur global</button>`);
    platformAdmin.onclick = () => App.router.go('/admin');
    aside.appendChild(platformAdmin);

    aside.appendChild(App.el(`<div class="dash-side-section">Administration du bot</div>`));
    Dashboard.BOT_MODULES.forEach(([id, ico, label]) => {
      const b = App.el(`<button class="dash-side-item ${Dashboard.state.module === id ? 'active' : ''}" data-m="${id}"><span class="ico">${ico}</span>${label}</button>`);
      b.onclick = () => Dashboard.setModule(id);
      aside.appendChild(b);
    });
  }
  aside.appendChild(App.el(`<div class="dash-side-foot">
    <div style="display:flex;align-items:center;gap:10px">
      ${Dashboard.state.bot.avatar_url ? `<img src="${App.escapeHtml(Dashboard.state.bot.avatar_url)}" style="width:34px;height:34px;border-radius:50%;box-shadow:0 0 0 2px rgba(var(--d-accent-rgb,224,122,95),.45)" alt=""/>` : '<span style="font-size:22px">⚡</span>'}
      <div>
        <b style="color:var(--d-text)">${App.escapeHtml(Dashboard.state.bot.name)}</b><br/>
        <span style="font-size:11px">Synchronisé en temps réel</span>
      </div>
    </div>
  </div>`));
  Dashboard.mountScrollHint(aside, 'La suite des modules');
};

Dashboard.setModule = (id, options = {}) => {
  const next = String(id || 'overview');
  const current = String(Dashboard.state.module || 'overview');
  if (next === current) return;
  if (!options.fromBack) {
    if (next === 'overview') {
      Dashboard.state.moduleHistory = [];
    } else {
      const history = Array.isArray(Dashboard.state.moduleHistory) ? Dashboard.state.moduleHistory : [];
      if (history[history.length - 1] !== current) history.push(current);
      Dashboard.state.moduleHistory = history.slice(-20);
    }
  }
  Dashboard.state.module = next;
  try { localStorage.setItem('hx-module', next); } catch {}
  Dashboard.scrollToTop();
  Dashboard.refresh();
};

Dashboard.goBack = () => {
  const history = Array.isArray(Dashboard.state.moduleHistory) ? Dashboard.state.moduleHistory : [];
  const previous = history.pop() || 'overview';
  Dashboard.state.moduleHistory = history;
  Dashboard.setModule(previous, { fromBack: true });
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
      <button class="bnav-item ${cur === id ? 'active' : ''}" data-bnav="${id}" aria-label="${label}" ${cur === id ? 'aria-current="page"' : ''}>
        <span class="bnav-ico" aria-hidden="true">${ico}</span>
        <span class="bnav-label">${label}</span>
      </button>`);
    b.onclick = () => Dashboard.setModule(id);
    nav.appendChild(b);
  });
  const more = App.el(`
    <button class="bnav-item" data-more aria-label="Plus de modules">
      <span class="bnav-ico" aria-hidden="true">☰</span>
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
  ['Argile', '#E07A5F', '#C95B49'],
  ['Océan', '#3B82F6', '#1677B7'],
  ['Sauge', '#57A773', '#2D8A68'],
  ['Moutarde', '#D99A32', '#B96D2E'],
  ['Prune', '#9B6BB3', '#70458E'],
  ['Rouge', '#D95459', '#A93642'],
];
Dashboard.applyAccent = (name) => {
  const acc = Dashboard.ACCENTS.find((a) => a[0] === name) || Dashboard.ACCENTS[0];
  const r = document.documentElement;
  const hex = String(acc[1] || '#e07a5f').replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  r.style.setProperty('--d-accent', acc[1]);
  r.style.setProperty('--d-accent2', acc[2]);
  r.style.setProperty('--d-accent-rgb', rgb);
  r.style.setProperty('--d-glow', acc[1] + '59');
  try {
    localStorage.setItem('hx-accent', acc[0]);
    localStorage.setItem('hx-accent-v2', acc[0]);
  } catch {}
};
// La nouvelle direction visuelle démarre en Argile. L'ancien choix Blurple
// ne doit pas réinjecter automatiquement l'ancienne palette violette ; les
// choix faits depuis cette version restent ensuite mémorisés.
try {
  const legacyAccent = localStorage.getItem('hx-accent');
  const savedAccent = localStorage.getItem('hx-accent-v2') || (legacyAccent && legacyAccent !== 'Blurple' ? legacyAccent : 'Argile');
  Dashboard.applyAccent(savedAccent);
} catch {}

// 🎨/🔔 Popovers : un clic sur l'icône ouvre, un second clic ou un clic
// ailleurs ferme. Le gestionnaire unique évite les panneaux « collés » lors
// des re-rendus de la topbar et fonctionne aussi sur écran tactile.
Dashboard.closePopovers = (except = null) => {
  document.querySelectorAll('.dash-accent-pop, .dash-bell-pop').forEach((pop) => {
    if (pop !== except) {
      pop.hidden = true;
      if (pop.id === 'dash-bell-pop') document.querySelector('#d-bell')?.setAttribute('aria-expanded', 'false');
      if (pop.id === 'dash-accent-pop') document.querySelector('#d-accent')?.setAttribute('aria-expanded', 'false');
    }
  });
};

// Un panneau ouvert sur ordinateur reste sous son bouton quand la fenêtre
// change de taille ou défile. En mode téléphone, le CSS le transforme en
// feuille flottante pleine largeur au-dessus de la navigation basse.
if (!window.__hxTopbarPopoverPosition) {
  window.__hxTopbarPopoverPosition = true;
  const reposition = () => {
    Dashboard.positionTopbarPopover(document.querySelector('#dash-bell-pop:not([hidden])'), document.querySelector('#d-bell'));
    Dashboard.positionTopbarPopover(document.querySelector('#dash-accent-pop:not([hidden])'), document.querySelector('#d-accent'));
  };
  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
}
if (!window.__hxPopoverDismiss) {
  window.__hxPopoverDismiss = true;
  document.addEventListener('click', (event) => {
    const inside = event.target && event.target.closest
      ? event.target.closest('#d-bell, .dash-bell-pop, #d-accent, .dash-accent-pop')
      : null;
    if (!inside) Dashboard.closePopovers();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') Dashboard.closePopovers();
  });
}

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
        <b title="${App.escapeHtml(g.name)}">${App.escapeHtml(g.name)}</b>
        ${g.hasBot
          ? (g.canManage ? '<span class="srv-badge ok">✅ Configurer</span>' : '<span class="srv-badge">🔒 Lecture seule</span>')
          : '<span class="srv-badge invite">➕ Inviter le bot</span>'}
      </button>`);
    card.onclick = () => {
      if (!g.hasBot) { App.openInvite(Dashboard.state.bot.invite_url); App.toast('Ajoute le bot puis reviens — le serveur sera configurable !'); return; }
      if (!g.canManage) { App.toast('Il te faut la permission Discord « Administrateur » ou être propriétaire du serveur.', 'error'); return; }
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
// Les panneaux de la topbar sont montés dans le body (portal) : sur téléphone
// ils ne sont jamais coupés par la barre d'actions horizontale ni cachés sous
// le contenu. Sur ordinateur, leur position est recalée sous le bouton.
Dashboard.removeTopbarPortals = () => {
  document.querySelectorAll('[data-dash-topbar-popover="true"]').forEach((node) => node.remove());
};

Dashboard.removeMobileDrawers = () => {
  document.querySelectorAll('[data-dash-mobile-layer="true"]').forEach((node) => node.remove());
};

Dashboard.positionTopbarPopover = (popover, button) => {
  if (!popover || popover.hidden || !button) return;
  // 📱 Interface compacte : écran étroit OU appareil tactile en paysage
  // (téléphone tourné : la sidebar desktop y coupe la liste des modules)
  const isMobile = window.matchMedia
    ? window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse) and (max-height: 800px)').matches
    : window.innerWidth <= 900;
  if (isMobile) {
    ['top', 'right', 'bottom', 'left'].forEach((property) => popover.style.removeProperty(property));
    return;
  }
  const rect = button.getBoundingClientRect();
  popover.style.top = `${Math.round(rect.bottom + 8)}px`;
  popover.style.right = `${Math.max(12, Math.round(window.innerWidth - rect.right))}px`;
};

Dashboard.renderTopbar = (topbar, discordGuilds) => {
  if (!topbar) return;
  Dashboard.removeTopbarPortals();
  Dashboard.removeMobileDrawers();
  const bot = Dashboard.state.bot;
  const cur = discordGuilds.find((g) => g.id === Dashboard.state.guildId);
  const needsInvite = discordGuilds.some((g) => g.canManage && !g.hasBot);
  const all = [...Dashboard.MODULES, ...Dashboard.BOT_MODULES];
  const mod = all.find(([id]) => id === Dashboard.state.module) || ['', '📊', 'Vue d\'ensemble'];
  topbar.innerHTML = `
    <div class="dash-mobile-bar" aria-label="Navigation mobile">
      <button class="dash-mobile-navbtn" id="d-mobile-menu" type="button" aria-label="Ouvrir le menu principal" aria-expanded="false">☰</button>
      <div class="dash-mobile-brand">
        ${bot.avatar_url ? `<img src="${App.escapeHtml(bot.avatar_url)}" alt="" />` : '<img src="/icons/nexora-robot-mark.svg" alt="Logo Optimus Prime" />'}
        <b>${App.escapeHtml(bot.name || 'Optimus Prime')}</b>
      </div>
      <button class="dash-mobile-navbtn" id="d-mobile-modules" type="button" aria-label="Ouvrir les serveurs et modules" aria-expanded="false">▦</button>
    </div>
    <div class="dash-crumb">
      <span class="crumb-ico">${mod[1]}</span>
      <div class="crumb-txt">
        <b>${App.escapeHtml(mod[2])}</b>
        <span>${cur ? App.escapeHtml(cur.name) : 'Aucun serveur sélectionné'}</span>
      </div>
    </div>
    <div class="dash-topbar-actions" aria-label="Actions rapides du dashboard">
      <div class="dash-accent-wrap">
        <button class="dash-iconbtn" id="d-bell" data-tip="Notifications" aria-label="Notifications" aria-controls="dash-bell-pop" aria-expanded="false">🔔<span class="bell-badge" hidden></span></button>
      </div>
      <button class="dash-iconbtn" id="d-theme" data-tip="Mode clair / sombre" aria-label="Changer le thème">🌓</button>
      <button class="dash-iconbtn" id="d-palette" data-tip="Recherche rapide (Ctrl+K)" aria-label="Rechercher un module ou un serveur">🔍</button>
      <button class="dash-iconbtn" id="d-refresh" data-tip="Actualiser le module" aria-label="Actualiser le module">🔄</button>
      <div class="dash-accent-wrap">
        <button class="dash-iconbtn" id="d-accent" data-tip="Couleur du dashboard" aria-label="Choisir la couleur du dashboard" aria-controls="dash-accent-pop" aria-expanded="false">🎨</button>
      </div>
      ${needsInvite ? `<button class="dash-btn" id="d-invite2" aria-label="Ajouter le bot au serveur">➕ Ajouter le bot</button>` : ''}
      <div class="dash-bot-chip" title="${App.escapeHtml(bot.bot_username || bot.name)}" aria-label="${App.escapeHtml(bot.name)}">
        ${bot.avatar_url ? `<img src="${App.escapeHtml(bot.avatar_url)}" alt="Avatar de ${App.escapeHtml(bot.name)}" />` : '<span class="chip-fallback" aria-hidden="true">🤖</span>'}
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

  // Portals : sortir les panneaux de la ligne scrollable évite tout clipping
  // sur les petits écrans et permet un vrai panneau lisible au-dessus du contenu.
  const bellPop = App.el(`
    <div id="dash-bell-pop" class="dash-bell-pop dash-topbar-popover" data-dash-topbar-popover="true" hidden role="dialog" aria-label="Notifications" aria-live="polite">
      <div class="bp-head"><b>🔔 Notifications</b><button class="bp-close" type="button" aria-label="Fermer les notifications">×</button></div>
      <div class="bp-list"><div class="dp-empty">Chargement…</div></div>
    </div>`);
  const accPop = App.el(`
    <div id="dash-accent-pop" class="dash-accent-pop dash-topbar-popover" data-dash-topbar-popover="true" hidden role="dialog" aria-label="Couleur du dashboard">
      ${Dashboard.ACCENTS.map(([n, c1, c2]) => `<button class="acc-dot" type="button" data-acc="${n}" aria-label="Thème ${n}" title="${n}" style="background:linear-gradient(135deg,${c1},${c2})"></button>`).join('')}
    </div>`);
  document.body.appendChild(bellPop);
  document.body.appendChild(accPop);

  // 📱 Navigation mobile inspirée d'un vrai panel : un menu général et un
  // tiroir séparé pour les serveurs/modules. Sur desktop, ces éléments sont
  // masqués ; la sidebar classique reste la navigation principale.
  const mobileUser = App.state.user || {};
  const mobileUserName = mobileUser.discord_username || mobileUser.email || 'Compte Discord';
  const mobileLayer = App.el(`
    <div class="dash-mobile-layer" data-dash-mobile-layer="true">
      <div class="dash-mobile-backdrop" id="dash-mobile-backdrop" hidden></div>
      <aside class="dash-mobile-drawer dash-mobile-site-drawer" id="dash-mobile-site-drawer" hidden aria-label="Menu principal">
        <div class="dash-mobile-drawer-head"><b>Menu Optimus Prime</b><button class="dash-mobile-close" id="d-mobile-site-close" type="button" aria-label="Fermer le menu">×</button></div>
        <nav class="dash-mobile-site-links">
          <button type="button" data-mobile-home><span>⌂</span>Accueil</button>
          <button type="button" data-mobile-open-modules><span>▦</span>Serveurs et modules</button>
          ${mobileUser.is_admin ? '<button type="button" data-mobile-admin><span>♛</span>Administration globale</button>' : ''}
        </nav>
        <div class="dash-mobile-drawer-account">
          <span class="dash-mobile-account-avatar">${App.escapeHtml(String(mobileUserName).slice(0, 1).toUpperCase())}</span>
          <div><b>${App.escapeHtml(mobileUserName)}</b><small>Compte connecté</small></div>
          <button type="button" data-mobile-logout aria-label="Déconnexion">⏻</button>
        </div>
      </aside>
      <aside class="dash-mobile-drawer dash-mobile-modules-drawer" id="dash-mobile-modules-drawer" hidden aria-label="Serveurs et modules">
        <div class="dash-mobile-drawer-head"><b>Serveurs et modules</b><button class="dash-mobile-close" id="d-mobile-modules-close" type="button" aria-label="Fermer les modules">×</button></div>
        <div class="dash-mobile-modules-body"><div class="dash-mobile-server-rail" id="dash-mobile-server-rail"></div><div class="dash-mobile-module-list" id="dash-mobile-module-list"></div></div>
      </aside>
    </div>`);
  document.body.appendChild(mobileLayer);

  const mobileBackdrop = mobileLayer.querySelector('#dash-mobile-backdrop');
  const siteDrawer = mobileLayer.querySelector('#dash-mobile-site-drawer');
  const modulesDrawer = mobileLayer.querySelector('#dash-mobile-modules-drawer');
  const mobileMenuButton = topbar.querySelector('#d-mobile-menu');
  const mobileModulesButton = topbar.querySelector('#d-mobile-modules');
  const closeMobileDrawers = () => {
    siteDrawer.hidden = true;
    modulesDrawer.hidden = true;
    mobileBackdrop.hidden = true;
    document.body.classList.remove('dash-mobile-drawer-open');
    mobileMenuButton?.setAttribute('aria-expanded', 'false');
    mobileModulesButton?.setAttribute('aria-expanded', 'false');
  };
  const openMobileDrawer = (drawer, button) => {
    Dashboard.closePopovers();
    siteDrawer.hidden = drawer !== siteDrawer;
    modulesDrawer.hidden = drawer !== modulesDrawer;
    mobileBackdrop.hidden = false;
    document.body.classList.add('dash-mobile-drawer-open');
    mobileMenuButton?.setAttribute('aria-expanded', String(drawer === siteDrawer));
    mobileModulesButton?.setAttribute('aria-expanded', String(drawer === modulesDrawer));
  };
  const moduleRail = mobileLayer.querySelector('#dash-mobile-server-rail');
  const moduleList = mobileLayer.querySelector('#dash-mobile-module-list');
  const renderMobileModules = () => {
    const currentGuild = (discordGuilds || []).find((guild) => guild.id === Dashboard.state.guildId);
    moduleRail.innerHTML = '';
    (discordGuilds || []).forEach((guild) => {
      const initial = String(guild.name || '?').trim().slice(0, 1).toUpperCase() || '?';
      const item = App.el(`<button type="button" class="dash-mobile-server-item ${guild.id === Dashboard.state.guildId ? 'active' : ''}" data-mobile-guild="${App.escapeHtml(guild.id)}" title="${App.escapeHtml(guild.name)}">${guild.icon ? `<img src="${App.escapeHtml(guild.icon)}" alt="" />` : `<span>${App.escapeHtml(initial)}</span>`}</button>`);
      item.onclick = async () => {
        if (!guild.hasBot) { App.openInvite(Dashboard.state.bot.invite_url); return; }
        if (!guild.canManage) { App.toast('Lecture seule : permission Administrateur requise.', 'error'); return; }
        closeMobileDrawers();
        await Dashboard.selectGuild(guild.id);
      };
      moduleRail.appendChild(item);
    });
    moduleList.innerHTML = `<div class="dash-mobile-current-server"><small>Serveur sélectionné</small><b>${App.escapeHtml(currentGuild ? currentGuild.name : 'Choisis un serveur')}</b></div>`;
    if (!currentGuild) {
      moduleList.appendChild(App.el('<div class="dash-mobile-module-empty">Sélectionne un serveur à gauche.</div>'));
      return;
    }
    const groups = [['Gestion du serveur', Dashboard.MODULES], ...(mobileUser.is_admin ? [['Administration du bot', Dashboard.BOT_MODULES]] : [])];
    groups.forEach(([label, entries]) => {
      moduleList.appendChild(App.el(`<div class="dash-mobile-module-group">${App.escapeHtml(label)}</div>`));
      entries.forEach(([id, icon, name]) => {
        const button = App.el(`<button type="button" class="dash-mobile-module-item ${Dashboard.state.module === id ? 'active' : ''}" data-mobile-module="${App.escapeHtml(id)}"><span>${icon}</span><b>${App.escapeHtml(name)}</b><i>›</i></button>`);
        button.onclick = () => { closeMobileDrawers(); Dashboard.setModule(id); };
        moduleList.appendChild(button);
      });
    });
    Dashboard.mountScrollHint(moduleList, 'La suite des modules');
  };
  renderMobileModules();
  mobileBackdrop.onclick = closeMobileDrawers;
  mobileMenuButton?.addEventListener('click', (event) => { event.stopPropagation(); openMobileDrawer(siteDrawer, mobileMenuButton); });
  mobileModulesButton?.addEventListener('click', (event) => { event.stopPropagation(); renderMobileModules(); openMobileDrawer(modulesDrawer, mobileModulesButton); });
  mobileLayer.querySelector('#d-mobile-site-close').onclick = closeMobileDrawers;
  mobileLayer.querySelector('#d-mobile-modules-close').onclick = closeMobileDrawers;
  mobileLayer.querySelector('[data-mobile-home]').onclick = () => { closeMobileDrawers(); Dashboard.setModule('overview'); };
  mobileLayer.querySelector('[data-mobile-open-modules]').onclick = () => { renderMobileModules(); openMobileDrawer(modulesDrawer, mobileModulesButton); };
  mobileLayer.querySelector('[data-mobile-admin]')?.addEventListener('click', () => { closeMobileDrawers(); App.router.go('/admin'); });
  mobileLayer.querySelector('[data-mobile-logout]').onclick = async () => {
    await App.api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/';
    location.reload();
  };

  const inviteBtn = topbar.querySelector('#d-invite2');
  if (inviteBtn) inviteBtn.onclick = () => App.openInvite(bot.invite_url);
  topbar.querySelector('#d-palette').onclick = () => { Dashboard.closePopovers(); Dashboard.openPalette(); };
  // 🌓 Mode clair / sombre
  topbar.querySelector('#d-theme').onclick = () => {
    const light = !document.documentElement.classList.contains('hx-light');
    document.documentElement.classList.toggle('hx-light', light);
    try { localStorage.setItem('hx-theme', light ? 'light' : 'dark'); } catch {}
    App.toast(light ? '☀️ Mode clair activé' : '🌙 Mode sombre activé');
  };
  // 🔔 Notifications : badge + panneau, dans un portal hors de la topbar
  const bellBtn = topbar.querySelector('#d-bell');
  const bellBadge = topbar.querySelector('.bell-badge');
  Dashboard.loadNotifications().then(({ warnings = [], infos = [] }) => {
    if (warnings.length) { bellBadge.textContent = warnings.length; bellBadge.hidden = false; }
    const list = bellPop.querySelector('.bp-list');
    list.innerHTML = '';
    if (!warnings.length && !infos.length) { list.appendChild(App.el(`<div class="dp-empty">✅ Tout va bien — aucune alerte !</div>`)); return; }
    warnings.forEach((w) => list.appendChild(App.el(`<div class="bp-item warn"><span>${w.icon || '⚠️'}</span><div>${App.escapeHtml(w.text)}</div>`)));
    infos.forEach((i2) => list.appendChild(App.el(`<div class="bp-item"><span>${i2.icon || 'ℹ️'}</span><div>${App.escapeHtml(i2.text)}</div>`)));
  });
  bellBtn.onclick = (e) => {
    e.stopPropagation();
    const open = bellPop.hidden;
    Dashboard.closePopovers(open ? bellPop : null);
    bellPop.hidden = !open;
    bellBtn.setAttribute('aria-expanded', String(open));
    if (open) Dashboard.positionTopbarPopover(bellPop, bellBtn);
  };
  bellPop.querySelector('.bp-close').onclick = (e) => {
    e.stopPropagation();
    bellPop.hidden = true;
    bellBtn.setAttribute('aria-expanded', 'false');
  };
  topbar.querySelector('#d-refresh').onclick = () => { Dashboard.closePopovers(); App.toast('Module actualisé !'); Dashboard.refresh(); };
  const accBtn = topbar.querySelector('#d-accent');
  accBtn.onclick = (e) => {
    e.stopPropagation();
    const open = accPop.hidden;
    Dashboard.closePopovers(open ? accPop : null);
    accPop.hidden = !open;
    accBtn.setAttribute('aria-expanded', String(open));
    if (open) Dashboard.positionTopbarPopover(accPop, accBtn);
  };
  accPop.querySelectorAll('[data-acc]').forEach((d) => {
    d.onclick = () => {
      Dashboard.applyAccent(d.dataset.acc);
      accPop.hidden = true;
      accBtn.setAttribute('aria-expanded', 'false');
      App.toast(`🎨 Thème « ${d.dataset.acc} » appliqué !`);
    };
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

  const botLevel = ['commands', 'modules', 'health', 'botsettings', 'help'].includes(module);
  if (!botLevel && !guildId) return;

  try {
    const data = botLevel ? null : await Dashboard.loadGuild();
    const fn = Dashboard.renderers[module];
    if (fn) {
      await fn(content, data);
      // 🧷 Mise en page des réglages en lignes (libellé à gauche, contrôle à droite)
      Dashboard.layoutSettingRows(content);
    }
    else content.innerHTML = `<div class="dash-empty">Module introuvable.</div>`;
  } catch (e) {
    content.innerHTML = `
      <div class="dash-state-card is-error" role="alert">
        <div class="state-icon">⚠️</div>
        <div class="state-copy"><h2>Impossible de charger ce module</h2><p>${App.escapeHtml(e.message || 'Une erreur temporaire est survenue.')}</p></div>
        <div class="state-actions"><button class="dash-btn" id="dash-error-back">← Retour</button><button class="dash-btn dash-btn-primary" id="dash-retry">Réessayer</button></div>
      </div>`;
    content.querySelector('#dash-retry')?.addEventListener('click', () => Dashboard.renderContent(content));
    content.querySelector('#dash-error-back')?.addEventListener('click', () => Dashboard.goBack());
  }
};

// ============================================================
// Modules
// ============================================================
Dashboard.header = (content, icon, title, sub) => {
  content.innerHTML = '';
  const isBotScope = ['commands', 'modules', 'health', 'botsettings', 'help'].includes(Dashboard.state.module);
  const isGuildScope = Boolean(Dashboard.state.guildId) && !isBotScope;
  const bot = Dashboard.state.bot || {};
  const statusLabel = bot.online === false ? 'Optimus Prime hors ligne' : 'Optimus Prime en ligne';
  const statusClass = bot.online === false ? 'is-offline' : 'is-online';
  const canGoBack = Dashboard.state.module !== 'overview' && Array.isArray(Dashboard.state.moduleHistory) && Dashboard.state.moduleHistory.length > 0;
  const header = App.el(`
    <div class="dash-module-header" data-module-header>
      <div class="module-header-lead">
        ${canGoBack ? '<button class="module-back" type="button" data-module-back aria-label="Retour au module précédent"><span aria-hidden="true">←</span><span class="module-back-label">Retour</span></button>' : '<span class="module-back-placeholder" aria-hidden="true"></span>'}
        <div class="m-icon" aria-hidden="true">${icon}</div>
      </div>
      <div class="module-header-copy"><h1>${title}</h1><div class="sub">${sub}</div></div>
      <div class="module-header-meta">
        <span class="module-scope"><span class="module-scope-dot ${statusClass}"></span>${isGuildScope ? 'Serveur sélectionné' : 'Configuration globale'}</span>
        <span class="module-status ${statusClass}">${statusLabel}</span>
      </div>
    </div>
  `);
  content.appendChild(header);
  const back = header.querySelector('[data-module-back]');
  if (back) back.onclick = () => Dashboard.goBack();
  return content;
};

Dashboard.card = (content, title, desc, inner = '') => {
  const c = App.el(`<div class="dash-card" data-dash-card><div class="card-head"><div class="card-heading"><h3>${title}</h3><div class="desc">${desc}</div></div></div>${inner}</div>`);
  content.appendChild(c);
  return c;
};

Dashboard.renderers = {};

// ============================================================
// 🧷 Mise en page des réglages façon Discord/DraftBot (v159)
// Après le rendu d'un module, chaque couple « libellé + contrôle »
// devient une ligne : texte à gauche, contrôle à droite. Les boutons
// en fin de carte sont regroupés dans un pied de carte aligné à droite.
// ============================================================
Dashboard.SETTING_ROW_CONTROLS = 'select.dash-select, input.dash-input, textarea.dash-input, label.switch, .dash-roles-multi, .discord-multi-host, .dd-host';

Dashboard.layoutSettingRows = (root) => {
  if (!root || !root.querySelectorAll) return;
  // 1) Lignes « libellé → contrôle »
  root.querySelectorAll('.dash-label').forEach((label) => {
    const parent = label.parentElement;
    if (!parent || parent.classList.contains('setting-row')) return;
    if (parent.style && parent.style.display === 'flex') {
      // Déjà une ligne construite en inline (ex : « Activer ») → harmonisation
      const next = label.nextElementSibling;
      if (next && (next.classList.contains('switch') || next.matches(Dashboard.SETTING_ROW_CONTROLS))) parent.classList.add('setting-row');
      return;
    }
    const next = label.nextElementSibling;
    if (!next) return;
    const isControl = next.matches(Dashboard.SETTING_ROW_CONTROLS)
      || (next.tagName === 'DIV' && next.querySelector('input[type="color"]'))
      || (next.tagName === 'DIV' && next.querySelector('.discord-multi-picker'))
      || (next.tagName === 'DIV' && next.querySelector('select.dash-select'));
    if (!isControl) return;
    const row = document.createElement('div');
    row.className = 'setting-row';
    parent.insertBefore(row, label);
    row.appendChild(label);
    row.appendChild(next);
  });
  // 2) Boutons en fin de zone → pied de carte aligné à droite
  root.querySelectorAll('.dash-card .dash-btn').forEach((btn) => {
    const parent = btn.parentElement;
    if (!parent || parent.classList.contains('card-actions') || parent.closest('.card-actions') || parent.closest('.setting-row') || parent.closest('.card-head')) return;
    const kids = Array.from(parent.children);
    const trailing = [];
    for (let i = kids.length - 1; i >= 0; i--) {
      if (kids[i].classList && kids[i].classList.contains('dash-btn')) trailing.unshift(kids[i]);
      else break;
    }
    if (!trailing.length || !trailing.includes(btn)) return;
    const foot = document.createElement('div');
    foot.className = 'card-actions';
    parent.insertBefore(foot, trailing[0]);
    trailing.forEach((b) => foot.appendChild(b));
  });
};

// ---------- Vue d'ensemble ----------
Dashboard.renderers.overview = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const g = data.guild || { name: 'Serveur', members: 0 };
  const ts = data.tickets_stats || { total: 0, open: 0 };
  const root = Dashboard.header(content, '⌂', 'Tableau de bord', `Gestion de ${App.escapeHtml(g.name)} · ${g.members} membres · Optimus Prime`);
  const workspace = App.el('<div class="ov-workspace ov-draft-home"></div>');
  root.appendChild(workspace);

  const greeting = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';
  const serverInitial = String(g.name || '?').trim().slice(0, 1).toUpperCase() || '?';
  const serverIcon = g.icon || g.icon_url || '';
  const serverBanner = g.banner || '';
  const statusText = bot.online === false ? 'Optimus Prime est hors ligne' : 'Optimus Prime est opérationnel';
  const statusClass = bot.online === false ? 'is-offline' : 'is-online';
  // 🖼️ Stats riches du serveur (bannière, boosts, salons, rôles, création)
  const createdLabel = g.createdAt
    ? new Date(g.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : '';
  const heroChips = [
    g.members ? `<span class="ov-hero-chip"><span>👥</span><b>${App.escapeHtml(String(g.members))}</b><small>membres</small></span>` : '',
    g.boosts ? `<span class="ov-hero-chip"><span>🚀</span><b>${App.escapeHtml(String(g.boosts))}</b><small>boost${g.boosts > 1 ? 's' : ''}</small></span>` : '',
    g.channelsCount ? `<span class="ov-hero-chip"><span>#️⃣</span><b>${App.escapeHtml(String(g.channelsCount))}</b><small>salons</small></span>` : '',
    g.rolesCount ? `<span class="ov-hero-chip"><span>🎭</span><b>${App.escapeHtml(String(g.rolesCount))}</b><small>rôles</small></span>` : '',
    createdLabel ? `<span class="ov-hero-chip"><span>🎂</span><small>créé en ${App.escapeHtml(createdLabel)}</small></span>` : '',
  ].filter(Boolean).join('');
  const overviewIntro = App.el(`
    <section class="ov-intro ov-welcome-panel${serverBanner ? ' has-banner' : ''}" aria-label="Résumé du serveur">
      ${serverBanner ? `<span class="ov-hero-bg" style="background-image:url('${App.escapeHtml(serverBanner)}')" aria-hidden="true"></span>` : ''}
      <div class="ov-intro-server">
        ${serverIcon
          ? `<img class="ov-server-avatar" src="${App.escapeHtml(serverIcon)}" alt="" />`
          : `<span class="ov-server-avatar fallback">${App.escapeHtml(serverInitial)}</span>`}
        <div class="ov-intro-copy">
          <span class="ov-eyebrow">${greeting}, administrateur</span>
          <h2>Bienvenue dans ton espace de gestion</h2>
          <p>${App.escapeHtml(g.name)}${g.description ? ` · ${App.escapeHtml(g.description)}` : ` · ${App.escapeHtml(String(g.members || 0))} membres · tous les réglages d’Optimus Prime au même endroit.`}</p>
        </div>
      </div>
      <div class="ov-intro-health ${statusClass}">
        <span class="ov-health-dot ${statusClass}"></span>
        <div><b>${App.escapeHtml(statusText)}</b><small>Dernière synchronisation disponible</small></div>
        <button class="ov-welcome-settings" data-go="server" type="button">Réglages <span>→</span></button>
      </div>
      ${heroChips ? `<div class="ov-hero-stats">${heroChips}</div>` : ''}
    </section>`);
  overviewIntro.querySelector('[data-go]').onclick = () => Dashboard.setModule('server');
  workspace.appendChild(overviewIntro);

  const quickActions = App.el(`
    <div class="ov-quick-actions ov-access-bar" aria-label="Accès rapides">
      <span class="ov-quick-label">Accès rapides</span>
      <button class="ov-quick-action" data-go="tickets"><span>🎫</span><div class="ov-qa-txt"><b>Tickets</b><small>Configurer</small></div><i>→</i></button>
      <button class="ov-quick-action" data-go="welcome"><span>👋</span><div class="ov-qa-txt"><b>Bienvenue</b><small>Préparer</small></div><i>→</i></button>
      <button class="ov-quick-action" data-go="moderation"><span>🛡️</span><div class="ov-qa-txt"><b>Modération</b><small>Protéger</small></div><i>→</i></button>
      <button class="ov-quick-action" data-go="botprofile"><span>🤖</span><div class="ov-qa-txt"><b>Identité du bot</b><small>Personnaliser</small></div><i>→</i></button>
    </div>`);
  quickActions.querySelectorAll('[data-go]').forEach((button) => { button.onclick = () => Dashboard.setModule(button.dataset.go); });
  workspace.appendChild(quickActions);

  const checklist = Array.isArray(data.checklist) ? data.checklist : [];
  const doneCount = checklist.filter((item) => item.done).length;
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;
  const columns = App.el('<div class="ov-home-columns"></div>');
  const mainColumn = App.el('<div class="ov-home-main"></div>');
  const sideColumn = App.el('<aside class="ov-home-side"></aside>');
  columns.appendChild(mainColumn);
  columns.appendChild(sideColumn);

  const configPanel = App.el(`
    <section class="ov-config-panel ov-checklist-card">
      <div class="ov-section-heading"><b>Configuration du serveur</b><span>${doneCount} étape(s) terminée(s) sur ${checklist.length || 0}</span></div>
      <div class="ov-progress-head">
        <div class="ov-progress-copy"><b>${pct === 100 ? 'Serveur prêt' : 'Progression de la configuration'}</b><span>Les éléments importants de ton installation Optimus Prime</span></div>
        <strong>${pct}%</strong>
      </div>
      <div class="ov-progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progression de la configuration"><div class="ov-progress-value" style="width:${pct}%"></div></div>
      <div class="ov-config-list"></div>
    </section>`);
  const configList = configPanel.querySelector('.ov-config-list');
  if (!checklist.length) configList.appendChild(App.el('<div class="ov-config-empty">Aucune étape à afficher pour le moment.</div>'));
  checklist.forEach((item) => {
    const row = App.el(`
      <button class="ov-config-row check-item ${item.done ? 'done' : ''}" type="button">
        <span class="ov-config-check">${item.done ? '✓' : '○'}</span>
        <span class="ov-config-copy"><b>${App.escapeHtml(item.label)}</b><small>${item.done ? 'Configuration active · Configurer →' : 'À configurer · Configurer →'}</small></span>
        <span class="ov-config-arrow">→</span>
      </button>`);
    row.onclick = () => Dashboard.setModule(item.module);
    configList.appendChild(row);
  });
  mainColumn.appendChild(configPanel);

  if (pct < 25) {
    const onboarding = App.el(`
      <section class="dash-hero ov-onboarding">
        <div class="hero-badge">Premiers réglages</div>
        <h2>Mettons ${App.escapeHtml(g.name)} en place</h2>
        <p>Ton bot est prêt. Commence par le support, l'accueil et la sécurité.</p>
        <div class="hero-steps">
          <button class="hero-step" data-go="tickets"><span class="hs-num">1</span><span class="hs-emoji">🎫</span><b>Support</b><span>Tickets et catégories</span></button>
          <button class="hero-step" data-go="welcome"><span class="hs-num">2</span><span class="hs-emoji">👋</span><b>Accueil</b><span>Bienvenue et auto-rôles</span></button>
          <button class="hero-step" data-go="community"><span class="hs-num">3</span><span class="hs-emoji">⭐</span><b>Communauté</b><span>Starboard, lives et annonces</span></button>
        </div>
      </section>`);
    onboarding.querySelectorAll('[data-go]').forEach((button) => { button.onclick = () => Dashboard.setModule(button.dataset.go); });
    mainColumn.appendChild(onboarding);
  }

  const stats = [
    ['👥', g.members, 'Membres', 'Communauté suivie'],
    ['🎫', ts.open, 'Tickets ouverts', 'À traiter maintenant'],
    ['🗂️', data.tickets && data.tickets.types ? data.tickets.types.length : 0, 'Types de tickets', 'Support organisé'],
    ['🏆', (data.xp_roles || []).length, 'Récompenses de niveau', 'Progression des membres'],
    ['📋', (data.role_menus || []).length, 'Menus de rôles', 'Accès simplifiés'],
    ['📅', (data.scheduled || []).length, 'Annonces programmées', 'Prochains envois'],
  ];
  const statsSection = App.el('<section class="ov-home-side-section ov-summary-section"><div class="ov-side-heading"><b>Résumé du serveur</b><span>État actuel</span></div><div class="dash-stats ov-stats"></div></section>');
  const statsEl = statsSection.querySelector('.ov-stats');
  stats.forEach(([icon, value, label, note]) => {
    statsEl.appendChild(App.el(`<div class="dash-stat ov-stat"><div class="ov-stat-top"><span class="ov-stat-icon">${icon}</span><span class="ov-stat-note">${note}</span></div><div class="val">${App.escapeHtml(String(value))}</div><div class="lbl">${label}</div></div>`));
  });
  sideColumn.appendChild(statsSection);

  const feedSection = App.el('<section class="ov-home-side-section ov-home-feed"><div class="ov-side-heading"><b>Activité récente</b><span>En direct</span></div><div id="ov-feed"><div class="ov-feed-empty">Chargement de l’activité…</div></div></section>');
  sideColumn.appendChild(feedSection);
  const feedList = feedSection.querySelector('#ov-feed');
  const relTime = (iso) => {
    const t = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime();
    const minutes = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (minutes < 1) return 'à l’instant';
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    return `il y a ${Math.floor(hours / 24)} j`;
  };
  const loadFeed = async () => {
    try {
      const { items } = await App.api(`/bots/${bot.id}/guilds/${guildId}/activity`);
      feedList.innerHTML = '';
      if (!items.length) {
        feedList.appendChild(App.el('<div class="ov-feed-empty">Le flux se remplira dès que Optimus Prime agit.</div>'));
        return;
      }
      items.forEach((item) => feedList.appendChild(App.el(`<div class="feed-item"><span class="feed-emoji">${item.emoji || '•'}</span><span class="feed-text">${App.escapeHtml(item.text)}</span><span class="feed-time">${relTime(item.created_at)}</span></div>`)));
    } catch { feedList.innerHTML = '<div class="ov-feed-empty">Activité indisponible pour le moment.</div>'; }
  };
  loadFeed();
  if (Dashboard.state.feedTimer) clearInterval(Dashboard.state.feedTimer);
  Dashboard.state.feedTimer = setInterval(loadFeed, 30000);

  const briefSection = App.el('<section class="ov-home-side-section ov-home-brief"><div class="ov-side-heading"><b>Ton serveur en bref</b><span>7 derniers jours</span></div><div class="ov-brief-content"><span class="ov-feed-empty">Chargement des statistiques…</span></div></section>');
  sideColumn.appendChild(briefSection);
  try {
    const st = await App.api(`/bots/${bot.id}/guilds/${guildId}/stats`);
    const totalMsgs = (st.activity || []).reduce((sum, day) => sum + Number(day.messages || 0), 0);
    const totalJoins = (st.joins || []).reduce((sum, day) => sum + Number(day.members || 0), 0);
    const top3 = (st.top_active || []).slice(0, 3);
    const brief = briefSection.querySelector('.ov-brief-content');
    brief.innerHTML = `<div class="ov-brief-badges"><span class="dash-badge ok">💬 ${totalMsgs} messages</span><span class="dash-badge">🆕 ${totalJoins} arrivée(s)</span><span class="dash-badge warn">🎫 ${ts.open} ticket(s)</span></div>`;
    if (top3.length) {
      brief.innerHTML += '<div class="dash-label ov-top-label">Membres actifs</div>';
      top3.forEach((member, index) => { brief.innerHTML += `<div class="ov-top-member"><span>${['🥇', '🥈', '🥉'][index]}</span><b>${App.escapeHtml(member.tag)}</b><small>${member.messages} msg</small></div>`; });
    }
  } catch {
    briefSection.querySelector('.ov-brief-content').innerHTML = '<div class="ov-feed-empty">Statistiques indisponibles pour le moment.</div>';
  }

  workspace.appendChild(columns);
  const moduleSection = App.el('<section class="ov-module-section"><div class="ov-section-heading"><b>Modules du serveur</b><span>Choisis une fonctionnalité à configurer</span></div><div class="dash-grid ov-module-grid"></div></section>');
  const grid = moduleSection.querySelector('.ov-module-grid');
  const modules = [
    ['tickets', '🎫', 'Tickets', 'Types personnalisés et support privé'],
    ['welcome', '👋', 'Bienvenue', 'Accueil, départ et auto-rôles'],
    ['levels', '📈', 'Niveaux', 'XP et récompenses des membres'],
    ['shop', '🛒', 'Boutique', 'Articles et rôles à acheter'],
    ['moderation', '🛡️', 'Modération', 'Auto-Mod, blacklist et anti-raid'],
    ['suggestions', '💡', 'Suggestions', 'Propositions et votes'],
    ['giveaways', '🎁', 'Giveaways', 'Tirages automatiques'],
    ['announcements', '📅', 'Annonces', 'Messages programmés'],
    ['members', '👥', 'Membres', 'Liste et actions rapides'],
    ['stats', '📊', 'Statistiques', 'Activité du serveur'],
    ['logs', '📜', 'Journaux', 'Événements enregistrés'],
    ['roles', '📋', 'Rôles', 'Menus et boutons'],
  ];
  modules.forEach(([id, icon, label, description]) => {
    const card = App.el(`<div class="dash-card ov-module-card" data-module-card="${id}"><div class="ov-module-icon" aria-hidden="true">${icon}</div><div class="ov-module-copy"><h3>${label}</h3><div class="desc">${description}</div></div><button class="dash-btn dash-btn-sm" data-go="${id}">Ouvrir <span aria-hidden="true">→</span></button></div>`);
    card.onclick = (event) => { if (!event.target.closest('button')) Dashboard.setModule(id); };
    card.querySelector('[data-go]').onclick = () => Dashboard.setModule(id);
    grid.appendChild(card);
  });
  workspace.appendChild(moduleSection);
};

// ---------- Tickets ----------
Dashboard.renderers.tickets = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const t = data.tickets;
  let advancedConfig = null;
  try { advancedConfig = (await App.api(`/bots/${bot.id}/guilds/${guildId}/advanced-tickets`)).config || null; } catch {}
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

  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const categories = (data.channels || []).filter((ch) => ch.category);
  const rolesList = (data.roles || []).filter((role) => role.name !== '@everyone');
  const curStyle = String(t.button_style || '1');
  const reqReason = !(t.require_reason === 0 || t.require_reason === false);

  const c = Dashboard.card(root, 'Configuration', '');
  c.querySelector('.desc').outerHTML = `<div class="desc">💡 Sur Discord : <b>/ticket setup</b> (assistant) et <b>/ticket types setup</b> (types + rôles staff). Tout est synchronisé avec ce formulaire.</div>`;

  // 📊 État actuel (data-status pour le retrouver après innerHTML +=)
  c.appendChild(App.el(`<div data-status style="margin-bottom:12px"></div>`));

  c.innerHTML += `
    <label class="dash-label">Salon du panneau</label>
    <select class="dash-select" id="t-channel">
      ${textChannels.length ? '<option value="">— Choisir un salon —</option>' : Dashboard.noDiscordChoice('Aucun salon texte reçu de Discord')}
      ${textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(t.channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(t.channel, textChannels)}
    </select>

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

    <label class="dash-label">Rôle staff global</label>
    <select class="dash-select" id="t-role">
      ${rolesList.length ? '<option value="">— Choisir un rôle —</option>' : Dashboard.noDiscordChoice('Aucun rôle reçu de Discord')}
      ${rolesList.map((r) => `<option value="${App.escapeHtml(r.name)}" ${Dashboard.discordRefMatches(t.support_role, r) ? 'selected' : ''}>🛡️ ${App.escapeHtml(r.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(t.support_role, rolesList, '⚠️', 'configuration actuelle — rôle introuvable')}
    </select>

    <label class="dash-label">Catégorie par défaut</label>
    <select class="dash-select" id="t-cat">
      ${categories.length ? '<option value="">— Choisir une catégorie —</option>' : Dashboard.noDiscordChoice('Aucune catégorie reçue de Discord')}
      ${categories.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(t.category, ch) ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(t.category, categories, '⚠️', 'configuration actuelle — catégorie introuvable')}
    </select>

    <label class="dash-label">Message du panneau (vide = automatique)</label>
    <textarea class="dash-input" id="t-msg" rows="3">${App.escapeHtml(t.message || '')}</textarea>

    <label class="dash-label">📔 Journal des tickets (salon staff — récapitulatif à la fermeture)</label>
    <select class="dash-select" id="t-logchan">
      <option value="">— Désactivé (choisir un salon pour activer) —</option>
      ${textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches((data.settings || {}).ticket_log_channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption((data.settings || {}).ticket_log_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable')}
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
    .concat(textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(t.menu_channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  if (t.menu_channel && !textChannels.some((ch) => Dashboard.discordRefMatches(t.menu_channel, ch))) {
    menuChanOpts.push(Dashboard.currentDiscordOption(t.menu_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable'));
  }
  cm.innerHTML += `
    <label class="dash-label">Salon du panneau menu</label>
    <select class="dash-select" id="tm-channel">${menuChanOpts.join('')}</select>
    <label class="dash-label">📁 Catégorie où créer les salons de tickets du MENU</label>
    <select class="dash-select" id="tm-cat">
      <option value="">— Automatique (catégorie du type, sinon celle par défaut) —</option>
      ${categories.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(t.menu_category, ch) ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(t.menu_category, categories, '⚠️', 'configuration actuelle — catégorie introuvable')}
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
    const selected = c.querySelector('#t-channel').value.trim();
    const selectedChannel = textChannels.find((ch) => Dashboard.discordRefMatches(selected, ch));
    zone.innerHTML = selectedChannel
      ? `<span class="dash-badge ok">📨 Panneau configuré dans #${App.escapeHtml(selectedChannel.name)} — salon trouvé ✅</span>`
      : (selected
          ? `<span class="dash-badge warn">⚠️ Le salon enregistré n'est plus disponible dans Discord</span>`
          : `<span class="dash-badge warn">⚠️ Aucun salon défini — choisis-en un puis « Envoyer le panneau »</span>`);
  };
  renderStatus();
  c.querySelector('#t-channel').onchange = renderStatus;
  c.querySelector('#t-reason').onchange = () => {
    const on = c.querySelector('#t-reason').checked;
    c.querySelector('#t-reason').nextElementSibling.nextElementSibling.textContent = on
      ? '✅ Obligatoire : une raison est demandée avant l\'ouverture'
      : '❌ Désactivé : le ticket s\'ouvre directement';
  };

  c.querySelector('#t-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/tickets`, { method: 'PUT', body: {
        guild_id: guildId,
        channel: c.querySelector('#t-channel').value.trim(),
        button_label: c.querySelector('#t-label').value.trim() || '🎫 Ouvrir un ticket',
        button_style: c.querySelector('#t-style').value,
        require_reason: c.querySelector('#t-reason').checked ? 1 : 0,
        support_role: c.querySelector('#t-role').value.trim(),
        category: c.querySelector('#t-cat').value.trim() || 'Tickets',
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
          <label class="dash-label">🗂️ Catégorie</label>
          <select class="dash-select" data-k="categorySel">
            ${categories.length ? '<option value="">— Catégorie par défaut (Tickets) —</option>' : Dashboard.noDiscordChoice('Aucune catégorie reçue de Discord')}
            ${categories.map((ch) => `<option value="${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(x.category, ch) ? 'selected' : ''}>📁 ${App.escapeHtml(ch.name)}</option>`).join('')}
            ${Dashboard.currentDiscordOption(x.category, categories, '⚠️', 'configuration actuelle — catégorie introuvable')}
          </select>
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
      catSel.addEventListener('change', () => {
        x.category = catSel.value;
        renderPreview();
      });
      row.querySelector('[data-del]').onclick = () => { typesData.splice(i, 1); renderTypes(); renderPreview(); };
      const rolesEl = row.querySelector('.t-roles');
      const renderRoles = () => {
        rolesEl.innerHTML = '';
        x.staff_roles.forEach((r, j) => {
          const rr = App.el(`
            <div style="display:flex;gap:7px">
              <select class="dash-select t-role-sel">
                ${rolesList.length ? '<option value="">— Choisir un rôle —</option>' : Dashboard.noDiscordChoice('Aucun rôle reçu de Discord')}
                ${rolesList.map((role) => `<option value="${App.escapeHtml(role.name)}" ${Dashboard.discordRefMatches(r, role) ? 'selected' : ''}>🛡️ ${App.escapeHtml(role.name)}</option>`).join('')}
                ${r && !rolesList.some((role) => Dashboard.discordRefMatches(r, role)) ? `<option value="${App.escapeHtml(r)}" selected>⚠️ ${App.escapeHtml(r)} (configuration actuelle — rôle introuvable)</option>` : ''}
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

  // ============================================================
  // 🎨 NOUVEAU système indépendant : Tickets personnalisés
  // Il est volontairement placé SOUS l'ancien système et possède sa propre
  // table, ses propres IDs d'interaction et son propre panneau Discord.
  // ============================================================
  const adv = advancedConfig || { id: null, name: 'Créer un ticket', mode: 'buttons', channel: '', message: '', image_url: 'https://hoxera.is-a.dev/icons/support-banner.png', require_reason: 1, types: [] };
  const advancedData = {
    ...adv,
    name: String(adv.name || 'Créer un ticket'),
    mode: adv.mode === 'menu' ? 'menu' : 'buttons',
    channel: String(adv.channel || ''),
    message: String(adv.message || ''),
    image_url: String(adv.image_url || 'https://hoxera.is-a.dev/icons/support-banner.png'),
    require_reason: adv.require_reason === 0 ? 0 : 1,
    types: (Array.isArray(adv.types) && adv.types.length ? adv.types : [{ id: 't1', label: 'Support', emoji: '🎫', button_label: '', description: 'Demande générale au staff', category: '', questions: [], color: '#5865F2', button_style: '1', staff_roles: [] }]).map((x, i) => ({
      id: String(x.id || `t${i + 1}`), label: String(x.label || ''), emoji: String(x.emoji || ''), button_label: String(x.button_label || ''),
      description: String(x.description || ''), category: String(x.category || ''),
      questions: (Array.isArray(x.questions) ? x.questions : []).map((q) => String(q).trim()).filter(Boolean).slice(0, 5),
      color: /^#[0-9a-fA-F]{6}$/.test(String(x.color || '')) ? String(x.color) : '#5865F2',
      button_style: ['1', '2', '3', '4'].includes(String(x.button_style)) ? String(x.button_style) : '1',
      staff_roles: Array.isArray(x.staff_roles) ? [...x.staff_roles] : [],
    })),
  };
  const c3 = Dashboard.card(root, '🎨 Système de tickets personnalisés', 'Nouveau système indépendant : un salon privé par ticket, placé dans la catégorie choisie pour son type. L’ancien système au-dessus ne sera jamais modifié.');
  c3.classList.add('adv-builder-card');
  const advChannelOptions = ['<option value="">— Choisir un salon —</option>']
    .concat(textChannels.map((ch) => {
      const selected = advancedData.channel === ch.id || advancedData.channel === `#${ch.name}`;
      return `<option value="${App.escapeHtml(ch.id)}" ${selected ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`;
    }));
  if (advancedData.channel && !textChannels.some((ch) => advancedData.channel === ch.id || advancedData.channel === `#${ch.name}`)) {
    advChannelOptions.push(`<option value="${App.escapeHtml(advancedData.channel)}" selected>${App.escapeHtml(advancedData.channel)} (actuel)</option>`);
  }
  c3.innerHTML += `
    <div class="adv-builder-status"><span class="dash-badge ok">✅ Système séparé</span><span class="adv-status-copy">${advancedData.id ? 'Configuration enregistrée' : 'Pas encore configuré'}</span></div>
    <label class="dash-label">Nom visible du nouveau panneau</label>
    <input class="dash-input" id="adv-name" value="${App.escapeHtml(advancedData.name)}" placeholder="Tickets personnalisés" maxlength="80" />
    <label class="dash-label">Type d'affichage</label>
    <select class="dash-select" id="adv-mode" style="max-width:300px">
      <option value="buttons" ${advancedData.mode === 'buttons' ? 'selected' : ''}>🔘 Boutons simples (un bouton par type)</option>
      <option value="menu" ${advancedData.mode === 'menu' ? 'selected' : ''}>📋 Menu déroulant (choix du type)</option>
    </select>
    <label class="dash-label">Salon où envoyer le nouveau panneau</label>
    <select class="dash-select" id="adv-channel" style="max-width:360px">${advChannelOptions.join('')}</select>
    <label class="dash-label">Image en haut du panneau (URL https, optionnelle)</label>
    <input class="dash-input" id="adv-image" value="${App.escapeHtml(advancedData.image_url)}" placeholder="https://.../image.png" />
    <label class="dash-label">Message au-dessus du panneau (optionnel)</label>
    <textarea class="dash-input" id="adv-message" rows="2" maxlength="1900" placeholder="Choisis le service dont tu as besoin…">${App.escapeHtml(advancedData.message)}</textarea>
    <label class="adv-check-row"><input type="checkbox" id="adv-reason" ${advancedData.require_reason ? 'checked' : ''} /><span><b>Demander une raison avant de créer le ticket</b><small>La raison sera ajoutée au questionnaire si Discord a encore un champ disponible.</small></span></label>
    <div class="adv-placement-notice"><span>📁</span><div><b>Placement simple et prévisible</b><small>Chaque type doit avoir une catégorie existante. Le même salon privé sera visible uniquement par son créateur et le staff autorisé à ce type.</small></div></div>
    <div class="adv-builder-grid">
      <div class="adv-types-panel">
        <div class="adv-panel-heading"><div><b>🗂️ Types du nouveau système</b><small>Chaque type possède sa couleur, son bouton, ses rôles staff et jusqu'à 5 questions obligatoires.</small></div><span class="adv-count" id="adv-type-count"></span></div>
        <div id="adv-types"></div>
        <button class="dash-btn dash-btn-sm adv-add-type" id="adv-add-type">＋ Ajouter un type</button>
      </div>
      <div id="adv-preview" class="adv-preview-shell"></div>
    </div>
    <div class="adv-builder-actions">
      <button class="dash-btn dash-btn-primary" id="adv-save">💾 Enregistrer le nouveau système</button>
      <button class="dash-btn" id="adv-send">📨 Envoyer le nouveau panneau</button>
    </div>
    <div id="adv-status" class="desc adv-status-line"></div>`;

  const advTypesEl = c3.querySelector('#adv-types');
  const advTypeCountEl = c3.querySelector('#adv-type-count');
  const updateAdvTypeCount = () => {
    if (advTypeCountEl) advTypeCountEl.textContent = `${advancedData.types.filter((type) => type.label.trim()).length}/25`;
  };
  const advColorToStyle = { '1': '#5865F2', '2': '#4E5058', '3': '#3BA55D', '4': '#ED4245' };
  const advRenderPreview = () => {
    const mode = c3.querySelector('#adv-mode').value;
    const imageUrl = c3.querySelector('#adv-image').value.trim();
    const imagePreview = /^https:\/\//i.test(imageUrl) ? `<img src="${App.escapeHtml(imageUrl)}" alt="" style="display:block;width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:12px" />` : '';
    const validTypes = advancedData.types.filter((x) => x.label.trim());
    const questionBadge = (x) => (x.questions && x.questions.length)
      ? `<span style="display:inline-block;margin-left:6px;font-size:10px;background:rgba(88,101,242,.2);color:#AAB1FF;padding:1px 6px;border-radius:8px">❓ ${x.questions.length}</span>`
      : '';
    const body = mode === 'menu'
      ? `<div style="border:1px solid #1E1F22;border-radius:8px;padding:10px 12px;color:#A8ABAF">📋 Choisis un type…<div style="margin-top:8px">${validTypes.map((x) => `<div style="padding:6px 8px;border-top:1px solid #3f4147"><span style="color:${x.color}">●</span> ${App.escapeHtml(x.emoji || '🎫')} <b style="color:#DBDEE1">${App.escapeHtml(x.label)}</b>${questionBadge(x)}<small style="display:block;margin-left:22px;color:#949BA4">${App.escapeHtml(x.description || 'Ouvrir un ticket en privé.')}</small></div>`).join('')}</div></div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">${validTypes.map((x) => `<div style="padding:9px 10px;border-left:4px solid ${x.color};border-top:1px solid #3f4147"><b style="display:block;color:#DBDEE1">${App.escapeHtml(x.emoji || '🎫')} ${App.escapeHtml(x.label)}${questionBadge(x)}</b><small style="display:block;color:#949BA4;margin:3px 0 7px">${App.escapeHtml(x.description || 'Ouvrir un ticket en privé.')}</small><span style="display:inline-flex;background:${advColorToStyle[x.button_style] || '#5865F2'};color:#fff;font-weight:700;padding:6px 10px;border-radius:6px">${App.escapeHtml(x.emoji || '🎫')} ${App.escapeHtml(x.button_label || ('Envoyer un ticket ' + x.label.toLowerCase()))}</span></div>`).join('') || '<span style="color:var(--d-dim)">Ajoute un type pour voir l’aperçu.</span>'}</div>`;
    c3.querySelector('#adv-preview').innerHTML = `<div class="adv-preview-title">👀 Aperçu Discord <span>Mis à jour en direct</span></div><div class="adv-discord-preview">${imagePreview}<div class="adv-discord-title">🎨 ${App.escapeHtml(c3.querySelector('#adv-name').value || 'Créer un ticket')}</div>${body}</div>`;
  };
  const advRenderTypes = () => {
    advTypesEl.innerHTML = '';
    updateAdvTypeCount();
    advancedData.types.forEach((type, index) => {
      const availableRoles = rolesList.filter((r) => r.name !== '@everyone');
      const row = App.el(`
        <div class="adv-type-card">
          <div class="adv-type-head">
            <span class="adv-type-number">${String(index + 1).padStart(2, '0')}</span>
            <input class="dash-input" data-k="emoji" value="${App.escapeHtml(type.emoji)}" placeholder="🎫" style="max-width:60px;text-align:center" />
            <input class="dash-input" data-k="label" value="${App.escapeHtml(type.label)}" placeholder="Nom du type" maxlength="80" style="flex:1;min-width:150px" />
            <input class="dash-input" data-k="color" type="color" value="${type.color}" title="Couleur de l'embed" style="width:48px;height:38px;padding:3px" />
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:9px">
            <div><label class="dash-label">Style du bouton</label><select class="dash-select" data-k="button_style">
              <option value="1" ${type.button_style === '1' ? 'selected' : ''}>🔵 Bleu</option>
              <option value="2" ${type.button_style === '2' ? 'selected' : ''}>⚪ Gris</option>
              <option value="3" ${type.button_style === '3' ? 'selected' : ''}>🟢 Vert</option>
              <option value="4" ${type.button_style === '4' ? 'selected' : ''}>🔴 Rouge</option>
            </select></div>
            <div><label class="dash-label">Catégorie de création du ticket</label><select class="dash-select" data-k="category">
              <option value="">— Choisir une catégorie (obligatoire) —</option>
              ${categories.map((cat) => `<option value="${App.escapeHtml(cat.id)}" ${Dashboard.discordRefMatches(type.category, cat) ? 'selected' : ''}>📁 ${App.escapeHtml(cat.name)}</option>`).join('')}
              ${Dashboard.currentDiscordOption(type.category, categories, '⚠️', 'configuration actuelle — catégorie introuvable')}
            </select><small class="adv-category-help">Le salon privé sera créé directement ici. Optimus Prime ne créera jamais de catégorie.</small></div>
          </div>
          <label class="dash-label">Description du type</label>
          <input class="dash-input" data-k="description" value="${App.escapeHtml(type.description)}" placeholder="Ex : demande privée au staff" maxlength="100" />
          <label class="dash-label">Texte du bouton (vide = « Envoyer un ticket + nom »)</label>
          <input class="dash-input" data-k="button_label" value="${App.escapeHtml(type.button_label)}" placeholder="Envoyer un ticket ${App.escapeHtml(type.label || 'support')}" maxlength="80" />
          <label class="dash-label" style="margin-top:12px">❓ Questionnaire de ce type (réponses obligatoires — max 5)</label>
          <div data-questions style="display:flex;flex-direction:column;gap:6px"></div>
          <button class="dash-btn dash-btn-sm" data-addquestion style="margin-top:6px">＋ Ajouter une question</button>
          <div style="color:var(--d-dim);font-size:10.5px;margin-top:5px">Au clic sur ce type, le membre devra répondre à ces questions avant la création du ticket.</div>
          <label class="dash-label">Rôles staff autorisés (sélection)</label>
          <div data-roles></div>
          <button class="dash-btn dash-btn-sm" data-addrole style="margin-top:6px">＋ Ajouter un rôle staff</button>
        </div>`);
      const rolesEl = row.querySelector('[data-roles]');
      const renderTypeRoles = () => {
        rolesEl.innerHTML = '';
        if (!type.staff_roles.length) rolesEl.appendChild(App.el(`<div style="font-size:11.5px;color:var(--d-dim)">Aucun rôle spécifique — gestionnaire du serveur uniquement.</div>`));
        type.staff_roles.forEach((roleName, roleIndex) => {
          const roleOptions = [availableRoles.length ? '<option value="">— Choisir un rôle staff —</option>' : Dashboard.noDiscordChoice('Aucun rôle reçu de Discord')]
            .concat(availableRoles.map((role) => `<option value="${App.escapeHtml(role.name)}" ${Dashboard.discordRefMatches(roleName, role) ? 'selected' : ''}>🛡️ ${App.escapeHtml(role.name)}</option>`));
          if (roleName && !availableRoles.some((role) => Dashboard.discordRefMatches(roleName, role))) roleOptions.push(`<option value="${App.escapeHtml(roleName)}" selected>⚠️ ${App.escapeHtml(roleName)} (configuration actuelle — rôle introuvable)</option>`);
          const rr = App.el(`<div style="display:flex;gap:7px;margin-top:6px"><select class="dash-select" style="flex:1">${roleOptions.join('')}</select><button class="dash-btn dash-btn-danger dash-btn-sm">🗑</button></div>`);
          const sel = rr.querySelector('select');
          if (roleName && [...sel.options].some((option) => option.value === roleName)) sel.value = roleName;
          sel.onchange = () => { type.staff_roles[roleIndex] = sel.value; };
          rr.querySelector('button').onclick = () => { type.staff_roles.splice(roleIndex, 1); renderTypeRoles(); };
          rolesEl.appendChild(rr);
        });
      };
      renderTypeRoles();
      const questionsEl = row.querySelector('[data-questions]');
      const renderTypeQuestions = () => {
        questionsEl.innerHTML = '';
        if (!type.questions.length) {
          questionsEl.appendChild(App.el(`<div style="font-size:11.5px;color:var(--d-dim)">Aucune question — seule la raison générale sera demandée si elle est activée.</div>`));
        }
        type.questions.forEach((question, questionIndex) => {
          const questionRow = App.el(`
            <div class="adv-question-row">
              <span style="font-size:11px;color:var(--d-dim);min-width:17px">${questionIndex + 1}.</span>
              <input class="dash-input" value="${App.escapeHtml(question)}" placeholder="Ex : Quel est ton pseudo ?" maxlength="45" style="flex:1" />
              <button class="dash-btn dash-btn-danger dash-btn-sm">🗑</button>
            </div>`);
          questionRow.querySelector('input').addEventListener('input', (event) => {
            type.questions[questionIndex] = event.target.value;
          });
          questionRow.querySelector('button').onclick = () => {
            type.questions.splice(questionIndex, 1);
            renderTypeQuestions();
            advRenderPreview();
          };
          questionsEl.appendChild(questionRow);
        });
      };
      renderTypeQuestions();
      row.querySelectorAll('[data-k]').forEach((input) => {
        const event = input.type === 'color' || input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(event, () => {
          type[input.dataset.k] = input.value;
          if (input.dataset.k === 'label') updateAdvTypeCount();
          advRenderPreview();
        });
      });
      row.querySelector('[data-addrole]').onclick = () => { type.staff_roles.push(''); renderTypeRoles(); };
      row.querySelector('[data-addquestion]').onclick = () => {
        if (type.questions.length >= 5) return App.toast('Maximum 5 questions par type.', 'error');
        type.questions.push('');
        renderTypeQuestions();
      };
      row.querySelector('[data-del]').onclick = () => { advancedData.types.splice(index, 1); advRenderTypes(); advRenderPreview(); };
      advTypesEl.appendChild(row);
    });
  };
  advRenderTypes();
  advRenderPreview();
  c3.querySelector('#adv-name').oninput = advRenderPreview;
  c3.querySelector('#adv-image').oninput = advRenderPreview;
  c3.querySelector('#adv-mode').onchange = advRenderPreview;
  c3.querySelector('#adv-add-type').onclick = () => {
    if (advancedData.types.length >= 25) return App.toast('Discord limite ce panneau à 25 types.', 'error');
    advancedData.types.push({ id: `t${Date.now()}`, label: '', emoji: '🎫', description: '', category: '', questions: [], color: '#5865F2', button_style: '1', staff_roles: [] });
    advRenderTypes(); advRenderPreview();
  };
  c3.querySelector('#adv-save').onclick = async () => {
    const validTypes = advancedData.types.filter((x) => x.label.trim());
    if (!validTypes.length) return App.toast('Ajoute au moins un type de ticket.', 'error');
    const missingCategory = validTypes.find((type) => !String(type.category || '').trim());
    if (missingCategory) return App.toast(`Choisis une catégorie Discord pour le type « ${missingCategory.label} ».`, 'error');
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/advanced-tickets`, { method: 'PUT', body: {
        name: c3.querySelector('#adv-name').value.trim(), mode: c3.querySelector('#adv-mode').value,
        channel: c3.querySelector('#adv-channel').value, message: c3.querySelector('#adv-message').value,
        image_url: c3.querySelector('#adv-image').value.trim(),
        require_reason: c3.querySelector('#adv-reason').checked ? 1 : 0, types: validTypes,
      }});
      advancedData.id = r.config && r.config.id;
      c3.querySelector('#adv-status').textContent = '✅ Nouveau système enregistré. Tu peux maintenant envoyer son panneau.';
      App.toast('Nouveau système de tickets enregistré !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
  c3.querySelector('#adv-send').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/advanced-tickets/send`, { method: 'POST' });
      c3.querySelector('#adv-status').textContent = '✅ Nouveau panneau envoyé dans le salon choisi. L’ancien panneau n’a pas été touché.';
      App.toast('Nouveau panneau personnalisé envoyé !');
    } catch (e) { App.toast(e.message, 'error'); }
  };
};

// ---------- Bienvenue ----------
Dashboard.renderers.welcome = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '👋', 'Bienvenue & auto-rôles', 'Accueille les nouveaux membres et donne des rôles automatiquement.');
  const defs = data.events.defs;
  const state = data.events.state || {};
  const textChannels = (data.channels || []).filter((c) => !c.category && !c.voice);
  const categories = (data.channels || []).filter((c) => c.category);
  const rolesList = (data.roles || []).filter((role) => role.name !== '@everyone');

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
        // 🏷️ Sélecteur multiple de rôles : l'événement historique attend
        // des noms séparés par des virgules, donc on conserve volontairement
        // le nom comme valeur de compatibilité.
        cfgZone.appendChild(App.el(`<label class="dash-label">${f.label}</label>`));
        const selected = new Set(String(ev.config[f.key] || '').split(',').map((value) => value.trim()).filter(Boolean));
        const box = App.el(`<div class="dash-roles-multi" data-k="${f.key}"></div>`);
        Dashboard.renderDiscordMultiSelect(box, {
          items: rolesList,
          selected,
          icon: '🛡️',
          placeholder: 'Ajouter un rôle automatique',
          emptyText: 'Aucun rôle reçu de Discord.',
          selectedEmptyText: 'Aucun rôle automatique sélectionné.',
          getValue: (role) => role.name,
          selectedClass: 'discord-multi-choice',
        });
        cfgZone.appendChild(box);
        return;
      }
      cfgZone.appendChild(App.el(`<label class="dash-label">${f.label}</label>`));

      if (f.type === 'channel') {
        // Un salon Discord se choisit toujours dans la liste. Une ancienne
        // valeur introuvable reste visible pour éviter de l'effacer sans
        // avertissement, mais ne redevient jamais un champ libre.
        const current = String(ev.config[f.key] || '');
        const opts = [textChannels.length ? '<option value="">— Choisir un salon —</option>' : Dashboard.noDiscordChoice('Aucun salon texte reçu de Discord')]
          .concat(textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(current, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`))
          .concat(Dashboard.currentDiscordOption(current, textChannels));
        cfgZone.appendChild(App.el(`<select class="dash-select" data-k="${f.key}">${opts.join('')}</select>`));
        return;
      }

      if (f.type === 'role') {
        const current = String(ev.config[f.key] || '');
        const opts = [rolesList.length ? '<option value="">— Choisir un rôle —</option>' : Dashboard.noDiscordChoice('Aucun rôle reçu de Discord')]
          .concat(rolesList.map((r) => `<option value="${App.escapeHtml(r.name)}" ${Dashboard.discordRefMatches(current, r) ? 'selected' : ''}>🛡️ ${App.escapeHtml(r.name)}</option>`))
          .concat(Dashboard.currentDiscordOption(current, rolesList, '⚠️', 'configuration actuelle — rôle introuvable'));
        cfgZone.appendChild(App.el(`<select class="dash-select" data-k="${f.key}">${opts.join('')}</select>`));
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

    // 👀 Aperçu Discord en direct (arrivée + départ), avec les vraies données du serveur
    if (key === 'member_join' || key === 'member_leave') {
      const pv = App.el(`<div class="dc-preview" style="margin-top:12px"><div class="dash-label" style="margin:0 0 8px">👀 Aperçu sur Discord</div><div class="dc-msg"></div></div>`);
      const renderPv = () => {
        const msgEl = pv.querySelector('.dc-msg');
        const get = (k) => { const el = cfgZone.querySelector(`[data-k="${k}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
        const serverName = (data.guild && data.guild.name) || 'Ton serveur';
        const memberCount = String((data.guild && data.guild.members) || '?');
        const txt = String(get('message') || 'Bienvenue {user} !').replace('{user}', '@NouveauMembre').replace('{server}', serverName).replace('{count}', memberCount);
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
          // 🏷️ multi-rôles : valeurs du sélecteur, séparées par des virgules
          config[inp.dataset.k] = [...(inp.__discordSelected || [])].join(', ');
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
  const textChannels = (data.channels || []).filter((channel) => !channel.category && !channel.voice);
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
    <select class="dash-select" id="xp-channel">
      <option value="">— Salon du message —</option>
      ${textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(s.xp_channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(s.xp_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable')}
    </select>
    <button class="dash-btn dash-btn-primary" style="margin-top:14px" id="xp-save">💾 Enregistrer</button>`;

  const c2 = Dashboard.card(root, '🏆 Récompenses de niveau', 'Rôle donné automatiquement quand le membre atteint le niveau.');
  c2.appendChild(App.el(`<div id="xp-roles"></div>`));
  c2.appendChild(App.el(`<button class="dash-btn dash-btn-sm" id="xp-add" style="margin-top:8px">＋ Ajouter une récompense</button>`));
  const xpRoleChoices = (data.roles || []).filter((role) => role.name !== '@everyone');

  const renderRoles = () => {
    const el = c2.querySelector('#xp-roles');
    el.innerHTML = '';
    if (!rolesData.length) el.appendChild(App.el(`<div class="dash-empty">Aucune récompense.</div>`));
    rolesData.forEach((r, i) => {
      const options = [xpRoleChoices.length ? '<option value="">— Choisir un rôle —</option>' : Dashboard.noDiscordChoice('Aucun rôle reçu de Discord')]
        .concat(xpRoleChoices.map((role) => `<option value="${App.escapeHtml(role.name)}" ${Dashboard.discordRefMatches(r.role, role) ? 'selected' : ''}>🛡️ ${App.escapeHtml(role.name)}</option>`));
      if (r.role && !xpRoleChoices.some((role) => Dashboard.discordRefMatches(r.role, role))) options.push(`<option value="${App.escapeHtml(r.role)}" selected>⚠️ ${App.escapeHtml(r.role)} (configuration actuelle — rôle introuvable)</option>`);
      const roleControl = `<select class="dash-select" data-k="role">${options.join('')}</select>`;
      const row = App.el(`
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <input class="dash-input" data-k="level" type="number" value="${r.level}" style="max-width:100px" />
          ${roleControl}
          <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
        </div>`);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        const event = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(event, () => { r[inp.dataset.k] = inp.dataset.k === 'level' ? (parseInt(inp.value, 10) || 1) : inp.value; });
      });
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
    const table = App.el(`<table class="dash-table"><thead><tr><th>#</th><th>Membre</th><th>Coins</th><th>Série 🔥</th></tr></thead><tbody></tbody></table>`);
    const tb = table.querySelector('tbody');
    lb.top.forEach((r, i) => tb.appendChild(App.el(`<tr><td>${['🥇','🥈','🥉'][i] || i + 1}</td><td><@${r.user_id}></td><td>🪙 ${r.coins}</td><td>${Number(r.daily_streak) > 1 ? `${r.daily_streak} j` : '—'}</td></tr>`)));
    c.appendChild(table);
    // 📥 Export CSV (v190)
    const exp = App.el(`<div style="margin-top:12px"><button class="btn btn-sm" id="exp-csv">📥 Exporter CSV</button></div>`);
    c.appendChild(exp);
    exp.querySelector('#exp-csv').onclick = () => {
      const rows = lb.top.map((r, i) => ({ rang: i + 1, user_id: r.user_id, coins: r.coins, serie_jours: Number(r.daily_streak) || 0 }));
      App.downloadCSV(`economie_${Dashboard.state.guildId}.csv`, rows);
    };
  }
};

// ---------- Boutique ----------
Dashboard.renderers.shop = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🛒', 'Boutique', 'Les membres achètent des rôles avec leurs coins (/shop, /buy). Tu gères les articles ici.');
  const { items } = await App.api(`/bots/${bot.id}/guilds/${guildId}/shop`);
  const itemsData = items.map((i) => ({ id: i.id, name: i.name, description: i.description, price: i.price, role: i.role, emoji: i.emoji }));
  const roleChoices = (data && data.roles || []).filter((role) => role.name !== '@everyone');
  const c = Dashboard.card(root, 'Articles', 'Prix en coins. Le rôle est donné automatiquement à l\'achat.');
  c.appendChild(App.el(`<div id="shop-items"></div>`));
  c.appendChild(App.el(`<button class="dash-btn dash-btn-sm" id="shop-add" style="margin-top:8px">＋ Ajouter un article</button>`));
  const render = () => {
    const el = c.querySelector('#shop-items');
    el.innerHTML = '';
    if (!itemsData.length) el.appendChild(App.el(`<div class="dash-empty">Boutique vide.</div>`));
    itemsData.forEach((it, i) => {
      const roleOptions = [roleChoices.length ? '<option value="">— Choisir un rôle —</option>' : Dashboard.noDiscordChoice('Aucun rôle reçu de Discord')]
        .concat(roleChoices.map((role) => `<option value="${App.escapeHtml(role.name)}" ${Dashboard.discordRefMatches(it.role, role) ? 'selected' : ''}>🛡️ ${App.escapeHtml(role.name)}</option>`));
      if (it.role && !roleChoices.some((role) => Dashboard.discordRefMatches(it.role, role))) roleOptions.push(`<option value="${App.escapeHtml(it.role)}" selected>⚠️ ${App.escapeHtml(it.role)} (configuration actuelle — rôle introuvable)</option>`);
      const roleControl = `<select class="dash-select" data-k="role">${roleOptions.join('')}</select>`;
      const row = App.el(`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <input class="dash-input" data-k="emoji" value="${App.escapeHtml(it.emoji)}" style="max-width:58px;text-align:center" />
          <input class="dash-input" data-k="name" value="${App.escapeHtml(it.name)}" placeholder="Nom" style="min-width:110px;flex:1" />
          ${roleControl}
          <input class="dash-input" data-k="price" type="number" value="${it.price}" style="max-width:90px" />
          <input class="dash-input" data-k="description" value="${App.escapeHtml(it.description)}" placeholder="Description" style="min-width:130px;flex:1" />
          <button class="dash-btn dash-btn-danger dash-btn-sm" data-del>🗑</button>
        </div>`);
      row.querySelectorAll('[data-k]').forEach((inp) => {
        const event = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(event, () => { it[inp.dataset.k] = inp.dataset.k === 'price' ? (parseInt(inp.value, 10) || 1) : inp.value; });
      });
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
  const serverSettings = data.settings || {};
  const draftKey = `hx-am-draft:${bot.id}:${guildId}`;
  let automodDraft = null;
  try {
    const storedDraft = localStorage.getItem(draftKey);
    if (storedDraft) automodDraft = JSON.parse(storedDraft);
  } catch {}
  const s = { ...serverSettings, ...(automodDraft && typeof automodDraft === 'object' ? automodDraft : {}) };
  const blacklist = automodDraft && Array.isArray(automodDraft.blacklist) ? automodDraft.blacklist : (data.blacklist || []);
  const [{ sanctions }, memberResult] = await Promise.all([
    App.api(`/bots/${bot.id}/guilds/${guildId}/sanctions`),
    App.api(`/bots/${bot.id}/guilds/${guildId}/members`).catch(() => ({ members: [] })),
  ]);
  const automodMembers = (memberResult.members || []).map((member) => ({
    id: String(member.id),
    name: String(member.username || member.tag || member.id),
  }));
  const root = Dashboard.header(content, '🛡️', 'Modération', 'Auto-modération, liste noire et sanctions prédéfinies (/sanction membre nom).');

  const parseAMList = (value) => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  };
  const parseAMObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
  };
  const ruleActions = parseAMObject(s.am_rule_actions);
  const blacklistRuleActions = parseAMObject(s.am_blacklist_rules);
  const blacklistThresholds = parseAMObject(s.am_blacklist_thresholds);
  const blacklistAfter = (rule) => !!(blacklistRuleActions[rule] === true || blacklistRuleActions[rule] === 1 || blacklistRuleActions[rule] === '1' || blacklistRuleActions[rule] === 'true');
  const blacklistThresholdFor = (rule) => Math.min(Math.max(parseInt(blacklistThresholds[rule], 10) || 0, 0), 50);
  const actionLabels = {
    inherit: 'Comportement actuel',
    log: '📋 Journal seulement',
    delete: '🗑️ Supprimer uniquement',
    warn: '⚠️ Supprimer + avertir',
    timeout: '⏱️ Supprimer + timeout',
    kick: '👢 Supprimer + expulser',
    ban: '🔨 Supprimer + bannir',
  };
  const actionOptions = (rule) => Object.entries(actionLabels).map(([value, label]) => `<option value="${value}" ${String(ruleActions[rule] || 'inherit') === value ? 'selected' : ''}>${label}</option>`).join('');
  const selectedExemptRoles = new Set(parseAMList(s.am_exempt_roles));
  const selectedExemptChannels = new Set(parseAMList(s.am_exempt_channels));
  const selectedExemptUsers = new Set(parseAMList(s.am_exempt_users));
  const rolesList = (data.roles || []).filter((role) => role.name !== '@everyone');
  const channelList = (data.channels || []).filter((channel) => !channel.category && !channel.voice);
  const currentBlacklistChannel = String(s.am_blacklist_channel || '').trim();
  const blacklistChannelOptions = [
    channelList.length ? '<option value="">— Aucun salon dédié —</option>' : Dashboard.noDiscordChoice('Aucun salon texte reçu de Discord'),
    ...channelList.map((channel) => `<option value="${App.escapeHtml(channel.id)}" ${Dashboard.discordRefMatches(currentBlacklistChannel, channel) ? 'selected' : ''}>💬 #${App.escapeHtml(channel.name)}</option>`),
  ];
  if (currentBlacklistChannel && !channelList.some((channel) => Dashboard.discordRefMatches(currentBlacklistChannel, channel))) {
    blacklistChannelOptions.push(Dashboard.currentDiscordOption(currentBlacklistChannel, channelList, '⚠️', 'configuration actuelle — salon blacklist introuvable'));
  }
  const blacklistDuration = Math.min(Math.max(parseInt(s.am_blacklist_duration_min, 10) || 0, 0), 525600);
  const blacklistDurations = [[0, '♾️ Permanente'], [60, '1 heure'], [360, '6 heures'], [1440, '24 heures'], [4320, '3 jours'], [10080, '7 jours'], [43200, '30 jours'], [525600, '365 jours']];
  const blacklistDurationOptions = blacklistDurations.map(([value, label]) => `<option value="${value}" ${blacklistDuration === value ? 'selected' : ''}>${label}</option>`);
  const nativeAlertChannel = String(s.am_native_alert_channel || '').trim();
  const nativeChannelOptions = [
    '<option value="">— Utiliser le salon de logs ou blacklist —</option>',
    ...channelList.map((channel) => `<option value="${App.escapeHtml(channel.id)}" ${Dashboard.discordRefMatches(nativeAlertChannel, channel) ? 'selected' : ''}>💬 #${App.escapeHtml(channel.name)}</option>`),
  ];
  if (nativeAlertChannel && !channelList.some((channel) => Dashboard.discordRefMatches(nativeAlertChannel, channel))) {
    nativeChannelOptions.push(Dashboard.currentDiscordOption(nativeAlertChannel, channelList, '⚠️', 'configuration actuelle — salon introuvable'));
  }
  const blacklistData = blacklist.map((word) => ({ word: String(word || '') }));
  const memberBlacklistData = Array.isArray(data.automod_blacklist) ? data.automod_blacklist : [];

  const c = Dashboard.card(root, '🛡️ Auto-modération', 'Un centre de protection complet : règles séparées, mode observation, actions maîtrisées et simulation sans risque.');
  c.classList.add('am-control-card');
  c.innerHTML += `
    <div class="am-control-hero">
      <div class="am-hero-copy"><span class="am-shield-icon">🛡️</span><div><b>Protection intelligente</b><small id="am-status-line">${automodDraft ? '🟡 Brouillon local affiché — pas encore publié.' : (s.am_enabled ? 'Le serveur est protégé.' : 'La protection est désactivée.')}</small></div></div>
      <label class="am-main-toggle"><span>Activer</span><input type="checkbox" id="am-on" ${s.am_enabled ? 'checked' : ''} /><i></i></label>
    </div>
    <div class="am-mode-row">
      <div><label class="dash-label">Mode de fonctionnement</label><select class="dash-select" id="am-mode" style="max-width:260px">
        <option value="enforce" ${s.am_mode !== 'observe' ? 'selected' : ''}>🛡️ Protection active</option>
        <option value="observe" ${s.am_mode === 'observe' ? 'selected' : ''}>👀 Observation sans sanction</option>
      </select></div>
      <div class="am-mode-note" id="am-mode-note">${s.am_mode === 'observe' ? '👀 Les règles seront enregistrées, mais aucun message ne sera supprimé et aucune sanction ne sera appliquée.' : '🟢 Les règles appliquent les actions configurées aux messages détectés.'}</div>
    </div>
    <div class="am-rule-heading"><div><b>Règles de protection</b><small>Chaque règle peut avoir sa propre action. « Comportement actuel » conserve la logique historique.</small></div><span class="dash-badge ok">⚡ Temps réel</span></div>
    <div class="am-rule-grid">
      <div class="am-rule-card" data-am-rule-card="links">
        <div class="am-rule-head"><div class="am-rule-name"><span class="am-rule-icon">🔗</span><div><b>Liens et invitations</b><small>Bloque les URL et invitations Discord.</small></div></div><input type="checkbox" id="am-links" ${s.am_links ? 'checked' : ''} /></div>
        <label class="am-rule-action">Action<select class="dash-select" id="am-action-links" data-am-action="links">${actionOptions('links')}</select></label>
        <label class="am-blacklist-toggle"><input type="checkbox" id="am-blacklist-links" data-am-blacklist-rule="links" ${blacklistAfter('links') ? 'checked' : ''} /><span><b>🚫 Blacklist après sanction</b><small>Ajoute le membre au registre du serveur et envoie le panneau dédié.</small></span></label>
        <div class="am-threshold-box"><label>Blacklist après répétition</label><div class="am-threshold-controls"><input class="dash-input" type="number" min="0" max="50" data-am-threshold="links" value="${blacklistThresholdFor('links')}" /><span>sanction(s) identique(s)</span></div><small>0 = désactivé. La sanction choisie ci-dessus doit être appliquée.</small></div>
      </div>
      <div class="am-rule-card" data-am-rule-card="caps">
        <div class="am-rule-head"><div class="am-rule-name"><span class="am-rule-icon">🔠</span><div><b>Majuscules</b><small>Détecte les messages écrits presque entièrement en majuscules.</small></div></div><input type="checkbox" id="am-caps" ${s.am_caps ? 'checked' : ''} /></div>
        <label class="am-rule-action">Action<select class="dash-select" id="am-action-caps" data-am-action="caps">${actionOptions('caps')}</select></label>
        <label class="am-blacklist-toggle"><input type="checkbox" id="am-blacklist-caps" data-am-blacklist-rule="caps" ${blacklistAfter('caps') ? 'checked' : ''} /><span><b>🚫 Blacklist après sanction</b><small>Conserve le membre dans la blacklist de ce serveur.</small></span></label>
        <div class="am-threshold-box"><label>Blacklist après répétition</label><div class="am-threshold-controls"><input class="dash-input" type="number" min="0" max="50" data-am-threshold="caps" value="${blacklistThresholdFor('caps')}" /><span>sanction(s) identique(s)</span></div><small>0 = désactivé. La sanction choisie ci-dessus doit être appliquée.</small></div>
      </div>
      <div class="am-rule-card" data-am-rule-card="mentions">
        <div class="am-rule-head"><div class="am-rule-name"><span class="am-rule-icon">📣</span><div><b>Mentions excessives</b><small>Bloque les rafales de mentions dans un message.</small></div></div></div>
        <label class="am-rule-setting">Mentions maximum <input class="dash-input" id="am-men" type="number" min="0" max="100" value="${s.am_mentions ?? 5}" /><small>0 = illimité</small></label>
        <label class="am-rule-action">Action<select class="dash-select" id="am-action-mentions" data-am-action="mentions">${actionOptions('mentions')}</select></label>
        <label class="am-blacklist-toggle"><input type="checkbox" id="am-blacklist-mentions" data-am-blacklist-rule="mentions" ${blacklistAfter('mentions') ? 'checked' : ''} /><span><b>🚫 Blacklist après sanction</b><small>Ajoute le membre seulement après une action réellement appliquée.</small></span></label>
        <div class="am-threshold-box"><label>Blacklist après répétition</label><div class="am-threshold-controls"><input class="dash-input" type="number" min="0" max="50" data-am-threshold="mentions" value="${blacklistThresholdFor('mentions')}" /><span>sanction(s) identique(s)</span></div><small>0 = désactivé. La sanction choisie ci-dessus doit être appliquée.</small></div>
      </div>
      <div class="am-rule-card" data-am-rule-card="words">
        <div class="am-rule-head"><div class="am-rule-name"><span class="am-rule-icon">🚫</span><div><b>Mots interdits</b><small>Utilise la liste noire configurée plus bas.</small></div></div><span class="am-rule-state">${blacklist.length ? '🟢 Actif' : '⚪ En attente'}</span></div>
        <label class="am-rule-action">Action<select class="dash-select" id="am-action-words" data-am-action="words">${actionOptions('words')}</select></label>
        <label class="am-blacklist-toggle"><input type="checkbox" id="am-blacklist-words" data-am-blacklist-rule="words" ${blacklistAfter('words') ? 'checked' : ''} /><span><b>🚫 Blacklist après sanction</b><small>Le mot interdit déclenche aussi la blacklist du membre.</small></span></label>
        <div class="am-threshold-box"><label>Blacklist après répétition</label><div class="am-threshold-controls"><input class="dash-input" type="number" min="0" max="50" data-am-threshold="words" value="${blacklistThresholdFor('words')}" /><span>sanction(s) identique(s)</span></div><small>0 = désactivé. La sanction choisie ci-dessus doit être appliquée.</small></div>
      </div>
      <div class="am-rule-card" data-am-rule-card="spam">
        <div class="am-rule-head"><div class="am-rule-name"><span class="am-rule-icon">💥</span><div><b>Anti-spam</b><small>Détecte plusieurs messages envoyés en peu de temps.</small></div></div></div>
        <label class="am-rule-setting">Messages en 5 secondes <input class="dash-input" id="am-spam" type="number" min="0" max="50" value="${s.am_spam ?? 5}" /><small>0 = désactivé</small></label>
        <label class="am-rule-action">Action<select class="dash-select" id="am-action-spam" data-am-action="spam">${actionOptions('spam')}</select></label>
        <label class="am-blacklist-toggle"><input type="checkbox" id="am-blacklist-spam" data-am-blacklist-rule="spam" ${blacklistAfter('spam') ? 'checked' : ''} /><span><b>🚫 Blacklist après sanction</b><small>Classe le membre après la détection de spam confirmée.</small></span></label>
        <div class="am-threshold-box"><label>Blacklist après répétition</label><div class="am-threshold-controls"><input class="dash-input" type="number" min="0" max="50" data-am-threshold="spam" value="${blacklistThresholdFor('spam')}" /><span>sanction(s) identique(s)</span></div><small>0 = désactivé. La sanction choisie ci-dessus doit être appliquée.</small></div>
      </div>
    </div>
    <div class="am-policy-row">
      <label class="am-inline-toggle"><input type="checkbox" id="am-staff" ${s.am_ignore_staff !== 0 ? 'checked' : ''} /><span><b>Ignorer les administrateurs et modérateurs</b><small>Recommandé pour éviter de filtrer le staff.</small></span></label>
      <div class="am-policy-time"><label class="dash-label">Durée du timeout par règle (minutes)</label><input class="dash-input" id="am-timeout" type="number" min="1" max="1440" value="${s.am_timeout_min ?? 5}" /></div>
    </div>
    <label class="dash-label">Message privé d'avertissement (vide = message standard)</label>
    <input class="dash-input" id="am-warn" value="${App.escapeHtml(s.am_warn_text || '')}" placeholder="Variables disponibles : {reason} et {server}." />
    <div class="am-warning-panel">
      <div class="am-panel-title"><div><b>⚠️ Avertissements progressifs</b><small>Le compteur actif est séparé de l'historique et repart à zéro après une sanction réussie.</small></div><span>1 → 2 → action</span></div>
      <div class="am-warning-grid">
        <div><label class="dash-label">Sanction après X avertissements</label><input class="dash-input" id="am-warn-limit" type="number" min="0" max="50" value="${s.am_warn_limit ?? 2}" /><small class="am-help">0 = désactivé</small></div>
        <div><label class="dash-label">Action automatique</label><select class="dash-select" id="am-warn-action">
          <option value="none" ${s.am_warn_action === 'none' ? 'selected' : ''}>🔕 Journal seulement</option>
          <option value="timeout" ${(s.am_warn_action || 'timeout') === 'timeout' ? 'selected' : ''}>⏱️ Timeout</option>
          <option value="kick" ${s.am_warn_action === 'kick' ? 'selected' : ''}>👢 Expulser</option>
          <option value="ban" ${s.am_warn_action === 'ban' ? 'selected' : ''}>🔨 Bannir</option>
        </select></div>
        <div><label class="dash-label">Durée du timeout (minutes)</label><input class="dash-input" id="am-warn-timeout" type="number" min="1" max="1440" value="${s.am_warn_timeout_min ?? 10}" /></div>
      </div>
    </div>
    <div class="am-blacklist-config">
      <div class="am-panel-title"><div><b>🚫 Blacklist des membres par serveur</b><small>Après une sanction réellement appliquée, Optimus Prime enregistre le membre ici et publie un panneau dans le salon choisi.</small></div><span class="am-blacklist-badge">Serveur uniquement</span></div>
      <div class="am-blacklist-duration"><div><label class="dash-label">Durée d’une blacklist</label><select class="dash-select" id="am-blacklist-duration">${blacklistDurationOptions.join('')}</select></div><small>Cette durée s’applique aux blacklists immédiates et à celles déclenchées après plusieurs sanctions. Le compteur est remis à zéro après le déclenchement.</small></div>
      <div class="am-blacklist-grid">
        <div><label class="dash-label">Salon dédié aux panneaux blacklist</label><select class="dash-select" id="am-blacklist-channel">${blacklistChannelOptions.join('')}</select><small class="am-help">Le panneau sera envoyé dans ce salon après l’action Auto-Mod. Si le salon est introuvable, le membre reste enregistré mais l’envoi sera signalé.</small></div>
        <div><label class="dash-label">Titre du panneau</label><input class="dash-input" id="am-blacklist-title" maxlength="120" value="${App.escapeHtml(s.am_blacklist_title || '🚫 Membre ajouté à la blacklist')}" placeholder="🚫 Membre ajouté à la blacklist" /><label class="dash-label">Couleur du panneau</label><div class="am-blacklist-color"><input type="color" id="am-blacklist-color" value="${/^#[0-9a-fA-F]{6}$/.test(String(s.am_blacklist_color || '')) ? String(s.am_blacklist_color) : '#ED4245'}" /><input class="dash-input" id="am-blacklist-color-text" maxlength="7" value="${App.escapeHtml(/^#[0-9a-fA-F]{6}$/.test(String(s.am_blacklist_color || '')) ? String(s.am_blacklist_color) : '#ED4245')}" aria-label="Code couleur du panneau" /></div></div>
      </div>
      <label class="dash-label">Pied de panneau</label><input class="dash-input" id="am-blacklist-footer" maxlength="200" value="${App.escapeHtml(s.am_blacklist_footer || 'Blacklist du serveur · Optimus Prime')}" placeholder="Blacklist du serveur · Optimus Prime" />
      <div class="am-blacklist-preview"><span class="am-blacklist-preview-icon">🚫</span><div><b>Prévisualisation</b><small>Le panneau indiquera l’utilisateur, le comportement, l’action appliquée, le salon d’origine et la date.</small></div></div>
    </div>
    <div class="am-save-row"><span class="am-save-hint">💡 Brouillon local → teste en observation → publie quand tout est correct.</span><div class="am-save-actions">${automodDraft ? '<button class="dash-btn dash-btn-danger dash-btn-sm" id="am-clear-draft">↩️ Restaurer le publié</button>' : ''}<button class="dash-btn dash-btn-sm" id="am-draft">📝 Enregistrer le brouillon</button><button class="dash-btn dash-btn-primary" id="am-save">💾 🚀 Publier les réglages</button></div></div>`;

  const syncAMStatus = () => {
    const on = c.querySelector('#am-on').checked;
    const mode = c.querySelector('#am-mode').value;
    const status = c.querySelector('#am-status-line');
    const note = c.querySelector('#am-mode-note');
    if (status) status.textContent = !on ? 'La protection est désactivée.' : (mode === 'observe' ? 'Le serveur est observé sans sanction.' : 'Le serveur est protégé en temps réel.');
    if (note) note.textContent = mode === 'observe'
      ? '👀 Les règles seront enregistrées, mais aucun message ne sera supprimé et aucune sanction ne sera appliquée.'
      : '🟢 Les règles appliquent les actions configurées aux messages détectés.';
  };
  c.querySelector('#am-on').onchange = syncAMStatus;
  c.querySelector('#am-mode').onchange = syncAMStatus;
  const blacklistColor = c.querySelector('#am-blacklist-color');
  const blacklistColorText = c.querySelector('#am-blacklist-color-text');
  if (blacklistColor && blacklistColorText) {
    blacklistColor.oninput = () => { blacklistColorText.value = blacklistColor.value.toUpperCase(); };
    blacklistColorText.oninput = () => {
      const value = blacklistColorText.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) blacklistColor.value = value;
    };
  }
  const collectAutomodForm = () => {
    const rule_actions = {};
    c.querySelectorAll('[data-am-action]').forEach((select) => { if (select.value !== 'inherit') rule_actions[select.dataset.amAction] = select.value; });
    const blacklist_rules = {};
    c.querySelectorAll('[data-am-blacklist-rule]').forEach((input) => { if (input.checked) blacklist_rules[input.dataset.amBlacklistRule] = true; });
    const blacklist_thresholds = {};
    c.querySelectorAll('[data-am-threshold]').forEach((input) => {
      const count = Math.min(Math.max(parseInt(input.value, 10) || 0, 0), 50);
      if (count > 0) blacklist_thresholds[input.dataset.amThreshold] = count;
    });
    return {      enabled: c.querySelector('#am-on').checked,
      mode: c.querySelector('#am-mode').value,
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
      rule_actions,
      blacklist_rules,
      blacklist_thresholds,
      blacklist_duration_min: parseInt(c.querySelector('#am-blacklist-duration').value, 10) || 0,
      blacklist_channel: c.querySelector('#am-blacklist-channel').value,
      blacklist_title: c.querySelector('#am-blacklist-title').value,
      blacklist_color: /^#[0-9a-fA-F]{6}$/.test(c.querySelector('#am-blacklist-color-text').value.trim()) ? c.querySelector('#am-blacklist-color-text').value.trim() : '#ED4245',
      blacklist_footer: c.querySelector('#am-blacklist-footer').value,
      native_enabled: document.querySelector('#am-native-on') ? document.querySelector('#am-native-on').checked : (s.am_native_enabled !== 0),
      native_alert_channel: document.querySelector('#am-native-channel') ? document.querySelector('#am-native-channel').value : nativeAlertChannel,
      exempt_roles: [...selectedExemptRoles],
      exempt_channels: [...selectedExemptChannels],
      exempt_users: [...selectedExemptUsers],
      blacklist: blacklistData.map((word) => word.word),
    };
  };
  const saveAutomodDraft = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(collectAutomodForm()));
      App.toast('🟡 Brouillon Auto-Mod enregistré sur cet appareil.');
      const status = c.querySelector('#am-status-line');
      if (status) status.textContent = '🟡 Brouillon local enregistré — pas encore publié.';
    } catch { App.toast('Impossible d’enregistrer le brouillon.', 'error'); }
  };
  c.querySelector('#am-draft').onclick = saveAutomodDraft;
  c.querySelector('#am-save').onclick = async () => {
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/automod`, { method: 'PUT', body: collectAutomodForm() });
      try { localStorage.removeItem(draftKey); } catch {}
      App.toast('🚀 Auto-modération publiée !');
      syncAMStatus();
      const status = c.querySelector('#am-status-line');
      if (status) status.textContent = '🟢 Configuration publiée et active.';
    } catch (e) { App.toast(e.message, 'error'); }
  };
  const clearDraft = c.querySelector('#am-clear-draft');
  if (clearDraft) clearDraft.onclick = () => {
    try { localStorage.removeItem(draftKey); } catch {}
    App.toast('Configuration publiée restaurée.');
    Dashboard.renderers.moderation(content, data);
  };

  // ☁️ Miroir officiel Discord : les règles natives restent en alerte
  // uniquement ; les sanctions avancées continuent d’être appliquées par Optimus Prime.
  const cNative = Dashboard.card(root, '☁️ Auto-Mod officiel Discord', 'Optimus Prime peut synchroniser des règles Auto-Mod officielles pour obtenir le badge « Uses AutoMod » quand Discord atteint son seuil. Aucun doublon de sanction : les règles natives sont en mode alerte.');
  cNative.classList.add('am-native-card');
  cNative.innerHTML += `
    <div class="am-native-hero"><div class="am-native-copy"><span class="am-native-icon">☁️</span><div><b>Miroir officiel actif</b><small>Discord reçoit de vraies règles liées à ta configuration, sans remplacer le système Optimus Prime.</small></div></div><label class="am-native-toggle"><span>Activer</span><input type="checkbox" id="am-native-on" ${s.am_native_enabled !== 0 ? 'checked' : ''} /><i></i></label></div>
    <div class="am-native-grid"><div><label class="dash-label">Salon des alertes Auto-Mod officielles</label><select class="dash-select" id="am-native-channel">${nativeChannelOptions.join('')}</select><small class="am-help">Choisis un salon ou laisse Optimus Prime utiliser le salon de logs/blacklist. Les alertes natives ne sanctionnent pas deux fois.</small></div><div class="am-native-status" id="am-native-status"><span class="am-native-status-dot"></span><div><b>Lecture des règles Discord…</b><small>Vérification en cours</small></div></div></div>
    <div class="am-native-actions"><span class="am-help">Le badge officiel apparaît uniquement selon les règles et le seuil définis par Discord.</span><button class="dash-btn dash-btn-primary" id="am-native-sync">☁️ Synchroniser avec Discord</button></div>`;
  const nativeStatusBox = cNative.querySelector('#am-native-status');
  const renderNativeStatus = async () => {
    try {
      const nativeStatus = await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/native`);
      const count = Number(nativeStatus.nativeRules) || 0;
      nativeStatusBox.innerHTML = nativeStatus.badgeEligible
        ? `<span class="am-native-status-dot is-ok"></span><div><b>✅ Seuil Auto-Mod atteint</b><small>${count} règle(s) native(s) détectée(s) par Discord.</small></div>`
        : `<span class="am-native-status-dot ${nativeStatus.ok ? '' : 'is-warn'}"></span><div><b>${nativeStatus.ok ? `☁️ ${count} règle(s) native(s) active(s)` : '⚠️ Synchronisation à vérifier'}</b><small>${nativeStatus.ok ? `${Math.max(0, 100 - count)} règle(s) native(s) manquante(s) pour le seuil indicatif.` : App.escapeHtml(nativeStatus.error || 'Choisis un salon d’alerte et synchronise.')}</small></div>`;
    } catch (e) {
      nativeStatusBox.innerHTML = `<span class="am-native-status-dot is-warn"></span><div><b>⚠️ API Discord indisponible</b><small>${App.escapeHtml(e.message)}</small></div>`;
    }
  };
  renderNativeStatus();
  cNative.querySelector('#am-native-sync').onclick = async () => {
    const syncButton = cNative.querySelector('#am-native-sync');
    syncButton.disabled = true; syncButton.textContent = '⏳ Synchronisation…';
    try {
      const result = await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/native/sync`, { method: 'POST', body: { enabled: cNative.querySelector('#am-native-on').checked, alert_channel: cNative.querySelector('#am-native-channel').value } });
      if (result.ok) App.toast(`☁️ Auto-Mod officiel synchronisé : ${result.created || 0} créée(s), ${result.updated || 0} mise(s) à jour.`);
      else App.toast(result.error || 'Synchronisation Auto-Mod officielle impossible.', 'error');
      renderNativeStatus();
    } catch (e) { App.toast(e.message, 'error'); }
    syncButton.disabled = false; syncButton.textContent = '☁️ Synchroniser avec Discord';
  };

  // 🚫 Membres actuellement blacklistés sur ce serveur.
  const cMemberBlacklist = Dashboard.card(root, `🚫 Membres blacklistés <span class="am-blacklist-count">${memberBlacklistData.length}</span>`, 'Registre local au serveur sélectionné. Retirer un membre conserve l’historique Auto-Mod et les anciens panneaux Discord.');
  cMemberBlacklist.classList.add('am-member-blacklist-card');
  const memberBlacklistBox = App.el(`<div class="am-member-blacklist-list"></div>`);
  cMemberBlacklist.appendChild(memberBlacklistBox);
  const blacklistRuleLabels = { links: '🔗 Liens', caps: '🔠 Majuscules', mentions: '📣 Mentions', words: '🚫 Mots interdits', spam: '💥 Spam' };
  const blacklistActionLabels = { legacy: 'Action historique', delete: 'Message supprimé', warn: 'Avertissement', timeout: 'Timeout', kick: 'Expulsion', ban: 'Bannissement' };
  const sourceChannelName = (id) => {
    const channel = channelList.find((item) => String(item.id) === String(id));
    return channel ? `#${channel.name}` : (id ? 'Salon introuvable' : 'Salon inconnu');
  };
  const blacklistTriggerText = (entry) => entry.trigger_type === 'threshold'
    ? `${entry.trigger_count || 0}/${entry.threshold || 0} sanctions identiques`
    : 'Blacklist immédiate';
  const blacklistExpiryText = (entry) => Number(entry.expires_at) > 0
    ? `expire le ${new Date(Number(entry.expires_at)).toLocaleString('fr-FR')}`
    : 'permanente';
  const renderMemberBlacklist = () => {
    memberBlacklistBox.innerHTML = '';
    const count = cMemberBlacklist.querySelector('.am-blacklist-count');
    if (count) count.textContent = String(memberBlacklistData.length);
    if (!memberBlacklistData.length) {
      memberBlacklistBox.appendChild(App.el(`<div class="am-blacklist-empty"><span>✅</span><div><b>Aucun membre blacklisté</b><small>Les membres ajoutés après une sanction apparaîtront ici.</small></div></div>`));
      return;
    }
    memberBlacklistData.forEach((entry) => {
      const row = App.el(`
        <div class="am-member-blacklist-row">
          <span class="am-member-blacklist-icon">🚫</span>
          <div class="am-member-blacklist-copy"><b>${App.escapeHtml(entry.user_tag || entry.user_id || 'Membre inconnu')}</b><small>${App.escapeHtml(blacklistRuleLabels[entry.rule] || entry.rule || 'Auto-Mod')} · ${App.escapeHtml(blacklistActionLabels[entry.action] || entry.action || 'Action')} · ${App.escapeHtml(sourceChannelName(entry.source_channel_id))}</small><small>${App.escapeHtml(blacklistTriggerText(entry))} · ${App.escapeHtml(blacklistExpiryText(entry))}</small><small>${App.escapeHtml(entry.reason || 'Aucune raison')} · ${App.escapeHtml(entry.created_at || '')}</small></div>
          <button class="dash-btn dash-btn-danger dash-btn-sm" data-remove-blacklist="${App.escapeHtml(entry.user_id || '')}" title="Retirer de la blacklist">Retirer</button>
        </div>`);
      row.querySelector('[data-remove-blacklist]').onclick = async () => {
        if (!(await App.confirm(`Retirer ${entry.user_tag || entry.user_id || 'ce membre'} de la blacklist de ce serveur ?`))) return;
        try {
          await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/blacklist/${encodeURIComponent(entry.user_id)}`, { method: 'DELETE' });
          const index = memberBlacklistData.indexOf(entry);
          if (index >= 0) memberBlacklistData.splice(index, 1);
          renderMemberBlacklist();
          App.toast('Membre retiré de la blacklist.');
        } catch (e) { App.toast(e.message, 'error'); }
      };
      memberBlacklistBox.appendChild(row);
    });
  };
  renderMemberBlacklist();

  // 🚧 Exceptions configurables (rôles, salons et membres)
  const cExceptions = Dashboard.card(root, '🚧 Exceptions et zones de confiance', 'Choisis qui et où l’auto-mod doit ignorer. Les exceptions personnalisées s’ajoutent à l’option « Ignorer le staff ».');
  cExceptions.classList.add('am-exceptions-card');
  cExceptions.innerHTML += `
    <div class="am-exception-grid">
      <div><label class="dash-label">Rôles ignorés</label><div class="am-choice-list" id="am-exempt-roles"></div></div>
      <div><label class="dash-label">Salons ignorés</label><div class="am-choice-list" id="am-exempt-channels"></div></div>
    </div>
    <div style="margin-top:14px"><label class="dash-label">Membres ignorés</label><div class="am-choice-list" id="am-exempt-users"></div></div>
    <div class="am-help">Utilise le sélecteur pour ajouter plusieurs éléments. Les anciennes références restent affichées avec ⚠️ si Discord ne les renvoie plus.</div>`;
  Dashboard.renderDiscordMultiSelect(cExceptions.querySelector('#am-exempt-roles'), {
    items: rolesList,
    selected: selectedExemptRoles,
    icon: '🛡️',
    placeholder: 'Ajouter un rôle à ignorer',
    emptyText: 'Aucun rôle reçu de Discord.',
    selectedEmptyText: 'Aucun rôle ignoré.',
    selectedClass: 'am-choice',
  });
  Dashboard.renderDiscordMultiSelect(cExceptions.querySelector('#am-exempt-channels'), {
    items: channelList,
    selected: selectedExemptChannels,
    icon: '💬',
    placeholder: 'Ajouter un salon à ignorer',
    emptyText: 'Aucun salon textuel reçu de Discord.',
    selectedEmptyText: 'Aucun salon ignoré.',
    selectedClass: 'am-choice',
  });
  Dashboard.renderDiscordMultiSelect(cExceptions.querySelector('#am-exempt-users'), {
    items: automodMembers,
    selected: selectedExemptUsers,
    icon: '👤',
    placeholder: 'Ajouter un membre à ignorer',
    emptyText: 'Aucun membre reçu de Discord.',
    selectedEmptyText: 'Aucun membre ignoré.',
    selectedClass: 'am-choice',
  });

  // 📊 Résumé des actions réelles et des observations
  const cSummary = Dashboard.card(root, '📊 Activité Auto-Mod', 'Les chiffres viennent du journal du bot et distinguent les observations des actions réellement appliquées.');
  cSummary.classList.add('am-summary-card');
  const summaryBox = App.el(`<div class="am-summary-loading">Chargement des statistiques…</div>`);
  cSummary.appendChild(summaryBox);
  (async () => {
    try {
      const stats = await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/summary`);
      const ruleLabels = { links: '🔗 Liens', caps: '🔠 Majuscules', mentions: '📣 Mentions', words: '🚫 Mots', spam: '💥 Spam', unknown: '❔ Autre' };
      const topRules = (stats.byRule || []).slice(0, 5).map((entry) => `<span class="am-summary-tag">${ruleLabels[entry.rule] || App.escapeHtml(entry.rule)} <b>${entry.count}</b></span>`).join('') || '<span class="am-help">Aucune action enregistrée.</span>';
      summaryBox.innerHTML = `<div class="am-summary-stats"><div><b>${stats.today || 0}</b><small>Aujourd’hui</small></div><div><b>${stats.enforced || 0}</b><small>Actions appliquées</small></div><div><b>${stats.observed || 0}</b><small>Observations</small></div><div><b>${stats.total || 0}</b><small>Total</small></div></div><div class="am-summary-label">Règles les plus déclenchées</div><div class="am-summary-tags">${topRules}</div>`;
    } catch { summaryBox.innerHTML = '<div class="am-help">Les statistiques apparaîtront dès la première action du bot.</div>'; }
  })();

  // 🧪 Simulation sans risque : aucun message Discord n'est envoyé.
  const cSim = Dashboard.card(root, '🧪 Simulateur sans risque', 'Teste une phrase avec les vraies règles du serveur. Cette simulation ne supprime rien, ne crée aucun avertissement et ne sanctionne personne.');
  cSim.classList.add('am-simulator-card');
  cSim.innerHTML += `
    <textarea class="dash-input am-sim-text" id="am-sim-content" rows="3" maxlength="2000" placeholder="Écris ici un message à analyser… Ex : https://exemple.com"></textarea>
    <div class="am-sim-controls"><select class="dash-select" id="am-sim-channel"><option value="">— Aucun salon spécifique —</option>${channelList.map((channel) => `<option value="${App.escapeHtml(channel.id)}">💬 #${App.escapeHtml(channel.name)}</option>`).join('')}</select><input class="dash-input" id="am-sim-spam" type="number" min="0" max="100" value="0" placeholder="Rafale (0 = non)" title="Nombre de messages simulés en 5 secondes" /><button class="dash-btn dash-btn-primary" id="am-sim-go">🧪 Analyser</button></div>
    <div id="am-sim-result" class="am-sim-result"></div>`;
  cSim.querySelector('#am-sim-go').onclick = async () => {
    const contentValue = cSim.querySelector('#am-sim-content').value.trim();
    const resultBox = cSim.querySelector('#am-sim-result');
    const button = cSim.querySelector('#am-sim-go');
    if (!contentValue) { resultBox.innerHTML = '<div class="am-result neutral">Écris un message avant de lancer l’analyse.</div>'; return; }
    button.disabled = true; button.textContent = '⏳ Analyse…';
    try {
      const channelId = cSim.querySelector('#am-sim-channel').value;
      const channel = channelList.find((item) => item.id === channelId);
      const result = await App.api(`/bots/${bot.id}/guilds/${guildId}/automod/simulate`, { method: 'POST', body: { content: contentValue, channel_id: channelId, channel_name: channel ? channel.name : '', spam_count: parseInt(cSim.querySelector('#am-sim-spam').value, 10) || 0 } });
      if (!result.enabled) resultBox.innerHTML = '<div class="am-result neutral">⚪ Auto-modération désactivée : aucune règle ne sera appliquée.</div>';
      else if (result.exempt) resultBox.innerHTML = '<div class="am-result neutral">🛡️ Ce message serait ignoré car le salon, le rôle ou le membre est dans les exceptions.</div>';
      else if (!result.matched) resultBox.innerHTML = '<div class="am-result success">✅ Aucun filtre ne détecte ce message.</div>';
      else if (result.mode === 'observe') resultBox.innerHTML = `<div class="am-result observe">👀 Règle détectée : <b>${App.escapeHtml(result.rule)}</b><br/>Mode observation : le message serait conservé et aucune sanction ne serait appliquée.</div>`;
      else resultBox.innerHTML = `<div class="am-result ${result.action === 'ban' ? 'danger' : 'warning'}">${result.action === 'legacy' ? '🛡️' : '⚡'} Règle détectée : <b>${App.escapeHtml(result.rule)}</b><br/>Action prévue : <b>${App.escapeHtml(actionLabels[result.action] || result.action)}</b><br/><small>${App.escapeHtml(result.reason || '')}</small></div>`;
    } catch (e) { resultBox.innerHTML = `<div class="am-result danger">❌ ${App.escapeHtml(e.message)}</div>`; }
    button.disabled = false; button.textContent = '🧪 Analyser';
  };

  // 🛡️ Permissions réelles du bot sur ce serveur
  const cPerm = Dashboard.card(root, '🛡️ Permissions du bot sur ce serveur', 'Ce que Optimus Prime peut réellement faire — vérifié en direct auprès de Discord.');
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
      else if (r.observed) resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(254,231,92,.4);border-radius:10px;background:rgba(254,231,92,.08)">👀 <b>Mode observation actif.</b> La règle a été détectée, mais aucun message n'a été supprimé et aucune sanction n'a été appliquée.</div>`;
      else if (r.acted && r.deleted) resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(59,165,93,.4);border-radius:10px;background:rgba(59,165,93,.08)">✅ <b>L'auto-mod fonctionne !</b> Le message a été supprimé (raison : ${App.escapeHtml(r.reason || '—')}).</div>`;
      else if (r.acted) resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(254,231,92,.4);border-radius:10px;background:rgba(254,231,92,.08)">⚠️ <b>Détecté mais pas supprimé.</b> Vérifie la carte « Permissions du bot » ci-dessus : il lui faut « Supprimer les messages ».</div>`;
      else resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(237,66,69,.4);border-radius:10px;background:rgba(237,66,69,.08)">❌ <b>Le bot n'a pas réagi.</b> Vérifie que l'auto-mod est activé, que le filtre testé est coché, et que le salon du test n'est pas exclu.</div>`;
    } catch (e) { resBox.innerHTML = `<div style="padding:12px;border:1px solid rgba(237,66,69,.4);border-radius:10px;background:rgba(237,66,69,.08)">❌ ${App.escapeHtml(e.message)}</div>`; }
    go.disabled = false;
  };

  // ⚠️ Centre des avertissements : la progression reste visible même si le
  // message public est automatiquement retiré après 24 heures.
  const cWarnings = Dashboard.card(root, '⚠️ Centre des avertissements', 'Historique unifié des avertissements manuels et auto-mod : 1er avertissement, 2e palier et sanctions appliquées. Les messages publics restent 24 h puis sont supprimés automatiquement.');
  const warningFilters = App.el(`<div class="am-warning-filters"><button class="am-filter active" data-warning-filter="all">Tous</button><button class="am-filter" data-warning-filter="automod">🤖 Auto-Mod</button><button class="am-filter" data-warning-filter="staff">🛡️ Staff</button><button class="am-filter" data-warning-filter="recent">🕘 24 h</button></div>`);
  const warningBox = App.el(`<div class="desc">Chargement des avertissements…</div>`);
  cWarnings.appendChild(warningFilters);
  cWarnings.appendChild(warningBox);
  let warningFilter = 'all';
  warningFilters.querySelectorAll('[data-warning-filter]').forEach((button) => {
    button.onclick = () => {
      warningFilter = button.dataset.warningFilter;
      warningFilters.querySelectorAll('[data-warning-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderWarnings();
    };
  });
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
            <span style="font-size:18px">⚠️</span><div style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.escapeHtml(s.user_tag)}</b><span style="font-size:11.5px;color:var(--d-dim)">${s.count} actif(s)${s.history_count ? ` · ${s.history_count} historique(s)` : ''}</span></div>
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-clear-warnings="${App.escapeHtml(s.user_id)}" title="Réinitialiser">↺</button>
          </div>`).join('')}
        </div>` : '';
      const visibleWarnings = warningRows.filter((warning) => {
        if (warningFilter === 'automod') return warning.source === 'automod';
        if (warningFilter === 'staff') return warning.source !== 'automod';
        if (warningFilter === 'recent') return Date.now() - new Date(warning.created_at || 0).getTime() <= 24 * 60 * 60 * 1000;
        return true;
      });
      const listHtml = visibleWarnings.slice(0, 30).map((w) => {
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
      warningBox.innerHTML = summaryHtml + `<div style="font-size:12px;color:var(--d-dim);margin:4px 0 6px">🧾 Dernières actions</div>${listHtml || '<div class="am-help">Aucun avertissement pour ce filtre.</div>'}`;
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
  const textChannels = (data.channels || []).filter((channel) => !channel.category && !channel.voice);
  const c = Dashboard.card(root, 'Configuration', '');
  c.innerHTML += `
    <label class="dash-label">Salon des suggestions</label>
    <select class="dash-select" id="s-channel">
      <option value="">— Désactivé —</option>
      ${textChannels.map((channel) => `<option value="#${App.escapeHtml(channel.name)}" ${Dashboard.discordRefMatches(s.suggestion_channel, channel) ? 'selected' : ''}>💡 #${App.escapeHtml(channel.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(s.suggestion_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable')}
    </select>
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
// ============================================================
// 🧱 Embed Builder (v168) — constructeur visuel de messages du bot
// ============================================================
Dashboard.embedDraft = Dashboard.embedDraft || null;

Dashboard.renderers.embeds = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🧱', 'Embed Builder', 'Construis visuellement les messages de ton bot : aperçu Discord en direct, envoi immédiat dans un salon et modèles réutilisables.');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const g = data.guild || {};
  const serverName = g.name || 'ton serveur';
  const memberCount = g.members || '?';
  const botName = (bot && bot.name) || 'Optimus Prime';

  // Brouillon persistant (conservé quand on change de module)
  if (!Dashboard.embedDraft) {
    Dashboard.embedDraft = {
      content: '', author: '', title: '', description: '', color: '#e07a5f',
      image: '', thumbnail: '', footer: '', buttons: [],
    };
  }
  const d = Dashboard.embedDraft;

  const wrap = App.el('<div class="eb-wrap"></div>');
  root.appendChild(wrap);
  const leftCol = App.el('<div class="eb-col eb-editor-col"></div>');
  const rightCol = App.el('<div class="eb-col eb-preview-col"></div>');
  wrap.append(leftCol, rightCol);

  // ---------- Carte 1 : le message ----------
  const cMsg = Dashboard.card(leftCol, '✍️ Ton message', 'Le texte au-dessus de l\'embed (optionnel) et l\'embed lui-même.');
  cMsg.innerHTML += `
    <div class="eb-vars">
      <span class="eb-vars-lbl">Variables :</span>
      <code class="eb-var" title="Mention du membre">{user}</code>
      <code class="eb-var" title="Pseudo sans mention">{username}</code>
      <code class="eb-var" title="Nom du serveur">{server}</code>
      <code class="eb-var" title="Nombre de membres">{memberCount}</code>
    </div>
    <label class="dash-label">Message (au-dessus de l'embed)</label>
    <textarea class="dash-input" id="eb-content" rows="2" maxlength="2000" placeholder="Bonjour {user} ! 👋"></textarea>
    <div class="eb-grid2">
      <div><label class="dash-label">Auteur (petite ligne au-dessus du titre)</label>
        <input class="dash-input" id="eb-author" maxlength="256" placeholder="📢 Annonces" /></div>
      <div><label class="dash-label">Titre</label>
        <input class="dash-input" id="eb-title" maxlength="256" placeholder="📣 Grande nouvelle" /></div>
    </div>
    <label class="dash-label">Description</label>
    <textarea class="dash-input" id="eb-description" rows="5" maxlength="4096" placeholder="Écris ton texte ici… **gras**, *italique*, \`code\`"></textarea>
    <div class="eb-grid2">
      <div>
        <label class="dash-label">Couleur de la barre</label>
        <div class="eb-color-row">
          <input type="color" id="eb-color" value="${App.escapeHtml(d.color)}" />
          ${['#e07a5f', '#57F287', '#5865F2', '#FEE75C', '#ED4245', '#EB459E'].map((c) => `<button type="button" class="eb-preset" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}
        </div>
      </div>
      <div><label class="dash-label">Pied de page</label>
        <input class="dash-input" id="eb-footer" maxlength="2048" placeholder="Optimus Prime · ${App.escapeHtml(serverName)}" /></div>
    </div>
    <div class="eb-grid2">
      <div><label class="dash-label">Grande image (URL)</label>
        <input class="dash-input" id="eb-image" maxlength="500" placeholder="https://…/image.png" /></div>
      <div><label class="dash-label">Miniature en haut à droite (URL)</label>
        <input class="dash-input" id="eb-thumbnail" maxlength="500" placeholder="https://…/mini.png" /></div>
    </div>
  `;

  // ---------- Carte 2 : les boutons ----------
  const cBtns = Dashboard.card(leftCol, '🔘 Boutons', "Jusqu'à 5 boutons sous le message. « Lien » ouvre une page web, les autres sont décoratifs.");
  cBtns.innerHTML += `<div id="eb-btn-list"></div><button type="button" class="btn btn-sm eb-btn-add" id="eb-btn-add">➕ Ajouter un bouton</button>`;

  // ---------- Carte 3 : les modèles ----------
  const cTpl = Dashboard.card(leftCol, '💾 Modèles', 'Sauvegarde tes constructions pour les réutiliser plus tard.');
  cTpl.innerHTML += `
    <div class="eb-tpl-save">
      <input class="dash-input" id="eb-tpl-name" maxlength="80" placeholder="Nom du modèle (ex : Règlement)" />
      <button type="button" class="btn btn-primary btn-sm" id="eb-tpl-save">💾 Sauvegarder</button>
    </div>
    <div id="eb-tpl-list"><div class="eb-tpl-empty">Aucun modèle pour l'instant.</div></div>
  `;

  // ---------- Colonne droite : envoi + aperçu ----------
  rightCol.innerHTML += `
    <div class="dash-card eb-send-card">
      <div class="card-head"><div class="card-heading"><h3>🚀 Envoyer</h3><div class="desc">Le message part immédiatement dans le salon choisi.</div></div></div>
      <label class="dash-label">Salon de destination</label>
      <select class="dash-input" id="eb-channel">
        <option value="">— Choisir un salon —</option>
        ${textChannels.map((ch) => `<option value="${App.escapeHtml(String(ch.id))}">#${App.escapeHtml(ch.name)}</option>`).join('')}
      </select>
      <div class="eb-actions">
        <button type="button" class="btn btn-primary" id="eb-send">🚀 Envoyer le message</button>
        <button type="button" class="btn" id="eb-copy">📋 Copier le JSON</button>
      </div>
    </div>
    <div class="dash-card eb-preview-card">
      <div class="card-head"><div class="card-heading"><h3>👀 Aperçu en direct</h3><div class="desc">Exactement comme tes membres le verront sur Discord.</div></div></div>
      <div id="eb-preview"></div>
    </div>
  `;

  // ---------- Lecture de l'état ----------
  const field = (id) => cMsg.querySelector('#' + id);
  const readDraft = () => {
    ['content', 'author', 'title', 'description', 'color', 'image', 'thumbnail', 'footer'].forEach((k) => {
      const el = field('eb-' + k);
      if (el) d[k] = el.value;
    });
    d.buttons = (d.buttons || []).filter((b) => b && b.label !== '__deleted__');
  };

  const mdLite = (s) => App.escapeHtml(String(s || ''))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
  const vars = (s) => String(s || '')
    .replace(/\{user\}/g, '<span class="eb-mention">@membre</span>')
    .replace(/\{username\}/g, 'membre')
    .replace(/\{server\}/g, App.escapeHtml(serverName))
    .replace(/\{memberCount\}/g, String(memberCount));

  // ---------- Aperçu ----------
  const updatePreview = () => {
    readDraft();
    const host = rightCol.querySelector('#eb-preview');
    if (!host) return;
    const hasEmbed = d.author || d.title || d.description || d.image || d.thumbnail || d.footer;
    const initials = (botName.trim()[0] || 'N').toUpperCase();
    host.innerHTML = `
      <div class="eb-discord">
        <div class="eb-dmsg">
          <span class="eb-dava">${initials}</span>
          <div class="eb-dbody">
            <div class="eb-dhead"><b>${App.escapeHtml(botName)}</b><span class="eb-dtag">BOT</span><span class="eb-dtime">aujourd'hui à ${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}</span></div>
            ${d.content ? `<div class="eb-dcontent">${vars(mdLite(d.content))}</div>` : ''}
            ${hasEmbed ? `
            <div class="eb-embed" style="border-left-color:${App.escapeHtml(d.color || '#e07a5f')}">
              <div class="eb-e-main">
                ${d.author ? `<div class="eb-e-author">${vars(mdLite(d.author))}</div>` : ''}
                ${d.title ? `<div class="eb-e-title">${vars(mdLite(d.title))}</div>` : ''}
                ${d.description ? `<div class="eb-e-desc">${vars(mdLite(d.description))}</div>` : ''}
                ${d.image && /^https?:\/\//.test(d.image) ? `<img class="eb-e-img" src="${App.escapeHtml(d.image)}" alt="" onerror="this.style.display='none'" />` : ''}
                ${d.footer ? `<div class="eb-e-footer">${vars(mdLite(d.footer))}</div>` : ''}
              </div>
              ${d.thumbnail && /^https?:\/\//.test(d.thumbnail) ? `<img class="eb-e-thumb" src="${App.escapeHtml(d.thumbnail)}" alt="" onerror="this.style.display='none'" />` : ''}
            </div>` : ''}
            ${(d.buttons || []).length ? `<div class="eb-btns">${d.buttons.map((b) => `
              <span class="eb-btn s${Number(b.style) || 1}">${b.emoji ? App.escapeHtml(b.emoji) + ' ' : ''}${App.escapeHtml(b.label || 'Bouton')}${Number(b.style) === 5 ? ' 🔗' : ''}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  };

  // ---------- Éditeur de boutons ----------
  const renderButtons = () => {
    const host = cBtns.querySelector('#eb-btn-list');
    if (!host) return;
    d.buttons = d.buttons || [];
    if (!d.buttons.length) {
      host.innerHTML = '<div class="eb-tpl-empty">Aucun bouton — le message sera sans boutons.</div>';
      return;
    }
    host.innerHTML = d.buttons.map((b, i) => `
      <div class="eb-btnrow" data-i="${i}">
        <input class="dash-input eb-b-emoji" maxlength="16" placeholder="😀" value="${App.escapeHtml(b.emoji || '')}" title="Émoji du bouton" />
        <input class="dash-input eb-b-label" maxlength="80" placeholder="Texte du bouton" value="${App.escapeHtml(b.label || '')}" />
        <select class="dash-input eb-b-style" title="Couleur du bouton">
          <option value="1"${Number(b.style) === 1 ? ' selected' : ''}>Bleu</option>
          <option value="2"${Number(b.style) === 2 ? ' selected' : ''}>Gris</option>
          <option value="3"${Number(b.style) === 3 ? ' selected' : ''}>Vert</option>
          <option value="4"${Number(b.style) === 4 ? ' selected' : ''}>Rouge</option>
          <option value="5"${Number(b.style) === 5 ? ' selected' : ''}>🔗 Lien</option>
        </select>
        <button type="button" class="btn btn-sm eb-b-del" title="Retirer ce bouton">🗑</button>
        ${Number(b.style) === 5 ? `<input class="dash-input eb-b-url" maxlength="500" placeholder="https://… (page à ouvrir)" value="${App.escapeHtml(b.url || '')}" />` : ''}
      </div>
    `).join('');
    host.querySelectorAll('.eb-btnrow').forEach((row) => {
      const i = Number(row.dataset.i);
      const sync = () => {
        d.buttons[i] = {
          emoji: row.querySelector('.eb-b-emoji').value,
          label: row.querySelector('.eb-b-label').value,
          style: Number(row.querySelector('.eb-b-style').value) || 1,
          url: (row.querySelector('.eb-b-url') || {}).value || '',
        };
      };
      row.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('input', () => { sync(); updatePreview(); });
        el.addEventListener('change', () => { sync(); renderButtons(); updatePreview(); });
      });
      row.querySelector('.eb-b-del').onclick = () => { d.buttons.splice(i, 1); renderButtons(); updatePreview(); };
    });
  };
  cBtns.querySelector('#eb-btn-add').onclick = () => {
    if ((d.buttons || []).length >= 5) return App.toast('Maximum 5 boutons.', 'error');
    d.buttons = d.buttons || [];
    d.buttons.push({ emoji: '', label: '', style: 1, url: '' });
    renderButtons(); updatePreview();
  };

  // ---------- Champs → brouillon + aperçu ----------
  cMsg.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('input', updatePreview));
  cMsg.querySelectorAll('.eb-preset').forEach((p) => p.onclick = () => {
    field('eb-color').value = p.dataset.c; updatePreview();
  });

  // ---------- Envoi ----------
  const getPayload = () => {
    readDraft();
    return {
      content: d.content, author: d.author, title: d.title, description: d.description,
      color: d.color, image: d.image, thumbnail: d.thumbnail, footer: d.footer,
      buttons: (d.buttons || []).map((b) => ({ emoji: b.emoji || '', label: b.label || 'Bouton', style: Number(b.style) || 1, url: b.url || '' })),
    };
  };
  rightCol.querySelector('#eb-send').onclick = async () => {
    const channel = rightCol.querySelector('#eb-channel').value;
    if (!channel) return App.toast('Choisis d\'abord un salon.', 'error');
    const btn = rightCol.querySelector('#eb-send');
    btn.disabled = true; btn.textContent = '⏳ Envoi…';
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/embed/send`, { method: 'POST', body: { channel, ...getPayload() } });
      App.toast(`✅ Message envoyé dans #${r.channel || channel} !`);
    } catch (e) { App.toast(e.message, 'error'); }
    btn.disabled = false; btn.textContent = '🚀 Envoyer le message';
  };
  rightCol.querySelector('#eb-copy').onclick = async () => {
    const json = JSON.stringify(getPayload(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      App.toast('📋 JSON copié dans le presse-papiers !');
    } catch {
      App.modal(`<div class="eb-json"><h3>JSON du message</h3><pre>${App.escapeHtml(json)}</pre></div>`, true);
    }
  };

  // ---------- Modèles ----------
  const renderTemplates = (list) => {
    const host = cTpl.querySelector('#eb-tpl-list');
    if (!host) return;
    if (!list.length) { host.innerHTML = '<div class="eb-tpl-empty">Aucun modèle pour l\'instant.</div>'; return; }
    host.innerHTML = list.map((t) => `
      <div class="eb-tpl-item">
        <div class="eb-tpl-copy"><b>${App.escapeHtml(t.name)}</b><small>${App.escapeHtml(String(t.createdAt || '').slice(0, 10))}</small></div>
        <div class="eb-tpl-actions">
          <button type="button" class="btn btn-sm" data-load="${t.id}">Charger</button>
          <button type="button" class="btn btn-sm" data-del="${t.id}">🗑</button>
        </div>
      </div>
    `).join('');
    host.querySelectorAll('[data-load]').forEach((b) => b.onclick = () => {
      const t = list.find((x) => String(x.id) === b.dataset.load);
      if (!t) return;
      const p = t.payload || {};
      Object.assign(d, {
        content: p.content || '', author: p.author || '', title: p.title || '', description: p.description || '',
        color: p.color || '#e07a5f', image: p.image || '', thumbnail: p.thumbnail || '', footer: p.footer || '',
        buttons: Array.isArray(p.buttons) ? p.buttons.map((x) => ({ ...x })) : [],
      });
      ['content', 'author', 'title', 'description', 'color', 'image', 'thumbnail', 'footer'].forEach((k) => {
        const el = field('eb-' + k);
        if (el) el.value = d[k] || (k === 'color' ? '#e07a5f' : '');
      });
      renderButtons();
      updatePreview();
      App.toast(`✅ Modèle « ${t.name} » chargé !`);
    });
    host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      try {
        await App.api(`/bots/${bot.id}/guilds/${guildId}/embed-templates/${b.dataset.del}`, { method: 'DELETE' });
        App.toast('🗑 Modèle supprimé.');
        loadTemplates();
      } catch (e) { App.toast(e.message, 'error'); }
    });
  };
  const loadTemplates = async () => {
    try { const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/embed-templates`); renderTemplates(r.templates || []); }
    catch { renderTemplates([]); }
  };
  cTpl.querySelector('#eb-tpl-save').onclick = async () => {
    const name = cTpl.querySelector('#eb-tpl-name').value.trim();
    if (!name) return App.toast('Donne un nom à ton modèle.', 'error');
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/embed-templates`, { method: 'POST', body: { name, ...getPayload() } });
      App.toast(`💾 Modèle « ${name} » sauvegardé !`);
      cTpl.querySelector('#eb-tpl-name').value = '';
      loadTemplates();
    } catch (e) { App.toast(e.message, 'error'); }
  };

  // Restauration du brouillon dans les champs
  ['content', 'author', 'title', 'description', 'color', 'image', 'thumbnail', 'footer'].forEach((k) => {
    const el = field('eb-' + k);
    if (el && d[k]) el.value = d[k];
  });

  renderButtons();
  updatePreview();
  loadTemplates();
};

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

  // 📜 Historique des sanctions (v188) : les avertissements récents du serveur
  const warnCard = Dashboard.card(root, '📜 Avertissements récents', 'Les dernières sanctions infligées sur le serveur (warn, timeout, kick, ban) — issues de la modération et de l\'auto-modération.');
  const warnList = App.el('<div id="m-warnings" style="display:flex;flex-direction:column;gap:6px;margin-top:10px"></div>');
  warnCard.appendChild(warnList);
  try {
    const wr = await App.api(`/bots/${bot.id}/guilds/${guildId}/warnings`);
    const warns = wr.warnings || [];
    if (!warns.length) {
      warnList.appendChild(App.el('<div class="dash-empty">Aucun avertissement pour le moment — tout est calme. 🕊️</div>'));
    } else {
      const actionLabel = { warn: '⚠️ warn', timeout: '⏱️ timeout', kick: '👢 kick', ban: '🔨 ban' };
      warns.slice(0, 20).forEach((w) => {
        const tag = w.user_tag || w.user_id;
        warnList.appendChild(App.el(`
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:var(--d-surface-2,#23262e);font-size:13px">
            <b style="min-width:140px;overflow:hidden;text-overflow:ellipsis">${App.escapeHtml(tag)}</b>
            <span style="font-size:11px;padding:1px 8px;border-radius:99px;background:rgba(237,66,69,.15);color:#ed4245;white-space:nowrap">${App.escapeHtml(actionLabel[w.action] || w.action || 'warn')}</span>
            <span style="flex:1;min-width:120px;color:var(--d-dim,#a0a5b3);overflow-wrap:anywhere">${App.escapeHtml(w.reason || '—')}</span>
            <span style="font-size:11px;color:var(--d-dim,#a0a5b3);white-space:nowrap">${App.escapeHtml(String(w.created_at || '').replace('T', ' ').slice(0, 16))}${w.channel_name ? ' · #' + App.escapeHtml(w.channel_name) : ''}</span>
          </div>`));
      });
    }
  } catch (e) { warnList.appendChild(App.el(`<div class="dash-empty">${App.escapeHtml(e.message)}</div>`)); }
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
  const rolesList = (data.roles || []).filter((role) => role.name !== '@everyone');
  const [scheduledResult, customResult] = await Promise.all([
    App.api(`/bots/${bot.id}/guilds/${guildId}/scheduled`),
    App.api(`/bots/${bot.id}/guilds/${guildId}/announcements/custom`).catch(() => ({ config: null })),
  ]);
  const scheduled = scheduledResult.scheduled || [];
  const customAnnouncement = customResult.config || { id: null, name: 'Annonce personnalisée', title: '', message: '', color: '#5865F2', image_url: '', footer: '', channels: [], ping_roles: [] };
  const currentTz = ((data.settings || {}).timezone) || 'Europe/Paris';

  // 📣 Le nouveau composeur est indépendant des annonces programmées.
  const cCustom = Dashboard.card(root, '📣 Annonce personnalisée', 'Compose un panneau complet, choisis plusieurs salons et les rôles à mentionner, puis publie-le immédiatement. Les annonces programmées historiques restent conservées en dessous.');
  cCustom.classList.add('custom-announcement-card');
  const customData = {
    ...customAnnouncement,
    name: String(customAnnouncement.name || 'Annonce personnalisée'),
    title: String(customAnnouncement.title || ''),
    message: String(customAnnouncement.message || ''),
    color: /^#[0-9a-fA-F]{6}$/.test(String(customAnnouncement.color || '')) ? String(customAnnouncement.color) : '#5865F2',
    image_url: String(customAnnouncement.image_url || ''),
    footer: String(customAnnouncement.footer || ''),
  };
  const selectedAnnChannels = new Set(Array.isArray(customAnnouncement.channels) ? customAnnouncement.channels.map(String) : []);
  const selectedAnnRoles = new Set(Array.isArray(customAnnouncement.ping_roles) ? customAnnouncement.ping_roles.map(String) : []);
  const announcementMarks = [
    ['B', '**', '**', 'Gras'],
    ['I', '*', '*', 'Italique'],
    ['U', '__', '__', 'Souligné'],
    ['S', '~~', '~~', 'Barré'],
    ['<>', '`', '`', 'Code court'],
    ['{}', '```\n', '\n```', 'Bloc de code'],
    ['❯', '> ', '', 'Citation'],
    ['•', '- ', '', 'Liste'],
    ['🔗', '[', '](https://...)', 'Lien Markdown'],
  ];
  cCustom.innerHTML += `
    <div class="ca-status-row"><span class="dash-badge ok">✨ Éditeur visuel</span><span class="ca-status-copy">Formatage Discord pris en charge : gras, italique, souligné, code et citations.</span></div>
    <div class="ca-top-grid">
      <div>
        <label class="dash-label">Nom de cette annonce</label>
        <input class="dash-input" id="ca-name" value="${App.escapeHtml(customData.name)}" maxlength="80" placeholder="Annonce de la communauté" />
        <label class="dash-label">Titre affiché sur Discord</label>
        <input class="dash-input" id="ca-title" value="${App.escapeHtml(customData.title)}" maxlength="256" placeholder="📣 Grande annonce" />
      </div>
      <div>
        <label class="dash-label">Couleur du panneau</label>
        <div class="ca-color-row"><input type="color" id="ca-color" value="${customData.color}" /><input class="dash-input" id="ca-color-hex" value="${customData.color}" maxlength="7" placeholder="#5865F2" /></div>
        <label class="dash-label">Image en bas du panneau (optionnelle)</label>
        <input class="dash-input" id="ca-image" value="${App.escapeHtml(customData.image_url)}" maxlength="500" placeholder="https://.../image.png" />
      </div>
    </div>
    <div class="ca-destination-grid">
      <div><label class="dash-label">Salons de publication (plusieurs possibles)</label><div class="ca-choice-list" id="ca-channels"></div></div>
      <div><label class="dash-label">Rôles à mentionner</label><div class="ca-choice-list" id="ca-roles"></div></div>
    </div>
    <label class="dash-label">Message complet</label>
    <div class="ca-toolbar" role="toolbar" aria-label="Formatage du message">${announcementMarks.map(([label,,, title], index) => `<button type="button" class="ca-mark" data-mark="${index}" title="${title}">${label}</button>`).join('')}</div>
    <textarea class="dash-input ca-message" id="ca-message" rows="9" maxlength="4000" placeholder="Écris ton annonce ici…">${App.escapeHtml(customData.message)}</textarea>
    <div class="ca-editor-help">Sélectionne un texte puis clique sur un bouton, ou clique sans sélectionner pour insérer un modèle. Les mentions de rôles seront ajoutées automatiquement en haut du panneau.</div>
    <label class="dash-label">Footer de l'annonce (optionnel)</label>
    <input class="dash-input" id="ca-footer" value="${App.escapeHtml(customData.footer)}" maxlength="200" placeholder="Hoxera · Informations du serveur" />
    <div class="ca-preview-wrap" id="ca-preview"></div>
    <div class="ca-actions"><button class="dash-btn dash-btn-sm" id="ca-save">📝 Enregistrer le brouillon</button><button class="dash-btn dash-btn-primary" id="ca-send">🚀 Publier maintenant</button></div>
    <div class="ca-status-line" id="ca-status"></div>`;

  const caMessage = cCustom.querySelector('#ca-message');
  const caPreview = cCustom.querySelector('#ca-preview');
  const caStatus = cCustom.querySelector('#ca-status');
  const markdownPreview = (value) => {
    let html = App.escapeHtml(String(value || ''));
    html = html.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
    html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^- (.*)$/gm, '<div class="ca-bullet">• $1</div>');
    return html.replace(/\n/g, '<br/>');
  };
  const renderAnnouncementPreview = () => {
    const color = /^#[0-9a-fA-F]{6}$/.test(cCustom.querySelector('#ca-color').value) ? cCustom.querySelector('#ca-color').value : '#5865F2';
    const roleNames = [...selectedAnnRoles].map((ref) => rolesList.find((role) => String(role.id) === ref || String(role.name) === ref)).filter(Boolean).map((role) => `<span class="ca-role-mention">@${App.escapeHtml(role.name)}</span>`).join(' ');
    const image = cCustom.querySelector('#ca-image').value.trim();
    caPreview.innerHTML = `<div class="ca-preview-label">👀 Aperçu Discord <span>Actualisé en direct</span></div><div class="ca-discord-preview"><div class="ca-discord-author"><span class="ca-bot-avatar">⚡</span><b>Hoxera</b><span>APP</span></div>${roleNames ? `<div class="ca-preview-pings">${roleNames}</div>` : ''}<div class="ca-embed-preview" style="border-left-color:${color}">${cCustom.querySelector('#ca-title').value.trim() ? `<div class="ca-embed-title">${App.escapeHtml(cCustom.querySelector('#ca-title').value.trim())}</div>` : ''}<div class="ca-embed-body">${markdownPreview(caMessage.value) || '<span class="ca-placeholder">Ton message apparaîtra ici…</span>'}</div>${image && /^https:\/\//i.test(image) ? `<img src="${App.escapeHtml(image)}" alt="" />` : ''}<div class="ca-embed-footer">${App.escapeHtml(cCustom.querySelector('#ca-footer').value.trim() || 'Hoxera · Annonce du serveur')}</div></div></div>`;
  };
  Dashboard.renderDiscordMultiSelect(cCustom.querySelector('#ca-channels'), {
    items: textChannels,
    selected: selectedAnnChannels,
    icon: '💬',
    placeholder: 'Ajouter un salon de publication',
    emptyText: 'Aucun salon textuel reçu de Discord.',
    selectedEmptyText: 'Aucun salon de publication sélectionné.',
    selectedClass: 'ca-choice',
  });
  Dashboard.renderDiscordMultiSelect(cCustom.querySelector('#ca-roles'), {
    items: rolesList,
    selected: selectedAnnRoles,
    icon: '🛡️',
    placeholder: 'Ajouter un rôle à mentionner',
    emptyText: 'Aucun rôle reçu de Discord.',
    selectedEmptyText: 'Aucun rôle à mentionner.',
    selectedClass: 'ca-choice',
    onChange: renderAnnouncementPreview,
  });
  const insertAnnouncementMark = (before, after) => {
    const start = caMessage.selectionStart;
    const end = caMessage.selectionEnd;
    const selected = caMessage.value.slice(start, end);
    const value = selected || (before === '> ' || before === '- ' ? 'ton texte' : before === '[' ? 'texte' : 'texte');
    caMessage.value = `${caMessage.value.slice(0, start)}${before}${value}${after}${caMessage.value.slice(end)}`;
    const cursor = start + before.length + value.length + after.length;
    caMessage.focus();
    caMessage.setSelectionRange(cursor, cursor);
    renderAnnouncementPreview();
  };
  cCustom.querySelectorAll('[data-mark]').forEach((button) => {
    button.onclick = () => { const mark = announcementMarks[Number(button.dataset.mark)]; insertAnnouncementMark(mark[1], mark[2]); };
  });
  cCustom.querySelector('#ca-color').oninput = (event) => { cCustom.querySelector('#ca-color-hex').value = event.target.value.toUpperCase(); renderAnnouncementPreview(); };
  cCustom.querySelector('#ca-color-hex').oninput = (event) => { const value = event.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(value)) { cCustom.querySelector('#ca-color').value = value; renderAnnouncementPreview(); } };
  ['#ca-title', '#ca-image', '#ca-footer'].forEach((selector) => cCustom.querySelector(selector).addEventListener('input', renderAnnouncementPreview));
  caMessage.addEventListener('input', renderAnnouncementPreview);
  renderAnnouncementPreview();
  const collectCustomAnnouncement = () => ({
    name: cCustom.querySelector('#ca-name').value.trim(),
    title: cCustom.querySelector('#ca-title').value.trim(),
    message: caMessage.value,
    color: cCustom.querySelector('#ca-color').value,
    image_url: cCustom.querySelector('#ca-image').value.trim(),
    footer: cCustom.querySelector('#ca-footer').value.trim(),
    channels: [...selectedAnnChannels],
    ping_roles: [...selectedAnnRoles],
  });
  const saveCustomAnnouncement = async (silent = false) => {
    const payload = collectCustomAnnouncement();
    if (!payload.message.trim()) throw new Error('Écris le contenu de ton annonce.');
    if (!payload.channels.length) throw new Error('Choisis au moins un salon de publication.');
    const result = await App.api(`/bots/${bot.id}/guilds/${guildId}/announcements/custom`, { method: 'PUT', body: payload });
    if (caStatus) caStatus.textContent = silent ? '✅ Brouillon enregistré, publication en cours…' : '🟡 Brouillon enregistré. Il sera publié uniquement après le bouton « Publier maintenant ».'.replace('uniquement', silent ? 'ensuite' : 'uniquement');
    if (!silent) App.toast('Brouillon d’annonce enregistré !');
    return result;
  };
  cCustom.querySelector('#ca-save').onclick = async () => { try { await saveCustomAnnouncement(false); } catch (e) { App.toast(e.message, 'error'); } };
  cCustom.querySelector('#ca-send').onclick = async () => {
    const button = cCustom.querySelector('#ca-send');
    button.disabled = true; button.textContent = '⏳ Publication…';
    try {
      await saveCustomAnnouncement(true);
      const result = await App.api(`/bots/${bot.id}/guilds/${guildId}/announcements/custom/send`, { method: 'POST' });
      caStatus.textContent = `✅ Annonce publiée dans ${result.sent || 0} salon(s).` + (result.missingChannels && result.missingChannels.length ? ' Certains salons sont introuvables.' : '');
      App.toast('Annonce publiée sur Discord !');
    } catch (e) { App.toast(e.message, 'error'); }
    button.disabled = false; button.textContent = '🚀 Publier maintenant';
  };

  const c = Dashboard.card(root, 'Mes annonces programmées', `Jusqu'à 20 annonces. Envoi à l'heure de : ${ANNOUNCEMENT_TZ_LABEL[currentTz] || currentTz}.`);
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
    <div class="dash-filter-grid" style="grid-template-columns:repeat(auto-fit,minmax(125px,1fr))">
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
  const textChannels = (data.channels || []).filter((channel) => !channel.category && !channel.voice);
  const root = Dashboard.header(content, '📜', 'Journaux de modération', 'Un salon où le bot trace ce que TU choisis.');
  const c = Dashboard.card(root, 'Configuration', 'Active avec /modlogs set #salon ou ici.');
  c.innerHTML += `
    <label class="dash-label">Salon des journaux</label>
    <select class="dash-select" id="l-channel">
      <option value="">— Journaux désactivés —</option>
      ${textChannels.map((channel) => `<option value="#${App.escapeHtml(channel.name)}" ${Dashboard.discordRefMatches(s.log_channel, channel) ? 'selected' : ''}>📜 #${App.escapeHtml(channel.name)}</option>`).join('')}
      ${Dashboard.currentDiscordOption(s.log_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable')}
    </select>
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

// ---------- 🎮 Événements & tournois (v189) ----------
Dashboard.renderers.quiz = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🧠', 'Quiz', 'Les membres gagnent des points avec /quiz sur le serveur. Bonne réponse : +10 pts, +5 de bonus si rapide.');
  const { top } = await App.api(`/bots/${bot.id}/guilds/${guildId}/quiz/top`);
  const c = Dashboard.card(root, '🏆 Classement Quiz', 'Les 25 meilleurs joueurs de ce serveur.');
  if (!top.length) c.appendChild(App.el(`<div class="dash-empty"><div class="big">🧠</div>Personne n\'a encore joué au quiz — lance <b>/quiz</b> sur le serveur !</div>`));
  else {
    const table = App.el(`<table class="dash-table"><thead><tr><th>#</th><th>Membre</th><th>Points</th><th>Réponses</th></tr></thead><tbody></tbody></table>`);
    const tb = table.querySelector('tbody');
    top.forEach((r, i) => tb.appendChild(App.el(`<tr><td>${['🥇','🥈','🥉'][i] || i + 1}</td><td><@${r.user_id}></td><td>${r.score} pts</td><td>${r.answers}</td></tr>`)));
    c.appendChild(table);
    const exp = App.el(`<div style="margin-top:12px"><button class="btn btn-sm" id="quiz-exp-csv">📥 Exporter CSV</button></div>`);
    c.appendChild(exp);
    exp.querySelector('#quiz-exp-csv').onclick = () => {
      const rows = top.map((r, i) => ({ rang: i + 1, user_id: r.user_id, points: r.score, reponses: r.answers }));
      App.downloadCSV(`quiz_${guildId}.csv`, rows);
    };
  }
};

Dashboard.renderers.events = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🎮', 'Événements & tournois', 'Crée des événements datés : les membres s\'inscrivent avec un bouton, et le bot rappelle automatiquement 24 h et 1 h avant.');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);

  // ---- 📋 Liste des événements ----
  const listCard = Dashboard.card(root, '📋 Événements du serveur', '');
  const listEl = App.el('<div id="ev-list" style="display:flex;flex-direction:column;gap:8px;margin-top:10px"></div>');
  listCard.appendChild(listEl);

  const fmtDate = (ts) => {
    try {
      return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return String(ts); }
  };

  const renderList = async () => {
    listEl.innerHTML = '';
    let events = [];
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/events`);
      events = r.events || [];
    } catch (e) { listEl.appendChild(App.el(`<div class="dash-empty">${App.escapeHtml(e.message)}</div>`)); return; }
    const upcoming = events.filter((e) => e.starts_at > Date.now()).sort((a, b) => a.starts_at - b.starts_at);
    if (!upcoming.length) {
      listEl.appendChild(App.el('<div class="dash-empty">Aucun événement à venir. Crée ton premier tournoi ci-dessous ! 🎮</div>'));
      return;
    }
    upcoming.forEach((ev) => {
      let participants = [];
      try { participants = JSON.parse(ev.participants || '[]'); } catch {}
      const item = App.el(`
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--d-surface-2,#23262e);border:1px solid var(--d-border,#2f323b)">
          <div style="flex:1;min-width:180px">
            <b>🎮 ${App.escapeHtml(ev.title)}</b>
            <div style="font-size:12px;color:var(--d-dim,#a0a5b3)">🕒 ${App.escapeHtml(fmtDate(ev.starts_at))}${ev.ping_role && ev.ping_role !== 'none' ? ' · 📣 ' + App.escapeHtml(ev.ping_role) : ''}</div>
            ${ev.description ? `<div style="font-size:12px;color:var(--d-dim,#a0a5b3);overflow-wrap:anywhere">${App.escapeHtml(ev.description).slice(0, 160)}</div>` : ''}
          </div>
          <div style="text-align:center;min-width:70px">
            <b style="font-size:18px">${participants.length}</b>
            <div style="font-size:10px;color:var(--d-dim,#a0a5b3)">inscrit(s)</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="dash-btn dash-btn-sm" data-ev-copy>🔗</button>
            <button class="dash-btn dash-btn-danger dash-btn-sm" data-ev-del>🗑️</button>
          </div>
        </div>`);
      item.querySelector('[data-ev-copy]').onclick = () => {
        const tz = 'Europe/Paris';
        const p = new Date(ev.starts_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        App.toast('Commande copiée : /event create ' + ev.title);
        const cmd = `/event create titre:${ev.title} quand:${p}${ev.ping_role && ev.ping_role !== 'none' ? ' role:' + ev.ping_role : ''}`;
        try { navigator.clipboard.writeText(cmd); } catch {}
        App.modal(`<div class="modal-header"><h3>📋 Commande de recréation</h3><button class="x-btn" data-close>×</button></div><div class="modal-body"><p style="font-size:13px;overflow-wrap:anywhere">${App.escapeHtml(cmd)}</p><div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-primary" data-close style="flex:1">OK</button></div></div>`);
        document.querySelectorAll('[data-close]').forEach((b) => b.onclick = App.closeModal);
      };
      item.querySelector('[data-ev-del]').onclick = async () => {
        if (!(await App.confirm(`Supprimer l'événement « ${ev.title} » ?`))) return;
        try { await App.api(`/bots/${bot.id}/guilds/${guildId}/events/${ev.id}`, { method: 'DELETE' }); App.toast('Événement supprimé.'); renderList(); }
        catch (e) { App.toast(e.message, 'error'); }
      };
      listEl.appendChild(item);
    });
  };
  await renderList();

  // ---- ➕ Créer un événement ----
  const createCard = Dashboard.card(root, '➕ Créer un événement', 'Titre, date (JJ/MM HH:MM — heure du serveur), description, salon d\'annonce et rôle à mentionner en option.');
  const chOpts = ['<option value="">— Salon actuel / premier salon texte —</option>']
    .concat(textChannels.map((ch) => `<option value="${ch.id}">#${App.escapeHtml(ch.name)}</option>`));
  createCard.innerHTML += `
    <label class="dash-label">Titre *</label>
    <input class="dash-input" id="ev-title" placeholder="Tournoi CODM — 1v1" style="max-width:420px" />
    <label class="dash-label">Date & heure (JJ/MM HH:MM) *</label>
    <input class="dash-input" id="ev-when" placeholder="25/08 20:00" style="max-width:180px" />
    <label class="dash-label">Description</label>
    <input class="dash-input" id="ev-desc" placeholder="Règles, prix, lien…" style="max-width:420px" />
    <label class="dash-label">Salon d'annonce</label>
    <select class="dash-select" id="ev-chan" style="max-width:320px">${chOpts.join('')}</select>
    <label class="dash-label">Rôle à mentionner (nom du rôle, laisser vide = aucune mention)</label>
    <input class="dash-input" id="ev-role" placeholder="Ex : Joueur CODM" style="max-width:320px" />
    <div style="margin-top:14px"><button class="dash-btn dash-btn-primary" id="ev-create">🎮 Créer l'événement</button></div>`;
  createCard.querySelector('#ev-create').onclick = async () => {
    const title = createCard.querySelector('#ev-title').value.trim();
    const when = createCard.querySelector('#ev-when').value.trim();
    if (!title || !when) return App.toast('Titre et date sont obligatoires.', 'error');
    const channelId = createCard.querySelector('#ev-chan').value;
    const role = createCard.querySelector('#ev-role').value.trim();
    try {
      const r = await App.api(`/bots/${bot.id}/guilds/${guildId}/events`, {
        method: 'POST',
        body: {
          title,
          starts_at: when,
          description: createCard.querySelector('#ev-desc').value.trim(),
          channel_id: channelId,
          ping_role: role || 'none',
        },
      });
      App.toast('Événement créé ! 🎉');
      createCard.querySelector('#ev-title').value = '';
      createCard.querySelector('#ev-when').value = '';
      createCard.querySelector('#ev-desc').value = '';
      createCard.querySelector('#ev-role').value = '';
      renderList();
    } catch (e) { App.toast(e.message, 'error'); }
  };
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
    .concat(textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(s.live_channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  if (s.live_channel && !textChannels.some((ch) => Dashboard.discordRefMatches(s.live_channel, ch))) {
    liveChanOpts.push(Dashboard.currentDiscordOption(s.live_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable'));
  }
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
      <div id="lv-preview">…</div>
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
  // 👀 Aperçu DYNAMIQUE de l'annonce : le premier compte suivi du serveur,
  // ou un exemple neutre (« ton_streamer ») s'il n'y en a aucun. Plus jamais
  // de pseudo réel affiché par erreur sur un autre serveur (v192).
  const renderPreview = (socials) => {
    const pv = cl.querySelector('#lv-preview');
    if (!pv) return;
    const s = (socials || [])[0];
    const handle = s ? `@${s.handle}` : '@ton_streamer';
    const [emo, lab] = s ? (PLAT[s.platform] || ['🌐', s.platform]) : ['🎵', 'TikTok'];
    pv.innerHTML = `
      <div style="font-size:12.5px;color:#dbdee1;margin-bottom:6px">@everyone</div>
      <div style="border-left:4px solid #FE2C55;background:#2B2D31;border-radius:4px;padding:12px 14px;max-width:430px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#FE2C55,#8B5CF6);display:inline-block"></span><b style="font-size:13px;color:#f2f3f5">${App.escapeHtml(handle)} est en live !</b></div>
        <div style="font-weight:700;font-size:14px;color:#fff">${emo} 🔴 LIVE sur ${lab}</div>
        <div style="font-size:12.5px;color:#b5bac1;margin:6px 0">✨ Rejoins-le maintenant, il t'attend…</div>
        <div style="display:inline-block;background:#4E5058;color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:6px">▶️ Regarder le live ${lab}</div>
      </div>`;
  };
  const renderSocials = async () => {
    const list = cl.querySelector('#lv-list');
    list.innerHTML = '';
    try {
      const { socials } = await App.api(`/bots/${bot.id}/guilds/${guildId}/livesocials`);
      renderPreview(socials);
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
  renderPreview([]);
  renderSocials();
  // Liste des membres pour lier un compte (asynchrone, non bloquant)
  App.api(`/bots/${bot.id}/guilds/${guildId}/members`).then(({ members }) => {
    const sel = cl.querySelector('#lv-member');
    (members || []).slice(0, 100).forEach((m) => sel.appendChild(App.el(`<option value="${m.id}">👤 ${App.escapeHtml(m.username || m.tag)}</option>`)));
  }).catch(() => {});

  // ---- Carte Starboard ----
  const c1 = Dashboard.card(root, '⭐ Starboard', 'Quand un message reçoit assez d\'étoiles (réaction ⭐), il est épinglé dans le salon choisi — le mur de la gloire de ton serveur.');
  const chanOpts = ['<option value="">— Désactivé (choisir un salon pour activer) —</option>']
    .concat(textChannels.map((ch) => `<option value="#${App.escapeHtml(ch.name)}" ${Dashboard.discordRefMatches(s.starboard_channel, ch) ? 'selected' : ''}>💬 #${App.escapeHtml(ch.name)}</option>`));
  if (s.starboard_channel && !textChannels.some((ch) => Dashboard.discordRefMatches(s.starboard_channel, ch))) {
    chanOpts.push(Dashboard.currentDiscordOption(s.starboard_channel, textChannels, '⚠️', 'configuration actuelle — salon introuvable'));
  }
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
  const currentLanguage = ['fr', 'en'].includes(String(s.lang || 'fr')) ? String(s.lang || 'fr') : 'fr';
  const root = Dashboard.header(content, '⚙️', 'Réglages du serveur', 'Préfixe, langue, anniversaires, salons vocaux temporaires et plus.');
  const textChannels = (data.channels || []).filter((ch) => !ch.category && !ch.voice);
  const categories = (data.channels || []).filter((ch) => ch.category);
  const rolesList = data.roles || [];
  const c = Dashboard.card(root, 'Général', '');
  c.innerHTML += `
    <label class="dash-label">Préfixe (vide = « ${App.escapeHtml(bot.prefix)} »)</label>
    <input class="dash-input" id="g-prefix" maxlength="5" value="${App.escapeHtml(s.prefix || '')}" placeholder="${App.escapeHtml(bot.prefix)}" style="max-width:200px" />
    <label class="dash-label" style="margin-top:12px">🌍 Langue d’Optimus Prime sur ce serveur</label>
    <select class="dash-select" id="g-lang" style="max-width:280px">
      <option value="fr" ${currentLanguage === 'fr' ? 'selected' : ''}>🇫🇷 Français</option>
      <option value="en" ${currentLanguage === 'en' ? 'selected' : ''}>🇬🇧 English</option>
    </select>
    <div class="desc" style="margin-top:6px">Les panneaux de tickets, messages publics, arrivées et transcriptions suivront cette langue. Le réglage est propre à ce serveur.</div>
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
        lang: c.querySelector('#g-lang').value,
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

// ---------- Identité du bot par serveur ----------
Dashboard.renderers.botprofile = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const profile = data.profile || {};
  const serverName = data.guild && data.guild.name ? data.guild.name : 'ce serveur';
  const root = Dashboard.header(content, '🤖', 'Identité du bot', `Personnalise Optimus Prime uniquement sur ${serverName}.`);
  const card = Dashboard.card(root, '🤖 Profil d’Optimus Prime sur ce serveur', 'Cette identité est indépendante des autres serveurs et ne modifie jamais le bot global.');
  const avatar = profile.avatar_url || bot.avatar_url || '';
  const banner = profile.banner_url || '';
  card.innerHTML += `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:14px;border:1px solid rgba(88,101,242,.28);border-radius:10px;background:rgba(88,101,242,.07)">
      <span style="font-size:20px">🔒</span><div><b>Configuration limitée à ce serveur</b><div class="desc" style="margin:2px 0 0">Les autres serveurs conservent leur propre nom et leurs propres images.</div></div>
    </div>
    <label class="dash-label">Nom affiché par Optimus Prime sur ce serveur</label>
    <input class="dash-input" id="bp-name" maxlength="80" value="${App.escapeHtml(profile.name || '')}" placeholder="Hoxera" />
    <div class="desc" style="margin-top:5px">Le nom personnalisé apparaît dans les messages envoyés par Optimus Prime sur ce serveur. L’application bot globale n’est pas renommée.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:16px">
      <div>
        <label class="dash-label">🖼️ Photo du bot sur ce serveur</label>
        <input class="dash-input" id="bp-avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        <div class="desc" style="margin-top:5px">Image maximum : 3 Mo. Sans image personnalisée, l’avatar global est utilisé.</div>
        <div id="bp-avatar-preview" style="margin-top:10px">${avatar ? `<img src="${App.escapeHtml(avatar)}" alt="Avatar actuel" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid rgba(88,101,242,.45)" />` : '<div class="dash-empty" style="padding:12px">Avatar global utilisé</div>'}</div>
      </div>
      <div>
        <label class="dash-label">🎴 Bannière du bot sur ce serveur</label>
        <input class="dash-input" id="bp-banner" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        <div class="desc" style="margin-top:5px">Image maximum : 3 Mo. Elle apparaît dans le profil et les embeds d’identité.</div>
        <div id="bp-banner-preview" style="margin-top:10px">${banner ? `<img src="${App.escapeHtml(banner)}" alt="Bannière actuelle" style="display:block;width:100%;max-width:390px;height:120px;border-radius:10px;object-fit:cover;border:1px solid rgba(88,101,242,.35)" />` : '<div class="dash-empty" style="padding:12px">Aucune bannière personnalisée</div>'}</div>
      </div>
    </div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:18px">
      <button class="dash-btn dash-btn-primary" id="bp-save">💾 Enregistrer l’identité</button>
      <button class="dash-btn dash-btn-danger" id="bp-reset">♻️ Reprendre l’identité globale</button>
    </div>
    <div class="desc" id="bp-status" style="margin-top:10px"></div>`;

  const fileAsDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!String(file.type || '').startsWith('image/')) return reject(new Error('Choisis un fichier image.'));
    if (file.size > 3 * 1024 * 1024) return reject(new Error('Image trop lourde : 3 Mo maximum.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
    reader.readAsDataURL(file);
  });
  const previewFile = (input, target, kind) => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/') || file.size > 3 * 1024 * 1024) {
      input.value = '';
      App.toast(kind + ' invalide ou trop lourde (3 Mo maximum).', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    target.innerHTML = `<img src="${url}" alt="Aperçu" style="display:block;width:${kind === 'Photo' ? '88px' : '100%'};max-width:390px;height:${kind === 'Photo' ? '88px' : '120px'};border-radius:${kind === 'Photo' ? '50%' : '10px'};object-fit:cover;border:2px solid rgba(88,101,242,.45)" />`;
  };
  const avatarInput = card.querySelector('#bp-avatar');
  const bannerInput = card.querySelector('#bp-banner');
  avatarInput.onchange = () => previewFile(avatarInput, card.querySelector('#bp-avatar-preview'), 'Photo');
  bannerInput.onchange = () => previewFile(bannerInput, card.querySelector('#bp-banner-preview'), 'Bannière');

  card.querySelector('#bp-save').onclick = async () => {
    const button = card.querySelector('#bp-save');
    const status = card.querySelector('#bp-status');
    button.disabled = true; button.textContent = '⏳ Enregistrement…';
    try {
      const body = { name: card.querySelector('#bp-name').value.trim() };
      if (avatarInput.files && avatarInput.files[0]) body.avatar_b64 = await fileAsDataUrl(avatarInput.files[0]);
      if (bannerInput.files && bannerInput.files[0]) body.banner_b64 = await fileAsDataUrl(bannerInput.files[0]);
      await App.api(`/bots/${bot.id}/guilds/${guildId}/profile`, { method: 'PUT', body });
      status.textContent = '✅ Identité enregistrée uniquement pour ce serveur.';
      App.toast('Identité d’Optimus Prime enregistrée pour ce serveur !');
      await Dashboard.renderContent(content);
    } catch (e) {
      status.textContent = `⚠️ ${e.message}`;
      App.toast(e.message, 'error');
    }
    button.disabled = false; button.textContent = '💾 Enregistrer l’identité';
  };
  card.querySelector('#bp-reset').onclick = async () => {
    if (!(await App.confirm(`Reprendre l’identité globale d’Optimus Prime sur ${serverName} ?`))) return;
    try {
      await App.api(`/bots/${bot.id}/guilds/${guildId}/profile`, { method: 'DELETE' });
      App.toast('Identité globale reprise sur ce serveur.');
      await Dashboard.renderContent(content);
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
    const cmds = m.commands || [];
    const count = cmds.length;
    const on = !!m.enabled;
    const card = App.el(`
      <div class="dash-card" data-module-card="${App.escapeHtml(m.key)}">
        <div class="card-head">
          <div><h3>${m.emoji} ${App.escapeHtml(m.label)}</h3><div class="desc">${App.escapeHtml(m.description)}</div></div>
          <label class="switch" aria-label="Module ${App.escapeHtml(m.label)}"><input type="checkbox" ${on ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap">
          <span class="dash-badge ${on ? 'ok' : 'bad'}">${on ? '● Activé' : '○ Désactivé'}</span>
          <span style="color:var(--d-dim);font-size:11.5px;font-weight:650">${count} commande${count > 1 ? 's' : ''}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${cmds.map((c) => `<span class="dash-badge">${App.escapeHtml(bot.prefix)}${App.escapeHtml(c.name)}</span>`).join('')}</div>
      </div>`);
    card.querySelector('input').onchange = async (e) => {
      try {
        await App.api(`/bots/${bot.id}/modules/${m.key}`, { method: 'PUT', body: { enabled: e.target.checked } });
        App.toast(`Module ${m.label} ${e.target.checked ? 'activé' : 'désactivé'} !`);
        // Met à jour le badge d'état sans recharger toute la page
        const badge = card.querySelector('.dash-badge.ok, .dash-badge.bad');
        if (badge) {
          badge.className = 'dash-badge ' + (e.target.checked ? 'ok' : 'bad');
          badge.textContent = e.target.checked ? '● Activé' : '○ Désactivé';
        }
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
    const resource = h.resources || {};
    const cache = h.cache || {};
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
      <div style="color:var(--d-dim);font-size:11.5px;margin-top:6px">${resource.state === 'critical' ? '🚨 Pression critique' : resource.state === 'high' ? '⚠️ Pression élevée' : resource.state === 'watch' ? '👀 À surveiller' : '🟢 Niveau normal'} · cache ${cache.entries ?? 0} entrée(s) en mémoire</div>
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

// ============================================================
// Phase 3 (v196) — Fonctionnalités avancées
// ============================================================

// 🔎 Recherche de transcriptions
Dashboard.renderers.transcripts = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '🔎', 'Recherche de transcriptions', 'Retrouve un ticket fermé par salon, serveur, ouvreur, type ou contenu.');
  const searchCard = App.el(`
    <div class="dash-card">
      <div class="card-head">
        <div><h3>🔎 Rechercher</h3><div class="desc">Tape un mot-clé (salon, membre, contenu…) puis appuie sur Entrée — sans mot-clé, les 100 dernières transcriptions.</div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <input class="dash-input" id="tr-search" placeholder="Ex : support, Bob, remboursement…" style="flex:1;min-width:220px" />
        <button class="dash-btn dash-btn-primary" id="tr-go">Rechercher</button>
      </div>
    </div>`);
  root.appendChild(searchCard);
  const listEl = App.el(`<div id="tr-list" style="margin-top:16px"><div class="dash-empty"><div class="big">🔎</div><p>Lance une recherche pour voir les transcriptions du serveur.</p></div></div>`);
  root.appendChild(listEl);
  const run = async (q) => {
    listEl.innerHTML = '<div class="spinner"></div>';
    try {
      const { items } = await App.api(`/bots/${bot.id}/guilds/${guildId}/transcripts${q ? '?q=' + encodeURIComponent(q) : ''}`);
      if (!items || !items.length) {
        listEl.innerHTML = '<div class="dash-empty"><div class="big">📭</div><p>Aucune transcription trouvée pour cette recherche.</p></div>';
        return;
      }
      listEl.innerHTML = `<div style="overflow-x:auto"><table class="dash-table"><thead><tr><th>Salon</th><th>Type</th><th>Serveur</th><th>Ouvreur</th><th>Date</th><th></th></tr></thead><tbody></tbody></table></div>`;
      const tb = listEl.querySelector('tbody');
      items.forEach((t) => {
        const tr = App.el(`<tr>
          <td><b>#${App.escapeHtml(t.channel_name || '—')}</b></td>
          <td>${App.escapeHtml(t.type_label || '—')}</td>
          <td>${App.escapeHtml(t.server_name || '—')}</td>
          <td>${App.escapeHtml(t.opener_id || '—')}</td>
          <td style="white-space:nowrap">${App.escapeHtml(String(t.created_at || '').slice(0, 16))}</td>
          <td><a class="dash-btn dash-btn-sm" target="_blank" rel="noopener" href="/transcript/${App.escapeHtml(t.token)}">👁 Voir</a></td>
        </tr>`);
        tb.appendChild(tr);
      });
    } catch (e) {
      listEl.innerHTML = `<div class="dash-empty"><div class="big">⚠️</div><p>${App.escapeHtml(e.message)}</p></div>`;
    }
  };
  const go = () => run(searchCard.querySelector('#tr-search').value.trim());
  searchCard.querySelector('#tr-go').onclick = go;
  searchCard.querySelector('#tr-search').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  run('');
};

// 💬 Modmail : configuration + conversations
Dashboard.renderers.modmail = async (content, data) => {
  const { bot, guildId } = Dashboard.state;
  const root = Dashboard.header(content, '💬', 'Modmail', 'Tes membres t\'écrivent en message privé : chaque conversation arrive dans un fil du salon choisi. Le staff répond dans le fil, le membre reçoit en MP.');
  const textChannels = (data.channels || []).filter((c) => !c.category && !c.voice);

  const load = async () => {
    root.querySelectorAll('.dash-card[data-mm]').forEach((c) => c.remove());
    let m;
    try { m = await App.api(`/bots/${bot.id}/guilds/${guildId}/modmail`); }
    catch (e) { root.appendChild(App.el(`<div class="dash-empty"><div class="big">⚠️</div><p>${App.escapeHtml(e.message)}</p></div>`)); return; }

    // ——— Configuration ———
    const cfgCard = App.el(`
      <div class="dash-card" data-mm>
        <div class="card-head">
          <div><h3>⚙️ Configuration</h3><div class="desc">Active le modmail et choisis le salon où les conversations apparaîtront.</div></div>
          <label class="switch" aria-label="Activer le modmail"><input type="checkbox" id="mm-enabled" ${m.enabled ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div style="margin-top:12px">
          <label class="dash-label">Salon des conversations</label>
          <select class="dash-select" id="mm-channel" ${m.enabled ? '' : 'disabled'}>
            <option value="">— Choisir un salon —</option>
            ${textChannels.map((c) => {
              const val = '#' + c.name;
              const sel = typeof Dashboard.discordRefMatches === 'function' && Dashboard.discordRefMatches(m.channel, c) ? 'selected' : '';
              return `<option value="${App.escapeHtml(val)}" ${sel}>💬 #${App.escapeHtml(c.name)}</option>`;
            }).join('')}
          </select>
        </div>
        <div style="margin-top:14px"><button class="dash-btn dash-btn-primary" id="mm-save">💾 Enregistrer</button></div>
      </div>`);
    root.appendChild(cfgCard);
    const en = cfgCard.querySelector('#mm-enabled');
    const chan = cfgCard.querySelector('#mm-channel');
    en.onchange = () => { chan.disabled = !en.checked; };
    cfgCard.querySelector('#mm-save').onclick = async () => {
      try {
        await App.api(`/bots/${bot.id}/guilds/${guildId}/modmail`, { method: 'PUT', body: { enabled: en.checked, channel: chan.value } });
        App.toast('Modmail enregistré !');
        await load();
      } catch (e) { App.toast(e.message, 'error'); }
    };

    // ——— Conversations ouvertes ———
    const open = m.open || [];
    const openCard = App.el(`
      <div class="dash-card" data-mm style="margin-top:16px">
        <h3>💬 Conversations ouvertes (${open.length})</h3>
        <div class="desc">Réponds directement dans le fil Discord du salon modmail — le membre recevra ta réponse en MP.</div>
        ${open.length ? `<div style="overflow-x:auto;margin-top:8px"><table class="dash-table"><thead><tr><th>Membre</th><th>Ouverte le</th><th></th></tr></thead><tbody></tbody></table></div>` : `<div class="dash-empty" style="margin-top:10px"><div class="big">📭</div><p>Aucune conversation ouverte.</p></div>`}
      </div>`);
    root.appendChild(openCard);
    const tb = openCard.querySelector('tbody');
    if (tb) {
      open.forEach((t) => {
        const tr = App.el(`<tr>
          <td><b>${App.escapeHtml(t.user_tag || t.user_id)}</b><small style="display:block;color:var(--d-dim)">ID ${App.escapeHtml(t.user_id)}</small></td>
          <td style="white-space:nowrap">${App.escapeHtml(String(t.created_at || '').slice(0, 16))}</td>
          <td><button class="dash-btn dash-btn-sm dash-btn-danger" data-close>🔒 Fermer</button></td>
        </tr>`);
        tr.querySelector('[data-close]').onclick = async () => {
          try {
            await App.api(`/bots/${bot.id}/guilds/${guildId}/modmail/close`, { method: 'POST', body: { threadId: t.thread_id } });
            App.toast('Conversation fermée.');
            await load();
          } catch (e) { App.toast(e.message, 'error'); }
        };
        tb.appendChild(tr);
      });
    }
  };
  await load();
};

// ❓ Aide intégrée (module global du bot)
Dashboard.renderers.help = async (content) => {
  const root = Dashboard.header(content, '❓', 'Aide & Guide', 'Bien démarrer, configurer, se faire aider — tout est ici.');
  const bot = Dashboard.state.bot || {};
  const serverName = (Dashboard.state.guildData && Dashboard.state.guildData.name) || 'ton serveur';

  const block = (icon, title, desc) => `<div class="dash-card" style="margin-bottom:16px"><h3>${icon} ${title}</h3><div class="desc">${desc}</div></div>`;

  root.appendChild(App.el(block('🚀', 'Bien démarrer en 3 étapes', `
    <ol style="margin:0;padding-left:20px;line-height:1.9">
      <li><b>Ajoute ${App.escapeHtml(bot.name || 'Hoxera')}</b> à ${App.escapeHtml(serverName)} (bouton « Ajouter le bot » en haut à droite).</li>
      <li><b>Choisis ton serveur</b> dans le sélecteur en haut, puis ouvre un module depuis le menu de gauche.</li>
      <li><b>Enregistre tes réglages</b> : chaque module a son bouton « Enregistrer » — une barre de sauvegarde apparaît en bas dès qu'un réglage change.</li>
    </ol>`)));

  root.appendChild(App.el(block('🧩', 'Les modules en un coup d\'œil', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">
      <div class="dash-badge" style="display:flex;gap:8px;padding:10px">🎫 Tickets : boutons, types, transcriptions automatiques en MP</div>
      <div class="dash-badge" style="display:flex;gap:8px;padding:10px">👋 Bienvenue : message d'accueil + rôles automatiques</div>
      <div class="dash-badge" style="display:flex;gap:8px;padding:10px">📈 Niveaux : XP, rangs, récompenses de rôles, /profile</div>
      <div class="dash-badge" style="display:flex;gap:8px;padding:10px">💰 Économie : coins, boutique, giveaways, classement</div>
      <div class="dash-badge" style="display:flex;gap:8px;padding:10px">🛡️ Modération : sanctions, blacklist, anti-raid, journaux</div>
      <div class="dash-badge" style="display:flex;gap:8px;padding:10px">💬 Modmail : tes membres t'écrivent en MP, tu réponds ici</div>
    </div>`)));

  root.appendChild(App.el(block('⚡', 'Astuces', `
    <ul style="margin:0;padding-left:20px;line-height:1.9">
      <li><b>Recherche rapide</b> : touche <kbd>Ctrl</kbd>+<kbd>K</kbd> (ou l'icône 🔍) pour sauter d'un module à l'autre.</li>
      <li><b>Mode clair / sombre</b> : bouton 🌓 en haut à droite, mémorisé sur ton appareil.</li>
      <li><b>Couleur du dashboard</b> : bouton 🎨 pour choisir ta teinte préférée.</li>
      <li><b>Chaque serveur a ses réglages</b> : change de serveur dans le sélecteur en haut.</li>
      <li><b>Mobile</b> : navigation en bas d'écran (Accueil, Tickets, Membres, Stats + « Plus »).</li>
    </ul>`)));

  root.appendChild(App.el(block('🆘', 'Besoin d\'aide ?', `
    <p style="margin:0 0 12px;color:var(--d-dim);line-height:1.6">Rejoins le serveur support officiel : l'équipe et la communauté répondent en français.</p>
    <a class="dash-btn" target="_blank" rel="noopener" href="https://discord.gg/X9hTdr9N3" style="text-decoration:none">🆘 Rejoindre le support</a>`)));
};
