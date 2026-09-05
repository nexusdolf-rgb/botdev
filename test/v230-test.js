// Test v2.30 — /poll passe en CHAMPS D'EMBED (un champ par option).
//
// Pourquoi :
//   • Rendu : la séparation entre les options devient NATIVE (Discord dessine
//     l'espace entre les champs), donc ni lignes vides ni traits ━. Les
//     pourcentages et barres de progression sont alignés sur leur propre ligne.
//   • Le critère v229 est respecté : une LISTE D'OPTIONS n'est pas une suite de
//     sections → ui.sectionize() ne s'applique toujours pas (il dessinerait
//     9 traits pour 10 choix).
//   • 🐛 BUG LATENT CORRIGÉ AU PASSAGE : les choix de /poll arrivaient dans
//     pollEmbed() sans AUCUNE limite de longueur (`raw.split('|')`), et
//     l'ancien rendu les empilait dans `setDescription()` SANS troncature.
//     10 choix de 400 caractères → ~4 400 caractères, au-delà de la limite
//     Discord de 4 096 → **le sondage échouait à s'envoyer**.
//
// Garanties vérifiées ici :
//  1. pollEmbed produit des CHAMPS (plus de description-liste)
//  2. Un champ par option, plafonné à 25 (limite Discord)
//  3. Aucun trait ━ nulle part dans l'embed
//  4. Calcul des pourcentages et des barres exact
//  5. Libellés tronqués à 100 caractères, markdown ** toujours apparié
//  6. Toutes les limites Discord respectées (nom 256, valeur 1024, total 6000)
//  7. L'ancien bug de dépassement est bien corrigé
//  8. État vide (0 vote) : description d'attente, barres vides, 0 %
//  9. Boutons de vote (pollRows) toujours cohérents avec les choix
// 10. Garde-fous v229/v220 toujours debout
// 11. Versionnage front cohérent (v230)
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v230-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const ui = require('../server/discord/ui');
const extra = require('../server/discord/extra');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SEP = ui.SEPARATOR;
const build = (question, choices, votes) => extra.pollEmbed(question, choices, votes || new Map()).toJSON();
const sizeOf = (e) => JSON.stringify(e).length;

// ------------------------------------------------------------
console.log('\n1) pollEmbed produit des CHAMPS, plus une description-liste');
const base = build('Quel salon voulez-vous ?', ['Salon gaming', 'Salon cinéma', 'Salon musique']);
check('pollEmbed est exportée et renvoie un embed', !!base && base.title === '🗳️ Quel salon voulez-vous ?');
check('3 options → 3 champs', Array.isArray(base.fields) && base.fields.length === 3);
check('plus de liste en description (0 vote ici → état vide)',
  !base.description || !base.description.includes('Salon cinéma'));
check('couleur de marque conservée (#e07a5f)', base.color === 0xe07a5f);
check('pied de page conservé (compteur de votes)', /vote\(s\)/.test(base.footer.text));

