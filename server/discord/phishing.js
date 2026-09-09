// ============================================================
// Hoxera — Détection de phishing / faux Nitro (v243)
// ------------------------------------------------------------
// Ce que Hoxera avait avant : la règle `am_links`, un interrupteur
// brut qui bloque TOUS les liens https://. Beaucoup de serveurs ne
// l'activent pas, parce qu'elle empêche aussi de partager une vidéo.
// Il n'y avait aucune détection d'arnaque.
//
// ── POURQUOI CINQ SIGNAUX ET PAS UNE LISTE ────────────────────
// Les deux listes publiques de référence sont périmées :
//   • nikolaischunk/discord-phishing-links — 21 908 domaines,
//     dernier commit mars 2024 ;
//   • Dogino/Discord-Phishing-URLs — octobre 2024.
// Or « les escrocs enregistrent un nouveau domaine pour quelques
// dollars : toute liste construite à la main devient inefficace
// jusqu'à sa prochaine mise à jour ». La liste embarquée est donc
// un BONUS à certitude élevée, pas le signal principal.
//
// ── CERTITUDE HAUTE vs MOYENNE ────────────────────────────────
// La réaction retenue est le bannissement. Bannir sur un doute
// serait inacceptable, donc les signaux sont séparés en deux
// niveaux :
//   HAUTE   A (liste noire), B (typosquat), E (propagation)
//           → la réaction configurée s'applique (ban par défaut)
//   MOYENNE C (domaine-appât), D (expressions d'arnaque)
//           → suppression + avertissement, JAMAIS de ban
// Un membre qui écrit « nitro gratuit » à côté d'un lien légitime
// ne doit pas être banni.
//
// ── LES DEUX PIÈGES ÉVITÉS ────────────────────────────────────
// 1. La liste noire ne fait AUCUNE recherche par sous-chaîne :
//    domaine exact ou sous-domaine seulement. Sinon un domaine
//    légitime contenant un mot blacklisté serait supprimé.
// 2. La liste blanche est testée sur l'hôte ORIGINAL, avant toute
//    normalisation. `discord.com` ne passe jamais par l'heuristique.
//
// LIMITE ASSUMÉE : les bots ne voient pas les MP entre membres.
// Cette protection couvre les salons du serveur, pas les messages
// privés que reçoivent les membres — aucun bot ne peut le faire.
// ============================================================
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ------------------------------------------------------------
// Liste blanche : domaines officiels, jamais signalés.
// ------------------------------------------------------------
const ALLOWED = new Set([
  // Discord
  'discord.com', 'discord.gg', 'discord.gift', 'discord.media', 'discord.new',
  'discord.store', 'discord.dev', 'discord.design', 'discord.co', 'discord.app',
  'discordapp.com', 'discordapp.net', 'discordstatus.com', 'discordattachments.com',
  // Steam / Valve
  'steampowered.com', 'steamcommunity.com', 'steam-chat.com', 'steamstatic.com',
  'valvesoftware.com',
]);

// Marques imitées par les arnaques.
const BRANDS = ['discord', 'discordapp', 'discords', 'steamcommunity', 'steampowered', 'steam', 'nitro'];

// Typosquatting : distance maximale admise, marque par marque.
// « steam » seul en est exclu à dessein : « steem.com » est un site réel et
// légitime, à une seule lettre d'écart. Le signaler serait un faux positif.
// « steam » reste utilisable par le signal C, qui exige marque ET mot-appât.
// « discords » est volontairement ABSENT : ce n'est pas une marque, c'est un
// pluriel. Le garder faisait correspondre « discordtemplates.com » à distance 1
// (discord → discords), donc bannir un site légitime. Rien n'est perdu : un
// vrai « discords.gift » reste attrapé par la marque « discord » à distance 1.
const TYPOSQUAT_BRANDS = {
  discord: 2, discordapp: 2, nitro: 2,
  steamcommunity: 2, steampowered: 2, steamchat: 2,
};

// Mots du langage courant qui ressemblent à une marque sans être des arnaques.
// « discourse » (le logiciel de forum) est à distance 1 de « discord ».
// Les administrateurs peuvent compléter cette liste par serveur via le champ
// « Domaines autorisés en plus » du dashboard.
const FAUX_AMIS = ['discourse', 'discordia', 'discordian'];

// Mots-appâts : un domaine n'est suspect que s'il combine une marque ET un appât.
const LURES = [
  'free', 'gratuit', 'gratuite', 'gift', 'cadeau', 'claim', 'airdrop', 'drop',
  'reward', 'recompense', 'récompense', 'giveaway', 'give', 'win', 'gagner',
  'premium', 'boost', 'skins', 'case', 'key', 'clef', 'clé',
];

