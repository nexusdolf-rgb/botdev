// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// PNG 544×192, simple, naturel et professionnel.
// Palette rouge rubis / blanc chaud, casque-micro discret,
// nom du serveur dynamique (aucun faux nom par défaut).
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
const SERVER_TEXT_MAX_WIDTH = 335;
const SERVER_NAME_MAX_LENGTH = 26;
const RUBY = '#B62F43';
const WARM_WHITE = '#FAFAF7';
const INK = '#272D33';

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

function cleanServerName(value) {
  // Compatibilité avec les anciennes valeurs « SUPPORT - nom ».
  // Sans nom réel, ne pas afficher « HOXERA » à la place du serveur.
  const raw = String(value || '').trim().replace(/^SUPPORT\s*[-–—:]\s*/i, '').trim().toUpperCase();
  return Array.from(raw).slice(0, SERVER_NAME_MAX_LENGTH).join('');
}

// Largeurs approximatives DejaVu Sans Bold, en em. Estimer la vraie largeur
// (plutôt que le seul nombre de caractères) évite que les W/M débordent.
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
  const nameText = label
    ? `<text id="server-name" x="42" y="104" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="700" fill="${INK}">${label}</text>`
    : '';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${WARM_WHITE}"/>

  <!-- Composition sobre : panneau clair, rail rouge et aplat rubis à droite -->
  <path d="M421 7H539V177H367Z" fill="${RUBY}"/>
  <rect x="6" y="7" width="8" height="170" fill="${RUBY}"/>
  <rect x="5" y="177" width="534" height="7" fill="${RUBY}"/>
  <rect x="4.5" y="4.5" width="535" height="183" fill="none" stroke="#D4D3CE" stroke-width="1"/>

  <!-- Repère discret et libellé -->
  <path d="M42 43H74" stroke="${RUBY}" stroke-width="2" stroke-linecap="round"/>
  <text id="support-label" x="42" y="67" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="2.15" fill="${RUBY}">SUPPORT</text>

  <!-- Nom Discord réel, ajusté à la largeur disponible -->
  ${nameText}

  <!-- Casque-micro blanc, fin et sans médaillon chargé -->
  <g id="support-headset" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="468" cy="96" r="47" stroke-width="2"/>
    <path d="M443 96A25 25 0 0 1 493 96" stroke-width="2.6"/>
    <rect x="434" y="91" width="11" height="25" rx="5.5" stroke-width="2.6"/>
    <rect x="491" y="91" width="11" height="25" rx="5.5" stroke-width="2.6"/>
    <path d="M496 108V114Q496 126 484 128H479" stroke-width="2.6"/>
    <rect x="472" y="124" width="10" height="6" rx="3" fill="#FFFFFF" stroke="none"/>
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
