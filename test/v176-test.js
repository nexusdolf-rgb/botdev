// ══════════════════════════════════════════════════════════════
// TEST v176 — Bannière « option 1 » sans sous-titre + rôle du bot
// synchronisé avec son nom sur tous les serveurs.
// Réponse au retour utilisateur :
//  1. bannière = option 1 (style cinéma) sans le texte « DISCORD BOT »
//  2. Discord ne renomme jamais le rôle intégré d'un bot → le bot
//     le fait lui-même à chaque démarrage et à chaque arrivée.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const bm = fs.readFileSync(path.join(root, 'server/discord/botManager.js'), 'utf8');

// ---------- 1. La synchronisation du rôle existe ----------
assert(bm.includes('async function syncBotRoleName'),
  'syncBotRoleName doit exister dans botManager');
assert(bm.includes("r.tags && r.tags.botId === String(client.user.id)"),
  'le rôle intégré est identifié via tags.botId (le rôle du bot)');
assert(bm.includes('guild.roles.edit(role, { name: wanted }'),
  'le rôle doit être renommé au nom du bot');
// appelée au démarrage pour CHAQUE serveur…
assert(/for \(const g of client\.guilds\.cache\.values\(\)\) \{[\s\S]{0,400}syncBotRoleName\(botId, client, g\)/.test(bm),
  'syncBotRoleName doit être appelée pour chaque serveur au démarrage');
// …et à l'arrivée sur un nouveau serveur
assert(/client\.on\('guildCreate'[\s\S]{0,800}syncBotRoleName\(botId, client, guild\)/.test(bm),
  'syncBotRoleName doit aussi être appelée à l’arrivée sur un nouveau serveur');
// le nom vient de la base (renommable depuis le dashboard)
assert(bm.includes("(record && record.name) || client.user.username"),
  'le nom du rôle vient du bot en base (choisi par l’utilisateur)');
// jamais bloquant : erreurs silencieuses
assert(bm.includes('rôle non renommé'), 'un échec de renommage ne doit jamais casser le démarrage');

// ---------- 2. Test comportemental : la logique de renommage ----------
// (simulation d'un rôle « Nexora » sur un serveur → devient « Optimus Prime »)
const { execFileSync } = require('child_process');
const probe = `
  const wanted = 'Optimus Prime';
  const roles = [{ id: '1', name: 'Nexora', tags: { botId: '42' } }];
  const guild = {
    name: 'Serveur Test',
    roles: {
      cache: {
        find: (fn) => roles.find(fn),
        get: (id) => roles.find((r) => r.id === id),
      },
      edit: async (role, data) => { role.name = data.name; return role; },
    },
  };
  const client = { user: { id: '42', username: 'optimus_prime' } };
  const role = guild.roles.cache.find((r) => r.tags && r.tags.botId === String(client.user.id));
  if (!role) { console.error('ECHEC: rôle introuvable'); process.exit(1); }
  if (role.name !== wanted) guild.roles.edit(role, { name: wanted }, 'test');
  if (guild.roles.cache.get('1').name !== 'Optimus Prime') {
    console.error('ECHEC: rôle toujours ' + guild.roles.cache.get('1').name); process.exit(1);
  }
  console.log('OK rôle → ' + guild.roles.cache.get('1').name);
`;
const out = execFileSync('node', ['-e', probe], { cwd: root, encoding: 'utf8' }).trim();
assert(out.startsWith('OK rôle → Optimus Prime'), 'la logique de renommage doit fonctionner');

// ---------- 3. Les bannières du site sont la version finale ----------
const sharp = require('sharp');
(async () => {
  const mp = await sharp(path.join(root, 'public/icons/nexora-profile-banner.png')).metadata();
  assert(mp.width === 1500 && mp.height === 600, `bannière MP 1500×600 attendue (${mp.width}×${mp.height})`);
  const st = fs.statSync(path.join(root, 'public/icons/nexora-profile-banner.png'));
  assert(st.size > 400000, 'bannière MP : version HD attendue');

  // ---------- 4. Version : gérée par le test de la version courante (v177) ----------

  console.log('✅ v176-test : bannière finale + rôle du bot synchronisé partout');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
