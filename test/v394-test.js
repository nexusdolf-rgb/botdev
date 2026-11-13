#!/usr/bin/env node
// v394 — le panneau vocal ne doit JAMAIS afficher d'émoji du clavier, et ses
// émojis ne doivent JAMAIS être créés dans le serveur du client.
//
// Capture du fondateur : la légende était en texte (✏️ NOM 👥 LIMITE…) et les
// dix boutons portaient ✏️ 👥 🔒 🔓 🔑 ➕ ➖ 👢 🤝 🗑️ — autrement dit le repli
// unicode était parti, et rien n'indiquait que c'était un incident.
//
// Ce test mesure trois choses, sans parler à Discord :
//   1. AUCUN émoji unicode, dans aucun envoi, quel que soit l'incident ;
//   2. aucune création d'émoji dans le serveur (espion sur emojis.create) ;
//   3. la légende voyage avec le panneau ; son secours est fait de mots.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync('/tmp/vt394-');
const store = require(path.join(__dirname, '..', 'server', 'db'));
const extra = require(path.join(__dirname, '..', 'server', 'discord', 'extra'));

let ok = 0, ko = 0;
const check = (nom, condition, detail) => {
  if (condition) { ok++; console.log(`  ✅ ${nom}`); }
  else { ko++; console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`); }
};

const CLES = ['nom', 'limite', 'prive', 'public', 'suppr', 'ajouter', 'retirer', 'expulser', 'recup', 'transfer'];
const UNICODE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2060}]/u;

function empreinte() {
  const dossier = path.join(__dirname, '..', 'server', 'assets', 'voicetemp');
  const h = crypto.createHash('sha256');
  for (const k of CLES) {
    const f = path.join(dossier, 'hox_' + k + '.png');
    h.update(fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0));
  }
  return h.digest('hex').slice(0, 16);
}

function pack(actif) {
  store.settings.set('vt_emotes_app', actif ? JSON.stringify(Object.fromEntries(CLES.map((k, i) => [k, String(2001 + i)]))) : '');
  store.settings.set('vt_emotes_app_ver', actif ? empreinte() : '');
}

// Tout ce qu'un message contient : émojis de boutons, textes, libellés.
function contenuDe(payload) {
  const emojis = [];
  const textes = [];
  const vus = new WeakSet();
  (function parcourir(o, prof) {
    if (!o || typeof o !== 'object' || prof > 9 || vus.has(o)) return;
    vus.add(o);
    if (o.emoji) emojis.push({ id: o.emoji.id || null, name: o.emoji.name || null });
    if (typeof o.content === 'string') textes.push(o.content);
    if (typeof o.label === 'string') textes.push(o.label);
    for (const k of Object.keys(o)) { try { parcourir(o[k], prof + 1); } catch {} }
  })(payload, 0);
  return { emojis, textes };
}

async function envoyer({ refuseImage, refuseTout }) {
  const envois = [];
  let creationsServeur = 0;
  const salon = {
    id: 'C1',
    messages: { fetch: async () => { throw new Error('rien'); } },
    send: async (payload) => {
      const c = contenuDe(payload);
      envois.push({ ...c, fichiers: (payload.files || []).length });
      if (refuseTout || (refuseImage && (payload.files || []).length > 0)) {
        const e = new Error('Invalid Form Body');
        e.code = 50035;
        throw e;
      }
      return { id: 'MSG' + envois.length };
    },
  };
  const guild = {
    id: 'G1', name: 'Test',
    emojis: { cache: new Map(), create: async () => { creationsServeur++; return { id: 'x' }; } },
    members: { me: null, cache: new Map() },
    channels: { cache: new Map([['C1', salon]]) },
  };
  let erreur = null;
  try { await extra.sendVtPanel(1, guild, 'C1'); } catch (e) { erreur = e; }
  return { envois, creationsServeur, erreur };
}

const tousLesEmojis = (r) => r.envois.flatMap((e) => e.emojis);
const tousLesTextes = (r) => r.envois.flatMap((e) => e.textes).join('\n');

(async () => {
  // ── 1. Pack d'application installé : dix dessins, aucun unicode ──────────
  pack(true);
  let r = await envoyer({});
  const e1 = tousLesEmojis(r);
  check('pack applicatif → 10 boutons émoji', e1.length === 10, `${e1.length}`);
  check('…tous portent un identifiant (nos dessins)', e1.every((x) => /^\d+$/.test(String(x.id))));
  check('…aucun émoji unicode dans le message', !UNICODE.test(tousLesTextes(r)));
  check('…la légende est l’image jointe', r.envois[0].fichiers === 1);

  // ── 2. Image refusée : on garde les dessins, la légende devient des mots ──
  r = await envoyer({ refuseImage: true });
  const e2 = r.envois[r.envois.length - 1].emojis;
  check('image refusée → le deuxième envoi garde les 10 dessins',
    e2.length === 10 && e2.every((x) => /^\d+$/.test(String(x.id))));
  check('image refusée → aucun émoji unicode', !UNICODE.test(tousLesTextes(r)));
  check('image refusée → la légende de secours est en mots',
    /NOM/.test(tousLesTextes(r)) && /SUPPRIMER/.test(tousLesTextes(r)));

  // ── 3. Aucun pack : des libellés, toujours pas d'unicode ─────────────────
  pack(false);
  r = await envoyer({});
  const dernier = r.envois[r.envois.length - 1];
  check('sans pack → les boutons portent leur libellé',
    dernier.textes.some((t) => t === 'NOM') && dernier.textes.some((t) => t === 'SUPPRIMER'));
  check('sans pack → aucun émoji unicode', !UNICODE.test(tousLesTextes(r)));
  check('sans pack → aucun émoji du tout dans les boutons', dernier.emojis.length === 0);

  // ── 4. Le serveur ne reçoit plus jamais d'émoji ──────────────────────────
  pack(true);
  r = await envoyer({});
  check('aucune création d’émoji dans le serveur', r.creationsServeur === 0, `${r.creationsServeur} création(s)`);

  // ── 5. Le code ne contient plus de table de repli utilisée par le panneau ─
  const EXTRA = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'extra.js'), 'utf8');
  const corps = EXTRA.slice(EXTRA.indexOf('function buildVtPanel'), EXTRA.indexOf('async function sendVtPanel'));
  check('buildVtPanel ne référence plus VT_EMOTE_FALLBACK', !corps.includes('VT_EMOTE_FALLBACK'));
  const envoi = EXTRA.slice(EXTRA.indexOf('async function sendVtPanel'), EXTRA.indexOf('async function handleVtInteraction'));
  check('sendVtPanel ne réessaie plus en unicode', !envoi.includes('sansEmoji: true, sansLegende: true'));

  console.log(`\n${ok} ✅ / ${ko} ❌`);
  process.exit(ko ? 1 : 0);
})();
