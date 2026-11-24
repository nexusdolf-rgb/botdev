// ============================================================
// v405/v406 — Assistant /setup apply : plusieurs formulaires, écrans autonomes
// ------------------------------------------------------------
// Ce que ce test prouve, sans Discord :
//   1. `/setup` est déclarée, branchée, réservée aux admins ;
//   2. la table `apply_forms` permet PLUSIEURS formulaires par serveur
//      (l'ancienne clé primaire bot_id+guild_id n'en autorisait qu'un) ;
//   3. l'ancienne configuration est migrée UNE fois, sans doublon ;
//   4. chaque écran est autonome : son customId, son embed, ses boutons ;
//   5. les boutons Précédent / Suivant respectent l'ordre des étapes ;
//   6. la question est enregistrée ENTIÈRE (bug de production : coupée à 45) ;
//   7. le bouton du panneau porte l'identifiant du FORMULAIRE, pas du serveur ;
//   8. l'ancienne /apply ne peut plus écrire de configuration.
// ============================================================
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lecture = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

let ok = 0;
let ko = 0;
function check(titre, condition, detail) {
  if (condition) { ok++; console.log('  ✅ ' + titre); }
  else { ko++; console.log('  ❌ ' + titre + (detail ? ' — ' + detail : '')); }
}

// ---------- 1. Déclaration ----------
console.log('\n1) La commande');
{
  const premade = lecture('server/discord/premade.js');
  check('`/setup` est déclarée', /name: 'setup'/.test(premade));
  check('elle a la sous-commande `apply`', /name: 'apply',[\s\S]{0,160}ApplicationCommandOptionType\.Subcommand/.test(premade));
  check('elle est réservée aux administrateurs', /name: 'setup',[\s\S]{0,400}default_member_permissions: '8'/.test(premade));

  const panels = lecture('server/discord/panels.js');
  check('`/setup` est routée', /\['ticket', 'roles', 'setup'\]/.test(panels));
  check('les interactions `apw:` sont routées', panels.includes("cid.startsWith('apw:')"));

  const pc = lecture('server/discord/panelCommands.js');
  check('`/setup apply` lance l’assistant', /sub === 'apply'[\s\S]{0,120}applyWizard/.test(pc));

  const idx = lecture('server/index.js');
  check('la migration est appelée au démarrage', idx.includes('migrateApplications()'));
}

