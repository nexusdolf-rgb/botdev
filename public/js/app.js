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
// Effet « ripple » Material sur TOUS les boutons (délégué global)
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

// ——————————————————————————————————————————————————————————————————————————
// v367 — Jeu d'icônes dessiné.
//
// Pourquoi : le tableau de bord illustrait chaque bouton, chaque titre et
// chaque notification d'un émoji (173 pictogrammes comptés dans l'interface
// rendue, pour 6 seulement dans les aperçus de messages — l'inverse de ce
// qu'il faut). Un émoji dans un MESSAGE Discord simulé est réaliste ; un émoji
// en guise d'icône de bouton est une empreinte de générateur, qui de plus rend
// mal (couleur imposée, taille imposée, aucune optical alignment) et ne suit
// pas le thème.
//
// Ces tracés sont dessinés ici, à la main, sur une grille de 24 : trait de
// 1,7, currentColor (donc ils suivent le texte, le thème clair/sombre et l'état
// focus/erreur), bout de trait arrondi, aucune couleur codée en dur. Ils sont
// pensés pour être lus à 16 px : c'est la taille de l'interface dense.
// La classe .ico-svg (style.css) porte le centrage et le retrait sous les
// lecteurs d'écran : une icône qui accompagne un libellé est décorative.
// ——————————————————————————————————————————————————————————————————————————
App.GLYPHES = {
  'sortie': '<path d="M9.4 20.4H5.6a2 2 0 0 1-2-2V5.6a2 2 0 0 1 2-2h3.8"/><path d="M15.6 16.8 20.4 12l-4.8-4.8"/><path d="M20.4 12H9.4"/>',
  corbeille: '<path d="M4 6.5h16M9.5 6.5V4.2h5v2.3M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6"/>',
  alerte: '<path d="M12 3.6 21.4 20H2.6L12 3.6Z"/><path d="M12 9.4v4.4"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>',
  eclair: '<path d="M13.4 2.6 5.6 13.4h4.8L9 21.4l8.6-11.2h-5l.8-7.6Z"/>',
  coche: '<path d="M4.4 12.6 9.4 17.6 19.6 6.6"/>',
  recherche: '<circle cx="10.6" cy="10.6" r="6.2"/><path d="M15.2 15.2 20 20"/>',
  theme: '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" stroke="none"/>',
  robot: '<rect x="4.4" y="8" width="15.2" height="11.6" rx="3"/><path d="M12 4.2V8"/><circle cx="12" cy="3.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="13.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="13.4" r="1.15" fill="currentColor" stroke="none"/><path d="M9.6 16.8h4.8"/>',
  boite: '<path d="M3.4 13.6h4.4l1.4 2.6h5.6l1.4-2.6h4.4M4.8 4.4h14.4l1.4 9.2v6H3.4v-6L4.8 4.4Z"/>',
  cerveau: '<path d="M12 5.2v13.6M12 6.6c-1-1.6-4.6-1.6-5.2.6-1.8.4-2 3.2-.4 4-1 2 .6 4 2.6 3.6.4 1.8 3 1.8 3 0M12 6.6c1-1.6 4.6-1.6 5.2.6 1.8.4 2 3.2.4 4 1 2-.6 4-2.6 3.6-.4 1.8-3 1.8-3 0"/>',
  lien: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.2.2l2.6-2.6a3.7 3.7 0 0 0-5.2-5.2l-1.4 1.4"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.2-.2L6 12.6a3.7 3.7 0 0 0 5.2 5.2l1.4-1.4"/>',
  couronne: '<path d="M3.6 7.4 7.4 12l4.6-6.2L16.6 12l3.8-4.6-1.6 11.2H5.2L3.6 7.4Z"/>',
  croix: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="M6.4 9.6 12 15.2l5.6-5.6"/>',
  horloge: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.4 2.2"/>',
  etincelle: '<path d="M12 3.6l1.7 4.9 4.9 1.7-4.9 1.7L12 16.8l-1.7-4.9-4.9-1.7 4.9-1.7L12 3.6ZM18.4 15.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
  casque: '<path d="M4.6 14.4v-2.2a7.4 7.4 0 0 1 14.8 0v2.2"/><rect x="2.8" y="13.6" width="3.8" height="6.4" rx="1.6"/><rect x="17.4" y="13.6" width="3.8" height="6.4" rx="1.6"/>',
  bouclier: '<path d="M12 3.4 19.6 6v6.2c0 4-3.2 6.9-7.6 8.4-4.4-1.5-7.6-4.4-7.6-8.4V6L12 3.4Z"/>',
  bulle: '<path d="M4.4 5.6h15.2v10.2H10l-4 3.4v-3.4H4.4V5.6Z"/>',
  cadenas: '<rect x="5.2" y="10.4" width="13.6" height="9.6" rx="2.4"/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4"/>',
  ticket: '<path d="M3.6 8.6V6.4h16.8v2.2a3.4 3.4 0 0 0 0 6.8v2.2H3.6v-2.2a3.4 3.4 0 0 1 0-6.8Z"/><path d="M12 6.4v11.2" stroke-dasharray="2 2.4"/>',
  horloge2: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.8V12h3.6"/>',
  // v367 — second lot, dicte par la mesure : les 20 pictogrammes que le
  // balayage laissait sans equivalent (liste imprimee par
  // scripts/retire-les-empreintes.py). Un jeu d'icones n'a d'interet que s'il
  // couvre tout ce que l'interface demande a illustrer.
  etoile: '<path d="M12 3.6l2.55 5.4 5.85.72-4.35 4.05 1.17 5.79L12 16.74l-5.22 2.82 1.17-5.79L3.6 9.72l5.85-.72L12 3.6Z"/>',
  dossier: '<path d="M3.4 6.6h5.4l1.8 2.2h9.8v9.6a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V6.6Z"/>',
  personne: '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  piece: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/>',
  interdit: '<circle cx="12" cy="12" r="8.2"/><path d="M6.2 17.8 17.8 6.2"/>',
  lettres: '<path d="M3.6 18.4 8 6.6l4.4 11.8M5.2 14.6h5.6"/><path d="M20.4 12.4v5.6M17 15.4a3 3 0 0 1 6 0"/>',
  nuage: '<path d="M7.2 18.4h9.4a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.6-1.4 3.9 3.9 0 0 0 .4 9Z"/>',
  presse: '<rect x="5" y="4.6" width="14" height="16.2" rx="2.2"/><path d="M9 4.6V3.2h6v1.4"/><path d="M8.4 11h7.2M8.4 15h5"/>',
  morceau: '<path d="M9.6 3.6a2.4 2.4 0 0 1 4.8 0v1.2h3.2v3.4h1.2a2.4 2.4 0 0 1 0 4.8h-1.2v3.4h-3.2v1.2a2.4 2.4 0 0 1-4.8 0v-1.2H6.4v-3.4H5.2a2.4 2.4 0 0 1 0-4.8h1.2V4.8h3.2V3.6Z"/>',
  courbe: '<path d="M4 19.4h16M5.4 15.4l4-4.6 3.2 2.6 5.2-6.4"/><path d="M17.8 7h2.4v2.4"/>',
  panier: '<path d="M3.6 5.6h2.2l2.4 10.2h9l2-7.2H7.4"/><circle cx="9.6" cy="19.2" r="1.5"/><circle cx="17" cy="19.2" r="1.5"/>',
  telephone: '<rect x="6.6" y="2.8" width="10.8" height="18.4" rx="2.4"/><path d="M10.4 18.2h3.2"/>',
  diplome: '<path d="M12 4.6l9 4.4-9 4.4-9-4.4 9-4.4Z"/><path d="M7 11.4v4.2c0 1.6 2.4 2.8 5 2.8s5-1.2 5-2.8v-4.2"/>',
  son: '<path d="M4.4 9.6h3l4.4-3.8v12.4l-4.4-3.8h-3V9.6Z"/><path d="M16.4 8.6a5.2 5.2 0 0 1 0 6.8M18.8 6.2a8.6 8.6 0 0 1 0 11.6"/>',
  calendrier: '<rect x="3.8" y="5.6" width="16.4" height="15" rx="2.2"/><path d="M3.8 10h16.4M8.4 3.8v3.2M15.6 3.8v3.2"/><path d="M7.6 13.6h2v2h-2zM14.4 13.6h2v2h-2z"/>',
  billets: '<rect x="2.6" y="6.6" width="18.8" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.6M17.4 12h.6"/>',
  ampoule: '<path d="M9 17.4a6.4 6.4 0 1 1 6 0v1.8H9v-1.8Z"/><path d="M10 21.2h4"/>',
  // v367 — quatrieme trait : ce que le bilan du balayage reclamait (diise de
  // salon, etiquette de role, porte d'entree, hamecon d'hameconnage).
  diise: '<path d="M9.4 3.8 7.6 20.2M16.4 3.8l-1.8 16.4M4.4 8.8h15.2M3.6 15.2h15.2"/>',
  etiquette: '<path d="M11.6 3.6H19a1.4 1.4 0 0 1 1.4 1.4v7.4L13.2 20.2a1.4 1.4 0 0 1-2 0L3.8 12.8a1.4 1.4 0 0 1 0-2l6.8-6.8a1.4 1.4 0 0 1 1-.4Z"/><circle cx="16" cy="8" r="1.6"/>',
  porte: '<path d="M6.6 3.6h10.8v16.8H6.6z"/><path d="M14.6 12h1"/><path d="M4.6 20.4h15"/>',
  hamecon: '<path d="M13.6 3.4v8.4a4.6 4.6 0 0 1-9.2 0"/><path d="M4.2 10 6.8 12.6"/><circle cx="13.6" cy="4.6" r="1.4"/>',
  palette: '<path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.4 0 2-.9 2-1.9s-.7-1.6-.7-2.4c0-1 .8-1.7 1.9-1.7h1.7a3.5 3.5 0 0 0 3.5-3.6A8.3 8.3 0 0 0 12 3.6Z"/><circle cx="8.2" cy="9.2" r="1.1"/><circle cx="12.6" cy="7.2" r="1.1"/><circle cx="16.6" cy="9.8" r="1.1"/>',
  personnes: '<circle cx="9" cy="8.6" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.2 5.9a3.2 3.2 0 0 1 0 5.5M17.6 14.6A6 6 0 0 1 21 20"/>',
  fusee: '<path d="M13.6 3.6c3.4 1.4 5.6 4.6 6 8.4l-4.2 4.2-6-6 4.2-6.6Z"/><path d="M9.4 10.2 6.2 11l1.9 2.5M13.4 16.2l.8 3.2 2.5-1.9"/><circle cx="14.6" cy="8.6" r="1.5"/>',
  rafraichir: '<path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.3"/><path d="M18.2 3.4v3.6h-3.6"/>',
  megaphone: '<path d="M4.2 10.2v3.6a1.4 1.4 0 0 0 1.4 1.4h2l8.6 4V4.8l-8.6 4h-2A1.4 1.4 0 0 0 4.2 10.2Z"/><path d="M19.4 9.2a4.4 4.4 0 0 1 0 5.6"/>',
  impact: '<circle cx="12" cy="12" r="3.3"/><path d="M12 3.6v3.2M12 17.2v3.2M3.6 12h3.2M17.2 12h3.2M6.1 6.1l2.3 2.3M15.6 15.6l2.3 2.3M17.9 6.1l-2.3 2.3M8.4 15.6l-2.3 2.3"/>',
  image: '<rect x="3.6" y="5" width="16.8" height="14" rx="2.2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.8 17.2l4.6-4.4 3.4 3 2.6-2.4 4.2 3.8"/>',
  crayon: '<path d="M4.4 19.6l1.2-3.6L15.6 6a1.9 1.9 0 0 1 2.7 2.7L8.3 18.6l-3.9 1Z"/><path d="M14 7.6l2.4 2.4"/>',
  reglages: '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v2.6M12 17.8v2.6M4.8 12H7.4M16.6 12h2.6M6.9 6.9l1.9 1.9M15.2 15.2l1.9 1.9M17.1 6.9l-1.9 1.9M8.8 15.2l-1.9 1.9"/>',
};

