// ============================================================
// BotDev — jeton de bannissement (lecture seule, courte durée)
// ------------------------------------------------------------
// Problème : une personne bannie ne peut pas se connecter, donc l'API
// ordinaire lui est fermée. Elle doit pourtant pouvoir lire POURQUOI elle
// est bannie et COMBIEN DE TEMPS il reste.
//
// Solution : après le retour OAuth, quand on constate le bannissement, on
// signe un jeton de courte durée (10 minutes) qui ne contient QUE
// l'identifiant du compte. La page publique /#/banned le présente à
// /api/ban/status, qui répond avec la raison et la date de fin.
//
// Ce jeton ne donne accès à rien d'autre : il n'ouvre aucune session, ne
// permet aucune écriture, et expire très vite. Il est signé en HMAC-SHA256.
// La clé est dérivée d'un secret déjà présent sur le serveur (jamais un
// nouveau secret à configurer) et isolée par un préfixe de domaine.
// ============================================================
const crypto = require('node:crypto');

const PREFIX = 'hoxera-ban-v1';
const TTL_MS = 10 * 60 * 1000;

let fallbackKey = null;

function signingKey() {
  const sources = [
    process.env.BOTDEV_DATA_ENCRYPTION_KEY,
    process.env.DISCORD_CLIENT_SECRET,
    process.env.HOXERA_TOKEN,
  ].filter((v) => typeof v === 'string' && v.length > 0);
  if (sources.length) {
    return crypto.createHash('sha256')
      .update(`${PREFIX}\0`, 'utf8')
      .update(sources[0], 'utf8')
      .digest();
  }
  // Aucun secret configuré (développement, tests) : clé propre au processus.
  // Les jetons émis avant un redémarrage ne sont alors plus valides, ce qui
  // est acceptable pour une fenêtre de 10 minutes.
  if (!fallbackKey) fallbackKey = crypto.randomBytes(32);
  return fallbackKey;
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64');
}

function signature(payload) {
  return base64url(crypto.createHmac('sha256', signingKey()).update(payload, 'utf8').digest());
}

// userId : identifiant du compte banni. ttlMs : durée de vie du jeton.
function sign(userId, ttlMs = TTL_MS) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return '';
  const ttl = Number.isFinite(Number(ttlMs)) ? Number(ttlMs) : TTL_MS;
  const expires = Date.now() + Math.max(0, ttl);
  const payload = `${id}.${expires}`;
  return `${payload}.${signature(payload)}`;
}

// Retourne { userId } si le jeton est valide et non expiré, sinon null.
function verify(token) {
  const raw = String(token || '').trim();
  if (!raw || raw.length > 200) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [idPart, expPart, sig] = parts;
  const expected = signature(`${idPart}.${expPart}`);
  // Comparaison à temps constant : on ne laisse pas fuir la signature octet
  // par octet via le temps de réponse.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expires = Number(expPart);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  const userId = Number(idPart);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return { userId };
}

module.exports = { sign, verify, TTL_MS, _fromBase64url: fromBase64url };
