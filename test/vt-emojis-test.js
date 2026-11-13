#!/usr/bin/env node
// Panneau vocal — les émojis dessinés ne doivent pas céder la place aux émojis
// du clavier au premier incident.
//
// Défaut constaté (reproduit par test/tools/repro-vt-emoji.js, sortie avant
// correctif) :
//   envoi 1 : pièce jointe=1 · émojis dessinés=10 · émojis du clavier=0
//   envoi 2 : pièce jointe=0 · émojis dessinés=0  · émojis du clavier=10
// Le second envoi n'était déclenché que par le refus de l'IMAGE, et il jetait
// pourtant les dix émojis dessinés.
//
// Ici on vérifie les quatre situations, sans jamais parler à Discord :
//   A. image refusée, pack installé      → les dessins restent
//   B. image ET émojis refusés           → unicode, mais le panneau part
//   C. aucun pack installé               → unicode d'emblée, le panneau part
//   D. envoi normal                      → un seul essai, avec l'image
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync('/tmp/vt-test-');
const store = require(path.join(__dirname, '..', 'server', 'db'));
const extra = require(path.join(__dirname, '..', 'server', 'discord', 'extra'));

let ok = 0, ko = 0;
const check = (nom, condition, detail) => {
  if (condition) { ok++; console.log(`  ✅ ${nom}`); }
  else { ko++; console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`); }
};

const CLES = ['nom', 'limite', 'prive', 'public', 'suppr', 'ajouter', 'retirer', 'expulser', 'recup', 'transfer'];

// Même calcul que vtVer() : l'empreinte des dix PNG.
function empreinte() {
  const dossier = path.join(__dirname, '..', 'server', 'assets', 'voicetemp');
  const h = crypto.createHash('sha256');
  for (const k of CLES) {
    const f = path.join(dossier, 'hox_' + k + '.png');
    h.update(fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0));
  }
  return h.digest('hex').slice(0, 16);
}

function packInstalle(actif) {
  if (!actif) {
    store.settings.set('vt_emotes_app', '');
    store.settings.set('vt_emotes_app_ver', '');
    return;
  }
  store.settings.set('vt_emotes_app', JSON.stringify(Object.fromEntries(CLES.map((k, i) => [k, String(1001 + i)]))));
  store.settings.set('vt_emotes_app_ver', empreinte());
}

// Émoji d'un payload, quelle que soit la profondeur (les constructeurs
// discord.js embarquent les boutons dans .data).
function emojisDe(payload) {
  const out = [];
  const vus = new WeakSet();
  (function parcourir(o, prof) {
    if (!o || typeof o !== 'object' || prof > 8 || vus.has(o)) return;
    vus.add(o);
    if (o.emoji) out.push(String(o.emoji.id || o.emoji.name || ''));
    for (const k of Object.keys(o)) { try { parcourir(o[k], prof + 1); } catch {} }
  })(payload, 0);
  return out;
}

async function essayer(refuse) {
  const envois = [];
  const salon = {
    id: 'C1',
    messages: { fetch: async () => { throw new Error('rien'); } },
    send: async (payload) => {
      const fichiers = (payload.files || []).length;
      const emojis = emojisDe(payload);
      envois.push({ fichiers, emojis });
      if (refuse(payload, fichiers, emojis)) {
        const e = new Error('Invalid Form Body');
        e.code = 50035;
        throw e;
      }
      return { id: 'MSG' + envois.length };
    },
  };
  const guild = {
    id: 'G1', name: 'Test',
    emojis: { cache: new Map() },
    members: { me: null, cache: new Map() },
    channels: { cache: new Map([['C1', salon]]) },
  };
  let erreur = null;
  try { await extra.sendVtPanel(1, guild, 'C1'); } catch (e) { erreur = e; }
  const dernier = envois[envois.length - 1] || { fichiers: 0, emojis: [] };
  const dessines = dernier.emojis.filter((x) => /^\d+$/.test(x)).length;
  const clavier = dernier.emojis.filter((x) => !/^\d+$/.test(x)).length;
  return { envois, erreur, dessines, clavier };
}

(async () => {
  // A. l'image est refusée, le pack d'émojis est installé
  packInstalle(true);
  let r = await essayer((p, fichiers) => fichiers > 0);
  check('A. image refusée + pack installé → les 10 émojis dessinés sont conservés',
    r.dessines === 10 && r.clavier === 0, `dessinés=${r.dessines} clavier=${r.clavier}`);
  check('A. le panneau part quand même (aucune exception)', !r.erreur);
  check('A. deux envois : avec image, puis sans image', r.envois.length === 2, `${r.envois.length} envoi(s)`);
  check('A. la seconde tentative a bien retiré la pièce jointe', r.envois[1] && r.envois[1].fichiers === 0);

  // B. image ET émojis refusés : l'unicode est légitime
  r = await essayer((p, fichiers, emojis) => fichiers > 0 || emojis.some((x) => /^\d+$/.test(x)));
  check('B. image et émojis refusés → repli unicode, panneau envoyé',
    r.clavier === 10 && !r.erreur, `clavier=${r.clavier} erreur=${r.erreur && r.erreur.message}`);

  // C. aucun pack : unicode d'emblée, et le panneau part
  packInstalle(false);
  r = await essayer(() => false);
  check('C. sans pack → unicode d’emblée, un seul envoi', r.clavier === 10 && r.envois.length === 1,
    `clavier=${r.clavier} envois=${r.envois.length}`);

  // D. envoi normal : un seul essai, avec l'image
  packInstalle(true);
  r = await essayer(() => false);
  check('D. envoi normal → un seul essai, avec image et émojis dessinés',
    r.envois.length === 1 && r.envois[0].fichiers === 1 && r.dessines === 10,
    `envois=${r.envois.length} dessinés=${r.dessines}`);

  // E. la reproduction publiée doit passer
  let repro = 'non exécutée';
  try {
    repro = execFileSync(process.execPath, [path.join(__dirname, 'tools', 'repro-vt-emoji.js')], { encoding: 'utf8' });
  } catch (e) { repro = String((e.stdout || '') + (e.stderr || '')); }
  check('E. test/tools/repro-vt-emoji.js conclut « OK »', repro.includes('OK :'));

  console.log(`\n${ok} ✅ / ${ko} ❌`);
  process.exit(ko ? 1 : 0);
})();
