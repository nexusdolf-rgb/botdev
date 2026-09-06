// ============================================================================
// v240 — Conversion « tu » → « vous » des textes codés en dur.
//
//   node scripts/v240-passage-vous.js           # DRY-RUN : affiche tout
//   node scripts/v240-passage-vous.js --write   # applique
//
// ── Les 4 pièges que ce script évite (tous trouvés en dry-run) ──────────────
// 1. IDENTIFIANTS. `name: 'divorce', description: 'Divorcer de ton époux…'` :
//    une règle naïve sur la ligne entière renommait la SOUS-COMMANDE Discord en
//    `name: 'divorcez'` → commande cassée. 144 lignes du dossier mélangent un
//    identifiant et du texte sur la même ligne.
//    → on ne transforme QUE l'intérieur des littéraux de chaîne, et on saute
//      tout littéral « identifiant-like » (/^[a-z0-9_\-]+$/i : ni espace, ni
//      accent, ni emoji, ni ponctuation).
// 2. CASCADES. « Choisis »→« Sélectionnez » puis « Sélectionne »→« Sélectionnez »
//    donnait « Sélectionnezz ». → règles bornées `(?<!\p{L})…(?![\p{L}\p{N}])`.
// 3. ORDRE. « Tu »→« Vous » avant « Tu es »→« Vous êtes » donnait « Vous es ».
//    → locutions longues AVANT les mots seuls.
// 4. RÉFLÉCHIS / 3ᵉ PERSONNE. « Cette commande se configure » devenait
//    « se configurez » ; « {a} corrige {b} » (roleplay) et « Je ne peux pas
//    expulser » (1ʳᵉ personne) ne sont pas des ordres.
//    → garde `(?<!\bse )` sur les verbes + SKIP_LINE sur les motifs connus.
//    NB : le `\b` est indispensable — sans lui, « InverSE TON texte » était
//    épargné parce que « Inverse » se termine par « se ».
// 5. INTERPOLATIONS. `${…}` contient du CODE : `.replace('T', ' ')` faisait
//    matcher `t'`. → les interpolations sont retirées avant détection.
// ============================================================================
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const WRITE = process.argv.includes('--write');
// Cible par défaut : les textes du bot. `--public` ajoute le dashboard, qui est
// la même surface produit et doit parler avec le même ton.
const argPublic = process.argv.includes('--public');
const DIR = path.join(__dirname, '..', 'server', 'discord');
const CIBLES = argPublic
  ? [...fs.readdirSync(DIR).filter((x) => x.endsWith('.js')).map((f) => path.join(DIR, f)),
     path.join(__dirname, '..', 'public', 'js', 'dashboard.js')]
  : fs.readdirSync(DIR).filter((x) => x.endsWith('.js')).map((f) => path.join(DIR, f));

const B = '(?<![\\p{L}])';
// Garde PERSONNE : évite « je sais » → « je savez » (1ʳᵉ personne) et les
// 3ᵉ personnes (« le bot envoie »). `\b` indispensable : sans lui « InverSE TON »
// était épargné.
const NOREF = /(?<!\bse )/.source + /(?<!\bs\\?')/.source + /(?<!\bS\\?')/.source +
  /(?<!\bje )(?<!\bJe )(?<!\bj')(?<!\bJ')/.source +
  /(?<!\bil )(?<!\bIl )(?<!\belle )(?<!\bElle )(?<!\bon )(?<!\bOn )/.source;
const E = '(?![\\p{L}\\p{N}])';
const W = (w, to) => [new RegExp(B + NOREF + w + E, 'gu'), to];