// ------------------------------------------------------------
console.log('\n2) Un champ par option, plafonné à 25');
const ten = build('Q', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
check('10 options → 10 champs', ten.fields.length === 10);
check('chaque option garde son émoji numéroté',
  ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
    .every((e, i) => ten.fields[i].name.startsWith(e)));
const thirty = build('Q', Array.from({ length: 30 }, (_, i) => `C${i}`));
check('30 options → plafonné à 25 champs (limite Discord)', thirty.fields.length === 25);
check('tous les champs en pleine largeur (inline: false)',
  base.fields.every((f) => f.inline === false));

// ------------------------------------------------------------
console.log('\n3) Aucun trait ━ dans le sondage');
check('embed 3 options : 0 trait', !JSON.stringify(base).includes(SEP));
check('embed 10 options : 0 trait', !JSON.stringify(ten).includes(SEP));
const withVotes = build('Q', ['A', 'B', 'C'], new Map([['u1', 0], ['u2', 1], ['u3', 2]]));
check('embed avec votes : 0 trait', !JSON.stringify(withVotes).includes(SEP));
check('le code ne sectionize PAS la liste des options',
  !read('server/discord/extra.js').includes('.setDescription(ui.sectionize(lines.join'));

// ------------------------------------------------------------
console.log('\n4) Pourcentages et barres exacts');
const votes = new Map();
votes.set('u1', 0); votes.set('u2', 0); votes.set('u3', 0); // 3 × A
votes.set('u4', 1);                                          // 1 × B
                                                            // 0 × C
const r = build('Q', ['A', 'B', 'C'], votes);
check('4 votes : A = 75 %', r.fields[0].value.includes('**75%**') && r.fields[0].value.includes('(3 votes)'));
check('4 votes : B = 25 %', r.fields[1].value.includes('**25%**') && r.fields[1].value.includes('(1 vote)'));
check('4 votes : C = 0 %', r.fields[2].value.includes('**0%**') && r.fields[2].value.includes('(0 vote)'));
const filled = (v) => (v.match(/█/g) || []).length;
const empty = (v) => (v.match(/░/g) || []).length;
check('barre A : 8 pleins + 2 vides = 10 segments', filled(r.fields[0].value) === 8 && empty(r.fields[0].value) === 2);
check('barre C : 0 plein + 10 vides', filled(r.fields[2].value) === 0 && empty(r.fields[2].value) === 10);
check('toutes les barres font exactement 10 segments',
  r.fields.every((f) => filled(f.value) + empty(f.value) === 10));
const all = build('Q', ['A', 'B'], new Map([['u1', 0]]));
check('100 % : barre pleine, jamais 11 segments', filled(all.fields[0].value) === 10);
check('pluriel français : « 1 vote » / « 3 votes »',
  r.fields[1].value.includes('(1 vote)') && r.fields[0].value.includes('(3 votes)'));

// ------------------------------------------------------------
console.log('\n5) Libellés longs : troncature propre, markdown apparié');
const balanced = (s) => ((String(s).match(/\*\*/g) || []).length) % 2 === 0;
const longChoices = build('Q', Array.from({ length: 10 }, () => 'X'.repeat(400)));
check('10 libellés de 400 caractères : aucun nom ne dépasse 256', longChoices.fields.every((f) => f.name.length <= 256));
check('libellé tronqué à ~100 caractères (+ émoji + gras + …)',
  Math.max(...longChoices.fields.map((f) => f.name.length)) <= 110);
check('markdown ** toujours APPARIÉ après troncature', longChoices.fields.every((f) => balanced(f.name)));
check('troncature signalée par un point de suspension', longChoices.fields[0].name.endsWith('**') && longChoices.fields[0].name.includes('…'));
const extreme = build('Q', ['Y'.repeat(6000), 'court']);
check('libellé de 6000 caractères (max Discord) : markdown apparié', balanced(extreme.fields[0].name));
check('libellé de 6000 caractères : nom <= 256', extreme.fields[0].name.length <= 256);
const short = build('Q', ['Oui', 'Non']);
check('libellé court : NON tronqué, aucun … ajouté', !short.fields[0].name.includes('…'));

// ------------------------------------------------------------
console.log('\n6) Limites Discord respectées');
const worst = build('Question très longue '.repeat(12), Array.from({ length: 25 }, () => 'Z'.repeat(400)),
  new Map(Array.from({ length: 50 }, (_, i) => [`u${i}`, i % 25])));
check('nom de champ <= 256', worst.fields.every((f) => f.name.length <= 256));
check('valeur de champ <= 1024', worst.fields.every((f) => f.value.length <= 1024));
check('nombre de champs <= 25', worst.fields.length <= 25);
check('description <= 4096', !worst.description || worst.description.length <= 4096);
check(`taille totale de l'embed raisonnable (${sizeOf(worst)} octets, rejet Discord au-delà de 6000)`, sizeOf(worst) < 6000);

// ------------------------------------------------------------
console.log('\n7) 🐛 L’ancien bug de dépassement est corrigé');
// Reproduction exacte du cas qui CASSAIT avant v230 : 10 choix de 400 caractères
// empilés dans setDescription() → ~4 400 caractères > limite Discord de 4 096.
const legacyChoices = Array.from({ length: 10 }, () => 'X'.repeat(400));
const legacyDescription = legacyChoices
  .map((c, i) => `${['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i]} **${c}**\n░░░░░░░░░░ **0%** (0 vote)`)
  .join('\n\n');
check(`l’ancien rendu dépassait bien la limite (${legacyDescription.length} > 4096)`, legacyDescription.length > 4096);
const fixed = build('Q', legacyChoices);
// À 0 vote la description d'état vide existe volontairement : ce qu'il faut
// interdire, c'est la LISTE des options en description (source du dépassement).
check('le nouveau rendu passe par des champs : aucune liste en description',
  !fixed.description || !fixed.description.includes('X'.repeat(50)));
check(`le nouveau rendu tient dans les limites (${sizeOf(fixed)} octets)`, sizeOf(fixed) < 6000);
check('le code tronque désormais les libellés (shortLabel présent)',
  read('server/discord/extra.js').includes('const shortLabel'));

// ------------------------------------------------------------
console.log('\n8) État vide : aucun vote');
check('description d’attente affichée', /Aucun vote pour l'instant/.test(base.description));
check('toutes les options à 0 %', base.fields.every((f) => f.value.includes('**0%**')));
check('toutes les barres vides', base.fields.every((f) => filled(f.value) === 0));
check('pied de page à 0 vote(s)', base.footer.text.startsWith('0 vote(s)'));
check('pas de division par zéro (NaN absent)', !JSON.stringify(base).includes('NaN'));

// ------------------------------------------------------------
console.log('\n9) Boutons de vote cohérents avec les choix');
const rows = extra.pollRows('G1', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
check('7 choix → 2 rangées de boutons (5 + 2)', rows.length === 2);
check('rangée 1 : 5 boutons', rows[0].components.length === 5);
check('rangée 2 : 2 boutons', rows[1].components.length === 2);
const ids = rows.flatMap((r) => r.components.map((c) => c.data.custom_id));
check('custom_id préfixés hx:poll:<guild>:', ids.every((id) => id.startsWith('hx:poll:G1:')));
check('un bouton par choix, dans l’ordre', ids.map((id) => id.split(':').pop()).join(',') === '0,1,2,3,4,5,6');

// ------------------------------------------------------------
console.log('\n10) Garde-fous v229 / v220 toujours debout');
const ex = read('server/discord/extra.js');
check('le quiz garde le trait (lancement + résultat)',
  (ex.match(/setDescription\(ui\.sectionize\(/g) || []).length >= 2);
check('mariage / pendu / morpion : toujours >= 5 « sections: false »',
  (ex.match(/sections: false/g) || []).length >= 5);
check('le critère v229 est toujours écrit dans le code',
  (ex.match(/jamais de trait entre deux COURTES phrases/g) || []).length === 2);
check('/shop : exclusion volontaire toujours en place',
  read('server/discord/premade.js').includes('EXCLUSION VOLONTAIRE'));
check('panneaux natifs V2 : séparateurs SeparatorBuilder toujours >= 3',
  (read('server/discord/advancedTickets.js').match(/addSeparatorComponents\(new SeparatorBuilder\(\)\.setDivider\(true\)\)/g) || []).length >= 3);

// ------------------------------------------------------------
console.log('\n11) Aucun secret ajouté + versionnage front v230');
check('aucun token en dur dans extra.js',
  !/(ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_]{15,}/.test(ex));
check('index.html : 7 références ?v=230', (read('public/index.html').match(/\?v=230/g) || []).length === 7);
check('index.html : plus aucune référence ?v=229', !read('public/index.html').includes('?v=229'));
check('sw.js : cache botdev-v230', read('public/sw.js').includes("const CACHE = 'botdev-v230';"));

console.log(failures === 0
  ? '\n✅ V230 — /poll en champs d’embed : rendu net, limites Discord respectées, bug de dépassement corrigé.'
  : `\n❌ V230 — ${failures} échec(s)`);
process.exit(failures ? 1 : 0);
