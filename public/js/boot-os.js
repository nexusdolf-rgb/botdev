// boot-os.js — décide « ordinateur » ou « mobile » avant le premier rendu.
// La décision vient du système annoncé par le navigateur, pas des mesures :
// un PC à 125 % d'échelle ou avec un écran tactile reste un PC.
(() => {
  // Un iPad récent se déclare « Macintosh » : ses points tactiles le trahissent.
  try {
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
    const ipadEnMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const bureau = /Windows NT|Macintosh|X11|Linux|CrOS/.test(ua);
    if (bureau && !mobile && !ipadEnMac) document.documentElement.classList.add('hx-os-pc');
  } catch (e) {}
})();
