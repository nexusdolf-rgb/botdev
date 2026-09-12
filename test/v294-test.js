// v294 — 🔒 Isolation : les 3 boutons deviennent un sélecteur + une case.
// Vérifié : sélecteur (2 choix, état reflété), case à cocher (distribution du
// rôle, se décoche après), disparition des 3 boutons, mêmes routes appelées,
// retour arrière du sélecteur en cas d'erreur, sauvegarde cohérente, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const racine = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

const dash = racine('public/js/dashboard.js');
const iVer = dash.indexOf('Dashboard.renderers.verification');
assert.ok(iVer > 0, 'renderer vérification introuvable');
const chunk = dash.slice(iVer, iVer + 16000);

console.log('— 1. Sélecteur d\'isolation —');
check('sélecteur présent avec id ver-isolate-sel', chunk.includes('id="ver-isolate-sel"'));
check('choix « Désactivée »', chunk.includes('<option value="off" ${cfg.isolate ? \'\' : \'selected\'}>Désactivée — tous les salons restent visibles</option>'));
check('choix « Activée »', chunk.includes('<option value="on" ${cfg.isolate ? \'selected\' : \'\'}>Activée — les non-vérifiés ne voient que le salon de vérification</option>'));
check('changement de sélecteur → POST verification/isolate', chunk.includes("querySelector('#ver-isolate-sel').onchange") && chunk.includes("/verification/isolate`, { method: 'POST', body: { on } }"));
check('erreur → le sélecteur revient en arrière', chunk.includes("sel.value = on ? 'off' : 'on'"));
check('sélecteur désactivé pendant l\'appel', chunk.includes('sel.disabled = true') && chunk.includes('sel.disabled = false'));

console.log('— 2. Case « Donner le rôle » —');
check('case présente avec id ver-grant-case', chunk.includes('id="ver-grant-case"'));
check('cocher → POST verification/grant-role', chunk.includes("querySelector('#ver-grant-case').onchange") && chunk.includes("/verification/grant-role`, { method: 'POST', body: {} }"));
check('la case se décoche après l\'action (ponctuelle)', chunk.includes('e.target.checked = false'));
check('décocher ne fait rien', chunk.includes('if (!e.target.checked) return;'));

console.log('— 3. Boutons supprimés —');
check('plus de bouton « Appliquer l\'isolation »', !chunk.includes('ver-iso-on'));
check('plus de bouton « Tout rendre visible »', !chunk.includes('ver-iso-off'));
check('plus de bouton « Donner le rôle » (ancien)', !chunk.includes("id=\"ver-grant\""));
check('ancienne case ver-isolate remplacée', !chunk.includes('id="ver-isolate"'));

console.log('— 4. Cohérence sauvegarde + badge —');
check('Enregistrer envoie isolate depuis le sélecteur', chunk.includes("isolate: c1.querySelector('#ver-isolate-sel').value === 'on'"));
check('badge « Isolation ACTIVE » conservé', chunk.includes('Isolation ACTIVE'));
check('avertissement membres existants conservé', chunk.includes('cochez la case ci-dessous pour ne bloquer personne'));

console.log('— 5. Backend inchangé —');
const routes = racine('server/routes.js');
check('routes isolate + grant-role toujours présentes', routes.includes("router.post('/bots/:id/guilds/:guildId/verification/isolate'") && routes.includes("router.post('/bots/:id/guilds/:guildId/verification/grant-role'"));
const ver = racine('server/discord/verification.js');
check('moteur d\'isolation intact', ver.includes('async function applyIsolation') && ver.includes('async function removeIsolation') && ver.includes('async function grantRoleToAll'));

console.log('— 6. Bump v294 —');
const index = racine('public/index.html');
check('index.html : ?v=294 référencé 7 fois', (index.match(/\?v=294/g) || []).length === 7,
  String((index.match(/\?v=294/g) || []).length));
check('sw.js : cache « botdev-v294 »', racine('public/sw.js').includes("const CACHE = 'botdev-v294';"));

console.log(`\n🎉 v294 : ${ok} vérifications passées`);
