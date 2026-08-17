// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// Style reproduit d'après la référence fournie :
//  - 680×240 (format exact de la référence)
//  - fond rouge/bordeaux sombre (dégradé) + fumée rougeoyante
//  - grille glitch RGB (points rouge/vert/bleu en diagonale, subtile)
//  - texte « SUPPORT - {NOM DU SERVEUR} » blanc bold centré avec
//    halo chromatique (rose + vert + cyan autour des lettres)
//  - animation : balayage lumineux diagonal + dérive de la fumée +
//    pulsation de la lueur — boucle continue (~6 s, comme la réf.)
// Formats : GIF animé (affiché par Discord) / PNG statique (repli).
// ============================================================
const store = require('./db');
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.error('[Hoxera] sharp indisponible :', e.message); }
let gifenc = null;
try { gifenc = require('gifenc'); } catch (e) { console.error('[Hoxera] gifenc indisponible :', e.message); }

const cache = new Map();    // nom -> Buffer PNG (statique)
const gifCache = new Map(); // nom -> Buffer GIF (animé)
const CACHE_MAX = 300;

const W = 680;  // largeur de référence
const H = 240;  // hauteur de référence

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

// SVG complet d'une trame. t : 0..1 (temps de l'animation)
//  - drift : déplacement de la fumée (0..1)
//  - glowPulse : intensité du halo (0.7..1.1)
//  - shineX : position de la bande de brillance (en px, ou null)
function bannerSvg(name, t = 0, glowPulse = 1, shineX = null) {
  const label = escapeXml(String(name || 'NEXORA').toUpperCase());
  const len = label.length;
  const size = len > 24 ? 34 : len > 18 ? 44 : len > 12 ? 56 : 66;
  const textY = H * 0.5;

  // Fumée : trois volutes qui dérivent lentement
  const drift = (base, amp, speed, phase) => base + amp * Math.sin((t * speed + phase) * Math.PI * 2);
  const s1x = drift(W * 0.16, W * 0.03, 0.05, 0.0);
  const s1y = drift(H * 0.75, H * 0.05, 0.07, 0.5);
  const s2x = drift(W * 0.86, W * 0.04, 0.04, 0.3);
  const s2y = drift(H * 0.25, H * 0.06, 0.06, 0.8);
  const s3x = drift(W * 0.55, W * 0.05, 0.03, 0.6);
  const s3y = drift(H * 0.95, H * 0.04, 0.05, 0.2);

  const glowOp = (0.75 * glowPulse).toFixed(2);
  const glowBlur = Math.round(14 * glowPulse);

  // Bande de brillance (balayage diagonal gauche → droite)
  let shine = '';
  if (shineX !== null) {
    const bandW = Math.round(W * 0.5);
    const shX = Math.round(shineX);
    shine = `<g transform="rotate(-20, ${shX + bandW / 2}, ${H / 2})" opacity="0.55">
      <defs>
        <linearGradient id="shineGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset=".45" stop-color="#ffffff" stop-opacity=".12"/>
          <stop offset=".5" stop-color="#ffffff" stop-opacity=".55"/>
          <stop offset=".55" stop-color="#ffffff" stop-opacity=".12"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="${shX - H * 0.7}" y="0" width="${bandW + H * 1.4}" height="${H}" fill="url(#shineGrad)"/>
    </g>`;
  }

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
      <feGaussianBlur stdDeviation="${Math.max(6, glowBlur)}"/>
    </filter>
    <filter id="glowGreen" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="${Math.max(6, glowBlur)}"/>
    </filter>
    <filter id="glowCyan" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="${Math.max(6, glowBlur)}"/>
    </filter>
    <!-- Grille glitch RGB : points rouge/vert/bleu en diagonale -->
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
  <!-- Fumée rougeoyante (dérive lente) -->
  <ellipse cx="${s1x.toFixed(1)}" cy="${s1y.toFixed(1)}" rx="${W * 0.38}" ry="${H * 0.28}" fill="#ff2030" opacity=".11" filter="url(#soft)"/>
  <ellipse cx="${s2x.toFixed(1)}" cy="${s2y.toFixed(1)}" rx="${W * 0.32}" ry="${H * 0.34}" fill="#ff2030" opacity=".09" filter="url(#soft)"/>
  <ellipse cx="${s3x.toFixed(1)}" cy="${s3y.toFixed(1)}" rx="${W * 0.45}" ry="${H * 0.2}" fill="#ff2030" opacity=".1" filter="url(#soft)"/>
  <!-- Grille glitch RGB -->
  <rect width="${W}" height="${H}" fill="url(#glitch)"/>
  <!-- Texte : halo chromatique (rose + vert + cyan décalés) puis blanc net -->
  <text x="${W / 2 + 3}" y="${textY + 1}" text-anchor="middle" dominant-baseline="central"
        font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}"
        fill="#ff3b5c" opacity="${glowOp}" filter="url(#glowPink)">${label}</text>
  <text x="${W / 2 - 3}" y="${textY - 1}" text-anchor="middle" dominant-baseline="central"
        font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}"
        fill="#39ff6a" opacity="${glowOp}" filter="url(#glowGreen)">${label}</text>
  <text x="${W / 2}" y="${textY + 3}" text-anchor="middle" dominant-baseline="central"
        font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}"
        fill="#39e6ff" opacity="${glowOp}" filter="url(#glowCyan)">${label}</text>
  <text x="${W / 2}" y="${textY}" text-anchor="middle" dominant-baseline="central"
        font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}"
        fill="#ffffff">${label}</text>
  ${shine}
