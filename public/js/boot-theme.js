// boot-theme.js — applique la palette choisie avant le premier pixel.
// Sans ce fichier chargé tôt, un écran clair clignote en sombre au démarrage.
(() => {
  try {
    const choisi = localStorage.getItem('hx-theme');
    const clair = choisi === 'light'
      || (!choisi && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (clair) document.documentElement.classList.add('hx-light');
    // La barre du navigateur suit la palette réellement affichée.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', clair ? '#f2f3f8' : '#36393f');
  } catch (e) {}
})();
