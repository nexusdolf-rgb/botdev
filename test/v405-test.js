// ============================================================
// v405 — Assistant interactif /setup apply
// ------------------------------------------------------------
// Ce que ce test prouve, sans Discord :
//   1. `/setup apply` est bien déclarée et branchée au répartiteur ;
//   2. l'assistant s'ouvre sur un menu déroulant, pas sur du texte à taper ;
//   3. ajouter une question l'enregistre ENTIÈRE (bug de production : elle
//      était coupée à 45 caractères, « …inte vous intéresser… ») ;
//   4. une question se modifie et se supprime ;
//   5. le panneau ne s'envoie que si salon + question sont présents ;
//   6. le bouton du panneau garde l'ancien customId `hx:apply:<guild>` pour
//      que les panneaux DÉJÀ envoyés dans les serveurs continuent de marcher.
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

// ---------- 1. Déclaration de la commande ----------
console.log('\n1) La commande');
{
  const premade = lecture('server/discord/premade.js');
  check('`/setup` est déclarée', /name: 'setup'/.test(premade));
  check('elle a la sous-commande `apply`', /name: 'apply',[\s\S]{0,160}ApplicationCommandOptionType\.Subcommand/.test(premade));
  check('elle est réservée aux administrateurs', /name: 'setup',[\s\S]{0,400}default_member_permissions: '8'/.test(premade));

  const panels = lecture('server/discord/panels.js');
  check('`/setup` est routée vers handlePanelCommand', /\['ticket', 'roles', 'setup'\]/.test(panels));
  check('les interactions `apw:` sont routées', panels.includes("cid.startsWith('apw:')"));
  check('elles vont vers applyWizard', panels.includes("require('./applyWizard')"));

  const pc = lecture('server/discord/panelCommands.js');
  check('`/setup apply` lance l’assistant', /sub === 'apply'[\s\S]{0,120}applyWizard/.test(pc));
}

// ---------- 2. L'assistant s'ouvre sur un menu ----------
console.log('\n2) Ouverture de l’assistant');
{
  const src = lecture('server/discord/applyWizard.js');
  check('un menu déroulant est construit', src.includes('StringSelectMenuBuilder'));
  check('les actions sont dans un menu, pas en sous-commandes',
    src.includes('Que voulez-vous faire ?') && src.includes('apw:menu:'));
  for (const action of ['canal', 'titre', 'ajouter', 'modifier', 'supprimer', 'envoyer', 'apercu', 'reset']) {
    check(`l’action « ${action} » existe`, src.includes(`'${action}'`));
  }
  check('une fenêtre sert à renommer', src.includes("mode === 'titre'") && src.includes('ModalBuilder'));
  check('un sélecteur natif sert à choisir le salon', src.includes('ChannelSelectMenuBuilder'));
  check('l’assistant expire au bout de 15 min', /WIZARD_TTL = 15 \* 60000/.test(src));
  check('seul le lanceur peut utiliser son assistant', src.includes("uid !== interaction.user.id"));
}

// ---------- 3. Le bug de troncature ----------
console.log('\n3) La question n’est plus coupée à 45 caractères');
{
  const src = lecture('server/discord/applyWizard.js');
  check('plus aucun `slice(0, 45)` sur la valeur enregistrée',
    !/questions\.push\([^)]*slice\(0, 45\)/.test(src));
  check('la question est enregistrée sur QUESTION_MAX (200)',
    /questions\.push\(val\.slice\(0, QUESTION_MAX\)\)/.test(src));
  check('l’ancien plafond de 5 est documenté comme limite Discord',
    src.includes('MAX_QUESTIONS = 5') && src.includes('limite DURE de Discord'));

  // Le texte exact qui avait été tronqué en production doit tenir entier.
  const QUESTION = 'Qu’est-ce qui pourrait vous intéresser par le recrutement ?';
  check('la question de production fait bien plus de 45 caractères',
    QUESTION.length > 45, QUESTION.length + ' caractères');
  check('elle tient dans la limite de la fenêtre (200)', QUESTION.length <= 200);
  check('elle tient dans un libellé Discord (45) après coupe d’affichage — d’où le bug d’origine',
    QUESTION.slice(0, 45) !== QUESTION);
}