</svg>`;
}

// Bande de brillance générique (composée par sharp sur le PNG de base)
function shineSvg(width = W, height = H) {
  const bandW = Math.round(width * 0.5);
  return `<svg width="${bandW}" height="${height}" viewBox="0 0 ${bandW} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity=".12"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset=".55" stop-color="#ffffff" stop-opacity=".12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g transform="rotate(-20, ${bandW / 2}, ${height / 2})">
    <rect x="${-height * 0.7}" y="0" width="${bandW + height * 1.4}" height="${height}" fill="url(#s)"/>
  </g>
</svg>`;
}

// PNG statique (repli) : trame « posée » (glow normal, pas de balayage)
async function generateBanner(name) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (!sharp) return null;
  if (cache.has(clean)) return cache.get(clean);
  try {
    const buf = await sharp(Buffer.from(bannerSvg(clean, 0.25, 1, null))).png().toBuffer();
    cache.set(clean, buf);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return buf;
  } catch (e) {
    console.error('[Hoxera] génération de bannière :', e.message);
    return null;
  }
}

// GIF animé (comme la référence : balayage + dérive + pulsation, ~6 s)
async function generateBannerGif(name, { sweepFrames = 36, driftFrames = 48, holdFrames = 30, delayMs = 50 } = {}) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (!sharp || !gifenc) return null;
  if (gifCache.has(clean)) return gifCache.get(clean);
  try {
    const { GIFEncoder, quantize, applyPalette } = gifenc;
    const bandBuf = await sharp(Buffer.from(shineSvg(W, H))).png().toBuffer();
    const bandW = Math.round(W * 0.5);

    // Palette globale : calculée sur la trame centrale (représentative)
    const centerBuf = await sharp(Buffer.from(bannerSvg(clean, 0.5, 1, null))).png().toBuffer();
    const { data: centerRaw } = await sharp(centerBuf).raw().toBuffer({ resolveWithObject: true });
    const palette = quantize(centerRaw, 256);

    const gif = GIFEncoder();
    const totalFrames = sweepFrames + driftFrames + holdFrames;

    // Rendu des trames : par lots en parallèle (le moteur d'images est
    // multithreadé → génération 3 à 4× plus rapide), puis écriture en ordre.
    const frameDatas = new Array(totalFrames);
    const BATCH = 8;
    for (let start = 0; start < totalFrames; start += BATCH) {
      const batch = [];
      for (let f = start; f < Math.min(start + BATCH, totalFrames); f++) {
        batch.push((async () => {
          if (f < sweepFrames) {
            const t = f / sweepFrames;
            const shineX = -bandW + (W + bandW) * t;
            const frameSvg = bannerSvg(clean, t, 0.85 + 0.3 * Math.sin(t * Math.PI), null);
            const out = await sharp(Buffer.from(frameSvg))
              .composite([{ input: bandBuf, left: Math.round(shineX), top: 0 }])
              .raw().toBuffer({ resolveWithObject: true });
            return out.data;
          }
          const t = (sweepFrames + (f - sweepFrames)) / totalFrames;
          const pulse = 0.9 + 0.15 * Math.sin((f - sweepFrames) / 6);
          const out = await sharp(Buffer.from(bannerSvg(clean, t, pulse, null)))
            .raw().toBuffer({ resolveWithObject: true });
          return out.data;
        })());
      }
      const results = await Promise.all(batch);
      results.forEach((data, i) => { frameDatas[start + i] = data; });
    }

    // Écriture des trames dans l'ordre (l'encodeur GIF est séquentiel)
    frameDatas.forEach((data) => {
      gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay: delayMs });
    });
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

// 🔥 Pré-chauffage : lance la génération du GIF en arrière-plan
// (appelé dès l'envoi du panneau → l'image est prête quand Discord
// vient la chercher). Évite les générations en double.
const warming = new Set();
function warmupGif(name) {
  const clean = String(name || '').trim().slice(0, 26) || 'NEXORA';
  if (gifCache.has(clean) || warming.has(clean)) return;
  warming.add(clean);
  generateBannerGif(clean)
    .catch((e) => console.error('[Hoxera] pré-chauffage bannière :', e.message))
    .finally(() => warming.delete(clean));
}

module.exports = { generateBanner, generateBannerGif, storedPanelName, warmupGif, bannerSvg, escapeXml, shineSvg, W, H };
