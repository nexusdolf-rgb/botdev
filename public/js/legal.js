// ============================================================
// Pages légales (/terms et /privacy) — sélecteur de langue.
//
// Rien d'autre : aucun appel réseau, aucun cookie, aucune mesure.
// La langue choisie est retenue dans le stockage local du navigateur
// (clé « hx-lang »), pour que la personne retrouve sa lecture à la
// visite suivante. Le HTML contient LES DEUX langues : sans ce script,
// le français s'affiche (attribut data-lang sur <html>).
// ============================================================
(function () {
  'use strict';

  var CLE = 'hx-lang';
  var LANGUES = ['fr', 'en'];

  function litLangue() {
    try {
      var v = localStorage.getItem(CLE);
      return LANGUES.indexOf(v) !== -1 ? v : '';
    } catch (e) {
      return '';
    }
  }

  function ecritLangue(langue) {
    try { localStorage.setItem(CLE, langue); } catch (e) { /* navigation privée : on continue */ }
  }

  function applique(langue) {
    if (LANGUES.indexOf(langue) === -1) langue = 'fr';
    document.documentElement.setAttribute('data-lang', langue);
    document.documentElement.setAttribute('lang', langue);
    var boutons = document.querySelectorAll('[data-lang-set]');
    for (var i = 0; i < boutons.length; i++) {
      boutons[i].setAttribute('aria-pressed', boutons[i].getAttribute('data-lang-set') === langue ? 'true' : 'false');
    }
    // Le titre de l'onglet suit la langue, comme le reste de la page.
    var titre = document.querySelector('title');
    if (titre && titre.dataset.fr && titre.dataset.en) {
      titre.textContent = langue === 'en' ? titre.dataset.en : titre.dataset.fr;
    }
  }

  // Choix explicite d'une personne : il prime sur la langue du navigateur.
  var choisi = litLangue();
  var initiale = choisi || ((navigator.language || 'fr').slice(0, 2).toLowerCase() === 'en' ? 'en' : 'fr');
  applique(initiale);

  document.addEventListener('click', function (ev) {
    var bouton = ev.target.closest && ev.target.closest('[data-lang-set]');
    if (!bouton) return;
    var langue = bouton.getAttribute('data-lang-set');
    if (LANGUES.indexOf(langue) === -1) return;
    applique(langue);
    ecritLangue(langue);
  });
}());
