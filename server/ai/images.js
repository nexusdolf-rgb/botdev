// v284 — 🎨 Génération d'images Hoxera AI.
// Source : Pollinations (modèle Flux) — gratuite, SANS clé API, paramètre
// safe=true (filtre NSFW). Comme la source anonyme est partagée et limitée,
// des garde-fous stricts protègent le bot : quota par serveur et par heure,
// refroidissement par membre, délai d'attente maximal, prompt borné.
const LIMIT_PER_HOUR = 6;        // images / heure / serveur
const COOLDOWN_USER_MS = 60000;  // 1 minute entre 2 images pour un même membre
const TIMEOUT_MS = 90000;        // 90 s max par génération
const MAX_PROMPT = 400;

const lastUser = new Map();  // `${guildId}:${userId}` -> timestamp
const hourCount = new Map(); // guildId -> { h, n }

function hourKey() { const d = new Date(); return `${d.getUTCDate()}-${d.getUTCHours()}`; }

async function generateImage(guildId, userId, prompt) {
  const text = String(prompt || '').trim().slice(0, MAX_PROMPT);
  if (!text) { const e = new Error('La description est vide.'); e.code = 'IMG_EMPTY'; throw e; }
  const now = Date.now();
  const ukey = `${guildId}:${userId}`;
  if ((lastUser.get(ukey) || 0) > now - COOLDOWN_USER_MS) {
    const e = new Error('Patiente 1 minute avant de générer une autre image.'); e.code = 'IMG_COOLDOWN'; throw e;
  }
  const h = hourKey();
  let c = hourCount.get(guildId);
  if (!c || c.h !== h) c = { h, n: 0 };
  if (c.n >= LIMIT_PER_HOUR) {
    hourCount.set(guildId, c);
    const e = new Error(`Le quota d images de ce serveur est atteint (${LIMIT_PER_HOUR} par heure), réessayez plus tard.`); e.code = 'IMG_QUOTA'; throw e;
  }
  lastUser.set(ukey, now);
  c.n += 1;
  hourCount.set(guildId, c);
  if (lastUser.size > 5000) lastUser.clear();
  if (hourCount.size > 500) hourCount.clear();
  const seed = Math.floor(Math.random() * 1000000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?model=flux&width=768&height=768&seed=${seed}&nologo=true&safe=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res || !res.ok) { const e = new Error('service'); e.code = 'IMG_FAIL'; throw e; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) { const e = new Error('vide'); e.code = 'IMG_FAIL'; throw e; }
    return buf;
  } catch (err) {
    if (err && err.code === 'IMG_FAIL') {
      const e = new Error('Le service d images n a pas répondu correctement.'); e.code = 'IMG_FAIL'; throw e;
    }
    const e = new Error('La génération a échoué (délai dépassé ou service occupé).'); e.code = 'IMG_FAIL'; throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { generateImage, LIMIT_PER_HOUR, MAX_PROMPT, _test: { lastUser, hourCount, hourKey } };
