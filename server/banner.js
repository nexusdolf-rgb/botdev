// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// Version STATIQUE (l'animation a été retirée pour la stabilité
// de l'hébergement gratuit : génération instantanée ~1 s, zéro
// charge sur le processeur, zéro mémoire).
// Style reproduit d'après la référence :
//  - 544×192, fond rouge/bordeaux sombre + fumée rougeoyante
//  - grille glitch RGB subtile
//  - texte « SUPPORT - {NOM DU SERVEUR} » blanc bold centré
//    avec halo chromatique (rose + vert + cyan)
// ============================================================
const store = require('./db');
let sharp = null;
try {
  sharp = require('sharp');
  sharp.concurrency(1); // une seule tâche à la fois : stabilité maximale
} catch (e) { console.error('[Hoxera] sharp indisponible :', e.message); }

const cache = new Map(); // nom -> Buffer PNG
const CACHE_MAX = 60;

const W = 544;
const H = 192;

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

// Taille de police automatique : le texte tient TOUJOURS dans la bannière,
// quelle que soit la longueur du nom du serveur (court = grand, long = réduit).
// Coefficient 0.72 : largeur moyenne réelle d'une majuscule bold DejaVu
// (mesurée empiriquement — 0.62 faisait déborder les noms).
const BANNER_MARGIN = 48; // 24 px de marge de chaque côté
function autoFontSize(label) {
  const available = W - BANNER_MARGIN;
  const est = Math.floor(available / (Math.max(1, label.length) * 0.72));
  return Math.max(12, Math.min(64, est));
}

// Fond + texte avec halos chromatiques (rendu en une seule passe)
function baseSvg(name) {
  const raw = String(name || 'NEXORA').toUpperCase();
  const label = escapeXml(raw.startsWith('SUPPORT') ? raw : `SUPPORT - ${raw}`);
  const size = autoFontSize(label);
  const available = W - BANNER_MARGIN;
  const textY = H * 0.5;
  const textProps = `font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}"`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#160405"/>
      <stop offset=".55" stop-color="#2a080a"/>
      <stop offset="1" stop-color="#3c0b0d"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".6" r=".55">
      <stop offset="0" stop-color="#ff2b2b" stop-opacity=".28"/>
      <stop offset=".65" stop-color="#ff0033" stop-opacity=".10"/>
      <stop offset="1" stop-color="#ff0033" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="40"/>
    </filter>
    <filter id="glowPink" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="glowGreen" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="glowCyan" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <pattern id="glitch" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#000000" fill-opacity="0.35"/>
      <rect x="1" y="0" width="1" height="1" fill="#ff1a1a" fill-opacity="0.55"/>
      <rect x="2" y="1" width="1" height="1" fill="#1aff4d" fill-opacity="0.5"/>
      <rect x="3" y="2" width="1" height="1" fill="#1a4dff" fill-opacity="0.5"/>
      <rect x="0" y="3" width="1" height="1" fill="#ff1a1a" fill-opacity="0.5"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>
  <ellipse cx="${W * 0.16}" cy="${H * 0.75}" rx="${W * 0.38}" ry="${H * 0.28}" fill="#ff2030" opacity=".11" filter="url(#soft)"/>
  <ellipse cx="${W * 0.86}" cy="${H * 0.25}" rx="${W * 0.32}" ry="${H * 0.34}" fill="#ff2030" opacity=".09" filter="url(#soft)"/>
  <ellipse cx="${W * 0.55}" cy="${H * 0.95}" rx="${W * 0.45}" ry="${H * 0.2}" fill="#ff2030" opacity=".1" filter="url(#soft)"/>
  <rect width="${W}" height="${H}" fill="url(#glitch)"/>
  <text x="${W / 2 + 3}" y="${textY + 1}" text-anchor="middle" dominant-baseline="central"
        ${textProps}
        fill="#ff3b5c" opacity=".55" filter="url(#glowPink)">${label}</text>
  <text x="${W / 2 - 3}" y="${textY - 1}" text-anchor="middle" dominant-baseline="central"
        ${textProps}
        fill="#39ff6a" opacity=".55" filter="url(#glowGreen)">${label}</text>
  <text x="${W / 2}" y="${textY + 3}" text-anchor="middle" dominant-baseline="central"
        ${textProps}
        fill="#39e6ff" opacity=".5" filter="url(#glowCyan)">${label}</text>
  <text x="${W / 2}" y="${textY}" text-anchor="middle" dominant-baseline="central"
        ${textProps}
        fill="#ffffff">${label}</text>
</svg>`;
}

// PNG statique (~1 s de génération, mis en cache mémoire ensuite)
async function generateBanner(name) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (!sharp) return null;
  if (cache.has(clean)) return cache.get(clean);
  try {
    const buf = await sharp(Buffer.from(baseSvg(clean))).png().toBuffer();
    cache.set(clean, buf);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return buf;
  } catch (e) {
    console.error('[Hoxera] génération de bannière :', e.message);
    return null;
  }
}

// Nom du serveur mémorisé (mis à jour à chaque envoi du panneau)
function storedPanelName(guildId) {
  try {
    const row = store.db.prepare("SELECT panel_name FROM guild_settings WHERE guild_id = ? AND panel_name != '' LIMIT 1").get(String(guildId));
    return row ? String(row.panel_name).slice(0, 26) : '';
  } catch { return ''; }
}

module.exports = { generateBanner, storedPanelName, baseSvg, escapeXml, W, H };
