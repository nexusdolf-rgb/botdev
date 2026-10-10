// Chiffrement au repos des jetons Discord stockés dans SQLite.
// AES-256-GCM + contexte authentifié : une valeur ne peut pas être déplacée
// silencieusement d'un champ/table vers un autre.
const crypto = require('node:crypto');

const PREFIX = 'hoxera.enc.v1.';
const CONTEXT_PREFIX = 'hoxera/sqlite/v1/';

function candidates() {
  const values = [
    ['configured', process.env.BOTDEV_DATA_ENCRYPTION_KEY],
    ['oauth-previous', process.env.BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS],
    ['oauth-current', process.env.DISCORD_CLIENT_SECRET],
    ['bot-token', process.env.HOXERA_TOKEN],
  ];
  const seen = new Set();
  return values
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([source, value]) => {
      const key = crypto.createHash('sha256')
        .update('hoxera-at-rest-key-v1\0', 'utf8')
        .update(value, 'utf8')
        .digest();
      const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
      return { source, key, id };
    })
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
}

function activeKey() {
  // La clé précédente sert uniquement à déchiffrer pendant une rotation.
  return candidates().find((entry) => entry.source !== 'oauth-previous') || null;
}

function keyForId(id) {
  return candidates().find((entry) => entry.id === id) || null;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(value, context) {
  if (value == null || value === '') return value;
  const plain = String(value);
  const active = activeKey();
  if (!active) return plain; // environnement de développement sans secrets
  // Cette fonction reçoit toujours un secret en clair. Ne jamais faire
  // confiance à un préfixe stocké dans l'entrée : un secret utilisateur peut
  // commencer par PREFIX et ne doit pas pouvoir contourner le chiffrement.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', active.key, iv);
  cipher.setAAD(Buffer.from(CONTEXT_PREFIX + String(context), 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${active.id}.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(value, context) {
  if (value == null || value === '' || !isEncrypted(value)) return value;
  const parts = value.slice(PREFIX.length).split('.');
  if (parts.length !== 4 || !/^[a-f0-9]{16}$/.test(parts[0])) {
    throw new Error('Format de jeton chiffré Hoxera invalide.');
  }
  const keyEntry = keyForId(parts[0]);
  if (!keyEntry) {
    throw new Error('Clé de chiffrement introuvable : configure BOTDEV_DATA_ENCRYPTION_KEY ou BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS.');
  }
  if (!/^[A-Za-z0-9_-]{16}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[2])
    || !/^[A-Za-z0-9_-]*$/.test(parts[3])) {
    throw new Error('Format de jeton chiffré Hoxera invalide.');
  }
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || iv.toString('base64url') !== parts[1]
      || tag.toString('base64url') !== parts[2] || ciphertext.toString('base64url') !== parts[3]) {
      throw new Error('longueur ou encodage invalide');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyEntry.key, iv);
    decipher.setAAD(Buffer.from(CONTEXT_PREFIX + String(context), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Impossible de déchiffrer un jeton stocké : vérifie la clé et la migration.');
  }
}

function reEncrypt(value, context) {
  if (value == null || value === '') return value;
  const active = activeKey();
  if (!active) return value;
  if (isEncrypted(value)) {
    const parts = value.slice(PREFIX.length).split('.');
    const looksLikeCiphertext = parts.length === 4
      && /^[a-f0-9]{16}$/.test(parts[0])
      && /^[A-Za-z0-9_-]{16}$/.test(parts[1])
      && /^[A-Za-z0-9_-]{22}$/.test(parts[2])
      && /^[A-Za-z0-9_-]*$/.test(parts[3]);
    // Un ancien secret en clair, même s'il commence par PREFIX, est chiffré
    // comme tel. En revanche un blob au format chiffré mais illisible échoue
    // explicitement au démarrage au lieu d'être silencieusement réécrit.
    if (!looksLikeCiphertext) return encrypt(value, context);
    if (parts[0] === active.id) {
      decrypt(value, context); // vérifie l'authenticité et le contexte AAD
      return value;
    }
    return encrypt(decrypt(value, context), context);
  }
  return encrypt(value, context);
}

function migrateDatabase(db) {
  const active = activeKey();
  if (!active) return { migrated: 0, enabled: false };
  const tables = [
    ['bots', 'id', 'token', 'bots.token'],
    ['discord_tokens', 'user_id', 'access_token', 'discord_tokens.access_token'],
    ['discord_tokens', 'user_id', 'refresh_token', 'discord_tokens.refresh_token'],
  ];
  let migrated = 0;
  const tx = db.transaction(() => {
    for (const [table, idColumn, valueColumn, context] of tables) {
      const rows = db.prepare(`SELECT ${idColumn} AS row_id, ${valueColumn} AS secret_value FROM ${table}`).all();
      const update = db.prepare(`UPDATE ${table} SET ${valueColumn} = ? WHERE ${idColumn} = ?`);
      for (const row of rows) {
        const previous = row.secret_value;
        if (previous == null || previous === '') continue;
        const next = reEncrypt(String(previous), context);
        if (next !== previous) {
          update.run(next, row.row_id);
          migrated++;
        }
      }
    }
  });
  tx();
  return { migrated, enabled: true };
}

function status() {
  const key = activeKey();
  return {
    enabled: !!key,
    source: key ? key.source : 'unavailable',
    rotationKeyConfigured: !!process.env.BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS,
  };
}

function assertReady() {
  const production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  const configured = typeof process.env.BOTDEV_DATA_ENCRYPTION_KEY === 'string'
    && /^[a-f0-9]{64}$/i.test(process.env.BOTDEV_DATA_ENCRYPTION_KEY);
  if (production && !configured) {
    throw new Error('BOTDEV_DATA_ENCRYPTION_KEY est obligatoire en production et doit contenir 64 caractères hexadécimaux (32 octets aléatoires).');
  }
}

module.exports = {
  PREFIX,
  isEncrypted,
  encrypt,
  decrypt,
  reEncrypt,
  migrateDatabase,
  status,
  assertReady,
};
