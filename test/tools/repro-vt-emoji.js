#!/usr/bin/env node
// Reproduction du défaut signalé : « les émojis des vocaux temporaires sont
// remplacés par des émojis normaux ».
//
// On ne parle pas à Discord : `channel.send` est remplacé par un faux salon qui
// refuse le message QUAND IL PORTE UNE PIÈCE JOINTE — le cas « Discord refuse
// l'image de légende ». On regarde ensuite ce que contient réellement chaque
// envoi : les émojis dessinés (identifiant) ou ceux du clavier (✏️, 👥…).
//
//   node test/tools/repro-vt-emoji.js
//
// Sortie 1 = défaut présent, 0 = comportement correct.
const path = require('path');
const fs = require('fs');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync('/tmp/vt-repro-');

const store = require(path.join(__dirname, '..', '..', 'server', 'db'));
const extra = require(path.join(__dirname, '..', '..', 'server', 'discord', 'extra'));

const ENVOIS = [];

// ce que le faux salon a reçu
const emojisDe = (payload) => {
  const out = [];
  const vus = new WeakSet();
  (function parcourir(o, prof) {
    if (!o || typeof o !== 'object' || prof > 8 || vus.has(o)) return;
    vus.add(o);
    if (o.emoji) out.push(o.emoji.id || o.emoji.name || '');
    for (const k of Object.keys(o)) { try { parcourir(o[k], prof + 1); } catch {} }
  })(payload, 0);
  return out;
};

(async () => {
  // 1) Un pack d'émojis est installé (identifiants factices) : le panneau doit
  //    porter NOS dessins. Sans ça, tout partirait déjà en unicode et le test
  //    ne prouverait rien.
  // La version attendue est l'empreinte SHA-256 des dix PNG, exactement comme
  // `vtVer()` la calcule dans le module.
  const crypto = require('crypto');
  const dossier = path.join(__dirname, '..', '..', 'server', 'assets', 'voicetemp');
  const h = crypto.createHash('sha256');
  for (const k of ['nom', 'limite', 'prive', 'public', 'suppr', 'ajouter', 'retirer', 'expulser', 'recup', 'transfer']) {
    const f = path.join(dossier, 'hox_' + k + '.png');
    h.update(fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0));
  }
  store.settings.set('vt_emotes_app', JSON.stringify({
    nom: '1001', limite: '1002', prive: '1003', public: '1004', suppr: '1005',
    ajouter: '1006', retirer: '1007', expulser: '1008', recup: '1009', transfer: '1010',
  }));
  store.settings.set('vt_emotes_app_ver', h.digest('hex').slice(0, 16));

  const salon = {
    id: 'C1',
    messages: { fetch: async () => { throw new Error('aucun ancien message'); } },
    send: async (payload) => {
      ENVOIS.push({ fichiers: (payload.files || []).length, emojis: emojisDe(payload) });
      if ((payload.files || []).length > 0) {
        const e = new Error('Invalid Form Body (attachment)');
        e.code = 50035;
        throw e;
      }
      return { id: 'MSG2' };
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

  console.log('── ce que le salon a réellement reçu ──');
  ENVOIS.forEach((e, i) => {
    const dessine = e.emojis.filter((x) => /^\d+$/.test(String(x))).length;
    const clavier = e.emojis.filter((x) => !/^\d+$/.test(String(x))).length;
    console.log(`  envoi ${i + 1} : pièce jointe=${e.fichiers} · émojis dessinés=${dessine} · émojis du clavier=${clavier}  ${e.emojis.slice(0, 2).join(' ')}`);
  });
  if (erreur) console.log('  erreur finale :', erreur.message);

  const dernier = ENVOIS[ENVOIS.length - 1] || { emojis: [] };
  const dessineFinal = dernier.emojis.some((x) => /^\d+$/.test(String(x)));
  const clavierFinal = dernier.emojis.some((x) => !/^\d+$/.test(String(x)));

  console.log('');
  if (!dessineFinal && clavierFinal) {
    console.log('DÉFAUT REPRODUIT : après le refus de l’image, les émojis dessinés');
    console.log('sont remplacés par ceux du clavier, alors que seul le fichier posait problème.');
    process.exit(1);
  }
  console.log('OK : le dernier envoi conserve les émojis dessinés.');
  process.exit(0);
})();