/**
 * Rend un <svg> du jeu App.GLYPHES.
 *   nom   : clé du jeu ; à défaut on obtient une pastille vide, jamais un émoji.
 *   opts  : { taille = 16, classe = '', titre = '' } — `titre` passe l'icône de
 *           décorative (aria-hidden) à informative (role=img + libellé accessible).
 * Les tracés sont en currentColor avec un trait de 1,7 : ils se lisent à 16 px
 * et suivent le thème, les états et l'accessibilité du texte voisin.
 */
App.glyphe = (nom, opts = {}) => {
  const taille = Number(opts.taille || 16);
  const trace = App.GLYPHES[nom] || '<circle cx="12" cy="12" r="7.4"/>';
  const titre = String(opts.titre || '');
  const accessibilite = titre
    ? `role="img" aria-label="${App.escapeHtml(titre)}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="ico-svg${opts.classe ? ' ' + opts.classe : ''}" viewBox="0 0 24 24" width="${taille}" height="${taille}" ${accessibilite}>`
    + `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${trace}</g></svg>`;
};

// v367 — un libellé d'interface ne se dépouille pas d'un emoji chez chaque
// appelant : le helper de carte le fait pour tous. Les titres de module arrivaient
// en forme « <pictogramme> Auto-modération » ; l'identité visuelle d'un module est
// portée par son émoji dessiné (Dashboard.iconCell), pas par le texte.
const PICTO_EN_TETE = /^(?:\s*[\u{1F000}-\u{1FAFF}\u2705\u274C\u2757\u2764\u27A1\u2B50\u2B55\u3030\u303D][\uFE0F\u20E3]?)+\s*/u;
App.sansPicto = (texte) => String(texte == null ? '' : texte).replace(PICTO_EN_TETE, '').trim();

/**
 * v367 — le retour après un enregistrement, calibre production.
 * Le bouton d'action confirme lui-même (l'attente bascule sur un état fini) et
 * une horodatation discrète s'écrit à côté, à la minute — comme un champ
 * « dernière modification ». Puis tout s'efface. Aucun pictogramme, aucun point
 * d'exclamation : un produit constate, il ne s'applaudit pas.
 */
