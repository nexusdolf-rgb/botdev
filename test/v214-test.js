// Test v214 — Rôles par niveau « en échelle » (XP)
// --------------------------------------------------
// Chaque niveau configuré possède son rôle : à la montée, le membre reçoit le
// rôle de son nouveau palier et l'ancien rôle de niveau est RETIRÉ (échelle de
// rangs). Un bouton « Synchroniser » donne leur rôle aux membres déjà avancés.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v217-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const xp = require('../server/discord/xp');
const db = require('fs').readFileSync('server/db.js', 'utf8');
const xpSrc = require('fs').readFileSync('server/discord/xp.js', 'utf8');
const routes = require('fs').readFileSync('server/routes.js', 'utf8');
const dash = require('fs').readFileSync('public/js/dashboard.js', 'utf8');
const index = require('fs').readFileSync('public/index.html', 'utf8');
const sw = require('fs').readFileSync('public/sw.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v214-test.js');

  // ---------- 1. Logique pure de l'échelle ----------
  console.log('— Échelle de rangs (objectif = dernier palier atteint) —');
  const R = [{ level: 1, role: 'Membre' }, { level: 3, role: 'VIP' }, { level: 5, role: 'Légende' }];
  check('niveau 1 → rôle du palier 1, rien à retirer', xp.computeRankGoal(R, 1).add === 'Membre' && xp.computeRankGoal(R, 1).remove.length === 0);
  check('niveau 2 → garde le rôle du palier 1', xp.computeRankGoal(R, 2).add === 'Membre');
  check('niveau 3 → rôle VIP et retire Membre', xp.computeRankGoal(R, 3).add === 'VIP' && xp.computeRankGoal(R, 3).remove.includes('Membre'));
  check('niveau 4 → garde VIP (pas de palier à 4)', xp.computeRankGoal(R, 4).add === 'VIP');
  check('niveau 5 → rôle Légende et retire VIP+Membre', xp.computeRankGoal(R, 5).add === 'Légende' && xp.computeRankGoal(R, 5).remove.length === 2);
  check('niveau très haut → dernier palier', xp.computeRankGoal(R, 99).add === 'Légende');
  check('aucun palier atteint (niveau 0) → rien', xp.computeRankGoal(R, 0).add === null);
  check('la liste est triée même si désordonnée en entrée', xp.computeRankGoal([{ level: 5, role: 'L' }, { level: 1, role: 'A' }], 5).add === 'L');

  // ---------- 2. Moteur XP branché ----------
  console.log('— Moteur XP —');
  check('xp.js : helper computeRankGoal', xpSrc.includes('function computeRankGoal(rewards, level)'));
  check('xp.js : applyRankToMember (ajout + retrait hiérarchie)', xpSrc.includes('async function applyRankToMember(botId, guild, member, level, rewards)'));
  check('xp.js : applyRewards délègue à applyRankToMember', xpSrc.includes('await applyRankToMember(botId, message.guild, member, level,'));
  check('xp.js : plus d’attribution cumulative de tous les rôles', !xpSrc.includes('for (const r of roles) {') && !xpSrc.includes('if (r.level > level) continue;'));
  check('xp.js : l’annonce affiche le palier FRANCHI (sauts de niveaux gérés)', xpSrc.includes('Number(r.level) > Number(oldLevel) && Number(r.level) <= Number(level))'));
  check('xp.js : exports rank helpers', /computeRankGoal, applyRankToMember, resolveRole/.test(xpSrc));
  check('db : xp.rows pour la synchro', db.includes('rows: (botId, guildId) => db.prepare(\'SELECT user_id, level, xp FROM xp'));
  check('db : stockage rôles par niveau (PK niveau unique)', db.includes('PRIMARY KEY (bot_id, guild_id, level)'));

  // ---------- 3. Routes ----------
  console.log('— Routes : sauvegarde + synchronisation —');
  check('routes : POST /xp/sync présent', routes.includes("'/bots/:id/guilds/:guildId/xp/sync'"));
  check('routes : synchro par lot borné + relançable', routes.includes('limit = Math.min(Math.max(parseInt((req.body || {}).limit, 10) || 250, 1), 400)'));
  check('routes : ajout du rôle du rang via applyRankToMember', routes.includes('applyRankToMember(bot.id, guild, member'));
  check('routes : sauvegarde dédoublonnée par niveau (Map)', routes.includes('const seen = new Map();'));
  check('routes : limite à 60 paliers', routes.includes('.slice(0, 60)'));

  // ---------- 4. Dashboard ----------
  console.log('— Dashboard : carte « Rôles par niveau » —');
  check('dash : titre et description échelle', dash.includes('🏆 Rôles par niveau'));
  check('dash : aperçu de l’échelle (remplace le palier précédent)', dash.includes('data-xp-ladder'));
  check('dash : bouton Synchroniser + statut', dash.includes('xp-sync') && dash.includes('🔄 Synchroniser les membres'));
  check('dash : nouveau palier par défaut = suivant', dash.includes("rolesData[rolesData.length - 1].level"));
  check('dash : sauvegarde triée par niveau', dash.includes('.sort((a, b) => a.level - b.level)'));

  // ---------- 5. Version ----------
  check('site : bump v214 (index)', index.includes('?v=217'));
  check('site : bump v214 (sw)', sw.includes('botdev-v217'));

  console.log(`  ✅ v214 : ${n} vérifications`);
})().catch((e) => { console.error(e); process.exit(1); });
