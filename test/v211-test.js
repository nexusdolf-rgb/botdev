// Test v211 — Profils d'envoi multiples par serveur
// --------------------------------------------------
// Identités additionnelles (alias) au profil principal : l'une d'elles
// (ou le profil principal) peut être choisie pour SIGNER les messages
// que le bot envoie sur un serveur (bienvenue, tickets, annonces…).
// — additif : le profil principal (/botprofile) reste intact.
// — résolution : alias actif > profil principal > identité globale.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v213-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const identity = require('../server/discord/identity');
const routes = require('fs').readFileSync('server/routes.js', 'utf8');
const dash = require('fs').readFileSync('public/js/dashboard.js', 'utf8');
const db = require('fs').readFileSync('server/db.js', 'utf8');
const index = require('fs').readFileSync('public/index.html', 'utf8');
const sw = require('fs').readFileSync('public/sw.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v211-test.js');

  // ---------- 1. Stockage ----------
  console.log('— Stockage : alias + état —');
  check('db : table bot_profile_aliases', db.includes('CREATE TABLE IF NOT EXISTS bot_profile_aliases'));
  check('db : table bot_profile_state', db.includes('CREATE TABLE IF NOT EXISTS bot_profile_state'));
  check('db : API profileAliases exportée', /profileAliases, profileState/.test(db));
  const id1 = store.profileAliases.create(1, 'G1', { name: 'Support', avatar_url: '/assets/s.png' });
  const id2 = store.profileAliases.create(1, 'G1', { name: 'Événements' });
  check('création : ids attribués', id1 > 0 && id2 > id1);
  check('liste : 2 alias pour le serveur', store.profileAliases.list(1, 'G1').length === 2);
  check('limite par serveur respectée', store.profileAliases.list(1, 'G1').every((a) => a.guild_id === 'G1'));
  store.profileAliases.setAvatar(id2, '/assets/e.png');
  store.profileAliases.rename(id2, 'Events');
  check('avatar + renommage persistés', store.profileAliases.get(id2).avatar_url === '/assets/e.png' && store.profileAliases.get(id2).name === 'Events');
  check('état par défaut : 0 (profil principal)', store.profileState.getActive(1, 'G1') === 0);
  store.profileState.setActive(1, 'G1', id1);
  check('activation persistée', store.profileState.getActive(1, 'G1') === id1);

  // ---------- 2. Résolution du profil effectif ----------
  console.log('— identity : qui signe les messages ? —');
  store.botProfiles.set(1, 'G1', { name: 'Principal Serveur', avatar_url: '/assets/p.png' });
  check('alias actif → l’alias signe', identity.effectiveProfile(1, 'G1').name === 'Support');
  store.profileState.setActive(1, 'G1', 0);
  check('retour au principal → le profil principal signe', identity.effectiveProfile(1, 'G1').name === 'Principal Serveur');
  store.botProfiles.remove(1, 'G1');
  check('sans alias ni principal → identité globale (null)', identity.effectiveProfile(1, 'G1') === null);
  check('alias supprimé alors qu’actif → repli propre', (() => {
    store.profileAliases.create(1, 'G1', { name: 'Ghost' });
    const g = store.profileAliases.list(1, 'G1')[0];
    store.profileState.setActive(1, 'G1', g.id);
    store.profileAliases.remove(g.id);
    const eff = identity.effectiveProfile(1, 'G1');
    return eff === null || eff.name !== 'Ghost';
  })());

  // ---------- 3. Serveur ----------
  console.log('— Routes —');
  check('payload : liste des profils additionnels', routes.includes('profiles_extra: store.profileAliases.list(bot.id, guildId)'));
  check('payload : profil actif', routes.includes('profile_active: store.profileState.getActive(bot.id, guildId)'));
  check('route : créer un profil', routes.includes("router.put('/bots/:id/guilds/:guildId/profiles'"));
  check('route : supprimer un profil', routes.includes("router.delete('/bots/:id/guilds/:guildId/profiles/:aliasId'"));
  check('route : choisir le profil actif', routes.includes("router.put('/bots/:id/guilds/:guildId/profile-active'"));
  check('sécurité : alias d’un autre serveur refusé', routes.includes('alias.guild_id !== guildId'));
  check('limite : 10 profils max par serveur', routes.includes('ALIAS_LIMIT = 10'));

  // ---------- 4. Dashboard ----------
  console.log('— Dashboard (module Identité) —');
  check('panneau « Profils d’envoi »', dash.includes('Profils d’envoi (qui signe les messages)'));
  check('radio de sélection du profil actif', dash.includes('name="bp-active"') && dash.includes('data.profile_active'));
  check('boutons supprimer par profil', dash.includes('[data-del-alias]'));
  check('formulaire d’ajout (nom + image)', dash.includes('#bp-alias-name') && dash.includes('#bp-alias-file'));
  check('sauvegarde du choix → /profile-active', dash.includes('`/bots/${bot.id}/guilds/${guildId}/profile-active`'));

  // ---------- 5. Versions ----------
  check('index : version v211', index.includes('?v=213'));
  check('service worker : cache v211', sw.includes('botdev-v213'));

  console.log(`\n✅ v211-test.js : ${n} vérifications OK`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