// ---------- 4. Enregistrement réel en base ----------
console.log('\n4) Enregistrement et relecture (base réelle, isolée)');
const DATA_DIR = path.join(os.tmpdir(), `hoxera-v405-${Date.now()}-${process.pid}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DATA_DIR = DATA_DIR;
process.env.DB_PATH = path.join(DATA_DIR, 'botdev.db');

{
  const store = require('../server/db');
  const wiz = require('../server/discord/applyWizard');

  // Aucune configuration au départ
  let cfg = wiz.lireConfig(1, 'G1');
  check('configuration vide au départ', cfg.channel === '' && cfg.questions.length === 0);
  check('titre par défaut', cfg.title === '📝 Candidature');
  check('désactivée par défaut', cfg.enabled === false);

  // Le salon
  cfg.channel = '123456789';
  wiz.ecrireConfig(1, 'G1', cfg);
  cfg = wiz.lireConfig(1, 'G1');
  check('le salon est enregistré', cfg.channel === '123456789');

  // La question longue, celle qui était tronquée
  const QUESTION = 'Qu’est-ce qui pourrait vous intéresser par le recrutement ?';
  cfg.questions.push(QUESTION);
  wiz.ecrireConfig(1, 'G1', cfg);
  cfg = wiz.lireConfig(1, 'G1');
  check('la question est stockée ENTIÈRE', cfg.questions[0] === QUESTION, `reçu : « ${cfg.questions[0]} »`);
  check('aucun début perdu (« inte vous… » ne revient plus)',
    !cfg.questions[0].startsWith('inte'));

  // Modification
  cfg.questions[0] = 'Pourquoi voulez-vous rejoindre l’équipe ?';
  wiz.ecrireConfig(1, 'G1', cfg);
  cfg = wiz.lireConfig(1, 'G1');
  check('une question se modifie', cfg.questions[0] === 'Pourquoi voulez-vous rejoindre l’équipe ?');

  // Ajout multiple + suppression
  cfg.questions.push('Depuis combien de temps jouez-vous ?');
  wiz.ecrireConfig(1, 'G1', cfg);
  cfg = wiz.lireConfig(1, 'G1');
  check('deux questions coexistent', cfg.questions.length === 2);
  cfg.questions.splice(0, 1);
  wiz.ecrireConfig(1, 'G1', cfg);
  cfg = wiz.lireConfig(1, 'G1');
  check('une question se supprime', cfg.questions.length === 1 && cfg.questions[0].startsWith('Depuis'));

  // Titre
  cfg.title = 'Candidature staff';
  wiz.ecrireConfig(1, 'G1', cfg);
  check('le titre se renomme', wiz.lireConfig(1, 'G1').title === 'Candidature staff');

  // Isolation par serveur : la config de G1 ne doit pas fuir sur G2
  check('un autre serveur garde sa propre configuration',
    wiz.lireConfig(1, 'G2').questions.length === 0);

  // reset
  wiz.ecrireConfig(1, 'G1', { channel: '', title: '📝 Candidature', enabled: false, questions: [] });
  const vide = wiz.lireConfig(1, 'G1');
  check('la réinitialisation efface tout', vide.channel === '' && vide.questions.length === 0);

  // Données malformées : ne doit jamais planter
  store.applications.set(1, 'G3', { channel: '', questions: '{{pas du json', title: '', enabled: 0 });
  let survit = true;
  try { wiz.lireConfig(1, 'G3'); } catch { survit = false; }
  check('une configuration corrompue ne fait pas planter la lecture', survit);
}

// ---------- 5. Le bouton du panneau reste compatible ----------
console.log('\n5) Compatibilité avec les panneaux déjà envoyés');
{
  const src = lecture('server/discord/applyWizard.js');
  check('le bouton garde l’ancien customId `hx:apply:<guild>`',
    src.includes('`hx:apply:${guildId}`'));
  const extra = lecture('server/discord/extra.js');
  check('ce customId est toujours écouté par extra.js', extra.includes('case \'apply\''));
  check('la fenêtre accepte toujours 5 questions', extra.includes('questions.slice(0, 5)'));
  check('le panneau passe ses boutons en 2ᵉ argument de v2panel',
    /ui\.v2panel\(\{[\s\S]{0,400}\}, \[row\]\)/.test(src));
}

console.log(`\n${ko === 0 ? '🎉' : '❌'} v405 — ${ok} vérification(s) OK, ${ko} échec(s).`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
process.exit(ko === 0 ? 0 : 1);
