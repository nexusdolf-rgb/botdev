#!/usr/bin/env node
// Reproduction du défaut signalé : « les émojis du panneau vocal sont
// remplacés par des émojis normaux ».
//
// On n'appelle pas Discord : `channel.send` est remplacé par un faux salon qui
// REFUSE le message quand il porte une pièce jointe (le cas « Discord refuse
// l'image de légende »). On observe ensuite ce que contient réellement le
// second envoi : les émojis dessinés, ou les émojis du clavier.
const path = require('path');
process.env.BOTDEV_DATA_DIR = require('fs').mkdtempSync('/tmp/vt-repro-');
require(path.join(__dirname, '..', 'server', 'db'));

const extra = require(path.join(__dirname, '..', 'server', 'discord', 'extra'));
extra._setVtTestPack ? extra._setVtTestPack() : null;

const CLE = 'hox_nom';
const PLANS = [];

function fauxSalon(options) {
  return {
    id: 'C1',
    send: async (payload) => {
      const aPieceJointe = Array.isArray(payload.files) && payload.files.length > 0;
      if (aPieceJointe && options.refusImage) {
        const e = new Error('Invalid Form Body (attachment)');
        e.code = 50035;
        throw e;
      }
      return { id: 'MSG' + (PLANS.length + 1) };
    },
  };
}

(async () => {
  // Un serveur minimal : aucun émoji, donc le pack tombe en unicode.
  const guild = { id: 'G1', name: 'Test', emojis: { cache: new Map() }, members: { me: null }, channels: { cache: new Map() } };

  console.log('── ce que chaque tentative envoie réellement ──');
  for (const variante of [
    { nom: 'envoi normal', sansEmoji: false, sansLegende: false },
    { nom: 'repli actuel (sansEmoji + sansLegende)', sansEmoji: true, sansLegende: true },
  ]) {
    const p = extra.buildVtPanel(1, guild, variante);
    const desc = (p.components || [])
      .flatMap((c) => (c.components || []))
      .map((b) => (b.emoji && (b.emoji.id || b.emoji.name)) || '')
      .join(' ');
    const image = p.files ? p.files.length : 0;
    PLANS.push({ nom: variante.nom, image, emoji: desc.slice(0, 80) });
    console.log(`  ${variante.nom.padEnd(46)} pièce jointe=${image} · émojis = ${desc.slice(0, 70)}`);
  }

  const normal = PLANS[0];
  const repli = PLANS[1];
  const emojiDessine = normal.emoji.includes('hox_') || /^\d/.test(normal.emoji);
  const repliEnUnicode = !/hox_|^\d/.test(repli.emoji);

  console.log('');
  if (emojiDessine && repliEnUnicode) {
    console.log('DÉFAUT REPRODUIT : la première tentative porte les émojis dessinés,');
    console.log('le repli les remplace par des émojis du clavier — même quand seul');
    console.log('le refus de l’image l’a déclenché.');
    process.exit(1);
  }
  console.log('PAS DE DÉFAUT : le repli conserve les émojis dessinés.');
  process.exit(0);
})();