App.retourEnregistrement = function (bouton, quoi) {
  const libellé = quoi || 'Enregistré';
  if (bouton && bouton.nodeType === 1) {
    if (!bouton.dataset.libelleAvant) bouton.dataset.libelleAvant = bouton.innerHTML;
    bouton.classList.add('is-done');
    bouton.innerHTML = App.glyphe('coche', { taille: 15 }) + '<span>' + libellé + '</span>';
    clearTimeout(bouton._retourTimer);
    bouton._retourTimer = setTimeout(function () {
      bouton.classList.remove('is-done');
      bouton.innerHTML = bouton.dataset.libelleAvant;
    }, 1800);
  }
  const racine = bouton
    ? bouton.closest('.dash-card, .dash-row, .cfg-actions, .am-actions, .ov-hero-actions, ' +
      '.modal-actions, .dash-modal-actions, .sheet-actions, .dash-mod-actions, .card-head')
    : null;
  const hôte = racine || (bouton && bouton.parentElement);
  if (!hôte) return;
  let horo = hôte.querySelector(':scope > .save-stamp');
  if (!horo) {
    horo = App.el('<span class="save-stamp" role="status"></span>');
    hôte.appendChild(horo);
  }
  const maintenant = new Date();
  horo.textContent = libellé + ' à ' +
    String(maintenant.getHours()).padStart(2, '0') + ':' +
    String(maintenant.getMinutes()).padStart(2, '0');
  horo.classList.remove('is-on');
  void hôte.offsetWidth;                 // relance la transition à chaque clic
  horo.classList.add('is-on');
  clearTimeout(horo._horoTimer);
  horo._horoTimer = setTimeout(function () { horo.classList.remove('is-on'); }, 6000);
};

App.escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// v364 — couleur de la barre du navigateur : elle doit suivre le thème.
// Les deux valeurs viennent du CSS (fond sombre `--bg`, fond clair du body),
// jamais inventées. Le script de index.html la pose avant le premier rendu ;
// ceci la remet d'aplomb si le thème change en cours de route.
App.THEME_COLORS = { dark: '#080b12', light: '#f2f3f8' };
App.syncThemeColor = () => {
  try {
    const clair = document.documentElement.classList.contains('hx-light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', clair ? App.THEME_COLORS.light : App.THEME_COLORS.dark);
  } catch {}
};

