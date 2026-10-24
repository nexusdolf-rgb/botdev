// ============================================================
// v379 — Bannissement de compte depuis le dashboard
// ------------------------------------------------------------
// Ce que ce test vérifie, dans l'ordre du parcours réel :
//   1. la base : durée, expiration, bannissement permanent, purge ;
//   2. le jeton de bannissement : signé, falsifiable = refusé, expirant ;
//   3. l'API fondateur : motif obligatoire, durée enregistrée ;
//   4. le panneau du membre banni : motif, date de fin, temps restant ;
//   5. la fin du bannissement : la personne peut revenir.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = '';
process.env.NEXORA_ADMIN_DISCORD_ID = '100000000000000001';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-ban-'));

const RACINE = path.join(__dirname, '..');
const store = require('../server/db');
const express = require('express');
const cookieParser = require('cookie-parser');
const banToken = require('../server/banToken');

let ok = 0;
const echecs = [];
function check(nom, condition, detail = '') {
  if (condition) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const adminId = store.users.create('fondateur@nexora.test', 'x', { discord_id: '100000000000000001', discord_username: 'Fondateur' });
  const membreId = store.users.create('membre@nexora.test', 'x', { discord_id: '100000000000000002', discord_username: 'Membre' });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookieAdmin = `botdev_session=${store.sessions.create(adminId)}`;
  const fetchJson = async (route, opts = {}) => {
    const res = await fetch(base + route, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  try {
    // ═══════════════════════════════════════════════════════════
    console.log('\n1) La base : durée, expiration, permanent');
    // ═══════════════════════════════════════════════════════════
    check('aucun bannissement au départ', store.platformBans.isBanned(membreId) === false);

    const temporaire = store.platformBans.set(membreId, 'Spam dans les tickets', adminId, 120);
    check('un bannissement temporaire est actif', store.platformBans.isBanned(membreId) === true);
    check('la date de fin est enregistrée', !!temporaire.expires_at && !Number.isNaN(new Date(temporaire.expires_at).getTime()));
    check('la durée demandée est conservée', Number(temporaire.duration_min) === 120);
    const restant = store.platformBans.remainingMs(store.platformBans.get(membreId));
    check('le temps restant est proche de deux heures', restant > 119 * 60000 && restant <= 120 * 60000, String(restant));

    const permanent = store.platformBans.set(membreId, 'Usurpation d’identité', adminId, 0);
    check('un bannissement de durée nulle est permanent', permanent.expires_at === '' && permanent.duration_min === 0);
    check('un bannissement permanent est actif', store.platformBans.isBanned(membreId) === true);
    check('un permanent n’a pas de temps restant', store.platformBans.remainingMs(permanent) === 0);

    // On recule la date de fin : le bannissement doit cesser d'agir seul.
    store.platformBans.set(membreId, 'Test expiration', adminId, 60);
    store.db.prepare("UPDATE platform_bans SET expires_at = datetime('now', '-1 minute') WHERE user_id = ?").run(membreId);
    check('un bannissement expiré n’est plus actif', store.platformBans.isBanned(membreId) === false);
    check('la ligne reste présente jusqu’au nettoyage', !!store.platformBans.get(membreId));
    const purge = store.platformBans.purgeExpired();
    check('le nettoyage supprime les bannissements expirés', purge >= 1 && store.platformBans.get(membreId) === null, String(purge));

    // ═══════════════════════════════════════════════════════════
    console.log('\n2) Le jeton de lecture du bannissement');
    // ═══════════════════════════════════════════════════════════
    const jeton = banToken.sign(membreId);
    check('un jeton valide est reconnu', banToken.verify(jeton) && banToken.verify(jeton).userId === membreId);
    check('un jeton modifié est refusé', banToken.verify(jeton.replace(/\.[0-9]+\./, '.9999999999999.')) === null);
    check('un identifiant modifié est refusé', banToken.verify('1' + jeton.slice(String(membreId).length)) === null);
    check('un jeton vide est refusé', banToken.verify('') === null);
    check('un jeton bidon est refusé', banToken.verify('n’importe quoi') === null);
    check('un jeton expiré est refusé', banToken.verify(banToken.sign(membreId, 0)) === null);

    // ═══════════════════════════════════════════════════════════
    console.log('\n3) L’API fondateur : motif obligatoire, durée au choix');
    // ═══════════════════════════════════════════════════════════
    const sansMotif = await fetchJson(`/admin/users/${membreId}/ban`, {
      method: 'POST', headers: { Cookie: cookieAdmin }, body: JSON.stringify({ duration: 60 }),
    });
    check('un bannissement sans motif est refusé', sansMotif.status === 400 && /motif/i.test(sansMotif.json.error || ''));
    check('aucun bannissement n’a été créé', store.platformBans.isBanned(membreId) === false);

    const avecDuree = await fetchJson(`/admin/users/${membreId}/ban`, {
      method: 'POST', headers: { Cookie: cookieAdmin }, body: JSON.stringify({ reason: 'Publicité non sollicitée', duration: 1440 }),
    });
    check('le bannissement avec motif et durée est accepté', avecDuree.status === 200 && avecDuree.json.ok === true);
    check('la réponse annonce la durée', /1440 minute/.test(avecDuree.json.message || ''));
    const ligne = store.platformBans.get(membreId);
    check('la base contient le motif', ligne && ligne.reason === 'Publicité non sollicitée');
    check('la base contient la durée', ligne && Number(ligne.duration_min) === 1440);
    check('la base contient la date de fin', ligne && !!ligne.expires_at);

    // ═══════════════════════════════════════════════════════════
    console.log('\n4) Le panneau du membre banni');
    // ═══════════════════════════════════════════════════════════
    const sansJeton = await fetchJson('/ban/status');
    check('sans jeton, la route refuse', sansJeton.status === 401);
    const mauvaisJeton = await fetchJson('/ban/status?t=faux.jeton.ici');
    check('avec un faux jeton, la route refuse', mauvaisJeton.status === 401);

    const jetonMembre = banToken.sign(membreId);
    const statut = await fetchJson(`/ban/status?t=${encodeURIComponent(jetonMembre)}`);
    check('avec un jeton valide, la route répond', statut.status === 200);
    check('le bannissement est actif', statut.json.active === true);
    check('le motif est transmis', statut.json.reason === 'Publicité non sollicitée');
    check('la date de fin est transmise', !!statut.json.expiresAt);
    check('le bannissement n’est pas permanent', statut.json.permanent === false);
    check('le temps restant est transmis', statut.json.remainingMs > 0 && statut.json.remainingMs <= 1440 * 60000, String(statut.json.remainingMs));
    check('l’heure du serveur accompagne la réponse (chrono fiable)', !!statut.json.serverTime);
    check('la réponse ne contient rien d’autre du compte',
      !('email' in statut.json) && !('discord_id' in statut.json) && !('discord_username' in statut.json));

    // Jeton d'un AUTRE compte : ne doit rien révéler du membre banni.
    const autreId = store.users.create('autre@nexora.test', 'x', {});
    const jetonAutre = banToken.sign(autreId);
    const statutAutre = await fetchJson(`/ban/status?t=${encodeURIComponent(jetonAutre)}`);
    check('le jeton d’un autre compte ne voit aucun bannissement', statutAutre.json.active === false);

    // ═══════════════════════════════════════════════════════════
    console.log('\n5) Le bannissement permanent, puis la fin');
    // ═══════════════════════════════════════════════════════════
    await fetchJson(`/admin/users/${membreId}/ban`, {
      method: 'POST', headers: { Cookie: cookieAdmin }, body: JSON.stringify({ reason: 'Tentative de fraude', duration: 0 }),
    });
    const statutPerm = await fetchJson(`/ban/status?t=${encodeURIComponent(banToken.sign(membreId))}`);
    check('un permanent est annoncé comme tel', statutPerm.json.permanent === true);
    check('un permanent n’a pas de date de fin', statutPerm.json.expiresAt === '');
    check('un permanent n’a pas de compte à rebours', statutPerm.json.remainingMs === 0);

    // Expiration : la personne peut revenir.
    store.db.prepare("UPDATE platform_bans SET expires_at = datetime('now', '-1 minute') WHERE user_id = ?").run(membreId);
    const statutFini = await fetchJson(`/ban/status?t=${encodeURIComponent(banToken.sign(membreId))}`);
    check('après expiration, le panneau annonce la fin', statutFini.json.active === false && statutFini.json.expiredNow === true);
    check('la connexion redevient possible', store.platformBans.isBanned(membreId) === false);

    const deban = await fetchJson(`/admin/users/${membreId}/ban`, { method: 'DELETE', headers: { Cookie: cookieAdmin } });
    check('le déban manuel fonctionne toujours', deban.status === 200 && store.platformBans.isBanned(membreId) === false);

    // ═══════════════════════════════════════════════════════════
    console.log('\n6) L’interface');
    // ═══════════════════════════════════════════════════════════
    const appJs = fs.readFileSync(path.join(RACINE, 'public', 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(RACINE, 'public', 'css', 'style.css'), 'utf8');
    check('la page du compte banni existe', appJs.includes('App.renderBanned = async'));
    check('la route #/banned est branchée avant le contrôle de session',
      /parts\[0\] === 'banned'[\s\S]{0,400}App\.renderBanned/.test(appJs));
    check('le bannissement par le fondateur demande une durée', appJs.includes('App.banDialog ='));
    check('la fenêtre propose le permanent', appJs.includes("['0', 'Permanent']"));
    check('la fenêtre refuse un motif vide', appJs.includes('Le motif est obligatoire'));
    check('le chrono se rafraîchit chaque seconde', appJs.includes('setInterval(rafraichir, 1000)'));
    check('le chrono s’aligne sur l’heure du serveur', appJs.includes('serverTime'));
    check('le chrono s’arrête en quittant la page', appJs.includes('clearInterval(App.bannedTimer)'));
    check('la liste admin montre la fin et le temps restant',
      appJs.includes('ban_expires_at') && appJs.includes('ban_active'));
    check('un bannissement terminé a son propre libellé', appJs.includes('Bannissement terminé'));
    check('la page bannie a son style', css.includes('.banned-card') && css.includes('.banned-clock'));
    check('aucun tiret cadratin dans les nouveaux textes',
      !appJs.slice(appJs.indexOf('App.renderBanned = async')).slice(0, 6000).includes('—'));
  } finally {
    server.close();
    try { store.db.close(); } catch {}
    try { fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true }); } catch {}
  }

  console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌ sur ${ok + echecs.length} vérifications`);
  if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
  console.log('🎉 v379 — bannissement avec motif, durée et compte à rebours.');
  process.exit(0);
})().catch((e) => {
  console.error('❌', e && e.stack ? e.stack : e);
  process.exit(1);
});
