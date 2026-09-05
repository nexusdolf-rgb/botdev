// Test v2.27 — Identité du bot PAR SERVEUR : garanties d'isolation.
// Objectifs (bug remonté « l'identité par serveur ne marche pas / la photo
// ne s'affiche pas pareil pour la bannière et le nom ») :
//  1. Un profil d'un serveur ne touche JAMAIS les autres serveurs ni le bot
//     global (nom/avatar/bannière globaux intacts).
//  2. Résolution à l'envoi : alias actif > profil principal > bot global.
//  3. absoluteUrl : chemin relatif /assets/… -> URL publique complète.
//  4. La page « Identité du bot » du dashboard affiche désormais un aperçu
//     unique (photo + bannière + nom) et la PHOTO sur le « profil principal ».
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v228-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const identity = require('../server/discord/identity');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- 0. Bot de test ----------
  const uid = store.users.create('discord:v227@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Hoxera Global', token: 'T', client_id: '1', prefix: '!' });

  // ---------- 1. Isolation PAR SERVEUR ----------
  console.log('\n1) Un serveur ne change jamais les autres ni le bot global');
  const globalNameBefore = store.bots.get(BOT).name;
  const globalAvatarBefore = store.bots.get(BOT).avatar_url || '';
  store.botProfiles.set(BOT, 'G1', { name: 'Hoxera du Serveur 1', bio: 'bio 1', avatar_url: '/assets/a.png', banner_url: '/assets/b.png', color: '#e07a5f' });
  store.botProfiles.set(BOT, 'G2', { name: 'Hoxera du Serveur 2', bio: 'bio 2', color: '#57F287' });
  check('profil G1 = Hoxera du Serveur 1', (store.botProfiles.get(BOT, 'G1') || {}).name === 'Hoxera du Serveur 1');
  check('profil G2 = Hoxera du Serveur 2', (store.botProfiles.get(BOT, 'G2') || {}).name === 'Hoxera du Serveur 2');
  check('les deux serveurs sont indépendants', (store.botProfiles.get(BOT, 'G1') || {}).name !== (store.botProfiles.get(BOT, 'G2') || {}).name);
  check('le nom GLOBAL du bot n’a pas changé', store.bots.get(BOT).name === globalNameBefore);
  check('l’avatar GLOBAL du bot n’a pas changé', (store.bots.get(BOT).avatar_url || '') === globalAvatarBefore);

  // Supprimer G1 ne doit pas toucher G2
  store.botProfiles.remove(BOT, 'G1');
  check('suppression G1 → G2 intact', !store.botProfiles.get(BOT, 'G1') && (store.botProfiles.get(BOT, 'G2') || {}).name === 'Hoxera du Serveur 2');
  // Aucun appel global dans identity.js (jamais de modification de l’application)
  const idSrc = read('server/discord/identity.js');
  check('identity.js ne modifie jamais le bot global', !idSrc.includes('setAvatar') && !idSrc.includes('users/@me') && !idSrc.includes('applications/@me'));

  // ---------- 2. Résolution à l’envoi : alias actif > principal > global ----------
  console.log('\n2) Résolution de l’identité effective');
  store.botProfiles.set(BOT, 'G1', { name: 'Principal G1', avatar_url: '/assets/principal.png', banner_url: '', bio: '', color: '#e07a5f' });
  const alias = store.profileAliases.create(BOT, 'G1', { name: 'Support', avatar_url: '' });
  store.profileState.setActive(BOT, 'G1', 0);
  const effPrincipal = identity.effectiveProfile(BOT, 'G1');
  check('aucun alias actif → profil principal', effPrincipal && effPrincipal.name === 'Principal G1');
  store.profileState.setActive(BOT, 'G1', alias);
  const effAlias = identity.effectiveProfile(BOT, 'G1');
  check('alias actif → nom de l’alias', effAlias && effAlias.name === 'Support');
  check('alias sans image → repli avatar du profil principal', effAlias && effAlias.avatar_url === '/assets/principal.png');
  store.profileAliases.setAvatar(alias, '/assets/alias.png');
  const effAliasImg = identity.effectiveProfile(BOT, 'G1');
  check('alias avec image → avatar de l’alias', effAliasImg && effAliasImg.avatar_url === '/assets/alias.png');
  store.botProfiles.remove(BOT, 'G3');
  check('serveur sans profil → null (identité globale du bot)', identity.effectiveProfile(BOT, 'G3') === null);

  // ---------- 3. absoluteUrl ----------
  console.log('\n3) absoluteUrl : des chemins /assets/… aux URLs publiques');
  store.settings.set('public_url', '');
  check('sans public_url, relatif → vide (envoi global, jamais cassant)', identity.absoluteUrl('/assets/x.png') === '');
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  check('relatif préfixé par le site', identity.absoluteUrl('/assets/x.png') === 'https://hoxera.is-a.dev/assets/x.png');
  check('URL absolue conservée telle quelle', identity.absoluteUrl('https://cdn.discordapp.com/a.png') === 'https://cdn.discordapp.com/a.png');
  check('vide → vide', identity.absoluteUrl('') === '');

  // ---------- 4. Page « Identité du bot » du dashboard ----------
  console.log('\n4) Dashboard : aperçu vivant photo + bannière + nom, photo sur « profil principal »');
  const dash = read('public/js/dashboard.js');
  check('aperçu vivant (#bp-live)', dash.includes('#bp-live') || dash.includes('"bp-live"'));
  check('la carte d’aperçu combine bannière et photo', dash.includes('height:120px') && dash.includes('border-radius:50%'));
  check('le profil principal affiche sa PHOTO dans « qui signe »', dash.includes('abs(c.avatar)') && dash.includes("this.style.display='none'"));
  check('rappel visuel « uniquement / jamais global »', dash.includes('jamais ailleurs') || dash.includes('ne modifie jamais le bot global'));
  check('anciennes tuiles conservées (avatar/bannière)', dash.includes('Avatar global utilisé') && dash.includes('Aucune bannière personnalisée'));

  // Versionnage front cohérent (v227)
  const indexHtml = read('public/index.html');
  const swSource = read('public/sw.js');
  check('index.html : 7 références ?v=228', (indexHtml.match(/\?v=228/g) || []).length === 7);
  check('sw.js : cache v227', swSource.includes("const CACHE = 'botdev-v228';"));

  console.log(failures === 0 ? '\n✅ V227 — Identité par serveur isolée, jamais globale ; dashboard cohérent. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
