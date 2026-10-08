// ============================================================
// Hoxera — Bannière du panneau de tickets, générée PAR SERVEUR
// PNG 544×192, composition simple et professionnelle.
// Fond bleu profond, texte blanc légèrement lumineux, panneau rubis et casque encadré.
// Nom du serveur dynamique (aucun faux nom par défaut).
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
const SERVER_NAME_MAX_FONT_SIZE = 29;
const NAVY = '#142A46';
const RUBY = '#B62F43';
const TILE = '#193F67';
const WHITE = '#F7FAFF';
const TEXT_WHITE = '#FFFFFF';
const HEADSET_RED = '#EF4653';

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
  return Math.max(12, Math.min(SERVER_NAME_MAX_FONT_SIZE, estimated));
}

function baseSvg(name) {
  const plainName = cleanServerName(name);
  const label = escapeXml(plainName);
  const size = autoFontSize(plainName);
  const nameText = label
    ? `<text id="server-name" x="42" y="107" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="700" fill="${TEXT_WHITE}" filter="url(#server-name-glow)">${label}</text>`
    : '';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="ruby-panel-clip"><path d="M421 7H539V177H367Z"/></clipPath>
    <pattern id="ruby-dots" width="8" height="8" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r=".8" fill="#E79AA5" fill-opacity=".72"/>
    </pattern>
    <filter id="server-name-glow" x="-12%" y="-35%" width="124%" height="170%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur"/>
      <feFlood flood-color="#A8D3FF" flood-opacity=".18" result="glowColor"/>
      <feComposite in="glowColor" in2="blur" operator="in" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${NAVY}"/>

  <!-- Composition simple : fond bleu profond, texte clair, panneau rubis à droite -->
  <path d="M421 7H539V177H367Z" fill="${RUBY}"/>
  <rect x="365" y="48" width="44" height="104" fill="url(#ruby-dots)" clip-path="url(#ruby-panel-clip)"/>
  <rect x="6" y="7" width="8" height="170" fill="${RUBY}"/>
  <rect x="5" y="177" width="534" height="7" fill="${RUBY}"/>
  <rect x="4.5" y="4.5" width="535" height="183" fill="none" stroke="#60788F" stroke-width="1"/>

  <!-- Repère rouge discret et texte blanc de la version bleu/blanc -->
  <path d="M42 43H74" stroke="${HEADSET_RED}" stroke-width="2" stroke-linecap="round"/>
  <text id="support-label" x="42" y="67" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="2.15" fill="${TEXT_WHITE}">SUPPORT</text>

  <!-- Nom Discord réel, ajusté à la largeur disponible -->
  ${nameText}

  <!-- Badge bleu distinct et casque-micro de la version précédente -->
  <rect x="407" y="42" width="117" height="108" rx="16" fill="${TILE}" stroke="#89AFCF" stroke-width="1"/>
  <rect x="413" y="48" width="105" height="96" rx="12" fill="none" stroke="#4D749A" stroke-width="1"/>
  <g id="support-headset" fill="none" stroke="${WHITE}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M434 96A30 30 0 0 1 494 96" stroke-width="3.5"/>
    <rect x="429" y="91" width="15" height="29" rx="6" fill="${HEADSET_RED}" stroke="none"/>
    <rect x="433" y="96" width="3" height="17" rx="1.5" fill="#FFE3E5" stroke="none"/>
    <rect x="483" y="91" width="15" height="29" rx="6" fill="${HEADSET_RED}" stroke="none"/>
    <rect x="488" y="96" width="3" height="17" rx="1.5" fill="#FFE3E5" stroke="none"/>
    <path d="M493 111Q493 122 485 126Q481 130 470 130" stroke-width="3"/>
    <circle cx="466" cy="130" r="4" fill="${HEADSET_RED}" stroke="none"/>
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
