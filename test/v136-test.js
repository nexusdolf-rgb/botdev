// ============================================================
// Test v3.36 — Route locale de l'avatar public Nexora.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v136-'));
const store = require('../server/db');
const userId = store.users.create('avatar@test.local', 'x');
store.bots.create({ user_id: userId, name: 'Hoxera', token: 'T', client_id: 'C', prefix: '!', });
store.bots.update(1, { avatar_url: 'https://cdn.example.test/nexora.png' });

(async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
  });
  const app = express();
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer));
  });
  const res = await originalFetch(`http://127.0.0.1:${server.address().port}/api/public/bot-avatar`);
  const body = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(res.status, 200);
  assert(String(res.headers.get('content-type')).includes('image/png'));
  assert.strictEqual(body[0], 137);
  server.close();
  global.fetch = originalFetch;
  store.db.close();
  console.log('✅ Avatar public : proxy local sert la vraie image Nexora sans exposer de données sensibles');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
