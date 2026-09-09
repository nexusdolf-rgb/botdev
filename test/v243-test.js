// ============================================================================
// Test v243 — Détection de phishing / faux Nitro.
//
// Deuxième des 10 fonctions manquantes face aux bots professionnels.
//
// Ce que Hoxera avait avant : la règle `am_links`, un interrupteur brut qui
// bloque TOUS les liens https://. Aucune détection d'arnaque.
//
// Choix validés par l'utilisateur :
//   - réaction : suppression + BANNISSEMENT ;
//   - liste de domaines embarquée (21 908 entrées publiques, mars 2024) ;
//   - les 5 signaux, propagation multi-salons comprise.
//
// Parce que le bannissement a été retenu, ce test porte d'abord sur les
// GARDE-FOUS : la réaction dure est réservée aux signaux à certitude HAUTE
// (liste noire, typosquat, propagation). Les signaux MOYENS (domaine-appât,
// expression d'arnaque) suppriment et avertissent sans jamais bannir.
//
// Fait vérifié pendant le développement : les deux listes publiques de
// référence sont périmées (mars et octobre 2024). La liste embarquée est donc
// traitée comme un bonus à certitude élevée, pas comme le signal principal —
// ce sont les heuristiques qui attrapent les domaines jamais vus.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v243-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const phishing = require('../server/discord/phishing');
const automod = require('../server/discord/automod');
const i18n = require('../server/i18n');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f) => racine(f).split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
const BOT_ID = String(BOT.id || BOT);
const GUILD = 'G243';

// Active l'auto-modération avec la règle phishing et une action donnée.
function activer(action = 'ban', over = {}) {
  store.guildSettings.set(BOT_ID, GUILD, {
    am_enabled: 1,
    am_phishing: 1,
    am_phishing_allow: '',
    am_links: 0,          // volontairement éteint : le phishing doit suffire
    am_caps: 0,
    am_mentions: 0,
    am_spam: 0,
    am_rule_actions: JSON.stringify({ phishing: action }),
    ...over,
  });
}

const sig = (texte, opts) => phishing.analyze(texte, opts || {});

// ============================================================================

