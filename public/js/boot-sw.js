// boot-sw.js — service worker : servir la dernière version sans perdre une saisie.
(() => {
  if (!('serviceWorker' in navigator)) return;

  let dejaRecharge = false;
  let modifie = false;
  let bandeau = null;

  const surSaisie = () => { modifie = true; };
  document.addEventListener('input', surSaisie, true);
  document.addEventListener('change', surSaisie, true);
  // Le tableau de bord signale chaque enregistrement réussi.
  document.addEventListener('hx:saved', () => { modifie = false; }, true);

  // Un champ modifié et non enregistré protège la page : pas de rechargement muet.
  window.addEventListener('beforeunload', (e) => {
    if (!modifie) return;
    e.preventDefault();
    e.returnValue = '';
  });

  const proposerActualisation = () => {
    if (bandeau) return;
    bandeau = document.createElement('div');
    bandeau.setAttribute('data-maj-bouton', '1');
    bandeau.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9999;'
      + 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;'
      + 'background:#2b2d31;color:#f2f3f5;font:500 14px/1.3 system-ui,sans-serif;'
      + 'box-shadow:0 10px 30px rgba(0,0,0,.35)';
    const texte = document.createElement('span');
    texte.textContent = 'Une nouvelle version est prête.';
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = 'Actualiser';
    bouton.style.cssText = 'border:0;border-radius:8px;padding:8px 12px;cursor:pointer;'
      + 'background:#e07a5f;color:#1c1e26;font:600 14px system-ui,sans-serif';
    bouton.addEventListener('click', () => {
      modifie = false;
      window.location.reload();
    });
    bandeau.appendChild(texte);
    bandeau.appendChild(bouton);
    document.body.appendChild(bandeau);
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dejaRecharge) return;
    dejaRecharge = true;
    if (modifie) proposerActualisation();
    else window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Contrôle périodique et au retour sur l'onglet, sans vider le cache.
    window.setInterval(() => { reg.update(); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update();
    });
  }).catch(() => {});
})();