// Expressions d'arnaque dans le corps du message (fr + en).
const SCAM_PHRASES = [
  /free\s*nitro/i, /nitro\s*(?:for\s*)?free/i, /nitro\s*gratuit/i, /gratuit\s*nitro/i,
  /discord\s*nitro\s*(?:gift|giveaway|generator)/i, /nitro\s*(?:generator|glitch|hack)/i,
  /claim\s*(?:your|ur)?\s*nitro/i, /r[ée]cup[èe]re(?:z|s)?\s*(?:ton|votre)\s*nitro/i,
  /steam\s*(?:gift|giveaway|wallet|nitro)/i, /cadeau\s*steam/i, /gift\s*steam/i,
  /discord\s*(?:and|x|\+)\s*steam\s*(?:partner|collab|event)/i,
  /nitro\s*airdrop/i, /crypto\s*airdrop/i, /airdrop\s*(?:nitro|discord)/i,
  /your\s*account\s*(?:will\s*be|is\s*being)?\s*(?:deleted|banned|suspended)/i,
  /ton\s*compte\s*(?:va\s*[êe]tre|sera)\s*(?:supprim[ée]|banni)/i,
  /votre\s*compte\s*(?:va\s*[êe]tre|sera)\s*(?:supprim[ée]|banni)/i,
  /verify\s*(?:your)?\s*account\s*(?:to\s*avoid|or)/i,
  /v[ée]rifie\s*(?:ton|votre)\s*compte/i,
  /last\s*(?:day|chance|hours?)/i, /derni[èe]re\s*(?:chance|jour)/i,
  /only\s*(?:24|48)\s*hours?/i, /(?:24|48)\s*h\s*(?:seulement|max)/i,
  /whoever\s*(?:is|wants)\s*(?:first|fastest)/i, /premier\s*arriv[ée]/i,
];

const HIGH_CONFIDENCE = new Set(['A', 'A2', 'B', 'E']);

// ------------------------------------------------------------
// Chargement des listes embarquées (une seule fois, en paresseux).
// ------------------------------------------------------------
let _blacklistDomains = null;
let _blacklistUrls = null;

function loadList(file) {
  try {
    const p = path.join(__dirname, '..', 'data', file);
    const txt = fs.readFileSync(p, 'utf8');
    return new Set(txt.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));
  } catch (e) {
    return new Set();
  }
}

function blacklistDomains() {
  if (!_blacklistDomains) _blacklistDomains = loadList('phishing-domains.txt');
  return _blacklistDomains;
}

function blacklistUrls() {
  if (!_blacklistUrls) _blacklistUrls = loadList('phishing-urls.txt');
  return _blacklistUrls;
}

// ------------------------------------------------------------
// Normalisation : les escrocs remplacent des lettres par des
// glyphes visuellement identiques (l/I, 0/O, cyrillique а/е/о/р/с).
// Sans cette étape, « dlscord » ou « dіscord » passent à travers.
// ------------------------------------------------------------
const HOMOGLYPHS = {
  // Cyrillique → latin
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j', '\u04bb': 'h',
  '\u0501': 'd', '\u051b': 'q', '\u043c': 'm', '\u0442': 't', '\u043d': 'h',
  // Grec → latin
  '\u03bf': 'o', '\u03b1': 'a', '\u03b5': 'e', '\u03b9': 'i', '\u03ba': 'k',
  '\u03bd': 'v', '\u03c1': 'p', '\u03c4': 't', '\u03c5': 'u', '\u03c7': 'x',
  // Confusables latins
  '\u0131': 'i', '\u0130': 'i', '\u1d00': 'a', '\u1d04': 'c', '\u1d07': 'e',
  '\u1d0f': 'o', '\u1d18': 'p', '\u1d1b': 't', '\u1d1c': 'u', '\u0251': 'a',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-',
  '\u2024': '.', '\uff0e': '.', '\u3002': '.',
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '9': 'g',
};

function normalizeHost(rawHost) {
  let h = String(rawHost || '').trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '').replace(/^www\./, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  h = h.replace(/\.$/, '').replace(/^\.+/, '');
  // Unicode : décomposition puis repli ASCII quand c'est possible.
  try { h = h.normalize('NFKD'); } catch { /* ancien runtime */ }
  let out = '';
  for (const ch of h) {
    if (HOMOGLYPHS[ch] !== undefined) { out += HOMOGLYPHS[ch]; continue; }
    // Le « l » minuscule imite le « i » : dlscord → discord.
    out += ch === 'l' ? 'i' : ch;
  }
  // Retire les points pour comparer les libellés entre eux.
  return out;
}