App.api = async (path, options = {}) => {
  const opts = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  const res = await fetch(`/api${path}`, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401) throw new Error('Session expirée. Reconnectez-vous avec Discord.');
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
    .then(() => App.toast('Fenêtre Discord ouverte : choisissez votre serveur dans le sélecteur ! (lien aussi copié)'))
    .catch(() => App.toast('Choisissez votre serveur dans la fenêtre Discord.'));
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
  // v364 : chaque navigation prend un numero. Une vue dont les arrivees
  // reseau trainaient ne repeint plus la page par-dessus celle demandee depuis
  // (l'ancien code ecrivait dans le DOM apres un await, sans verifier).
  App._vueSeq = (App._vueSeq || 0) + 1;
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
    if (o === 'linked') App.toast('Compte Discord lié.');
    else if (o === 'banned') App.toast('Ce compte est banni d’Hoxera.', 'error');
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

// ---------------------- Avatar public d’Hoxera ----------------------
// Les pages publiques utilisent une route locale qui sert l'avatar réel du
// bot. Cela évite qu'un blocage du CDN Discord laisse uniquement le logo ⚡.
App.loadPublicBotAvatar = (root) => {
  if (!root) return;
  root.querySelectorAll('[data-brand-logo]').forEach((oldLogo) => {
    // Le logo est déjà une image dans le HTML initial : on lui ajoute
    // seulement un fallback pour éviter un second chargement inutile.
    if (oldLogo.tagName === 'IMG') {
      oldLogo.onerror = () => { if (oldLogo.isConnected) oldLogo.replaceWith(App.el('<span class="logo" data-brand-logo><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13.4 2.6 5.6 13.4h4.8L9 21.4l8.6-11.2h-5l.8-7.6Z"/></svg></span>')); };
      return;
    }
    const image = App.el('<img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar d’Hoxera" style="border-radius:50%;object-fit:cover" />');
    image.onerror = () => { if (image.isConnected) image.replaceWith(App.el('<span class="logo" data-brand-logo><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13.4 2.6 5.6 13.4h4.8L9 21.4l8.6-11.2h-5l.8-7.6Z"/></svg></span>')); };
    if (oldLogo.isConnected) oldLogo.replaceWith(image);
  });
};

// ---------------------- Page « Connectez-vous avec Discord » ----------------------
App.renderConnect = () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  const page = App.el(`
    <div class="auth-wrap" id="connect-card">
      <div class="auth-left">
        <div class="logo-row"><img class="logo" data-brand-logo src="/api/public/bot-avatar" alt="Avatar d’Hoxera" style="border-radius:50%;object-fit:cover" /> Hoxera</div>
        <h1 style="margin-top:52px">Configurez votre serveur<br/><span>depuis votre compte Discord</span></h1>
        <p class="tagline">Tickets automatiques, niveaux, boutique, giveaways, bienvenue… Tout se règle ici, sans mot de passe : on vérifie simplement avec votre compte Discord.</p>
        <ul class="auth-features">
          <li><span class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 9a3 3 0 0 0 0 6v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a3 3 0 0 1 0-6V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/></svg></span> Tickets avec types personnalisés & transcriptions</li>
          <li><span class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 19.4h16M5.4 15.4l4-4.6 3.2 2.6 5.2-6.4"/><path d="M17.8 7h2.4v2.4"/></svg></span> Niveaux XP et récompenses de rôles</li>
          <li><span class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3.6 5.6h2.2l2.4 10.2h9l2-7.2H7.4"/><circle cx="9.6" cy="19.2" r="1.5"/><circle cx="17" cy="19.2" r="1.5"/></svg></span> Boutique, économie et giveaways</li>
          <li><span class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.6 3.6h10.8v16.8H6.6z"/><path d="M14.6 12h1"/><path d="M4.6 20.4h15"/></svg></span> Bienvenue, auto-rôles et menus de rôles</li>
          <li><span class="f-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l7 2.8v5.6c0 4.2-2.9 7.3-7 8.6-4.1-1.3-7-4.4-7-8.6V6l7-2.8Z"/><path d="M9 12.1l2 2 4-4"/></g></svg></span> Modération et journaux complets</li>
        </ul>
      </div>
      <div class="auth-right">
        <div class="auth-card auth-glass" style="text-align:center">
          <div class="auth-bot-ava"><img src="/api/public/bot-avatar" alt="Hoxera" /></div>
          <h2>Connectez-vous avec Discord</h2>
          <p class="sub" style="margin:8px 0 20px">Aucun compte à créer, aucun mot de passe.<br/>Discord vérifie automatiquement vos serveurs et vos permissions.</p>
          <button class="btn btn-discord" id="connect-discord" style="padding:13px;font-size:16px">Se connecter avec Discord</button>
          <div class="auth-trust">
            <span>Connexion sécurisée OAuth2 · nous ne voyons <b>jamais</b> votre mot de passe</span>
            <span>Accès demandé : votre pseudo, votre avatar et votre liste de serveurs. Rien d'autre.</span>
            <span>Seuls les <b>admins</b> des serveurs peuvent configurer.</span>
          </div>
          <a href="#/" style="font-size:13px">← Retour à l'accueil</a>
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
      b.textContent = 'Se connecter avec Discord';
    }
  };
};

// ---------------------- Marque du bot, mémorisée ----------------------
// v364 — le nom et l'avatar du bot sont gardés en mémoire entre deux
// visites. Sans ça, chaque rafraîchissement peignait la marque de secours
// (« ⚡ Hoxera ») pendant que /api/hoxera répondait, puis RECONSTRUISAIT la
// barre avec la vraie identité (« Hoxera ») : le flash signalé par le
// fondateur, mesuré à 2 constructions de navbar par chargement.
App.BRAND_KEY = 'hx-brand';
App.brandSig = (b) => (b && b.name ? `${b.name}\u0000${b.avatar_url || ''}` : '');
App.brandRead = () => {
  try {
    const raw = localStorage.getItem(App.BRAND_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw);
    return b && b.name ? { name: String(b.name), avatar_url: String(b.avatar_url || '') } : null;
  } catch { return null; }
};
App.brandWrite = (bot) => {
  if (!bot || !bot.name) return;
  const b = { name: String(bot.name), avatar_url: String(bot.avatar_url || '') };
  if (App.brandSig(b) === App.brandSig(App.brandRead())) return;
  try { localStorage.setItem(App.BRAND_KEY, JSON.stringify(b)); } catch {}
};

// ---------------------- Navbar (connecté) ----------------------
App.renderNavbar = () => {
  const user = App.state.user;
  // La barre se peint avec l'identité connue : celle de cette session, sinon
  // celle de la visite précédente. Jamais un trou ni un faux nom.
  const bot = App.state.bot || App.brandRead();
  // L'avatar passe par le proxy local : il répond toujours avec une image
  // (l'avatar Discord du bot, sinon la marque posée sur le serveur), alors que
  // l'URL du CDN peut traîner une seconde — et c'est ce décalage qui laissait
  // voir l'éclair de secours avant la vraie photo.
  const brand = '<img id="nav-brand-avatar" class="logo" src="/api/public/bot-avatar" alt="Avatar du bot" style="border-radius:50%;object-fit:cover" />';
  const nav = App.el(`
    <div class="navbar">
      <div class="logo-row" style="cursor:pointer" id="nav-logo">${brand} ${App.escapeHtml((bot && bot.name) || 'Hoxera')}</div>
      <div class="navbar-right">
        ${user.is_admin ? `<button class="btn btn-ghost btn-sm" id="nav-admin">Admin</button>` : ''}
        <div class="user-pill">
          ${user.discord_avatar
            ? `<img class="user-avatar" style="border-radius:50%" src="/api/img?u=${encodeURIComponent(`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=64`)}" alt="" data-fb-text="${App.escapeHtml((user.discord_username || user.email || '?').trim().slice(0, 1).toUpperCase())}" />`
            : `<div class="user-avatar">${App.escapeHtml((user.email[0] || '?').toUpperCase())}</div>`}
          <span>${App.escapeHtml(user.discord_username || user.email)}</span>
          <span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10.2 13.8a3.6 3.6 0 0 0 5.2.2l2.6-2.6a3.7 3.7 0 0 0-5.2-5.2l-1.4 1.4"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.2-.2L6 12.6a3.7 3.7 0 0 0 5.2 5.2l1.4-1.4"/></svg></span>
        </div>
        <button class="btn btn-ghost btn-sm" id="nav-logout" title="Déconnexion" aria-label="Se déconnecter du dashboard"><span class="nl-ico"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 20.4H5.6a2 2 0 0 1-2-2V5.6a2 2 0 0 1 2-2h3.8"/><path d="M15.6 16.8 20.4 12l-4.8-4.8"/><path d="M20.4 12H9.4"/></g></svg></span><span class="nl-lbl">Déconnexion</span></button>
      </div>
    </div>
  `);
  const brandImage = nav.querySelector('#nav-brand-avatar');
  if (brandImage) brandImage.onerror = () => brandImage.replaceWith(App.el('<span class="logo"><svg class="ico-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13.4 2.6 5.6 13.4h4.8L9 21.4l8.6-11.2h-5l.8-7.6Z"/></svg></span>'));
  // Ce que cette barre sait deja : la comparaison evite de la jeter pour rien.
  nav.dataset.brandSig = App.brandSig(bot);
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
  const seq = App._vueSeq;
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const shell = App.el(`<div class="bot-shell"><div class="center-loading"><div class="spinner"></div></div></div>`);
  root.appendChild(shell);

  try {
    const { bot, configured } = await App.api('/hoxera');
    // Une autre vue a ete demandee pendant l'attente : on ne touche plus a rien.
    if (App._vueSeq !== seq) return;
    if (!configured || !bot) {
      shell.innerHTML = `
        <div class="dash-card" style="max-width:560px;margin:24px auto">
          <h3>Hoxera n'est pas encore branché</h3>
          <div class="desc">Ajoute la variable d'environnement <b>HOXERA_TOKEN</b> (token du bot) dans les réglages du service sur Render, puis redémarre. La connexion se fait automatiquement.</div>
        </div>`;
      return;
    }
    App.state.bot = bot;
    App.brandWrite(bot);
    // v364 — on ne remplace la barre QUE si l'identite a reellement change
    // (renommage du bot, nouvel avatar). La remplacer a chaque rafraichissement
    // etait exactement le flash constate en haut a gauche.
    const currentNav = root.querySelector('.navbar');
    if (currentNav && currentNav.dataset.brandSig !== App.brandSig(bot)) {
      currentNav.replaceWith(App.renderNavbar());
    }
    shell.innerHTML = '';
    await Dashboard.mount(shell, bot);
  } catch (e) {
    if (App._vueSeq !== seq) return;
    shell.innerHTML = `<div class="empty-state"><div class="big">${App.glyphe('alerte', { taille: 26 })}</div>${App.escapeHtml(e.message)}</div>`;
  }
};

// ---------------------- Administration Hoxera (fondateur uniquement) ----------------------
App.ADMIN_TAB = App.ADMIN_TAB || 'overview';

// HUB FONDATEUR (v199) — espace privé du créateur d'Hoxera.
// Onglets : Vue d'ensemble (stats + santé + activité + actions rapides),
// Comptes (recherche + gestion), Bots (démarrer/arrêter), Journal de
// sécurité (filtrable), Réglages plateforme (URL publique, bannière, sauvegarde).
App.renderAdminPage = async () => {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(App.renderNavbar());
  const page = App.el(`
    <div class="page admin-platform-page">
      <header class="admin-head">
        <div class="admin-identity">
          <img id="a-bot-avatar" class="admin-mark admin-bot-avatar" src="/api/public/bot-avatar?v=367" alt="Avatar d’Optimus Prime" width="48" height="48" />
          <div class="admin-head-copy">
            <div class="admin-breadcrumb"><span>OPTIMUS PRIME</span><i>/</i><b>CONSOLE FONDATEUR</b></div>
            <h1>Espace fondateur</h1>
            <p class="sub">Le pilotage global de la plateforme, dans un espace privé.</p>
          </div>
        </div>
        <div class="admin-head-actions">
          <span class="admin-access-badge"><span class="admin-access-dot"></span>Accès fondateur</span>
          <button class="btn admin-refresh-btn" id="a-refresh"><span aria-hidden="true">↻</span>Actualiser</button>
        </div>
      </header>
      <nav class="admin-tabs" id="a-tabs" role="tablist" aria-label="Navigation de l'espace fondateur"></nav>
      <div id="a-body" role="tabpanel"></div>
    </div>`);
  root.appendChild(page);

  const ADMIN_ICONS = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.07 0l2-2A5 5 0 0 0 12 3.93l-1.14 1.14"/><path d="M14 11a5 5 0 0 0-7.07 0l-2 2A5 5 0 0 0 12 20.07l1.14-1.14"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
    group: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    ticket: '<path d="M2 9a3 3 0 0 0 0 6v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a3 3 0 0 1 0-6V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M8 13h.01M16 13h.01M9 17h6"/><circle cx="12" cy="3" r="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a1.7 1.7 0 0 1-3.4 0v-.2A1.7 1.7 0 0 0 7.8 17l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.3a1.7 1.7 0 0 1 0-3.4h.2A1.7 1.7 0 0 0 5.3 7l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.3a1.7 1.7 0 0 1 3.4 0v.2A1.7 1.7 0 0 0 16.9 5l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.3a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 1.3Z"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17.5 6L20 12M4 12l2.5 6a7 7 0 0 0 11.9-3"/>',
    restart: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  };
  const adminIcon = (name, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ADMIN_ICONS[name] || ''}</svg>`;

  const TABS = [
    ['overview', 'overview', 'Vue d\'ensemble'],
    ['users', 'users', 'Comptes'],
    ['bots', 'bot', 'Bots'],
    ['audit', 'shield', 'Journal'],
    ['settings', 'settings', 'Réglages'],
  ];
  const tabsEl = page.querySelector('#a-tabs');
  const bodyEl = page.querySelector('#a-body');
  page.querySelector('#a-refresh').onclick = () => renderBody();

  const renderTabs = () => {
    tabsEl.innerHTML = '';
    TABS.forEach(([id, ico, label]) => {
      const active = App.ADMIN_TAB === id;
      const b = App.el(`<button class="admin-tab ${active ? 'active' : ''}" type="button" role="tab" aria-selected="${active}" data-tab="${id}">${adminIcon(ico, 'admin-tab-icon')}<span class="admin-tab-label">${label}</span></button>`);
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
    const [stats, system, activityRes, botsRes] = await Promise.all([
      App.api('/admin/stats'),
      App.api('/admin/system'),
      App.api('/admin/activity?limit=40'),
      App.api('/admin/bots').catch(() => ({ bots: [] })),
    ]);
    const uptime = Math.floor((Number(system.uptimeMs) || 0) / 1000);
    const upStr = uptime > 86400 ? Math.floor(uptime / 86400) + ' j ' + Math.floor((uptime % 86400) / 3600) + ' h'
      : uptime > 3600 ? Math.floor(uptime / 3600) + ' h ' + Math.floor((uptime % 3600) / 60) + ' min'
      : Math.max(1, Math.floor(uptime / 60)) + ' min';
    const primaryBot = (Array.isArray(botsRes.bots) ? botsRes.bots : []).find((bot) => Number(bot.id) === 1);
    const botName = String((primaryBot && primaryBot.name) || 'Bot principal');
    const botOnline = primaryBot ? Boolean(primaryBot.online) : Boolean(stats.online);
    const backupActive = Boolean(system.backupEnabled);
    const activityItems = Array.isArray(activityRes.items) ? activityRes.items.slice(0, 8) : [];
    const displayNumber = (value) => (Number(value) || 0).toLocaleString('fr-FR');
    const lastBackup = system.lastBackup ? String(system.lastBackup).replace('T', ' ').slice(0, 16) : 'Aucune sauvegarde enregistrée';
    const metrics = [
      ['users', 'Comptes', displayNumber(stats.users), 'Utilisateurs de la plateforme'],
      ['link', 'Liés à Discord', displayNumber(stats.linked), 'Comptes connectés'],
      ['shield', 'Comptes bannis', displayNumber(stats.banned), 'Mesures de protection'],
      ['server', 'Serveurs', displayNumber(stats.servers), 'Espaces suivis'],
      ['group', 'Membres suivis', displayNumber(stats.members), 'Sur l’ensemble des serveurs'],
      ['ticket', 'Tickets', displayNumber((Number(stats.tickets) || 0) + (Number(stats.openTickets) || 0)), 'Ouverts et traités'],
      ['message', 'Messages · 24 h', displayNumber(stats.messages24h), 'Sur les dernières 24 heures'],
      ['bot', botName, botOnline ? 'Connecté' : 'Hors ligne', botOnline ? 'Connexion Discord active' : 'Bot non connecté'],
    ];
    const metricsMarkup = metrics.map(([icon, label, value, note]) => `
      <article class="admin-stat-card${icon === 'bot' ? (botOnline ? ' is-online' : ' is-offline') : ''}">
        <div class="admin-stat-top"><span class="admin-stat-icon">${adminIcon(icon)}</span>${icon === 'bot' ? `<span class="admin-stat-live"><i></i>${botOnline ? 'En ligne' : 'Hors ligne'}</span>` : ''}</div>
        <div class="admin-stat-value">${App.escapeHtml(String(value))}</div>
        <div class="admin-stat-label">${App.escapeHtml(label)}</div>
        <div class="admin-stat-note">${App.escapeHtml(note)}</div>
      </article>`).join('');
    const activityMarkup = activityItems.length ? activityItems.map((it) => {
      const context = [it.guild_name, it.bot_name].filter(Boolean).map((part) => App.escapeHtml(String(part))).join(' · ');
      const rawTime = String(it.created_at || '');
      const time = rawTime ? rawTime.replace('T', ' ').slice(0, 16) : '—';
      return `
        <article class="admin-activity-item">
          <span class="admin-activity-icon">${it.emoji ? App.escapeHtml(it.emoji) : adminIcon('activity')}</span>
          <div class="admin-activity-copy"><strong>${App.escapeHtml(String(it.text || 'Activité enregistrée'))}</strong>${context ? `<span>${context}</span>` : ''}</div>
          <time class="admin-activity-time">${App.escapeHtml(time)}</time>
        </article>`;
    }).join('') : '<div class="admin-empty"><span class="admin-empty-mark">—</span><strong>Aucune activité récente</strong><span>Les événements de la plateforme apparaîtront ici.</span></div>';
    const backupActionMarkup = `${adminIcon('database')}<span>Sauvegarder maintenant</span>`;
    bodyEl.innerHTML = `
      <div class="admin-overview">
        <section class="admin-overview-hero">
          <div class="admin-overview-copy">
            <span class="admin-section-kicker">SYNTHÈSE DE LA PLATEFORME</span>
            <h2>Vue d’ensemble opérationnelle</h2>
            <p>Activité, disponibilité et volumes clés · réunis au même endroit.</p>
          </div>
          <div class="admin-hero-status ${botOnline ? 'is-online' : 'is-offline'}">
            <span class="admin-hero-status-mark"><i></i></span>
            <span><strong>${botOnline ? 'Bot opérationnel' : 'Bot hors ligne'}</strong><small>Processus actif depuis ${App.escapeHtml(upStr)}</small></span>
          </div>
        </section>

        <section class="admin-metrics-section" aria-label="Indicateurs de la plateforme">
          <div class="admin-section-heading">
            <div><span class="admin-section-kicker">INDICATEURS</span><h3>Les chiffres clés</h3></div>
            <span class="admin-section-note">Données de la plateforme</span>
          </div>
          <div class="admin-stat-grid">${metricsMarkup}</div>
        </section>

        <div class="admin-overview-grid">
          <section class="admin-panel admin-health-panel">
            <header class="admin-panel-head">
              <div><span class="admin-section-kicker">SYSTÈME</span><h3>Santé de la plateforme</h3><p>État des services essentiels et des sauvegardes.</p></div>
              <span class="admin-summary-mark">${adminIcon('activity')}</span>
            </header>
            <div class="admin-health-list">
              <div class="admin-health-row">
                <span class="admin-health-icon is-good">${adminIcon('server')}</span>
                <span class="admin-health-copy"><strong>Serveur web</strong><small>Actif depuis ${App.escapeHtml(upStr)}</small></span>
                <span class="admin-state-tag is-good"><i></i>En ligne</span>
              </div>
              <div class="admin-health-row">
                <span class="admin-health-icon ${botOnline ? 'is-good' : 'is-bad'}">${adminIcon('bot')}</span>
                <span class="admin-health-copy"><strong>${App.escapeHtml(botName)}</strong><small>Connexion au réseau Discord</small></span>
                <span class="admin-state-tag ${botOnline ? 'is-good' : 'is-bad'}"><i></i>${botOnline ? 'Connecté' : 'Hors ligne'}</span>
              </div>
              <div class="admin-health-row">
                <span class="admin-health-icon ${backupActive ? 'is-good' : 'is-warn'}">${adminIcon('database')}</span>
                <span class="admin-health-copy"><strong>Sauvegardes automatiques</strong><small>${App.escapeHtml(lastBackup)}</small></span>
                <span class="admin-state-tag ${backupActive ? 'is-good' : 'is-warn'}"><i></i>${backupActive ? 'Actives' : 'À configurer'}</span>
              </div>
            </div>
            <div class="admin-panel-actions">
              <button class="btn admin-action-primary" id="a-backup-now">${backupActionMarkup}</button>
              <button class="btn admin-action-secondary" id="a-restart-bot">${adminIcon('restart')}<span>Redémarrer le bot</span></button>
            </div>
          </section>

          <section class="admin-panel admin-activity-panel">
            <header class="admin-panel-head">
              <div><span class="admin-section-kicker">ÉVÉNEMENTS</span><h3>Activité récente</h3><p>Les dernières opérations enregistrées sur la plateforme.</p></div>
              <span class="admin-activity-count">${activityItems.length}</span>
            </header>
            <div class="admin-activity-feed" id="a-feed">${activityMarkup}</div>
            <div class="admin-panel-footer"><button class="admin-text-action" id="a-view-audit" type="button">Ouvrir le journal ${adminIcon('arrow')}</button></div>
          </section>
        </div>
      </div>`;

    bodyEl.querySelector('#a-backup-now').onclick = async () => {
      const b = bodyEl.querySelector('#a-backup-now');
      b.disabled = true;
      b.innerHTML = '<span class="admin-inline-spinner" aria-hidden="true"></span><span>Sauvegarde…</span>';
      try {
        const r = await App.api('/backup/now', { method: 'POST' });
        App.toast(r.ok ? 'Sauvegarde terminée.' : (r.error || 'Erreur'));
      } catch (e) { App.toast(e.message, 'error'); }
      finally { b.disabled = false; b.innerHTML = backupActionMarkup; renderBody(); }
    };
    bodyEl.querySelector('#a-restart-bot').onclick = async () => {
      if (!(await App.confirm('Redémarrer le bot Hoxera ? Il sera indisponible ~10 secondes.'))) return;
      try {
        await App.api('/bots/1/stop', { method: 'POST' });
        await new Promise((r) => setTimeout(r, 800));
        await App.api('/bots/1/start', { method: 'POST' });
        App.toast('Bot redémarré.');
        renderBody();
      } catch (e) { App.toast(e.message, 'error'); }
    };
    bodyEl.querySelector('#a-view-audit').onclick = () => { App.ADMIN_TAB = 'audit'; renderTabs(); renderBody(); };
  };

  // ─────────────────── Comptes ───────────────────
  const renderUsers = async () => {
    const query = (App.ADMIN_Q = App.ADMIN_Q || '');
    bodyEl.innerHTML = `
      <div class="card">
        <h3>Comptes Hoxera liés à Discord</h3>
        <div class="card-sub">Délier Discord, bannir ou supprimer un compte. Votre propre compte est toujours protégé.</div>
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
      usersEl.innerHTML = `<div class="admin-users-table-wrap"><table class="leaderboard-table admin-users-table"><thead><tr><th>Compte</th><th>Discord lié</th><th>Serveurs</th><th>Statut</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
      const tb = usersEl.querySelector('tbody');
      const discordAvatarUrl = (user) => {
        const id = String(user.discord_id || '').trim();
        if (!/^\d{15,21}$/.test(id)) return '';
        const hash = String(user.discord_avatar || '').trim();
        let source;
        if (/^[a-zA-Z0-9_]+$/.test(hash)) {
          // Les avatars animés Nitro portent le préfixe a_ et se chargent en GIF.
          source = `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=96`;
        } else {
          let index = 0;
          try { index = Number((BigInt(id) >> 22n) % 6n); } catch {}
          source = `https://cdn.discordapp.com/embed/avatars/${index}.png?size=96`;
        }
        // Même origine que le dashboard : évite les blocages directs du CDN Discord.
        return `/api/img?u=${encodeURIComponent(source)}`;
      };
      res.users.forEach((u) => {
        const isCurrent = Number(u.id) === Number(App.state.user && App.state.user.id);
        const guildNames = (u.guilds || []).slice(0, 5).map((g) => App.escapeHtml(g.name)).join(', ');
        const moreGuilds = (u.guilds || []).length > 5 ? ` +${u.guilds.length - 5}` : '';
        const avatarUrl = u.discord_linked ? discordAvatarUrl(u) : '';
        const avatarInitial = [...String(u.discord_username || u.discord_id || '?').trim()][0] || '?';
        const avatarImage = avatarUrl
          ? `<img class="admin-discord-avatar" src="${App.escapeHtml(avatarUrl)}" alt="" width="34" height="34" loading="lazy" data-fb-text="${App.escapeHtml(avatarInitial)}" />`
          : `<span class="admin-discord-avatar-fallback" aria-hidden="true">${App.escapeHtml(avatarInitial.toUpperCase())}</span>`;
        const decoUrl = typeof Dashboard !== 'undefined' && typeof Dashboard.userDecoUrl === 'function'
          ? Dashboard.userDecoUrl(u.discord_deco) : '';
        const discordAvatar = typeof Dashboard !== 'undefined' && typeof Dashboard.decoWrap === 'function'
          ? Dashboard.decoWrap(avatarImage, decoUrl) : avatarImage;
        const discordCell = u.discord_linked
          ? `<span class="admin-linked-account"><span class="admin-linked-avatar${u.discord_deco ? ' has-decoration' : ''}" title="${u.discord_deco ? 'Photo Discord avec décoration d’avatar' : 'Photo Discord'}">${discordAvatar}</span><span class="admin-linked-copy"><b>${App.escapeHtml('@' + (u.discord_username || u.discord_id))}</b><small>ID ${App.escapeHtml(u.discord_id)}</small></span></span>`
          : `<span style="color:var(--text-dim)">Non lié</span><small style="display:block;color:var(--text-dim)">${App.escapeHtml(u.email)}</small>`;
        const statusCell = u.banned
          ? `<span class="chip" style="color:#ff8a8d;border-color:rgba(237,66,69,.45)">Banni</span><small style="display:block;color:var(--text-dim);max-width:180px">${App.escapeHtml(u.ban_reason || 'Aucune raison')}</small>`
          : `<span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">Actif</span>`;
        const actions = isCurrent
          ? `<span style="font-size:12px;color:var(--text-dim)">Compte protégé</span>`
          : `<div style="display:flex;gap:6px;flex-wrap:wrap">
              ${u.discord_linked ? '<button class="btn btn-ghost btn-sm" data-unlink>Délier</button>' : ''}
              ${u.banned ? '<button class="btn btn-ghost btn-sm" data-unban>Débannir</button>' : '<button class="btn btn-ghost btn-sm" data-ban>Bannir</button>'}
              <button class="btn btn-danger btn-sm" data-delete>Supprimer</button>
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
          if (!(await App.confirm('Délier le compte Discord de cet utilisateur ? Son compte Hoxera sera conservé, mais il devra relier Discord pour revenir.'))) return;
          try { await App.api(`/admin/users/${u.id}/unlink-discord`, { method: 'POST' }); App.toast('Compte Discord délié.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const ban = row.querySelector('[data-ban]');
        if (ban) ban.onclick = async () => {
          if (!(await App.confirm('Bannir cet utilisateur d\'Hoxera ? Ses données seront conservées et le bannissement pourra être retiré.'))) return;
          const reason = await App.prompt('Raison du bannissement (optionnelle)', 'Abus de la plateforme');
          try { await App.api(`/admin/users/${u.id}/ban`, { method: 'POST', body: { reason } }); App.toast('Utilisateur banni d\'Hoxera.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const unban = row.querySelector('[data-unban]');
        if (unban) unban.onclick = async () => {
          if (!(await App.confirm('Débannir cet utilisateur d\'Hoxera ?'))) return;
          try { await App.api(`/admin/users/${u.id}/ban`, { method: 'DELETE' }); App.toast('Utilisateur débanni.'); await reload(); }
          catch (e) { App.toast(e.message, 'error'); }
        };
        const del = row.querySelector('[data-delete]');
        if (del) del.onclick = async () => {
          if (!(await App.confirm('Supprimer définitivement ce compte et toutes ses données Hoxera ? Cette action est irréversible.'))) return;
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
    bodyEl.innerHTML = `<div class="card"><h3>Bots de la plateforme</h3><div class="card-sub">Contrôle complet en tant que fondateur : démarrer, arrêter, redémarrer.</div><div id="a-bots"><div class="spinner" style="margin:20px auto"></div></div></div>`;
    const res = await App.api('/admin/bots');
    const botsEl = bodyEl.querySelector('#a-bots');
    if (!res.bots || !res.bots.length) {
      botsEl.innerHTML = `<div class="empty-state">Aucun bot enregistré.</div>`;
    } else {
      botsEl.innerHTML = `<div style="overflow-x:auto"><table class="leaderboard-table"><thead><tr><th>Bot</th><th>État</th><th>Serveurs</th><th>Propriétaire</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
      const tb = botsEl.querySelector('tbody');
      res.bots.forEach((b) => {
        const statusCell = b.online
          ? `<span class="chip" style="color:#57F287;border-color:rgba(87,242,135,.4)">En ligne</span>`
          : `<span class="chip" style="color:#ff8a8d;border-color:rgba(237,66,69,.45)">Hors ligne</span>`;
        const row = App.el(`<tr>
          <td><b>${App.escapeHtml(b.name || 'Sans nom')}</b>${b.bot_username ? `<small style="display:block;color:var(--text-dim)">${App.escapeHtml(b.bot_username)}</small>` : ''}</td>
          <td>${statusCell}</td>
          <td>${b.servers ?? 0}</td>
          <td style="color:var(--text-dim);font-size:13px">${App.escapeHtml(b.owner_email || '—')}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap">
            ${b.online
              ? '<button class="btn btn-ghost btn-sm" data-restart>Redémarrer</button><button class="btn btn-danger btn-sm" data-stop>⏹ Arrêter</button>'
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
            App.toast('Bot redémarré.');
            renderBody();
          } catch (e) { App.toast(e.message, 'error'); btn.disabled = false; }
        };
        const start = row.querySelector('[data-start]');
        if (start) start.onclick = async () => {
          start.disabled = true;
          try { await App.api(`/bots/${b.id}/start`, { method: 'POST' }); App.toast('▶️ Bot démarré.'); renderBody(); }
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
      unlink_discord: 'Discord délié',
      ban_user: 'Compte banni',
      unban_user: 'Compte débanni',
      delete_user: 'Compte supprimé',
    };
    bodyEl.innerHTML = `
      <div class="card">
        <h3>️ Journal de sécurité</h3>
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
        <h3>Réglages plateforme</h3>
        <div class="card-sub">Ces réglages sont appliqués partout : liens de transcription, bannière du profil, sauvegardes.</div>
        <label class="dash-label">URL publique du site</label>
        <input class="dash-input" id="a-public-url" placeholder="https://hoxera.onrender.com" value="${App.escapeHtml(cfg.public_url || '')}" style="max-width:420px" />
        <div style="font-size:12px;color:var(--text-dim);margin-top:6px">Utilisée pour les liens de transcription envoyés en message privé. Laisse vide pour le défaut.</div>
        <label class="dash-label" style="margin-top:16px">Bannière du profil du bot (MP de fermeture des tickets)</label>
        <input class="dash-input" id="a-banner-url" placeholder="https://…" value="${App.escapeHtml(cfg.profile_banner_url || '')}" style="max-width:420px" />
        <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-sm" id="a-settings-save">Enregistrer</button>
        </div>
      </div>
      <div class="card">
        <h3>Sauvegardes</h3>
        <div class="card-sub">La base de données est sauvegardée sur GitHub automatiquement (si configuré).</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="chip" style="color:${cfg.backup_enabled ? '#57F287' : '#ff8a8d'};border-color:${cfg.backup_enabled ? 'rgba(87,242,135,.4)' : 'rgba(237,66,69,.45)'}">${cfg.backup_enabled ? 'Sauvegarde configurée' : 'Non configurée'}</span>
          ${cfg.backup_repo ? `<span class="chip">${App.escapeHtml(cfg.backup_repo)}</span>` : ''}
          <span class="chip">Dernière : ${cfg.last_backup ? App.escapeHtml(String(cfg.last_backup).slice(0, 16)) : 'jamais'}</span>
        </div>
        <div style="margin-top:12px"><button class="btn btn-sm" id="a-backup">Sauvegarder maintenant</button></div>
      </div>`;
    bodyEl.querySelector('#a-settings-save').onclick = async () => {
      try {
        await App.api('/admin/settings', { method: 'PUT', body: {
          public_url: bodyEl.querySelector('#a-public-url').value.trim(),
          profile_banner_url: bodyEl.querySelector('#a-banner-url').value.trim(),
        }});
        App.toast('Réglages enregistrés.');
      } catch (e) { App.toast(e.message, 'error'); }
    };
    bodyEl.querySelector('#a-backup').onclick = async () => {
      const b = bodyEl.querySelector('#a-backup');
      b.disabled = true; b.textContent = '⏳ Sauvegarde…';
      try {
        const r = await App.api('/backup/now', { method: 'POST' });
        App.toast(r.ok ? 'Sauvegarde terminée.' : (r.error || 'Erreur'));
      } catch (e) { App.toast(e.message, 'error'); }
      finally { b.disabled = false; b.textContent = 'Sauvegarder maintenant'; renderBody(); }
    };
  };

  renderTabs();
  await renderBody();
};

// ---------------------- Démarrage ----------------------
App.syncThemeColor();
window.addEventListener('hashchange', () => App.router.run());
window.addEventListener('DOMContentLoaded', () => App.router.run());
if (document.readyState !== 'loading') App.router.run();

// ============================================================
// Anti-images cassées (global, capture) — v206, robuste v207
// ------------------------------------------------------------
// Toute <img> qui échoue à charger (CDN Discord injoignable, avatar ou
// icône supprimé, URL devenue invalide…) est remplacée SUR PLACE par une
// pastille de secours propre (initiale sur fond doux). L'icône « image
// cassée » du navigateur ne doit JAMAIS apparaître — ni dans le dashboard,
// ni dans les menus déroulants, ni sur les pages publiques.
// Les images qui ont déjà leur propre onerror (logo public ⚡, etc.)
// restent gérées par leur code local : on ne les touche pas.
// Règle d'or v207 : une pastille de secours DOIT rester visible.
//   - Si l'image échoue avant que son conteneur ait une taille (layout pas
//     encore fait, conteneur masqué…), on NE fige PAS une pastille de 1 px :
//     on réessaie au frame suivant, puis on attend que l'élément devienne
//     visible (IntersectionObserver) pour le remplacer avec sa vraie taille.
App.imgFallbackText = (img) => {
  if (!img) return '?';
  const named = img.dataset && (img.dataset.fbText || img.dataset.name);
  if (named && String(named).trim()) return [...String(named).trim()][0].toUpperCase();
  const alt = String(img.getAttribute && (img.getAttribute('alt') || '') || '').trim();
  if (alt && !/^(logo|avatar|ic[oô]ne|image|banni[eè]re|photo)/i.test(alt) && alt !== 'Logo Hoxera') return [...alt][0].toUpperCase();
  const title = String(img.title || '').trim();
  if (title) return [...title][0].toUpperCase();
  // Contexte : carte de serveur (le <b> voisin porte le nom), option de
  // menu déroulant (.dd-opt-txt b), pastille de membre…
  const host = img.closest('.sp-card, .srv-card, .dash-server-card, .dash-mobile-server-item, .ov-intro-server, .dd-option, .ov-top-member, .dash-bot-chip, .dash-mobile-drawer-account, .module-header-meta');
  if (host) {
    const nameEl = host.querySelector('b, .chip-txt b, .srv-txt b, .sp-txt b, .dd-opt-txt b, .ov-qa-txt b');
    const nm = (nameEl && nameEl.textContent || '').trim().replace(/^#/, '');
    if (nm) return [...nm][0].toUpperCase();
  }
  // v367 — « ? » et non un eclair : la pastille de repli n'est pas une signature
  // graphique, c'est un etat « aucun nom exploitable ». Les six occurrences
  // mesurees dans la liste des membres rendaient un eclair identique partout.
  return '?';
};

// Mesure la taille CSS effective d'une image (layout + styles calculés).
App.imgSizeOf = (img) => {
  try {
    const cs = window.getComputedStyle(img);
    const rect = img.getBoundingClientRect();
    let w = Math.round(rect.width);
    let h = Math.round(rect.height);
    if (!w || !h) {
      const cw = parseFloat(cs.width), ch = parseFloat(cs.height);
      if (!w && cw) w = Math.round(cw);
      if (!h && ch) h = Math.round(ch);
    }
    return { w: w || 0, h: h || 0, cs };
  } catch { return { w: 0, h: 0, cs: null }; }
};

let __fbObserver = null;
function __fbObserveWhenVisible(img) {
  // L'élément est masqué ou pas encore dimensionné : on attend qu'il entre
  // dans le viewport (ou que son conteneur s'affiche) pour le remplacer.
  if (typeof IntersectionObserver === 'undefined') return;
  if (!__fbObserver) {
    __fbObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const target = en.target;
        __fbObserver.unobserve(target);
        if (target.tagName === 'IMG') App.imgFailed(target);
      }
    }, { rootMargin: '200px' });
  }
  __fbObserver.observe(img);
}

App.imgFailed = (img) => {
  if (!img || !img.isConnected || (img.dataset && img.dataset.fbSafe)) return;
  img.dataset.fbSafe = '1';
  const replace = () => {
    if (!img.isConnected) return;
    try {
      const { w, h, cs } = App.imgSizeOf(img);
      // 1) Pas encore de taille (layout en cours) : on retente au prochain
      //    frame — quelques ms plus tard le conteneur est dimensionné.
      const tries = parseInt(img.dataset.fbTries || '0', 10) || 0;
      if ((w < 4 || h < 4) && tries < 12) {
        img.dataset.fbTries = String(tries + 1);
        img.dataset.fbSafe = '';
        requestAnimationFrame(() => App.imgFailed(img));
        return;
      }
      // 2) Toujours aucune taille (conteneur masqué : drawer fermé, onglet
      //    inactif…) : on remplacera dès que l'élément sera visible — jamais
      //    une pastille de 1 px invisible.
      if (w < 4 || h < 4) {
        img.dataset.fbSafe = '';
        __fbObserveWhenVisible(img);
        return;
      }
      // 3) Taille connue : pastille propre et visible.
      const round = (cs && /50%|100%/.test(cs.borderRadius)) || img.classList.contains('round');
      const fb = document.createElement('span');
      // On garde les classes de l'image : les styles qui ciblaient sa classe
      // (taille, bordure…) s'appliquent aussi à la pastille.
      fb.className = 'img-fb' + (round ? ' is-round' : '') + (img.className ? ' ' + String(img.className) : '');
      fb.style.width = w + 'px';
      fb.style.height = h + 'px';
      fb.style.fontSize = Math.max(10, Math.min(22, Math.round(Math.min(w, h) * 0.44))) + 'px';
      fb.setAttribute('aria-hidden', 'true');
      fb.textContent = App.imgFallbackText(img);
      img.replaceWith(fb);
    } catch { /* ne jamais bloquer le rendu */ }
  };
  replace();
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