// ---------- 2. Plusieurs formulaires par serveur ----------
console.log('\n2) Plusieurs formulaires par serveur');
const DATA_DIR = path.join(os.tmpdir(), `hoxera-v406-${Date.now()}-${process.pid}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

{
  const store = require('../server/db');

  const a = store.applyForms.create({ bot_id: 1, guild_id: 'G1', title: 'Staff', channel: '111', questions: ['Pourquoi vous ?'], enabled: 1 });
  const b = store.applyForms.create({ bot_id: 1, guild_id: 'G1', title: 'Partenaire', channel: '222', questions: ['Votre serveur ?', 'Vos membres ?'], enabled: 1 });
  const c = store.applyForms.create({ bot_id: 1, guild_id: 'G2', title: 'Autre serveur', channel: '333', questions: ['q'], enabled: 1 });
  check('deux formulaires coexistent sur le même serveur', store.applyForms.count(1, 'G1') === 2);
  check('un autre serveur a les siens', store.applyForms.count(1, 'G2') === 1);
  check('chaque formulaire a son propre identifiant', a !== b && b !== c);
  check('les questions sont relues en tableau', Array.isArray(store.applyForms.get(b).questions) && store.applyForms.get(b).questions.length === 2);

  store.applyForms.update(a, { title: 'Staff modifié', enabled: 0 });
  const maj = store.applyForms.get(a);
  check('un formulaire se modifie', maj.title === 'Staff modifié' && Number(maj.enabled) === 0);
  store.applyForms.update(b, { questions: ['une seule ?'] });
  check('les questions se mettent à jour', store.applyForms.get(b).questions.length === 1);

  store.applyForms.remove(c);
  check('un formulaire se supprime', store.applyForms.get(c) === null);
  check('les autres ne bougent pas', store.applyForms.count(1, 'G1') === 2);

  // Données corrompues : la lecture ne doit jamais planter.
  store.db.prepare("UPDATE apply_forms SET questions = '{{pas du json' WHERE id = ?").run(a);
  let survit = true;
  try { store.applyForms.get(a); } catch { survit = false; }
  check('des questions corrompues ne font pas planter la lecture', survit && Array.isArray(store.applyForms.get(a).questions));
}

// ---------- 3. Migration de l'ancienne configuration ----------
console.log('\n3) Migration de l’ancienne configuration unique');
{
  const store = require('../server/db');
  // On repart d'une base vierge pour la migration.
  store.db.prepare('DELETE FROM apply_forms').run();
  store.db.prepare("DELETE FROM settings WHERE key = 'apply_migrated'").run();
  store.applications.set(1, 'G_MIGRE', { channel: '555', questions: ['Ancienne question ?'], title: 'Ancien', enabled: 1 });
  store.applications.set(1, 'G_VIDE', { channel: '', questions: '[]', title: '', enabled: 0 });

  const n = store.migrateApplications();
  check('une configuration existante est migrée', n === 1, `${n} migré(s)`);
  const migre = store.applyForms.all(1, 'G_MIGRE');
  check('le formulaire migré garde son salon', migre[0] && migre[0].channel === '555');
  check('il garde ses questions entières', migre[0] && migre[0].questions[0] === 'Ancienne question ?');
  check('une configuration vide n’est pas migrée', store.applyForms.count(1, 'G_VIDE') === 0);
  check('la migration ne se rejoue pas', store.migrateApplications() === 0);
  check('l’ancienne table est conservée (aucune perte)',
    !!store.applications.get(1, 'G_MIGRE'));
}

// ---------- 4. Les écrans ----------
console.log('\n4) Chaque écran est autonome');
{
  const src = lecture('server/discord/applyWizard.js');
  for (const ecran of ['accueil', 'canal', 'retrait', 'choix', 'btn', 'modal']) {
    check(`l’écran « ${ecran} » a son propre customId`, src.includes(`apw:${ecran}`) || src.includes(`'${ecran}'`));
  }
  check('un écran = un embed', src.includes('ecranAccueil') && src.includes('ecranEtape') && src.includes('ecranChoix'));
  check('4 étapes ordonnées', /const ORDRE = \['identite', 'canal', 'questions', 'recap'\]/.test(src));
  check('bouton « Suivant → »', src.includes("'Suivant →'"));
  check('bouton « ↩ Précédent »', src.includes("'↩ Précédent'"));
  check('bouton « ✖ Annuler »', src.includes("'✖ Annuler'"));
  check('l’accueil propose créer / modifier / supprimer / envoyer',
    ['creer', 'modifier', 'supprimer', 'envoyer'].every((v) => src.includes(`'${v}'`)));
  check('la création ouvre une fenêtre titre + texte',
    src.includes("id: 'titre'") && src.includes("id: 'texte'"));
  check('le salon se choisit dans un sélecteur natif', src.includes('ChannelSelectMenuBuilder'));
  // Discord affiche l'emoji du champ `emoji` PUIS le label : si le label
  // contient aussi l'emoji, l'option s'affiche « ➕ ➕ Créer un… ».
  check('les options du menu n’affichent pas l’emoji en double',
    !/label: '➕|label: '✏️|label: '🗑️|label: '📤/.test(src));
  check('une question se retire via un menu', src.includes('apw:retrait') || src.includes("'retrait'"));
  check('la suppression demande confirmation', src.includes('confirmersuppression') && src.includes('irréversible'));

  // --- Un seul message : le défaut d'ergonomie signalé en production ---
  // Chaque écran repartait d'un `reply()` sur une interaction de composant :
  // Discord ne l'autorise qu'une fois par clic, le reste partait en followUp
  // et l'assistant empilait jusqu'à 7 messages dans le salon.
  const corps = src.slice(src.indexOf('async function handleWizardInteraction'));
  check('aucun écran ne crée un nouveau message', !/\.followUp\(/.test(corps));
  check('le parcours réécrit le message mémorisé', src.includes('state.panneau.edit') || src.includes('afficherSur(state'));
  check('l’assistant garde une seule référence de panneau', !/state\.message\b/.test(src));
  check('la fenêtre du premier affichage est conservée', /fetchReply: true/.test(src) && /state\.panneau = msg/.test(src));
  check('un panneau supprimé est signalé sans être recréé', src.includes('a été supprimé') && src.includes('wizards.delete'));

  // --- Accusé de réception : sinon « L'application ne répond pas » ---
  check('les sélecteurs de salon sont acquittés', /isChannelSelectMenu\(\)\) \{\s*\n\s*await ack\(interaction\)/.test(src));
  check('les soumissions de fenêtre sont acquittées', /isModalSubmit\(\)\) \{\s*\n[\s\S]{0,220}await ack\(interaction\)/.test(src));
  check('aucune fenêtre n’est ouverte après un accusé de réception',
    /action !== 'identite' && action !== 'ajouterquestion'\) await ack\(interaction\)/.test(src));
  check('l’assistant expire', /WIZARD_TTL = 20 \* 60000/.test(src));
  check('seul le lanceur peut utiliser son assistant', src.includes('uid !== interaction.user.id'));

  // Limites Discord, pas des choix produit
  check('5 questions maximum (limite d’une fenêtre)', /const MAX_QUESTIONS = 5/.test(src));
  check('la limite est expliquée dans le code', src.includes('5 rangées maximum') || src.includes('limite d\'une fenêtre Discord'));
}

// ---------- 5. La question entière ----------
console.log('\n5) La question n’est plus tronquée');
{
  const src = lecture('server/discord/applyWizard.js');
  check('aucun `slice(0, 45)` sur une question enregistrée', !/questions\.push\([^)]*slice\(0, 45\)/.test(src));
  check('la question est enregistrée sur QUESTION_MAX (200)', /slice\(0, QUESTION_MAX\)/.test(src));

  const extra = lecture('server/discord/extra.js');
  check('l’ancienne /apply ne fait plus qu’une redirection',
    extra.includes('/setup apply') && !extra.slice(extra.indexOf("case 'apply': {")).includes('store.applications.set'));
}

// ---------- 6. Le panneau et le bouton ----------
console.log('\n6) Le panneau public');
{
  const src = lecture('server/discord/applyWizard.js');
  check('le bouton porte l’identifiant du formulaire', src.includes('`hx:apply:${form.id}`'));
  check('le panneau passe ses boutons en 2ᵉ argument de v2panel', /ui\.v2panel\(\{[\s\S]{0,500}\}, \[row\]\)/.test(src));

  const extra = lecture('server/discord/extra.js');
  check('extra.js lit le formulaire par identifiant',
    /const formId = Number\(parts\[2\]\);\s*\n\s*const form = store\.applyForms\.get\(formId\);/.test(extra));
  check('la fenêtre du membre est celle du bon formulaire', extra.includes("store.applyForms.get(Number(id.split(':')[1]))"));
  check('extra.js ne lit plus l’ancienne table pour les candidatures',
    !/const cfg = store\.applications\.get\(botId, guild\.id\);\s*\n\s*if \(!cfg \|\| !cfg\.enabled/.test(extra));
}

console.log(`\n${ko === 0 ? '🎉' : '❌'} v405/v406 — ${ok} vérification(s) OK, ${ko} échec(s).`);
try { require('../server/db').db.close(); } catch {}
fs.rmSync(DATA_DIR, { recursive: true, force: true });
process.exit(ko === 0 ? 0 : 1);
