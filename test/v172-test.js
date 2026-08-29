// ══════════════════════════════════════════════════════════════
// TEST v172 — Renommage du bot : « Nexora » → « Optimus Prime »
// + nouvelle identité visuelle (logo robot + bannière).
// Ce test verrouille le renommage pour qu'aucun « Nexora » ne
// réapparaisse dans l'interface ou les messages du bot.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const index = read('public/index.html');
const sw = read('public/sw.js');
const dash = read('public/js/dashboard.js');
const appJs = read('public/js/app.js');
const panels = read('server/discord/panels.js');
const i18n = read('server/i18n.js');
const routes = read('server/routes.js');
const automod = read('server/discord/automod.js');
const native = read('server/discord/nativeAutomod.js');

// ---------- 1. Plus aucun « Nexora » visible dans le code ----------
const protectedFiles = new Set(['server/discord/nativeAutomod.js']); // LEGACY_RULE_PREFIX autorisé
const scan = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() && e.name !== 'node_modules' ? scan(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const jsFiles = [...scan('server'), ...scan('public/js'), ...scan('scripts')].filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const hits = (read(f).match(/Nexora/g) || []).length;
  if (protectedFiles.has(f)) {
    assert(read(f).includes("LEGACY_RULE_PREFIX = 'Nexora · Auto-Mod officiel · '"),
      'nativeAutomod doit conserver l’ancien préfixe pour reconnaître les règles existantes');
    assert(hits === 1, `${f} : une seule mention Nexora autorisée (préfixe historique), ${hits} trouvées`);
  } else {
    assert(hits === 0, `${f} contient encore ${hits} « Nexora »`);
  }
}

// ---------- 2. Le nouveau nom est bien en place ----------
assert(dash.includes("'Optimus Prime hors ligne'") || dash.includes('Optimus Prime hors ligne'),
  'dashboard : étiquette de statut au nouveau nom');
assert(dash.includes("bot.name || 'Optimus Prime'") || dash.includes("(bot && bot.name) || 'Optimus Prime'"),
  'dashboard : nom de repli du bot');
assert(panels.includes("PANEL_DEFAULT_NAME = 'Optimus Prime'"), 'panneau tickets : nom par défaut');
assert(panels.includes("'Optimus Prime · '"), 'panneau tickets : pied de page');
assert(i18n.includes('Optimus Prime est très sollicité'), 'i18n fr : message busy');
assert(i18n.includes('Optimus Prime is very busy'), 'i18n en : message busy');
assert(routes.includes('banni d’Optimus Prime'), 'routes : message de bannissement (apostrophe typographique)');
assert(automod.includes("'Blacklist du serveur · Optimus Prime'"), 'automod : pied de blacklist');

// ---------- 3. Nouvelle identité visuelle : logo + bannières ----------
for (const f of ['public/icons/nexora-robot-mark.png', 'public/icons/nexora-robot-mark-192.png',
  'public/icons/icon-512.png', 'public/icons/nexora-profile-banner.png', 'public/icons/support-banner.png']) {
  const st = fs.statSync(path.join(root, f));
  assert(st.size > 2000, `image trop petite/absente : ${f}`);
}
const svg = read('public/icons/nexora-robot-mark.svg');
assert(svg.includes('emblème robot') && svg.includes('#e07a5f') && svg.includes('#f2f3f5'),
  'SVG de repli : structure/colors exigées (compat v156)');

// ---------- 4. Règles Auto-Mod : nouveau préfixe + reconnaissance historique ----------
assert(native.includes("RULE_PREFIX = 'Optimus Prime · Auto-Mod officiel · '"),
  'nativeAutomod : nouveau préfixe de règle');
assert(native.includes('legacyName'), 'nativeAutomod : les règles historiques doivent rester reconnues');

// ---------- 5. Version : gérée par le test de la version courante (v173) ----------

console.log('✅ v172-test : renommage « Optimus Prime » + identité visuelle verrouillés');
