// Contrôles ciblés des protections ajoutées (stockage, sessions, CSRF, images et invitations).
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-security-'));
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = dataDir;
process.env.BOTDEV_DATA_ENCRYPTION_KEY = 'test-current-key-not-a-real-secret';
process.env.BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS = '';

function test(label, condition) {
  assert.ok(condition, `ÉCHEC : ${label}`);
  console.log(`✅ ${label}`);
}

(async () => {
  const secretStore = require('../server/secretStore');
  const keyEnvNames = ['NODE_ENV', 'BOTDEV_DATA_ENCRYPTION_KEY', 'BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS', 'DISCORD_CLIENT_SECRET', 'HOXERA_TOKEN'];
  const savedKeyEnv = Object.fromEntries(keyEnvNames.map((name) => [name, process.env[name]]));
  process.env.NODE_ENV = 'production';
  process.env.BOTDEV_DATA_ENCRYPTION_KEY = '';
  process.env.BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS = '';
  process.env.DISCORD_CLIENT_SECRET = 'oauth-only-test-value';
  process.env.HOXERA_TOKEN = 'bot-only-test-value';
  assert.throws(() => secretStore.assertReady(), /64 caractères hexadécimaux/);
  test('production exige une clé dédiée, pas un secret OAuth ou un token de bot', true);
  process.env.BOTDEV_DATA_ENCRYPTION_KEY = 'a'.repeat(64);
  assert.doesNotThrow(() => secretStore.assertReady());
  test('production accepte une clé explicite de 32 octets aléatoires', true);
  for (const name of keyEnvNames) {
    if (savedKeyEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedKeyEnv[name];
  }

  const encoded = secretStore.encrypt('discord-token-test', 'bots.token');
  test('jeton chiffré au repos et déchiffrable avec le bon contexte',
    encoded !== 'discord-token-test' && secretStore.decrypt(encoded, 'bots.token') === 'discord-token-test');
  assert.throws(() => secretStore.decrypt(encoded, 'discord_tokens.access_token'), /Impossible de déchiffrer/);
  test('le contexte AAD empêche de déplacer un secret entre colonnes', true);
  const forgedPrefix = `hoxera.enc.v1.${encoded.slice('hoxera.enc.v1.'.length)}`;
  const wrappedPrefix = secretStore.encrypt(forgedPrefix, 'bots.token');
  test('un secret en clair commençant par le préfixe interne reste chiffré',
    wrappedPrefix !== forgedPrefix && secretStore.decrypt(wrappedPrefix, 'bots.token') === forgedPrefix);

  const oldKey = process.env.BOTDEV_DATA_ENCRYPTION_KEY;
  const legacyCipher = secretStore.encrypt('secret-avant-rotation', 'bots.token');
  process.env.BOTDEV_DATA_ENCRYPTION_KEY = 'test-next-key-not-a-real-secret';
  process.env.BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS = oldKey;
  const rotated = secretStore.reEncrypt(legacyCipher, 'bots.token');
  test('rotation : ancienne clé déchiffre et nouvelle clé rechiffre',
    rotated !== legacyCipher && secretStore.decrypt(rotated, 'bots.token') === 'secret-avant-rotation');

  const store = require('../server/db');
  const userId = store.users.create('security-test@example.invalid', 'hash-factice');
  const rawSession = store.sessions.create(userId);
  const storedSession = store.db.prepare('SELECT token FROM sessions WHERE user_id = ?').get(userId).token;
  test('seul le hash du cookie de session est enregistré en SQLite',
    storedSession !== rawSession && storedSession.startsWith('s1:') && !!store.sessions.find(rawSession));
  const botId = store.bots.create({ user_id: userId, name: 'Test', token: 'bot-token-test', client_id: '123456789012345678', prefix: '!' });
  const storedBotToken = store.db.prepare('SELECT token FROM bots WHERE id = ?').get(botId).token;
  test('le token Discord est chiffré en base puis restitué seulement côté serveur',
    storedBotToken !== 'bot-token-test' && store.bots.get(botId).token === 'bot-token-test');
  store.discordTokens.set(userId, { access: 'oauth-access-test', refresh: 'oauth-refresh-test', expires: new Date(Date.now() + 3600000).toISOString() });
  const storedOauth = store.db.prepare('SELECT access_token, refresh_token FROM discord_tokens WHERE user_id = ?').get(userId);
  const readOauth = store.discordTokens.get(userId);
  test('les jetons OAuth sont chiffrés et relus par le helper de stockage',
    storedOauth.access_token !== 'oauth-access-test' && storedOauth.refresh_token !== 'oauth-refresh-test'
      && readOauth.access_token === 'oauth-access-test' && readOauth.refresh_token === 'oauth-refresh-test');
  if (process.platform !== 'win32') {
    test('permissions du fichier SQLite limitées au propriétaire (0600)',
      (fs.statSync(path.join(dataDir, 'botdev.db')).mode & 0o777) === 0o600);
  }

  const security = require('../server/security');
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ORIGIN = 'https://hoxera.is-a.dev';
  const makeReq = (origin, site = 'same-origin') => ({
    method: 'POST',
    protocol: 'https',
    secure: true,
    path: '/api/example',
    ip: '192.0.2.1',
    headers: { origin, 'sec-fetch-site': site },
    get(name) { return this.headers[String(name).toLowerCase()]; },
  });
  const makeRes = () => ({
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  });
  let continued = false;
  security.originGuard(makeReq('https://hoxera.is-a.dev'), makeRes(), () => { continued = true; });
  test('CSRF : origine canonique autorisée', continued);
  const denied = makeRes();
  security.originGuard(makeReq('https://attacker.invalid', 'cross-site'), denied, () => {});
  test('CSRF : origine tierce et Sec-Fetch-Site cross-site refusés', denied.statusCode === 403);
  const missingOrigin = makeRes();
  security.originGuard(makeReq(undefined), missingOrigin, () => {});
  test('CSRF : mutation sans Origin refusée', missingOrigin.statusCode === 403);

  const { PermissionsBitField } = require('discord.js');
  const invite = require('../server/discord/invite');
  const inviteUrl = invite.inviteUrl('123456789012345678');
  const parsedInvite = new URL(inviteUrl);
  const permissions = BigInt(parsedInvite.searchParams.get('permissions'));
  test('lien d’invitation valide avec scopes bot et applications.commands',
    parsedInvite.origin === 'https://discord.com'
      && parsedInvite.searchParams.get('scope').split(' ').sort().join(' ') === 'applications.commands bot');
  test('aucune permission Administrator dans le lien d’invitation',
    (permissions & PermissionsBitField.Flags.Administrator) === 0n
      && !invite.REQUIRED_PERMISSIONS.includes(PermissionsBitField.Flags.Administrator));
  test('ID d’application invalide : aucun lien d’invitation généré', invite.inviteUrl('not-an-id') === '');

  const sharp = require('sharp');
  const assets = require('../server/assets');
  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#193f67' } }).png().toBuffer();
  test('validation d’image accepte un vrai PNG', await assets.validateImage(png, 'image/png') === 'image/png');
  await assert.rejects(assets.validateImage(png, 'image/jpeg'), /type ou dimensions/);
  test('validation d’image refuse une discordance MIME/contenu', true);

  const backup = require('../server/backup');
  process.env.BOTDEV_DATA_REPO = '../outside';
  test('nom de dépôt GitHub avec traversal refusé', backup.repo() === '');
  process.env.BOTDEV_DATA_REPO = 'owner/test-data';
  process.env.BOTDEV_GITHUB_API = 'https://attacker.invalid';
  await assert.rejects(backup.ghJson('/repos/owner/test-data', { token: 'fake-test-token' }), /URL de l’API GitHub invalide/);
  test('un hôte API non GitHub ne reçoit jamais le PAT', true);

  console.log('✅ Contrôles de sécurité ciblés terminés.');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  try {
    const db = require.cache[require.resolve('../server/db')];
    if (db && db.exports && db.exports.db && db.exports.db.open) db.exports.db.close();
  } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
});
