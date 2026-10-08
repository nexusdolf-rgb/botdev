// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// PNG statique 544×192 : rendu léger, mis en cache par nom de serveur.
// Style approuvé par l’utilisateur : fond bleu nuit, texte perle argenté
// avec halo froid discret, et casque-micro support dessiné en SVG.
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
const SERVER_TEXT_MAX_WIDTH = 350;
const SERVER_NAME_MAX_LENGTH = 26;

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/\"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

function cleanServerName(value) {
  // Accepte encore les anciennes valeurs « SUPPORT - nom » sans afficher
  // le préfixe deux fois dans la nouvelle composition à deux lignes.
  const raw = String(value || '').trim().replace(/^SUPPORT\s*[-–—:]\s*/i, '').trim().toUpperCase();
  const points = Array.from(raw || 'HOXERA').slice(0, SERVER_NAME_MAX_LENGTH);
  return points.join('') || 'HOXERA';
}

// Largeurs approximatives DejaVu Sans Bold, en em. Estimer la vraie largeur
// (plutôt que le seul nombre de caractères) évite qu'un nom rempli de W/M déborde.
const GLYPH_WIDTHS = {
  A: .77, B: .76, C: .73, D: .83, E: .68, F: .68, G: .82, H: .84, I: .37,
  J: .37, K: .77, L: .64, M: 1, N: .84, O: .85, P: .73, Q: .85, R: .77,
  S: .72, T: .68, U: .81, V: .77, W: 1.1, X: .77, Y: .72, Z: .73,
  'À': .77, 'Â': .77, 'Æ': 1, 'Ç': .73, 'É': .68, 'È': .68, 'Ê': .68,
  'Ë': .68, 'Î': .37, 'Ï': .37, 'Ô': .85, 'Œ': 1.05, 'Ù': .81, 'Û': .81,
  'Ü': .81, 'Ÿ': .72, '0': .7, '1': .7, '2': .7, '3': .7, '4': .7,
  '5': .7, '6': .7, '7': .7, '8': .7, '9': .7, ' ': .35, '_': .5,
  '-': .41, '–': .55, '—': .9, '.': .38, ',': .38, '!': .46, '?': .58,
  ':': .4, ';': .4, '(': .46, ')': .46, '[': .46, ']': .46, '/': .37,
  '\\': .37, '+': .84, '&': .87, '@': 1, '#': .84, '\'': .27, '"': .43,
};

// Taille automatique : le nom reste dans la zone de gauche, sans toucher
// au casque à droite. Les noms courts restent grands ; les plus longs réduisent.
function autoFontSize(label) {
  const glyphs = Array.from(String(label || ''));
  const widthEm = Math.max(.7, glyphs.reduce((sum, char) => sum + (GLYPH_WIDTHS[char] ?? 1.1), 0));
  const estimated = Math.floor(SERVER_TEXT_MAX_WIDTH / (widthEm * 1.04));
  return Math.max(12, Math.min(25, estimated));
}

function baseSvg(name) {
  const plainName = cleanServerName(name);
  const label = escapeXml(plainName);
  const size = autoFontSize(plainName);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101b2a"/>
      <stop offset=".58" stop-color="#142134"/>
      <stop offset="1" stop-color="#182638"/>
    </linearGradient>
    <linearGradient id="titleShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".45" stop-color="#f1f6fb"/>
      <stop offset="1" stop-color="#dae6f2"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4a5c74"/>
      <stop offset="1" stop-color="#34465e"/>
    </linearGradient>
    <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r=".65" fill="#71839a" fill-opacity=".45"/>
    </pattern>
    <filter id="titleGlow" x="-12%" y="-45%" width="130%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="softAlpha"/>
      <feFlood flood-color="#badcf8" flood-opacity=".28" result="glowColor"/>
      <feComposite in="glowColor" in2="softAlpha" operator="in" result="softGlow"/>
      <feOffset in="SourceAlpha" dx="0" dy="1" result="shadowOffset"/>
      <feGaussianBlur in="shadowOffset" stdDeviation="1.2" result="softShadow"/>
      <feFlood flood-color="#050e1b" flood-opacity=".28" result="shadowColor"/>
      <feComposite in="shadowColor" in2="softShadow" operator="in" result="titleShadow"/>
      <feMerge>
        <feMergeNode in="titleShadow"/>
        <feMergeNode in="softGlow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Cadre bleu nuit et accent vertical -->
  <rect width="${W}" height="${H}" fill="url(#background)"/>
  <rect x="1" y="1" width="542" height="190" rx="16" fill="none" stroke="url(#edge)" stroke-width="1"/>
  <rect x="22" y="27" width="4" height="138" rx="2" fill="#e07a5f"/>

  <!-- Détails fins au-dessus du titre -->
  <path d="M44 44H77" stroke="#e07a5f" stroke-width="3" stroke-linecap="round"/>
  <circle cx="84" cy="44" r="2" fill="#e07a5f"/>
  <text x="43" y="67" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2.5" fill="#e98b70">SUPPORT</text>

  <!-- Nom du serveur : dynamique, perle/argent, halo froid discret -->
  <text id="server-name" x="41" y="112" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="700" fill="url(#titleShine)" filter="url(#titleGlow)">${label}</text>

  <!-- Ligne d’accent et séparation -->
  <path d="M44 138H90" stroke="#e07a5f" stroke-width="3" stroke-linecap="round"/>
  <path d="M101 138H350" stroke="#53677f" stroke-width="3" stroke-linecap="round"/>

  <!-- Motif discret, derrière le médaillon du casque -->
  <rect x="367" y="35" width="147" height="126" fill="url(#dots)" opacity=".58"/>
  <rect x="414" y="48" width="100" height="96" rx="16" fill="#1c2b3e" stroke="#45566f" stroke-width="1"/>
  <rect x="420" y="54" width="88" height="84" rx="12" fill="none" stroke="#31435b" stroke-width="1"/>

  <!-- Casque-micro : symbole universel du support -->
  <g id="support-headset" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M434 96A30 30 0 0 1 494 96" stroke="#f0f3f7" stroke-width="3.5"/>
    <path d="M439 96A25 25 0 0 1 489 96" stroke="#7e96af" stroke-width="1" opacity=".72"/>
    <rect x="430" y="91" width="15" height="29" rx="6" fill="#e07a5f" stroke="none"/>
    <rect x="434" y="96" width="3" height="17" rx="1.5" fill="#ffd3c7" stroke="none"/>
    <rect x="483" y="91" width="15" height="29" rx="6" fill="#e07a5f" stroke="none"/>
    <rect x="488" y="96" width="3" height="17" rx="1.5" fill="#ffd3c7" stroke="none"/>
    <path d="M493 111Q493 122 485 126Q481 131 470 130" stroke="#d4dee9" stroke-width="3"/>
    <circle cx="466" cy="130" r="4" fill="#e07a5f" stroke="none"/>
  </g>
</svg>`;
}

// PNG statique (~1 s de génération, mis en cache mémoire ensuite)
async function generateBanner(name) {
  const clean = cleanServerName(name);
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
    return row ? Array.from(String(row.panel_name)).slice(0, SERVER_NAME_MAX_LENGTH).join('') : '';
  } catch { return ''; }
}

module.exports = { generateBanner, storedPanelName, baseSvg, escapeXml, W, H };