// Hôte brut, sans normalisation — sert à tester la liste blanche.
function rawHost(rawHost) {
  let h = String(rawHost || '').trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '').replace(/^www\./, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  return h.replace(/\.$/, '').replace(/^\.+/, '');
}

// ------------------------------------------------------------
// Distance de Levenshtein, bornée : dès qu'on dépasse `max`, on
// arrête. Les domaines sont courts, donc le coût est négligeable.
// ------------------------------------------------------------
function levenshtein(a, b, max = 3) {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (!la) return lb;
  if (!lb) return la;
  let prev = new Array(lb + 1);
  let cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

// ------------------------------------------------------------
// Extraction des liens. Prend aussi les domaines nus, sans
// http:// — les arnaques sont souvent collées sans schéma.
// ------------------------------------------------------------
const URL_RE = /\b(?:https?:\/\/|www\.)?[a-z0-9\u0400-\u04FF\u0370-\u03FF](?:[a-z0-9\u0400-\u04FF\u0370-\u03FF-]{0,61}[a-z0-9\u0400-\u04FF\u0370-\u03FF])?(?:\.[a-z0-9\u0400-\u04FF\u0370-\u03FF](?:[a-z0-9\u0400-\u04FF\u0370-\u03FF-]{0,61}[a-z0-9\u0400-\u04FF\u0370-\u03FF])?)+(?:\/[^\s<>"']*)?/gi;

function extractUrls(text) {
  const out = [];
  const seen = new Set();
  const src = String(text || '');
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(src)) !== null) {
    const u = m[0].replace(/[.,;:!?)\]]+$/, '');
    const h = rawHost(u);
    // Un domaine doit avoir un TLD d'au moins 2 caractères.
    if (!h || !h.includes('.')) continue;
    const tld = h.split('.').pop();
    if (!tld || tld.length < 2) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    out.push({ url: u, host: h });
  }
  return out;
}

// ------------------------------------------------------------
// Liste blanche : domaine exact OU sous-domaine d'un domaine sûr.
// `evil.discord.com.attacker.xyz` ne doit PAS être blanchi : on
// compare donc la fin de l'hôte, précédée d'un point.
// ------------------------------------------------------------
function isAllowed(host, extra) {
  const h = rawHost(host);
  if (!h) return false;
  if (ALLOWED.has(h)) return true;
  for (const d of ALLOWED) if (h.endsWith(`.${d}`)) return true;
  const ex = extra || [];
  for (const d of ex) {
    const dd = rawHost(d);
    if (!dd) continue;
    if (h === dd || h.endsWith(`.${dd}`)) return true;
  }
  return false;
}