(async () => {
  console.log('\n🎣 v243 — Détection de phishing / faux Nitro\n');

  // --------------------------------------------------------------------------
  console.log('1) Liste noire embarquée');
  // --------------------------------------------------------------------------
  {
    const dom = phishing.blacklistDomains();
    const urls = phishing.blacklistUrls();
    check('fichier de domaines présent', fs.existsSync(path.join(__dirname, '..', 'server/data/phishing-domains.txt')));
    check('fichier d’URL précises présent', fs.existsSync(path.join(__dirname, '..', 'server/data/phishing-urls.txt')));
    check('plus de 20 000 domaines chargés', dom.size > 20000, String(dom.size));
    check('URL précises chargées', urls.size > 0, String(urls.size));
    check('chargement paresseux renvoie le même jeu', phishing.blacklistDomains() === dom);

    // Aucune entrée ne doit être un domaine légitime.
    let legit = 0;
    for (const d of ['discord.com', 'discord.gg', 'discord.gift', 'discordapp.com',
      'steamcommunity.com', 'steampowered.com', 'youtube.com', 'google.com', 'github.com']) {
      if (dom.has(d)) legit++;
    }
    check('aucun domaine légitime dans la liste noire', legit === 0, `${legit} trouvé(s)`);
    check('toutes les entrées sont en minuscules et non vides',
      [...dom].every((d) => d && d === d.toLowerCase()));
  }

  // --------------------------------------------------------------------------
  console.log('\n2) Signal A — domaine d’arnaque connu');
  // --------------------------------------------------------------------------
  {
    const r = sig('Viens voir 101nitro.com');
    check('domaine blacklisté détecté', !!r && r.signal === 'A', r && r.signal);
    check('domaine blacklisté → certitude HAUTE', r && r.confidence === 'high');
    check('le domaine est remonté dans le résultat', r && r.host === '101nitro.com', r && r.host);

    // PIÈGE : jamais de recherche par sous-chaîne. Un domaine légitime qui
    // CONTIENT un domaine blacklisté ne doit pas être signalé.
    const sousChaine = sig('Voir https://mon-101nitro.com.example.fr/page');
    check('pas de correspondance par sous-chaîne', !sousChaine || sousChaine.signal !== 'A',
      sousChaine && sousChaine.signal);

    // Un sous-domaine d'un domaine blacklisté DOIT être attrapé.
    const sub = sig('offre sur promo.101nitro.com');
    check('sous-domaine d’un domaine blacklisté détecté', !!sub && sub.signal === 'A', sub && sub.signal);
  }

  // --------------------------------------------------------------------------
  console.log('\n3) Liste blanche : les domaines officiels ne sont JAMAIS signalés');
  // --------------------------------------------------------------------------
  {
    const legitimes = [
      'Le règlement est sur discord.com/rules',
      'Rejoins-nous : discord.gg/hoxera',
      'Ton cadeau : discord.gift/abc123',
      'Vidéo : youtube.com/watch?v=dQw4w9WgXcQ',
      'Le bot : top.gg/bot/hoxera',
      'Mon profil steamcommunity.com/id/moi',
      'Le jeu : store.steampowered.com/app/730',
      'discordapp.com/api/webhooks/123',
      'Dépôt : github.com/nexusdolf-rgb/botdev',
      'Recherche : google.com/search?q=discord',
      'Docs : discord.dev/developers/docs',
      'Statut : discordstatus.com',
    ];
    let faux = 0;
    for (const m of legitimes) {
      const r = sig(m);
      if (r) { faux++; console.log(`      ↳ faux positif ${r.signal} sur : ${m}`); }
    }
    check(`${legitimes.length} messages légitimes → 0 faux positif`, faux === 0, `${faux} faux positif(s)`);

    // isAllowed doit accepter les sous-domaines officiels…
    check('sous-domaine officiel autorisé', phishing.isAllowed('support.discord.com') === true);
    check('sous-domaine steam autorisé', phishing.isAllowed('help.steampowered.com') === true);
    // …mais PAS un domaine officiel détourné en préfixe.
    check('PIÈGE : discord.com.attacker.xyz n’est PAS autorisé',
      phishing.isAllowed('discord.com.attacker.xyz') === false);
    check('PIÈGE : steampowered.com.evil.ru n’est PAS autorisé',
      phishing.isAllowed('steampowered.com.evil.ru') === false);
    check('PIÈGLE évité : notdiscord.com n’est pas autorisé',
      phishing.isAllowed('notdiscord.com') === false);

    // Liste blanche personnalisée par serveur.
    check('domaine ajouté par le serveur est autorisé',
      phishing.isAllowed('partenaire.com', ['partenaire.com']) === true);
    check('sous-domaine du domaine ajouté est autorisé',
      phishing.isAllowed('blog.partenaire.com', ['partenaire.com']) === true);
    const r2 = sig('Offre sur partenaire.com/promo', { allow: ['partenaire.com'] });
    check('lien du domaine autorisé → rien', !r2, r2 && r2.signal);
  }

  // --------------------------------------------------------------------------
  console.log('\n4) Signal B — imitation de marque (typosquatting)');
  // --------------------------------------------------------------------------
  {
    const cas = [
      ['dlscord.com/nitro', 'l minuscule au lieu du i'],
      ['disc0rd.gift/claim', 'zéro au lieu du o'],
      ['dicsord-nitro.ru', 'lettres inversées'],
      ['discrod.com', 'transposition'],
      ['d1scord.xyz', 'chiffre 1'],
      ['steamcornmunity.com/gift', 'm au lieu de mm'],
    ];
    let pris = 0;
    for (const [m, pourquoi] of cas) {
      const r = sig('Cadeau : ' + m);
      if (r && (r.signal === 'B' || r.signal === 'A')) pris++;
      else console.log(`      ↳ raté (${pourquoi}) : ${m}`);
    }
    check(`${cas.length}/${cas.length} imitations détectées`, pris === cas.length, `${pris}/${cas.length}`);
    // Un domaine peut être attrapé par la liste noire (A) AVANT l'imitation
    // (B) : les deux sont à certitude haute, l'important est le niveau.
    const rIm = sig('Voir discrad-not-in-list-2026.xyz');
    check('typosquat détecté', !!rIm && (rIm.signal === 'B' || rIm.signal === 'A'), rIm && rIm.signal);
    check('typosquat → certitude HAUTE', !!rIm && rIm.confidence === 'high', rIm && rIm.confidence);
    check('la marque imitée est identifiée', rIm && rIm.brand === 'discord', rIm && rIm.brand);

    // GARDE 1 — un libellé commençant par une marque correctement épelée est un
    // mot composé, pas une imitation. « discordapi » est à distance 1 de
    // « discordapp » : sans cette garde, ban injuste.
    for (const h of ['discordapi.info', 'discordtemplates.com', 'discordlist.com', 'nitrotype.com']) {
      const r = sig('Voir ' + h);
      check(`GARDE 1 : ${h} non signalé`, !r, r && `${r.signal}/${r.reason} conf=${r.confidence}`);
    }
    // La garde porte sur le DÉBUT du libellé : « discrodnitro2026 » contient
    // « nitro » mais pas en tête, la faute « discrod » doit rester détectée.
    check('GARDE 1 n’affaiblit pas la détection en milieu de libellé',
      !!sig('Voir discrodnitro2026.top'), 'rien');

    // GARDE 2 — la marque épelée correctement ailleurs dans le domaine.
    for (const h of ['mydiscordserver.com', 'discordmeme.com', 'discordbotlist.com']) {
      const r = sig('Voir ' + h);
      check(`GARDE 2 : ${h} non signalé`, !r, r && `${r.signal}/${r.reason}`);
    }
    // Mots du langage courant proches d'une marque.
    check('FAUX_AMIS : discourse.org non signalé', !sig('Voir discourse.org'));
    check('FAUX_AMIS : discordia.game non signalé', !sig('Voir discordia.game'));

    // Les gardes lisent le domaine BRUT : un homoglyphe cyrillique doit passer.
    const rCyr = sig('Voir d\u0456scord-app.com');
    check('homoglyphe cyrillique malgré la garde', !!rCyr && rCyr.confidence === 'high',
      rCyr && `${rCyr.signal}/${rCyr.reason}`);
    check('homoglyphe → raison dédiée', !!rCyr && rCyr.reason === 'homoglyphe', rCyr && rCyr.reason);

    // Homoglyphes : cyrillique et autres glyphes visuellement identiques.
    const cyr = sig('Cadeau : d\u0456scord-app.com');
    check('cyrillique (і) détecté', !!cyr && (cyr.signal === 'B' || cyr.signal === 'A'), cyr && cyr.signal);
    check('normalisation : cyrillique і → i latin',
      phishing.normalizeHost('d\u0456scord').includes('discord'));
    check('normalisation : 0 → o', phishing.normalizeHost('disc0rd') === 'discord');
    check('normalisation : l → i', phishing.normalizeHost('dlscord') === 'discord');
    check('normalisation retire le schéma', phishing.normalizeHost('https://Discord.COM/x') === 'discord.com');
  }

  // --------------------------------------------------------------------------
  console.log('\n5) Levenshtein borné');
  // --------------------------------------------------------------------------
  {
    check('distance 0 sur mots identiques', phishing.levenshtein('discord', 'discord') === 0);
    check('distance 1 sur une substitution', phishing.levenshtein('discord', 'discora') === 1);
    check('distance 2 sur transposition', phishing.levenshtein('discord', 'discrod') === 2);
    check('bornage : renvoie max+1 dès que c’est trop loin',
      phishing.levenshtein('discord', 'xxxxxxxxxxxxxxxx', 2) === 3);
    check('bornage : différence de longueur excessive coupée court',
      phishing.levenshtein('a', 'abcdefghijklmnopqrstuvwxyz', 2) === 3);
    check('chaîne vide contre mot', phishing.levenshtein('', 'abc') === 3);

    // levenshteinSlice renvoie un NOMBRE (distance minimale sur fenêtre
    // glissante), pas un booléen. C'est la régression qui faisait partir
    // n'importe quel domaine contenant une marque en signal C.
    const LS = phishing.levenshteinSlice;
    check('slice : renvoie un nombre', typeof LS('discorcl-gift', 'discord', 2) === 'number',
      String(typeof LS('discorcl-gift', 'discord', 2)));
    // « mydiscords » CONTIENT « discord » tel quel → distance 0.
    check('slice : sous-chaîne exacte → 0', LS('mydiscords', 'discord', 2) === 0,
      String(LS('mydiscords', 'discord', 2)));
    // « discorcl-gift » : meilleure fenêtre « discorcl » → 1 substitution.
    check('slice : fenêtre glissante → 1', LS('discorcl-gift', 'discord', 2) === 1,
      String(LS('discorcl-gift', 'discord', 2)));
    check('slice : trop loin → max+1', LS('xyz', 'discord', 2) === 3, String(LS('xyz', 'discord', 2)));
    check('slice : identique → 0', LS('discord', 'discord', 2) === 0);
    check('slice : haystack vide → longueur de la marque', LS('', 'abc', 2) === 3, String(LS('', 'abc', 2)));
    check('slice : needle vide → 0', LS('abc', '', 2) === 0);
  }

  // --------------------------------------------------------------------------
  console.log('\n6) Signal C — domaine-appât (marque + mot-appât)');
  // --------------------------------------------------------------------------
  {
    const r = sig('Profite : discord4free.com');
    check('domaine-appât détecté', !!r && (r.signal === 'C' || r.signal === 'A'), r && r.signal);
    check('domaine-appât → certitude MOYENNE', !!r && r.confidence === 'medium', r && r.confidence);
    check('domaine-appât → raison explicite', !!r && r.reason === 'domaine_appat', r && r.reason);

    // Exiger les DEUX évite de signaler des sites légitimes contenant la marque.
    const pasAppat = sig('Voir discordtemplates.com pour des modèles');
    check('marque seule sans appât → rien', !pasAppat, pasAppat && pasAppat.signal);
    const pasMarque = sig('Voir freebies.com pour des cadeaux');
    check('appât seul sans marque → rien', !pasMarque, pasMarque && pasMarque.signal);
    // Domaine nu, sans TLD : pas un domaine.
    check('domaine nu sans point → rien', !phishing.matchLure('discord'));
  }

  // --------------------------------------------------------------------------
  console.log('\n7) Signal D — expressions d’arnaque');
  // --------------------------------------------------------------------------
  {
    const r = sig('Free nitro ici : offre-speciale-2026.xyz');
    check('expression d’arnaque + lien inconnu → détecté', !!r, r && JSON.stringify(r));
    if (r) check('expression → certitude MOYENNE', r.confidence === 'medium', r.confidence);

    // Sans lien, ce n'est pas du phishing : on ne fait pas la police du texte.
    check('expression d’arnaque SANS lien → rien', !sig('Quelqu un a du free nitro ?'));
    // Avec un lien officiel seulement → rien (cas réel rencontré en développement).
    check('expression + lien discord.com officiel → rien',
      !sig('J ai gagné du nitro gratuit sur discord.com !'));
    // La liste blanche du serveur est honorée par le signal D aussi.
    check('expression + lien du domaine autorisé → rien',
      !sig('Free nitro sur partenaire.com', { allow: ['partenaire.com'] }));

    // Couverture français / anglais.
    const phrases = [
      ['nitro gratuit : site-bizarre.top', 'fr'],
      ['claim your nitro on weird-site.top', 'en'],
      ['steam gift : site-bizarre.top', 'en'],
      ['cadeau steam sur site-bizarre.top', 'fr'],
      ['your account will be deleted, verify here: site-bizarre.top', 'en'],
      ['ton compte va être supprimé, vérifie : site-bizarre.top', 'fr'],
      ['nitro airdrop : site-bizarre.top', 'en'],
      ['dernière chance : site-bizarre.top nitro', 'fr'],
    ];
    let pris = 0;
    for (const [m, langue] of phrases) {
      const rr = sig(m);
      if (rr) pris++; else console.log(`      ↳ raté (${langue}) : ${m}`);
    }
    check(`${pris}/${phrases.length} expressions fr+en détectées`, pris === phrases.length, `${pris}/${phrases.length}`);
  }

  // --------------------------------------------------------------------------
  console.log('\n8) Signal E — propagation multi-salons (compte piraté)');
  // --------------------------------------------------------------------------
  {
    phishing._test.spreadTracker.clear();
    const contenu = 'Regarde ce cadeau lien-suspect-2026.xyz';
    check('1er salon → pas encore de propagation',
      !phishing.noteSpread(BOT_ID, GUILD, 'U1', contenu, 'C1'));
    check('2e salon → toujours pas', !phishing.noteSpread(BOT_ID, GUILD, 'U1', contenu, 'C2'));
    const r = phishing.noteSpread(BOT_ID, GUILD, 'U1', contenu, 'C3');
    check('3e salon → propagation détectée', !!r && r.signal === 'E', JSON.stringify(r));
    check('propagation → certitude HAUTE', r && phishing.HIGH_CONFIDENCE.has(r.signal));
    check('le compteur est remis à zéro après déclenchement',
      !phishing._test.spreadTracker.has(`${BOT_ID}:${GUILD}:U1`));

    // Le même salon répété ne doit pas compter comme une propagation.
    phishing._test.spreadTracker.clear();
    check('même salon répété 5× → aucune propagation',
      !Array.from({ length: 5 }, (_, i) => phishing.noteSpread(BOT_ID, GUILD, 'U2', contenu, 'C1')).some(Boolean));

    // Deux auteurs différents ne doivent pas être cumulés.
    phishing._test.spreadTracker.clear();
    check('auteurs différents → pas de cumul (1/2)',
      !phishing.noteSpread(BOT_ID, GUILD, 'U3', contenu, 'C1'));
    check('auteurs différents → pas de cumul (2/2)',
      !phishing.noteSpread(BOT_ID, GUILD, 'U4', contenu, 'C2'));

    // Un contenu différent réinitialise le suivi.
    phishing._test.spreadTracker.clear();
    phishing.noteSpread(BOT_ID, GUILD, 'U5', 'premier lien-suspect.xyz', 'C1');
    check('contenu différent → suivi réinitialisé',
      !phishing.noteSpread(BOT_ID, GUILD, 'U5', 'autre contenu lien-suspect.xyz', 'C2'));

    // Le balayage purge les suivis périmés.
    phishing._test.spreadTracker.set('vieux', { content: 'x', channels: new Set(['C1']), ts: Date.now() - 600000 });
    phishing.sweepSpread();
    check('sweep purge les suivis périmés', !phishing._test.spreadTracker.has('vieux'));
    check('seuil de propagation = 3 salons', phishing.SPREAD_MIN_CHANNELS === 3);
    check('fenêtre de propagation = 15 s', phishing.SPREAD_WINDOW_MS === 15000);
  }

  // --------------------------------------------------------------------------
  console.log('\n9) Extraction des liens');
  // --------------------------------------------------------------------------
  {
    const un = phishing.extractUrls('Va sur https://malveillant.xyz/nitro maintenant');
    check('URL avec schéma extraite', un.length === 1 && un[0].host === 'malveillant.xyz', JSON.stringify(un));
    const deux = phishing.extractUrls('lien nu malveillant.xyz/nitro');
    check('domaine nu (sans http) extrait', deux.length === 1 && deux[0].host === 'malveillant.xyz', JSON.stringify(deux));
    check('aucun lien dans du texte ordinaire',
      phishing.extractUrls('Bonjour tout le monde, comment ça va ?').length === 0);
    check('ponctuation finale retirée',
      (phishing.extractUrls('voir malveillant.xyz.')[0] || {}).host === 'malveillant.xyz');
    check('dédoublonnage des hôtes',
      phishing.extractUrls('a.xyz et encore a.xyz').length === 1);
    // Un point final seul n'est pas un TLD.
    check('mot suivi d’un point isolé → pas un domaine',
      phishing.extractUrls('J ai un chien. Il est gentil.').length === 0);
  }

  // --------------------------------------------------------------------------
  console.log('\n10) GARDE-FOU — la certitude moyenne ne bannit jamais');
  // --------------------------------------------------------------------------
  {
    activer('ban');
    // Certitude HAUTE : domaine blacklisté → le ban configuré s'applique.
    const haute = automod.analyzeContent(BOT_ID, GUILD, 'Voir 101nitro.com', {});
    check('haute certitude → règle phishing', haute.rule === 'phishing', haute.rule);
    check('haute certitude → certitude exposée', haute.confidence === 'high', haute.confidence);
    check('haute certitude → l’action « ban » est appliquée', haute.action === 'ban', haute.action);

    // Certitude MOYENNE : expression d'arnaque → le ban est ramené à warn.
    const moyenne = automod.analyzeContent(BOT_ID, GUILD, 'Free nitro : offre-speciale-2026.xyz', {});
    check('certitude moyenne → règle phishing', moyenne.rule === 'phishing', moyenne.rule);
    check('certitude moyenne → confidence = medium', moyenne.confidence === 'medium', moyenne.confidence);
    check('certitude moyenne → le BAN est refusé', moyenne.action !== 'ban', moyenne.action);
    check('certitude moyenne → ramené à « warn »', moyenne.action === 'warn', moyenne.action);
    check('certitude moyenne → le message est quand même supprimé', moyenne.wouldDelete === true);

    // Même plafond sur kick et timeout.
    for (const dure of ['kick', 'timeout']) {
      activer(dure);
      const m2 = automod.analyzeContent(BOT_ID, GUILD, 'Free nitro : offre-speciale-2026.xyz', {});
      check(`certitude moyenne → « ${dure} » refusé aussi`, m2.action === 'warn', m2.action);
      const h2 = automod.analyzeContent(BOT_ID, GUILD, 'Voir 101nitro.com', {});
      check(`certitude haute → « ${dure} » autorisé`, h2.action === dure, h2.action);
    }

    // Les actions douces ne sont pas modifiées.
    for (const douce of ['delete', 'warn', 'log']) {
      activer(douce);
      const m3 = automod.analyzeContent(BOT_ID, GUILD, 'Free nitro : offre-speciale-2026.xyz', {});
      check(`certitude moyenne → « ${douce} » conservé`, m3.action === douce, m3.action);
    }

    // Le barème progressif (v213) doit être désactivé en certitude moyenne.
    const am = code('server/discord/automod.js');
    check('le barème progressif est désactivé en certitude moyenne',
      /phishingEscalationAllowed\(detection\)/.test(am));
    check('la sanction dure est aussi plafonnée sur le chemin historique',
      /warning\.sanction = null/.test(am));
    activer('ban');
  }

  // --------------------------------------------------------------------------
  console.log('\n11) Intégration à l’auto-modération existante');
  // --------------------------------------------------------------------------
  {
    activer('ban');
    const d = automod.detectContent(BOT_ID, GUILD, 'Voir 101nitro.com', null, {});
    check('detectContent renvoie la règle phishing', !!d && d.rule === 'phishing');
    check('la raison est lisible en français', d && /phishing|Nitro/i.test(d.reason), d && d.reason);
    check('le domaine apparaît dans la raison', d && d.reason.includes('101nitro.com'), d && d.reason);

    // Le signal D n'a pas de domaine : la raison ne doit pas afficher « () ».
    const d2 = automod.detectContent(BOT_ID, GUILD, 'Free nitro : offre-speciale-2026.xyz', null, {});
    check('raison sans parenthèses vides', d2 && !d2.reason.includes('()'), d2 && d2.reason);

    // La règle phishing est testée AVANT « links » : plus précise.
    const src = code('server/discord/automod.js');
    check('phishing testé avant la règle links',
      src.indexOf('gs.am_phishing === 1') < src.indexOf("gs.am_links === 1 && /(discord"));

    // Règle désactivée → plus rien, même sur un domaine blacklisté.
    store.guildSettings.set(BOT_ID, GUILD, { am_phishing: 0 });
    check('règle désactivée → aucune détection',
      !automod.detectContent(BOT_ID, GUILD, 'Voir 101nitro.com', null, {}));
    store.guildSettings.set(BOT_ID, GUILD, { am_phishing: 1 });

    // Les autres règles continuent de fonctionner normalement.
    store.guildSettings.set(BOT_ID, GUILD, { am_links: 1 });
    const lien = automod.detectContent(BOT_ID, GUILD, 'Voir https://example.com/page', null, {});
    check('la règle links fonctionne toujours', !!lien && lien.rule === 'links', lien && lien.rule);

    // Auto-modération complètement éteinte → rien.
    store.guildSettings.set(BOT_ID, GUILD, { am_enabled: 0 });
    const off = automod.analyzeContent(BOT_ID, GUILD, 'Voir 101nitro.com', {});
    check('auto-modération éteinte → rien', off.matched === false);
    activer('ban');
  }

  // --------------------------------------------------------------------------
  console.log('\n12) Base de données');
  // --------------------------------------------------------------------------
  {
    const cols = store.db.prepare('PRAGMA table_info(guild_settings)').all().map((c) => c.name);
    check('colonne am_phishing créée', cols.includes('am_phishing'));
    check('colonne am_phishing_allow créée', cols.includes('am_phishing_allow'));
    store.guildSettings.set(BOT_ID, GUILD, { am_phishing_allow: 'a'.repeat(5000) });
    check('liste blanche bornée à 1000 caractères',
      String(store.guildSettings.get(BOT_ID, GUILD).am_phishing_allow).length === 1000);
    store.guildSettings.set(BOT_ID, GUILD, { am_phishing: 1 });
    check('am_phishing = 1 enregistré', store.guildSettings.get(BOT_ID, GUILD).am_phishing === 1);
    store.guildSettings.set(BOT_ID, GUILD, { am_phishing: 0 });
    check('am_phishing = 0 enregistré', store.guildSettings.get(BOT_ID, GUILD).am_phishing === 0);
    activer('ban');
  }

  // --------------------------------------------------------------------------
  console.log('\n13) Reflet dans l’AutoMod natif de Discord');
  // --------------------------------------------------------------------------
  {
    const na = code('server/discord/nativeAutomod.js');
    check('règle native « phishing » créée', /key: 'phishing'/.test(na));
    check('elle utilise regexPatterns', /regexPatterns: NATIVE_PHISHING_REGEX/.test(na));
    check('comparaison des motifs dans sameTrigger',
      /spec\.key === 'phishing'[\s\S]{0,200}regexPatterns/.test(na));

    const motifs = eval('[' + na.match(/const NATIVE_PHISHING_REGEX = \[([\s\S]*?)\n\];/)[1] + ']');
    check('au plus 10 motifs (limite Discord)', motifs.length <= 10, String(motifs.length));
    check('chaque motif fait au plus 256 caractères', motifs.every((m) => m.length <= 256));
    check('chaque motif est une expression rationnelle valide',
      motifs.every((m) => { try { new RegExp(m); return true; } catch { return false; } }));

    // Le vrai mot « discord » ne doit JAMAIS être bloqué : le moteur Rust de
    // Discord n'a pas de lookahead, donc un motif comme disc[o0]rd serait faux.
    let bloqueLegit = 0;
    for (const t of ['discord.com', 'le serveur discord', 'discord.gift/abc', 'discord.gg/hoxera',
      'discordapp.com', 'discord est gratuit', 'nitro sur discord.com', 'mon discord a un bug']) {
      if (motifs.some((r) => new RegExp(r, 'i').test(t))) bloqueLegit++;
    }
    check('aucun texte légitime bloqué par le reflet natif', bloqueLegit === 0, `${bloqueLegit} bloqué(s)`);

    let bloqueArnaque = 0;
    for (const t of ['dlscord.com/nitro', 'disc0rd.gift', 'dicsord-nitro.ru', 'nitro generator',
      'discord airdrop', 'discrod.com', 'd1scord.xyz', 'nitro hack', 'discorb-app.com']) {
      if (motifs.some((r) => new RegExp(r, 'i').test(t))) bloqueArnaque++;
    }
    check('les imitations courantes sont bloquées nativement', bloqueArnaque >= 8, `${bloqueArnaque}/9`);

    // Les expressions seules sont volontairement exclues du natif.
    check('« free nitro » seul n’est PAS dans le natif (bloquerait sans recours)',
      !motifs.some((r) => new RegExp(r, 'i').test('quelqu un a du free nitro ?')));
  }

  // --------------------------------------------------------------------------
  console.log('\n14) Routes API');
  // --------------------------------------------------------------------------
  {
    const r = code('server/routes.js');
    check('« phishing » dans la liste des règles d’action',
      /const AUTOMOD_RULES = \['phishing'/.test(r));
    check('« phishing » dans les règles de blacklist', /AUTOMOD_BLACKLIST_RULES = AUTOMOD_RULES/.test(r));
    check('« phishing » dans les barèmes progressifs',
      /const AUTOMOD_ESC_RULES = \['phishing'/.test(r));
    check('la route accepte le champ phishing', /phishing, phishing_allow \} = body/.test(r));
    check('la route écrit am_phishing', /am_phishing: \(phishing === false/.test(r));
    check('la route écrit am_phishing_allow', /am_phishing_allow: String\(phishing_allow/.test(r));
    check('la liste blanche est bornée côté serveur', /am_phishing_allow[\s\S]{0,80}slice\(0, 1000\)/.test(r));
    check('am_phishing présent dans les valeurs par défaut', /am_enabled: 0, am_phishing: 1/.test(r));
    check('champ présent seulement s’il est envoyé (pas d’écrasement)',
      /phishing !== undefined \? \{ am_phishing/.test(r));
  }

  // --------------------------------------------------------------------------
  console.log('\n15) Dashboard');
  // --------------------------------------------------------------------------
  {
    const d = code('public/js/dashboard.js');
    check('carte de règle « phishing » présente', d.includes('data-am-rule-card="phishing"'));
    check('case à cocher #am-phishing', d.includes('id="am-phishing"'));
    check('sélecteur d’action par règle', d.includes('data-am-action="phishing"'));
    check('champ domaines autorisés', d.includes('id="am-phishing-allow"'));
    check('collecté à l’enregistrement : phishing', /phishing: c\.querySelector\('#am-phishing'\)\.checked/.test(d));
    check('collecté à l’enregistrement : phishing_allow', /phishing_allow: c\.querySelector\('#am-phishing-allow'\)/.test(d));
    check('cochée par défaut (am_phishing = 1)', /s\.am_phishing === 0 \? '' : 'checked'/.test(d));
    check('les deux niveaux de certitude sont expliqués', /Deux niveaux de certitude/.test(d));
    check('l’absence de ban en certitude moyenne est annoncée', /jamais de ban, kick ou muet/.test(d));
    check('carte placée avant la règle « links »',
      d.indexOf('data-am-rule-card="phishing"') < d.indexOf('data-am-rule-card="links"'));
    check('les domaines déjà autorisés d’office sont listés', /discord\.gg, discord\.gift et steamcommunity\.com/.test(d));
  }

  // --------------------------------------------------------------------------
  console.log('\n16) Textes i18n en français ET en anglais');
  // --------------------------------------------------------------------------
  {
    let manquantes = 0;
    for (const l of ['fr', 'en']) {
      for (const c of ['am_reason_phishing', 'am_reason_phishing_suspect', 'am_dm_phishing']) {
        const v = i18n.t(l, c, { server: 'S' });
        if (!v || v === c || v.includes('{server}')) manquantes++;
      }
    }
    check('3 clés × 2 langues résolues et interpolées', manquantes === 0, `${manquantes} manquante(s)`);
    check('raison fr : parle de phishing / faux Nitro', /phishing|Nitro/i.test(i18n.t('fr', 'am_reason_phishing')));
    check('raison en : distincte de la version fr',
      i18n.t('en', 'am_reason_phishing') !== i18n.t('fr', 'am_reason_phishing'));
    check('le MP distingue les deux niveaux de certitude',
      i18n.t('fr', 'am_reason_phishing') !== i18n.t('fr', 'am_reason_phishing_suspect'));
    check('le MP conseille de changer le mot de passe', /changez-le|change it/i.test(i18n.t('fr', 'am_dm_phishing') + i18n.t('en', 'am_dm_phishing')));
  }

  // --------------------------------------------------------------------------
  console.log('\n17) Balayage périodique');
  // --------------------------------------------------------------------------
  {
    const t = code('server/discord/tasks.js');
    check('le traqueur de propagation est balayé', /require\('\.\/phishing'\)\.sweepSpread\(\)/.test(t));
    check('le balayage est isolé dans un try/catch',
      /sweepSpread\(\);[\s\S]{0,120}catch/.test(t));
  }

  // --------------------------------------------------------------------------
  console.log('\n18) Version 243');
  // --------------------------------------------------------------------------
  {
    const html = racine('public/index.html');
    check('index.html : ?v=252 référencé 7 fois', (html.match(/\?v=252/g) || []).length === 7,
      String((html.match(/\?v=252/g) || []).length));
    check('index.html : plus aucun ?v=242', !html.includes('?v=242'));
    check('sw.js : cache « botdev-v252 »', racine('public/sw.js').includes("'botdev-v252'"));
  }

  console.log(`\n${echecs === 0
    ? '🎉 Tous les tests v243 passent — phishing détecté, garde-fous vérifiés.'
    : `❌ v243 — ${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
