'use strict';

// Images PNG temporaires utilisées par les annonces de niveau Components V2.
// Les webhooks V2 ne peuvent pas joindre de fichiers : Discord charge cette
// URL publique, puis son CDN conserve sa propre copie. Le cache est borné et
// chaque clé est imprévisible ; aucun fichier n'est écrit sur disque.
const crypto = require('crypto');

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 256;
const cards = new Map();

function prune(now = Date.now()) {
  for (const [key, entry] of cards) {
    if (!entry || entry.expiresAt <= now) cards.delete(key);
  }
  while (cards.size > MAX_ENTRIES) {
    cards.delete(cards.keys().next().value);
  }
}

function put(png, now = Date.now()) {
  if (!Buffer.isBuffer(png) || png.length === 0) return null;
  prune(now);
  const key = crypto.randomBytes(24).toString('hex');
  cards.set(key, { buffer: Buffer.from(png), expiresAt: now + TTL_MS });
  prune(now);
  return key;
}

function get(key, now = Date.now()) {
  prune(now);
  const token = String(key || '');
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const entry = cards.get(token);
  if (!entry) return null;
  if (!Buffer.isBuffer(entry.buffer) || entry.expiresAt <= now) {
    cards.delete(token);
    return null;
  }
  return entry.buffer;
}

function remove(key) {
  const token = String(key || '');
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  return cards.delete(token);
}

// Route Express publique, exposée uniquement avec une clé à forte entropie.
function route(req, res) {
  const png = get(req && req.params && req.params.key);
  if (!png) return res.status(404).end();
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=3600, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.end(png);
}

function stats(now = Date.now()) {
  prune(now);
  return { size: cards.size, ttlMs: TTL_MS, maxEntries: MAX_ENTRIES };
}

module.exports = { put, get, remove, route, prune, stats, TTL_MS, MAX_ENTRIES };
