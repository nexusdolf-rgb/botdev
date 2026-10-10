// Proxy privé à l'application pour les images raster hébergées par Discord.
// Allowlist stricte, redirections contrôlées, taille et durée bornées.
const ALLOWED_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
  'images-ext-1.discordapp.net',
  'images-ext-2.discordapp.net',
]);
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 12000;

function isDiscordImageUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())
      && !parsed.port
      && !parsed.username
      && !parsed.password
      && !parsed.hash;
  } catch {
    return false;
  }
}

function imgProxy(value) {
  if (!value) return '';
  return isDiscordImageUrl(value) ? `/api/img?u=${encodeURIComponent(value)}` : value;
}

async function responseBuffer(response) {
  const lengthText = response.headers?.get?.('content-length');
  if (lengthText != null && lengthText !== '') {
    const length = Number(lengthText);
    if (Number.isFinite(length) && length > MAX_BYTES) return null;
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        size += chunk.length;
        if (size > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          return null;
        }
        chunks.push(chunk);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return Buffer.concat(chunks, size);
  }

  if (typeof response.arrayBuffer !== 'function') return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length <= MAX_BYTES ? buffer : null;
}

async function fetchDiscordImage(url) {
  if (!isDiscordImageUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop < 3; hop++) {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'HoxeraBot/1.0 (image proxy)' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.('location');
        if (!location) return null;
        let next;
        try { next = new URL(location, current).toString(); } catch { return null; }
        if (!isDiscordImageUrl(next)) return null;
        current = next;
        continue;
      }
      if (!response.ok) return null;
      const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(type)) return null;
      const buffer = await responseBuffer(response);
      if (!buffer || !buffer.length) return null;
      return { buffer, type };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ALLOWED_HOSTS, ALLOWED_IMAGE_TYPES, MAX_BYTES, isDiscordImageUrl, imgProxy, fetchDiscordImage };