// ------------------------------------------------------------
// Signaux A et A2 — liste noire embarquée.
// Domaine exact ou sous-domaine, JAMAIS de sous-chaîne.
// ------------------------------------------------------------
function matchBlacklist(host, url) {
  const bl = blacklistDomains();
  const h = rawHost(host);
  if (bl.has(h)) return { signal: 'A', host: h };
  for (const d of bl) {
    // Uniquement si h est un sous-domaine de d : on compare la fin
    // précédée d'un point, jamais une simple inclusion.
    if (h.endsWith(`.${d}`)) return { signal: 'A', host: h };
  }
  const clean = String(url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (blacklistUrls().has(clean)) return { signal: 'A2', host: h };
  return null;
}

// ------------------------------------------------------------
// Signal B — typosquatting de marque.
// Distance ≤ 2 entre un libellé de l'hôte normalisé et une marque,
// sur un hôte qui n'est PAS dans la liste blanche.
// ------------------------------------------------------------
function matchTyposquat(host) {
  const brut = rawHost(host);
  if (!brut) return null;
  if (FAUX_AMIS.some((f) => brut.includes(f))) return null;
  const marques = Object.keys(TYPOSQUAT_BRANDS);

  // Chaque libellé est testé séparément : sur « discorcl-gift.top », comparer
  // le libellé ENTIER « discorcl-gift » à « discord » échoue (écart de
  // longueur), alors qu'une fenêtre glissante y trouve « discorcl » à distance 1.
  //
  // La boucle part des libellés BRUTS, pas de la forme normalisée : les deux
  // gardes ci-dessous doivent voir les homoglyphes tels quels, sinon un
  // « dіscord-app.com » en cyrillique serait pris pour du « discord-app »
  // correctement épelé et passerait à travers.
  let best = null;
  for (const labelBrut of brut.split('.').filter((x) => x && x.length >= 5)) {
    const bas = labelBrut.toLowerCase();

    // GARDE 1 — Un libellé qui COMMENCE par une marque correctement épelée est
    // un mot composé, pas une imitation : « discordapi » = discord + api. Sans
    // cette règle il était pris pour une faute de frappe de « discordapp »
    // (distance 1) et conduisait à un bannissement.
    // La règle porte sur le DÉBUT du libellé : « discrodnitro2026 » contient
    // bien « nitro », mais pas en tête — la faute « discrod » reste détectée.
    if (marques.some((m) => bas.startsWith(m))) continue;

    const label = normalizeHost(labelBrut);
    if (!label || label.length < 5) continue;

    for (const brand of marques) {
      const maxD = TYPOSQUAT_BRANDS[brand];
      const d = levenshteinSlice(label, brand, maxD);
      if (d > maxD) continue;

      // GARDE 2 — Distance 0 alors que le libellé brut contient la marque
      // correctement épelée (mydiscordserver, discordtemplates, nitrotype) :
      // ce n'est PAS une imitation, et ce signal conduit au BANNISSEMENT. On
      // laisse passer ; les vrais cas marque + mot-appât retombent sur le
      // signal C, en certitude moyenne.
      if (d === 0 && bas.includes(brand)) continue;

      // d === 0 sans marque correctement épelée : imitation par homoglyphe
      // (dlscord, disc0rd, dіscord en cyrillique).
      const cand = { signal: 'B', host: brut, brand, distance: d, label: labelBrut, homoglyph: d === 0 };
      if (!best || d < best.distance) best = cand;
    }
  }
  return best;
}

// ------------------------------------------------------------
// Signal C — domaine-appât : marque + mot-appât.
// Exiger les DEUX évite de signaler des sites légitimes comme
// « discordtemplates.com », qui contiennent la marque sans arnaque.
// ------------------------------------------------------------
function matchLure(host) {
  const h = rawHost(host);
  // Un domaine nu (« discord » sans TLD) n'est pas un domaine : exiger au moins
  // un point évite de signaler du texte ordinaire capté par l'extracteur.
  if (!h.includes('.') || h.length > 60) return null;
  const norm = normalizeHost(h).replace(/\./g, '');
  if (!norm) return null;
  // RÉGRESSION CORRIGÉE : levenshteinSlice renvoie désormais un NOMBRE, et un
  // nombre non nul est vrai en JavaScript. L'ancien « || levenshteinSlice(...) »
  // rendait donc hasLure toujours vrai, et tout domaine contenant une marque
  // (discordtemplates.com, discord.js.org) partait en signal C.
  //
  // Les mots-appâts sont des mots courants : seule la sous-chaîne EXACTE est
  // acceptée. Une tolérance de faute de frappe sur « gift » ou « free »
  // multiplierait les faux positifs sans gain réel.
  const hasLure = LURES.some((l) => norm.includes(normalizeHost(l).replace(/\./g, '')));
  if (!hasLure) return null;
  const hasBrand = BRANDS.some((b) => norm.includes(normalizeHost(b)));
  if (!hasBrand) return null;
  return { signal: 'C', host: rawHost(host) };
}

// Recherche approchée d'un motif dans une chaîne : vraie si une fenêtre de la
// longueur du motif est à distance ≤ 1 du motif.
// Distance de Levenshtein minimale entre n'importe quelle sous-chaîne de
// `haystack` et `needle`, bornée par `max` (renvoie max+1 si rien n'est assez
// proche). Renvoie un NOMBRE, pas un booléen.
//
// Les coupes anticipées habituelles (écart de longueur > max) seraient FAUSSES
// ici : `haystack` est plus long que la marque, et le meilleur candidat est
// justement une sous-chaîne de sa longueur. D'où la première colonne à 0, qui
// rend gratuit le choix du point de départ dans `haystack`.
function levenshteinSlice(haystack, needle, max = 2) {
  const a = String(haystack || '');
  const b = String(needle || '');
  if (!b.length) return 0;
  if (!a.length) return Math.min(b.length, max + 1);
  if (b.length > a.length + max) return max + 1;

  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  let best = prev[b.length];

  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    let ligneMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cout);
      if (cur[j] < ligneMin) ligneMin = cur[j];
    }
    if (cur[b.length] < best) best = cur[b.length];
    prev = cur;
    // Toute la ligne dépasse la borne : aucune sous-chaîne plus longue ne
    // pourra revenir en dessous.
    if (ligneMin > max) break;
  }
  return Math.min(best, max + 1);
}

