// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// Chaque serveur a sa propre bannière « SUPPORT - NOM DU SERVEUR »
// (style noir / néon rouge / texte blanc, comme la référence).
// L'image est générée en SVG puis rastérisée en PNG (sharp) et
// mise en cache en mémoire — aucun impact sur la logique tickets.
// ============================================================
const store = require('./db');
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.error('[Hoxera] sharp indisponible, bannières par serveur désactivées :', e.message); }

const cache = new Map(); // nom -> Buffer PNG
const CACHE_MAX = 300;

function escapeXml(s) {
  // Références numériques (compatibles avec tous les parseurs XML)
  return String(s || '')
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

function bannerSvg(name) {
  const label = escapeXml(name).toUpperCase();
  // La taille du texte s'adapte à la longueur du nom du serveur
  const len = label.length;
  const size = len > 24 ? 40 : len > 18 ? 52 : len > 12 ? 64 : 76;
  return `<svg width="1200" height="420" viewBox="0 0 1200 420" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050505"/>
      <stop offset=".55" stop-color="#0d0305"/>
      <stop offset="1" stop-color="#16060a"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".62" r=".55">
      <stop offset="0" stop-color="#ff2b2b" stop-opacity=".38"/>
      <stop offset=".6" stop-color="#ff0033" stop-opacity=".12"/>
      <stop offset="1" stop-color="#ff0033" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7" result="b1"/>
      <feGaussianBlur stdDeviation="18" result="b2"/>
      <feMerge>
        <feMergeNode in="b2"/>
        <feMergeNode in="b1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1200" height="420" fill="url(#bg)"/>
  <rect width="1200" height="420" fill="url(#halo)"/>
  <line x1="60" y1="86" x2="1140" y2="86" stroke="#ff1a1a" stroke-opacity=".55" stroke-width="2"/>
  <line x1="60" y1="334" x2="1140" y2="334" stroke="#ff1a1a" stroke-opacity=".55" stroke-width="2"/>
  <text x="600" y="196" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
        font-size="${size}" fill="#ff2030" opacity=".9" filter="url(#glow)">${label}</text>
  <text x="600" y="196" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
        font-size="${size}" fill="#ffffff" letter-spacing="4">${label}</text>
</svg>`;
}

// Génère le PNG de la bannière pour un nom de serveur (cache mémoire).
async function generateBanner(name) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (!sharp) return null;
  if (cache.has(clean)) return cache.get(clean);
  try {
    const buf = await sharp(Buffer.from(bannerSvg(clean))).png().toBuffer();
    cache.set(clean, buf);
    if (cache.size > CACHE_MAX) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
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

module.exports = { generateBanner, storedPanelName, bannerSvg, escapeXml };
