// ============================================================
// 🖼️ Proxy d'images Discord (v208)
// ------------------------------------------------------------
// Certains réseaux (mobile, bloqueurs, DNS) chargent mal les URLs
// cdn.discordapp.com / media.discordapp.net. Le dashboard servait ces URLs
// directement : les vraies photos (avatar du bot, icônes de serveurs,
// avatars de membres, avatar du compte lié) pouvaient donc ne pas
// s'afficher. Désormais ces images sont servies par NOTRE domaine via
// /api/img?u=… : le serveur (qui, lui, atteint toujours Discord) les
// télécharge et les met en cache. Les photos réelles s'affichent partout.
// Sécurité : allowlist stricte de domaines + HTTPS obligatoire → aucune
// ouverture (pas de SSRF vers localhost/réseau privé).
const ALLOWED_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
  'images-ext-1.discordapp.net',
  'images-ext-2.discordapp.net',
]);

function isDiscordImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const p = new URL(url);
    return p.protocol === 'https:' && ALLOWED_HOSTS.has(p.hostname);
  } catch { return false; }
}

// Transforme une URL d'image Discord en URL servie par notre domaine.
// (Les autres URLs — locales, data:, autres domaines — restent inchangées.)
function imgProxy(url) {
  if (!url) return '';
  return isDiscordImageUrl(url) ? `/api/img?u=${encodeURIComponent(url)}` : url;
}

const MAX_BYTES = 6 * 1024 * 1024; // garde-fou 6 Mo
const TIMEOUT_MS = 12000;

// Télécharge l'image (redirections suivies uniquement vers l'allowlist).
async function fetchDiscordImage(url) {
  if (!isDiscordImageUrl(url)) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetch(current, { redirect: 'manual', signal: ac.signal, headers: { 'user-agent': 'HoxeraBot/1.0 (dashboard img proxy)' } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        const next = new URL(loc, current).toString();
        if (!isDiscordImageUrl(next)) return null; // redirection hors allowlist : stop
        current = next;
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || 'image/png';
      if (!/^image\//i.test(type)) return null;
      const length = parseInt(res.headers.get('content-length') || '0', 10);
      if (length > MAX_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) return null;
      return { buffer: buf, type: type.split(';')[0].trim() };
    }
    return null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

module.exports = { ALLOWED_HOSTS, isDiscordImageUrl, imgProxy, fetchDiscordImage };