// ── PHASE 1 — locutions complètes ───────────────────────────────────────────
const PHRASES = [
  [/Pourquoi es-tu AFK \?/gu, 'Pourquoi êtes-vous AFK ?'],
  [/Pourquoi ouvres-tu ce ticket \?/gu, 'Pourquoi ouvrez-vous ce ticket ?'],
  [/Quel panneau veux-tu modifier \?/gu, 'Quel panneau voulez-vous modifier ?'],
  [/Je te souhaiterai ton anniversaire/gu, 'Je vous souhaiterai votre anniversaire'],
  [/le bot te souhaite le jour J/gu, 'le bot vous souhaite le jour J'],
  [/il recevra ta réponse/gu, 'il recevra votre réponse'],
  [/te demande en mariage/gu, 'vous demande en mariage'],
  [/N’hésite pas à améliorer ta candidature/gu, 'N’hésitez pas à améliorer votre candidature'],
  [/Réponds vite/gu, 'Répondez vite'],
  [/Réponds ici/gu, 'Répondez ici'],
  [/Ajoute-moi à ton serveur/gu, 'Ajoutez-moi à votre serveur'],
  [/Ajoute tes questions/gu, 'Ajoutez vos questions'],
  [/puis envoie le panneau/gu, 'puis envoyez le panneau'],
  [/Corrige les types/gu, 'Corrigez les types'],
  [/Rejoins-le maintenant/gu, 'Rejoignez-le maintenant'],
  [/Rejoins un salon existant/gu, 'Rejoignez un salon existant'],
  [/Ouvre ton ticket et réponds/gu, 'Ouvrez votre ticket et répondez'],
  [/ou écris le tien/gu, 'ou écrivez le vôtre'],
  [/Lance la tienne/gu, 'Lancez la vôtre'],
  [/Demande quelqu\\?'un en mariage/gu, 'Demandez quelqu’un en mariage'],
  [/(?:autre que|Autre que) toi/gu, 'autre que vous'],
  [/Relance `/gu, 'Relancez `'],
  [/Configure d[’']abord/gu, 'Configurez d’abord'],
  [/Donne un nom à ton/gu, 'Donnez un nom à votre'],
  [/Donne le nom du type/gu, 'Donnez le nom du type'],
  [/Donne un nom au type/gu, 'Donnez un nom au type'],
  [/le tien si tu ne précises/gu, 'le vôtre si vous ne précisez'],
  [/\*\*Ouvre votre galerie\*\*/gu, '**Ouvrez votre galerie**'],
  [/\*\*Ouvre ta galerie/gu, '**Ouvrez votre galerie'],
  // Verbes AMBIGUS → règles ciblées uniquement, jamais de règle globale :
  //   « ouvre »  : « l'option « image » ouvre votre galerie » = 3ᵉ personne
  //   « active » : « Blacklist active sur ce serveur »        = adjectif
  //   « envoie » : « le bot t'envoie un message »             = 3ᵉ personne
  [/\bOuvre ton\b/gu, 'Ouvrez votre'],
  [/\bOuvre ta\b/gu, 'Ouvrez votre'],
  [/\bactive «/gu, 'activez «'],
  [/\bActive «/gu, 'Activez «'],
  [/créé-en un nouveau, ou termine\./gu, 'créez-en un nouveau, ou terminez.'],
  [/crées-en une\./gu, 'créez-en une.'],
  [/puis redémarre ce bot/gu, 'puis redémarrez ce bot'],
  // Backtick ÉCHAPPÉ : dans un template, la commande s'écrit  tape \`/x\`
  // → la règle doit accepter un backslash optionnel devant le backtick.
  [/\btape (\\?`)/gu, 'tapez $1'],
  [/\bTape (\\?`)/gu, 'Tapez $1'],
  [/\bEnvoie le panneau/gu, 'Envoyez le panneau'],
  [/\bContinue avec «/gu, 'Continuez avec «'],
  [/ou envoie la suite/gu, 'ou envoyez la suite'],
  // ── Relevés par la PASSE DE CONCORDANCE : textes déjà passés au « vous »
  //    mais dont le verbe était resté au singulier (« Achète … avec vos coins »).
  [/\bAchète un article avec vos coins/gu, 'Achetez un article avec vos coins'],
  [/\bachète des rôles avec vos coins/gu, 'achetez des rôles avec vos coins'],
  [/\bGagne de l'XP en discutant/gu, "Gagnez de l'XP en discutant"],
  [/\bPersonnalise le bot sur CE serveur/gu, 'Personnalisez le bot sur CE serveur'],
  [/\benvoie la photo\)/gu, 'envoyez la photo)'],
  [/\benvoie la photo ici/gu, 'envoyez la photo ici'],
  [/\bdemande à un administrateur/gu, 'demandez à un administrateur'],
  [/\bEnregistre votre date/gu, 'Enregistrez votre date'],
  // « divorce » est AUSSI un nom (« 💔 Divorce enregistré », « Divorce possible à
  // tout moment ») et un nom de commande (`/divorce`) → règle globale interdite.
  [/Divorce d\\?'abord/gu, "Divorcez d'abord"],
  [/Divorce d’abord/gu, 'Divorcez d’abord'],
  [/Article introuvable\. Vois la boutique/gu, 'Article introuvable. Consultez la boutique'],
  [/\bDemande un membre en mariage/gu, 'Demander un membre en mariage'],
  [/\bajoute une explication professionnelle/gu, 'ajoutez une explication professionnelle'],
  // ── Dashboard (v240) : verbes AMBIGUS → règles ciblées uniquement.
  //    « règle » est un NOM omniprésent dans l'auto-mod ; « crée », « importe »,
  //    « commence », « active », « envoie » existent tous à la 3ᵉ personne.
  [/\bCommence par le support/gu, 'Commencez par le support'],
  [/\bImporte la (?:vôtre|tienne)/gu, 'Importez la vôtre'],
  [/\bPersonnalise le message affiché/gu, 'Personnalisez le message affiché'],
  [/\bEnvoie un vrai message piégé/gu, 'Envoyez un vrai message piégé'],
  [/\bEnvoie-les sur Discord/gu, 'Envoyez-les sur Discord'],
  [/ou utilise ✏️/gu, 'ou utilisez ✏️'],
  [/\bActive avec \/modlogs/gu, 'Activez avec /modlogs'],
  [/\bActive des commandes en un clic/gu, 'Activez des commandes en un clic'],
  [/\bActive le modmail/gu, 'Activez le modmail'],
  [/et envoie le panneau dédié/gu, 'et envoyez le panneau dédié'],
  [/\bva voir le salon/gu, 'allez voir le salon'],
  [/\bTape un mot-clé/gu, 'Tapez un mot-clé'],
  [/puis ouvre un module/gu, 'puis ouvrez un module'],
  [/\bconfigure BOTDEV_GH_TOKEN/gu, 'configurez BOTDEV_GH_TOKEN'],
  [/\bCrée tes propres quiz, choisis le salon, règle les points/gu,
    'Créez vos propres quiz, sélectionnez le salon, réglez les points'],
  [/\bDésactive un quiz/gu, 'Désactivez un quiz'],
  [/\bCrée ton premier tournoi/gu, 'Créez votre premier tournoi'],
  [/\bCompose un panneau complet/gu, 'Composez un panneau complet'],
  [/\bEnregistre le lien TikTok/gu, 'Enregistrez le lien TikTok'],
  [/\bSauvegarde tes constructions/gu, 'Sauvegardez vos constructions'],
  [/\bEnregistre tes réglages/gu, 'Enregistrez vos réglages'],
  [/\bEnregistre ton annonce/gu, 'Enregistrez votre annonce'],
  // « continue » = 3ᵉ personne dans « le bot continue de tourner » → ciblé.
  [/🔥 continue !/gu, '🔥 continuez !'],
  [/\bTape `/gu, 'Tapez `'],
  [/envoie la photo ici/gu, 'envoyez la photo ici'],
  [/envoie-la ici/gu, 'envoyez-la ici'],
  [/puis envoie le panneau/gu, 'puis envoyez le panneau'],
];

// ── PHASE 2 — verbes : 2ᵉ personne singulier → pluriel ──────────────────────
// Absents volontairement (ambigus) : « note » (nom = évaluation), « dis »,
// « trouve », « tape » (nom), « règle » (nom), « ouvre » (« la galerie s’ouvre »),
// « envoie » (« le bot t’envoie » = 3ᵉ personne).
const VERBES = [
  ['es', 'êtes'], ['as', 'avez'], ['peux', 'pouvez'], ['veux', 'voulez'],
  ['fais', 'faites'], ['vas', 'allez'], ['sais', 'savez'], ['vois', 'voyez'],
  ['dois', 'devez'], ['aimes', 'aimez'], ['penses', 'pensez'],
  ['devrais', 'devriez'], ['seras', 'serez'], ['auras', 'aurez'],
  ['recevras', 'recevrez'], ['répondras', 'répondrez'],
  ['reçois', 'recevez'], ['perds', 'perdez'], ['voles', 'volez'],
  ['doubles', 'doublez'], ['atteins', 'atteignez'], ['ouvres', 'ouvrez'],
  ['écris', 'écrivez'], ['précises', 'précisez'], ['demandes', 'demandez'],
  ['attends', 'attendez'], ['pourras', 'pourrez'], ['reviens', 'revenez'],
  ['crées', 'créez'], ['quitte', 'quittez'], ['précise', 'précisez'],
  ['parie', 'pariez'], ['gère', 'gérez'], ['lance', 'lancez'],
  ['essaie', 'essayez'], ['choisis', 'choisissez'], ['clique', 'cliquez'],
  ['sélectionne', 'sélectionnez'], ['relance', 'relancez'],
  ['mentionne', 'mentionnez'], ['ajoute', 'ajoutez'], ['corrige', 'corrigez'],
  ['réessaie', 'réessayez'], ['réponds', 'répondez'], ['rejoins', 'rejoignez'],
  ['configure', 'configurez'], ['explique', 'expliquez'],
  ['touche', 'touchez'], ['regarde', 'regardez'], ['évalue', 'évaluez'],
  ['laisse', 'laissez'], ['mets', 'mettez'], ['prends', 'prenez'],
  ['viens', 'venez'], ['pars', 'partez'], ['donne', 'donnez'], ['joins', 'joignez'], ['redémarre', 'redémarrez'],
  // v240 dashboard — 2sg sûres (jamais noms, jamais 3ᵉ personne dans ce dépôt)
  ['gères', 'gérez'], ['décris', 'décrivez'], ['pense', 'pensez'],
  ['synchronise', 'synchronisez'], ['découvre', 'découvrez'],
  ['construis', 'construisez'], ['appuie', 'appuyez'],
  ['termine', 'terminez'],
];
const PHASE2 = [];
for (const [s1, s2] of VERBES) {
  PHASE2.push(W(s1, s2));
  const cap = s1[0].toUpperCase() + s1.slice(1);
  const cap2 = s2[0].toUpperCase() + s2.slice(1);
  if (cap !== s1) PHASE2.push(W(cap, cap2));
}

// ── PHASE 3 — pronoms et possessifs ─────────────────────────────────────────
const PHASE3 = [
  [/\\?t\\?'(?=\p{L})/gu, 'vous '],   // élision, avec ou sans backslash d'échappement
  W('Tu', 'Vous'), W('tu', 'vous'),
  W('TU', 'VOUS'), W('TON', 'VOTRE'), W('TA', 'VOTRE'), W('TES', 'VOS'),
  W('Ton', 'Votre'), W('ton', 'votre'),
  W('Ta', 'Votre'), W('ta', 'votre'),
  W('Tes', 'Vos'), W('tes', 'vos'), W('TES', 'VOS'),
  W('toi', 'vous'), W('Toi', 'Vous'),
  W('te', 'vous'), W('Te', 'Vous'),
  W('tien', 'vôtre'), W('Tien', 'Vôtre'),
  W('tienne', 'vôtre'), W('tiens', 'vôtres'),
];

const RULES = [...PHRASES, ...PHASE2, ...PHASE3];

// ── Exclusions : 3ᵉ personne, 1ʳᵉ personne, roleplay ────────────────────────
const SKIP_LINE = [
  /Donne automatiquement un ou PLUSIEURS rôles/,
  /Je ne peux pas (expulser|bannir|mettre)/,
  /Verrouille ou rouvre tous les salons/,
  /\{a\}|\{b\}/,
  // NB : pas de filtre « commentaire » ici — il s'appliquait au CORPS des
  // littéraux et sautait toute chaîne commençant par `**` (gras markdown).
  // Les commentaires // et /* */ sont déjà exclus par le parseur.
];

const TU_DETECT = new RegExp(B + "(tu|ton|ta|tes|toi|t')" + E + '|' + B + NOREF +
  '(sélectionne|clique|regarde|évalue|choisis|relance|essaie|rejoins|pars|viens|donne|reçois|peux|veux|seras|auras|écris|mentionne|ajoute|corrige|réponds|attends|réessaie|configure|précises|penses|devrais|aimes|dois|sais|fais|vas|demandes|touche|explique|mets|prends|laisse|quitte|lance|parie|gère|reviens|crées|répondras|recevras|ouvres|atteins|doubles|voles|perds|tape|ouvre|active|envoie|joins|redémarre|termine|gères|décris|pense|synchronise|découvre|construis|appuie|continue|compose|crée|importe|sauvegarde|enregistre|désactive|utilise|règle|va)' + E, 'iu');

// Un littéral « identifiant-like » n'est jamais de la prose : ni espace, ni
// accent, ni emoji, ni ponctuation. C'est ce qui protège `name: 'divorce'`.
const IDENTIFIANT = /^[a-z0-9_\-]+$/i;

// Clés dont la valeur est TOUJOURS un identifiant technique.
const CLES_INTERDITES = new Set(['custom_id', 'customId', 'emoji', 'style', 'id', 'url', 'icon_url', 'avatar_url', 'type']);

/**
 * Retourne l'indice JUSTE APRÈS le `}` qui ferme une interpolation `${…}`.
 *
 * Indispensable : le dashboard contient des TEMPLATES IMBRIQUÉS —
 *   App.el(`<div class="x${o.selected ? ' is-selected' : ''}">
 *     ${icoContent ? `<span>${icoContent}</span>` : ''}
 *   </div>`)
 * Sans ce scanner, le backtick du template interne fermait le template externe
 * et tout le reste du fichier était décalé → du CODE était transformé
 * (`st.joins` → `st.joignez`).
 */
function finInterpolation(source, debut) {
  const n = source.length;
  let i = debut + 2;            // saute « ${ »
  let prof = 1;
  while (i < n) {
    const c = source[i];
    if (c === '\\') { i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (q === '`' && source[i] === '$' && source[i + 1] === '{') { i = finInterpolation(source, i); continue; }
        if (source[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '{') { prof++; i++; continue; }
    if (c === '}') { prof--; i++; if (prof === 0) return i; continue; }
    i++;
  }
  return n;
}

/**
 * Découpe un FICHIER ENTIER en segments code / littéraux de chaîne.
 * Un littéral peut traverser plusieurs lignes (template `…`) : c'est exactement
 * ce que le parseur ligne-à-ligne ratait.
 */
function segments(source) {
  const out = [];
  let i = 0; let code = ''; let ligne = 1;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === '\n') { code += c; ligne++; i++; continue; }
    // Commentaires : à laisser intacts (ils ne sont jamais envoyés à personne).
    if (c === '/' && source[i + 1] === '/') {
      const j = source.indexOf('\n', i);
      const fin = j < 0 ? n : j;
      code += source.slice(i, fin); i = fin; continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const j = source.indexOf('*/', i + 2);
      const fin = j < 0 ? n : j + 2;
      const bloc = source.slice(i, fin);
      ligne += (bloc.match(/\n/g) || []).length;
      code += bloc; i = fin; continue;
    }
    // Regex littérale : `/` qui n'est ni un commentaire ni une division.
    // Heuristique classique — si le dernier caractère de code significatif est
    // un opérateur/ouvrant, c'est une regex ; sinon c'est une division.
    if (c === '/') {
      const avant = code.replace(/\s+$/, '');
      const prec = avant ? avant[avant.length - 1] : '';
      const estRegex = prec === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prec) ||
        /(?:return|typeof|case|in|of|new|delete|void|throw|instanceof)$/.test(avant);
      if (estRegex) {
        let j = i + 1; let classe = false;
        while (j < n) {
          const d = source[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') break;                       // une regex ne traverse pas les lignes
          if (d === '[') classe = true;
          else if (d === ']') classe = false;
          else if (d === '/' && !classe) break;
          j++;
        }
        if (j < n && source[j] === '/') {
          j++;
          while (j < n && /[dgimsuvy]/.test(source[j])) j++;   // drapeaux
          code += source.slice(i, j); i = j; continue;
        }
      }
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c; const debutLigne = ligne; let j = i + 1; let body = ''; let ferme = false;
      while (j < n) {
        if (source[j] === '\\') { body += source[j] + (source[j + 1] || ''); j += 2; continue; }
        if (source[j] === quote) { ferme = true; break; }
        // Interpolation `${…}` : elle peut contenir un AUTRE template. On la
        // saute d'un bloc, sinon son backtick fermait le template courant.
        if (quote === '`' && source[j] === '$' && source[j + 1] === '{') {
          const fin = finInterpolation(source, j);
          const bloc = source.slice(j, fin);
          ligne += (bloc.match(/\n/g) || []).length;
          body += bloc; j = fin; continue;
        }
        if (source[j] === '\n') ligne++;
        body += source[j]; j++;
      }
      out.push({ kind: 'code', text: code }); code = '';
      out.push({ kind: 'str', quote, body, ferme, ligne: debutLigne });
      i = ferme ? j + 1 : j;
    } else { code += c; i++; }
  }
  out.push({ kind: 'code', text: code });
  return out;
}

/** Clé JS qui précède immédiatement un littéral (« name: 'x' » → « name »). */
function cleAvant(code) {
  const m = code.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  return m ? m[1] : null;
}

/** Retire le code des interpolations `${…}` : ce n'est pas de la prose. */
function sansInterpolation(txt) { return txt.replace(/\$\{[^}]*\}/g, ' '); }

function detecte(txt) { return TU_DETECT.test(sansInterpolation(txt)); }

/**
 * Transforme les littéraux à l'intérieur d'une interpolation `${…}`.
 *
 * Le code lui-même n'est jamais touché, mais il embarque souvent de la PROSE :
 *   ${App.escapeHtml('Ex : Merci d\'avoir contacté le support ! Ta demande…')}
 *   ${x || '<span class="ca-placeholder">Ton message apparaîtra ici…</span>'}
 * Protéger l'interpolation en bloc laissait ces textes au tutoiement.
 */
function transformeInterpolation(code) {
  let out = '';
  for (const s of segments(code)) {
    if (s.kind === 'code') { out += s.text; continue; }
    if (!s.ferme) { out += s.quote + s.body; continue; }
    const brut = s.body.replace(/\\'/g, "'").replace(/\\"/g, '"');
    const cle = cleAvant(out.slice(out.lastIndexOf('\n') + 1));
    if (CLES_INTERDITES.has(cle) || IDENTIFIANT.test(brut.trim()) || SKIP_LINE.some((r) => r.test(brut))) {
      out += s.quote + s.body + s.quote; continue;
    }
    out += s.quote + transformeCorps(s.body, s.quote) + s.quote;
  }
  return out;
}

/**
 * Applique les règles à un corps de littéral.
 * Dans un template, les interpolations `${…}` sont du CODE : les transformer
 * pourrait renommer une variable. On ne touche donc que le texte autour.
 */
function transformeCorps(body, quote) {
  // Piège MAJEUR : dans une chaîne à simple quote, le saut de ligne s'écrit
  // `\n` (2 caractères). Le « n » est une LETTRE pour `(?<![\p{L}])`, donc
  // « …!\nTu es le membre » n'était JAMAIS transformé — silencieusement.
  // On remplace chaque échappement par U+0000 (ni lettre ni chiffre : il
  // satisfait les deux bornes), on applique les règles, puis on restaure.
  const applique = (txt) => {
    const sauve = [];
    let r = txt.replace(/\\[ntr]/g, (m) => { sauve.push(m); return '\u0000'; });
    for (const [from, to] of RULES) r = r.replace(from, to);
    return r.replace(/\u0000/g, () => sauve.shift());
  };
  if (quote !== '`') return applique(body);
  // Même logique que segments() : on ne transforme que le TEXTE entre les
  // interpolations, jamais le code à l'intérieur des `${…}`.
  let out = ''; let i = 0; let texte = '';
  while (i < body.length) {
    if (body[i] === '\\') { texte += body[i] + (body[i + 1] || ''); i += 2; continue; }
    if (body[i] === '$' && body[i + 1] === '{') {
      const fin = finInterpolation(body, i);
      out += applique(texte); texte = '';
      out += transformeInterpolation(body.slice(i, fin));
      i = fin; continue;
    }
    texte += body[i]; i++;
  }
  return out + applique(texte);
}

function transformeFichier(source, nom) {
  const segs = segments(source);
  const changes = [];
  let out = '';
  let ligneCourante = 1;

  for (const s of segs) {
    if (s.kind === 'code') {
      ligneCourante += (s.text.match(/\n/g) || []).length;
      out += s.text;
      continue;
    }
    const brut = s.body.replace(/\\'/g, "'").replace(/\\"/g, '"');
    const cle = cleAvant(out.slice(out.lastIndexOf('\n') + 1));
    // Un littéral jamais refermé ne doit JAMAIS être re-recollé avec sa quote :
    // c'est ce qui ajoutait un backtick fantôme. On le laisse tel quel.
    if (!s.ferme) { out += s.quote + s.body; ligneCourante += (s.body.match(/\n/g) || []).length; continue; }

    // Pas de filtre préalable : on applique les règles et on regarde si ça bouge.
    // (Un filtre basé sur une liste de verbes oubliait systématiquement les
    //  règles ajoutées après coup — « Achète », « Gagne », « Personnalise »….)
    const skip = CLES_INTERDITES.has(cle) || IDENTIFIANT.test(brut.trim()) ||
      SKIP_LINE.some((r) => r.test(brut));

    if (skip) { out += s.quote + s.body + s.quote; ligneCourante += (s.body.match(/\n/g) || []).length; continue; }

    const t = transformeCorps(s.body, s.quote);
    out += s.quote + t + s.quote;
    ligneCourante += (s.body.match(/\n/g) || []).length;
    if (t !== s.body) {
      let d = 0;
      while (d < Math.min(s.body.length, t.length) && s.body[d] === t[d]) d++;
      const zone = (str) => { const a = Math.max(0, d - 40); return (a ? '…' : '') + str.slice(a, d + 85).trim().replace(/\n/g, ' ⏎ '); };
      changes.push({ ligne: s.ligne, avant: zone(s.body), apres: zone(t) });
    }
  }
  return { out, changes };
}

let total = 0;
const rapport = [];

for (const p of CIBLES) {
  const f = path.basename(p);
  const src = fs.readFileSync(p, 'utf8');
  const { out, changes } = transformeFichier(src, f);
  if (!changes.length) continue;
  // Filet de sécurité : le nombre de quotes doit être STRICTEMENT identique,
  // sinon on a ajouté/retiré un délimiteur → on refuse d'écrire.
  // NB : on ne vérifie PAS les apostrophes — la règle d'élision « t' » → « vous »
  // en retire légitimement. Backticks et guillemets doubles, eux, ne doivent
  // jamais varier : toute différence = délimiteur fantôme.
  const q = (str, ch) => str.split(ch).length - 1;
  let sain = true;
  for (const ch of ['`', '"']) {
    if (q(src, ch) !== q(out, ch)) {
      console.error(`  ⛔ ${f} : nombre de « ${ch} » modifié (${q(src, ch)} → ${q(out, ch)}) — écriture refusée`);
      sain = false;
    }
  }
  if (!sain) { process.exitCode = 1; continue; }
  // Garantie dure : le résultat doit compiler. Toute désync de parseur qui
  // aurait abîmé le code est bloquée ici, avant l'écriture.
  try { new vm.Script(out, { filename: f }); }
  catch (e) { console.error(`  ⛔ ${f} : le résultat ne compile pas (${e.message}) — écriture refusée`); process.exitCode = 1; continue; }
  total += changes.length;
  rapport.push({ f, changes, nouveau: out });
  if (WRITE) fs.writeFileSync(p, out);
}

// ── Vérification : ce qui tutoie ENCORE, littéral par littéral ──────────────
let reste = 0;
for (const { f, nouveau } of rapport) {
  for (const s of segments(nouveau)) {
    if (s.kind !== 'str' || !s.ferme) continue;
    const brut = s.body.replace(/\\'/g, "'");
    if (IDENTIFIANT.test(brut.trim())) continue;
    if (SKIP_LINE.some((r) => r.test(brut))) continue;
    if (detecte(brut)) { reste++; console.log(`   ⚠️  ${f}:${s.ligne} — « ${brut.slice(0, 130)} »`); }
  }
}

for (const { f, changes } of rapport) {
  console.log(`\n══ ${f} (${changes.length}) ══`);
  for (const c of changes) {
    console.log(`   ${String(c.ligne).padStart(5)}  − ${c.avant}`);
    console.log(`   ${String(c.ligne).padStart(5)}  + ${c.apres}`);
  }
}
console.log('\n════════════════════════════════════════════════════════════');
console.log(`  Lignes modifiées : ${total}   ·   ${WRITE ? 'ÉCRIT' : 'DRY-RUN (rien n\u2019a été écrit)'}`);
console.log(`  Tutoiement restant : ${reste}`);
console.log('════════════════════════════════════════════════════════════');
