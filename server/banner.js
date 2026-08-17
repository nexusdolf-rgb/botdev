// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// Style : fond sombre rouge/bordeaux avec fumée rougeoyante,
// texte blanc majuscule bold, et EFFET DE BRILLANCE animé
// (un balayage de lumière blanche traverse la bannière en
// diagonale, de gauche à droite, en boucle régulière).
// Formats :
//  - GIF animé (affiché par Discord dans l'embed) — principal
//  - PNG statique (repli si l'animation est impossible)
// Cache mémoire par nom de serveur. Logique tickets intacte.
// ============================================================
const store = require('./db');
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.error('[Hoxera] sharp indisponible :', e.message); }
let gifenc = null;
try { gifenc = require('gifenc'); } catch (e) { console.error('[Hoxera] gifenc indisponible :', e.message); }

const cache = new Map();    // nom -> Buffer PNG (statique)
const gifCache = new Map(); // nom -> Buffer GIF (animé)
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

// SVG de la bannière : fond bordeaux, fumée rougeoyante,
// lignes rouges néon, texte blanc bold avec lueur rouge.
function bannerSvg(name, width = 1200, height = 420) {
  const label = escapeXml(name).toUpperCase();
  const len = label.length;
  const base = width * 0.078;
  const size = len > 24 ? base * 0.52 : len > 18 ? base * 0.68 : len > 12 ? base * 0.82 : base;
  const spacing = width * 0.004;
  const lineY1 = height * 0.2;
  const lineY2 = height * 0.8;
  const textY = height * 0.5;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#170305"/>
      <stop offset=".55" stop-color="#2a0709"/>
      <stop offset="1" stop-color="#3c0b0e"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".62" r=".55">
      <stop offset="0" stop-color="#ff2b2b" stop-opacity=".30"/>
      <stop offset=".6" stop-color="#ff0033" stop-opacity=".10"/>
      <stop offset="1" stop-color="#ff0033" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="42"/>
    </filter>
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
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#halo)"/>
  <!-- Fumée rougeoyante -->
  <ellipse cx="${width * 0.18}" cy="${height * 0.72}" rx="${width * 0.38}" ry="${height * 0.30}" fill="#ff2030" opacity=".10" filter="url(#soft)"/>
  <ellipse cx="${width * 0.85}" cy="${height * 0.28}" rx="${width * 0.32}" ry="${height * 0.34}" fill="#ff2030" opacity=".08" filter="url(#soft)"/>
  <ellipse cx="${width * 0.55}" cy="${height * 0.95}" rx="${width * 0.45}" ry="${height * 0.22}" fill="#ff2030" opacity=".09" filter="url(#soft)"/>
  <!-- Lignes néon -->
  <line x1="${width * 0.05}" y1="${lineY1}" x2="${width * 0.95}" y2="${lineY1}" stroke="#ff3030" stroke-opacity=".55" stroke-width="2"/>
  <line x1="${width * 0.05}" y1="${lineY2}" x2="${width * 0.95}" y2="${lineY2}" stroke="#ff3030" stroke-opacity=".55" stroke-width="2"/>
  <!-- Texte : lueur rouge derrière, blanc net devant -->
  <text x="${width / 2}" y="${textY}" text-anchor="middle" dominant-baseline="central"
        font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
        font-size="${size}" fill="#ff2030" opacity=".9" filter="url(#glow)">${label}</text>
  <text x="${width / 2}" y="${textY}" text-anchor="middle" dominant-baseline="central"
        font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
        font-size="${size}" fill="#ffffff" letter-spacing="${spacing}">${label}</text>
</svg>`;
}

// Bande de brillance : une traînée lumineuse blanche, inclinée,
// qui balaie la bannière en diagonale (transparente en dehors).
function shineSvg(width, height) {
  const bandW = Math.round(width * 0.55);
  return `<svg width="${bandW}" height="${height}" viewBox="0 0 ${bandW} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".42" stop-color="#ffffff" stop-opacity=".10"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset=".58" stop-color="#ffffff" stop-opacity=".10"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g transform="rotate(-20, ${bandW / 2}, ${height / 2})">
    <rect x="${-height * 0.6}" y="0" width="${bandW + height * 1.2}" height="${height}" fill="url(#s)"/>
  </g>
</svg>`;
}

// Génère le PNG statique (repli + vignettes)
async function generateBanner(name) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (!sharp) return null;
  if (cache.has(clean)) return cache.get(clean);
  try {
    const buf = await sharp(Buffer.from(bannerSvg(clean))).png().toBuffer();
    cache.set(clean, buf);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return buf;
  } catch (e) {
    console.error('[Hoxera] génération de bannière :', e.message);
    return null;
  }
}

// Génère le GIF ANIMÉ : balayage de lumière (24 images) + pause,
// en boucle continue.
async function generateBannerGif(name, { width = 720, height = 252, sweepFrames = 24 } = {}) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (!sharp || !gifenc) return null;
  if (gifCache.has(clean)) return gifCache.get(clean);
  try {
    const { GIFEncoder, quantize, applyPalette } = gifenc;
    // Image de base (fond + texte) et bande de brillance
    const baseBuf = await sharp(Buffer.from(bannerSvg(clean, width, height))).png().toBuffer();
    const bandBuf = await sharp(Buffer.from(shineSvg(width, height))).png().toBuffer();
    const { data: baseRaw } = await sharp(baseBuf).raw().toBuffer({ resolveWithObject: true });
    const palette = quantize(baseRaw, 256);
    const baseIndex = applyPalette(baseRaw, palette);

    const gif = GIFEncoder();
    const bandW = Math.round(width * 0.55);
    // 1) Le balayage : la traînée traverse de gauche à droite, en diagonale
    // (délais gifenc en millisecondes : ~80 ms par image → balayage fluide)
    for (let f = 0; f < sweepFrames; f++) {
      const x = -bandW + Math.round((width + bandW) * (f / (sweepFrames - 1)));
      const comp = await sharp(baseBuf)
        .composite([{ input: bandBuf, left: x, top: 0 }])
        .raw().toBuffer({ resolveWithObject: true });
      gif.writeFrame(applyPalette(comp.data, palette), width, height, { palette, delay: 80 });
    }
    // 2) Pause nette (la bannière « respire ») avant le prochain balayage
    for (let i = 0; i < 2; i++) {
      gif.writeFrame(baseIndex, width, height, { palette, delay: 1500 });
    }
    gif.finish();
    const buf = Buffer.from(gif.bytes());
    gifCache.set(clean, buf);
    if (gifCache.size > CACHE_MAX) gifCache.delete(gifCache.keys().next().value);
    return buf;
  } catch (e) {
    console.error('[Hoxera] génération de bannière animée :', e.message);
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

module.exports = { generateBanner, generateBannerGif, storedPanelName, bannerSvg, escapeXml, shineSvg };