// ------------------------------------------------------------
// Signal D — expressions d'arnaque dans le texte.
// Ne compte QUE si un lien HORS liste blanche est présent dans le même
// message : parler de « nitro gratuit » à côté d'un lien discord.com
// officiel n'est pas du phishing.
// ------------------------------------------------------------
function matchPhrases(text, hasUrl) {
  if (!hasUrl) return null;
  const src = String(text || '');
  for (const re of SCAM_PHRASES) {
    const m = src.match(re);
    if (m) return { signal: 'D', phrase: m[0] };
  }
  return null;
}

// ------------------------------------------------------------
// Signal E — propagation en rafale.
// Signature documentée d'un compte piraté : le même contenu, avec
// un lien, posté dans plusieurs salons différents à ~1 s d'écart.
// ------------------------------------------------------------
const SPREAD_MIN_CHANNELS = 3;
const SPREAD_WINDOW_MS = 15000;
const spreadTracker = new Map(); // `${botId}:${guildId}:${authorId}` -> { content, channels:Set, ts }

function noteSpread(botId, guildId, authorId, content, channelId) {
  try {
    if (!authorId || !channelId) return null;
    const key = `${botId}:${guildId}:${authorId}`;
    const now = Date.now();
    const norm = String(content || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!norm) return null;
    let t = spreadTracker.get(key);
    if (!t || t.content !== norm || (now - t.ts) > SPREAD_WINDOW_MS) {
      t = { content: norm, channels: new Set(), ts: now };
      spreadTracker.set(key, t);
    }
    t.channels.add(String(channelId));
    if (t.channels.size >= SPREAD_MIN_CHANNELS) {
      const n = t.channels.size;
      spreadTracker.delete(key);
      return { signal: 'E', channels: n };
    }
    return null;
  } catch (e) { return null; }
}

function sweepSpread(now = Date.now()) {
  for (const [k, t] of spreadTracker) if ((now - t.ts) > SPREAD_WINDOW_MS * 4) spreadTracker.delete(k);
  return spreadTracker.size;
}

// ------------------------------------------------------------
// Analyse complète d'un message.
// Retourne null si rien, sinon { signal, confidence, reason, host, ... }.
// Les signaux sont testés du plus certain au moins certain, et le
// premier qui correspond gagne.
// ------------------------------------------------------------
function analyze(text, opts = {}) {
  const src = String(text || '');
  if (!src.trim()) return null;

  // Signal E d'abord : la propagation est le cas le plus urgent.
  if (opts.spread) return { ...opts.spread, confidence: 'high', reason: 'propagation_multi_salons' };

  const urls = extractUrls(src);
  // Un lien de la liste blanche n'est pas un lien suspect. Sans cette
  // distinction, « j'ai gagné du nitro gratuit sur discord.com » était
  // signalé : le texte seul ne suffit pas, il faut un lien qui n'est pas
  // un domaine officiel.
  const suspectUrls = urls.filter((u) => !isAllowed(u.host, opts.allow));
  const hasSuspectUrl = suspectUrls.length > 0;

  // Signal D ne dépend pas d'un domaine précis.
  const phrase = matchPhrases(src, hasSuspectUrl);

  for (const { url, host } of urls) {
    if (isAllowed(host, opts.allow)) continue;      // liste blanche en premier
    const bl = matchBlacklist(host, url);
    if (bl) return { ...bl, confidence: 'high', reason: 'domaine_connu', url };
    const ty = matchTyposquat(host);
    // Une imitation par homoglyphe (dlscord, disc0rd) est encore plus
    // délibérée qu'une simple faute de frappe : utile dans les journaux.
    if (ty) return { ...ty, confidence: 'high', reason: ty.homoglyph ? 'homoglyphe' : 'typosquat', url };
  }

  // Haute certitude épuisée. Un signal moyen reste un signal : on supprime,
  // mais on ne bannit pas (voir l'en-tête du module).
  for (const { url, host } of urls) {
    if (isAllowed(host, opts.allow)) continue;
    const lu = matchLure(host);
    if (lu) return { ...lu, confidence: 'medium', reason: 'domaine_appat', url };
  }

  if (phrase) return { ...phrase, confidence: 'medium', reason: 'expression_arnaque' };

  return null;
}

module.exports = {
  analyze, extractUrls, isAllowed, normalizeHost, rawHost, levenshtein,
  matchBlacklist, matchTyposquat, matchLure, matchPhrases,
  noteSpread, sweepSpread,
  blacklistDomains, blacklistUrls,
  ALLOWED, BRANDS, TYPOSQUAT_BRANDS, LURES, SCAM_PHRASES, HIGH_CONFIDENCE, levenshteinSlice,
  SPREAD_MIN_CHANNELS, SPREAD_WINDOW_MS,
  _test: { spreadTracker },
};
