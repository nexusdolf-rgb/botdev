// ============================================================
// Hoxera — Catalogue d'un serveur (salons + rôles), partagé
//
// POURQUOI CE FICHIER (v406e)
// Le tableau de bord relisait rôles et salons depuis l'API Discord à chaque
// ouverture de module, dès que 10 secondes s'étaient écoulées : deux
// allers-retours réseau complets, mesurés à 250-300 ms, pour une donnée qui ne
// change pas entre deux clics. Les commandes du bot (panneaux, réglages) ont le
// même besoin ; elles lisaient donc leur propre copie, avec leur propre cache.
//
// RÈGLE DE FRAÎCHEUR (une seule, valable pour tous les appelants)
//  - Une lecture de moins de 10 s : cache mémoire, zéro réseau.
//  - Une lecture après un enregistrement réussi : cache mémoire pendant 15 s
//    (le gel). L'enregistrement, lui, venait justement de demander des données
//    à jour ; les clics qui suivent n'ont pas à les repayer.
//  - Sinon : une resynchronisation REST, puis nouveau gel de 15 s. Une erreur
//    Discord n'est jamais bloquante, on retombe sur le cache local de
//    discord.js, que la passerelle tient déjà à jour.
//
// Aucune donnée ici n'est une source de vérité : tout est relisible depuis
// Discord. La base SQLite (réglages) n'est pas concernée.
// ============================================================

const { AsyncTTLCache, TTLCache } = require('../cache');

const CATALOGUE_GEL_MS = 15000;

// Catalogues déjà construits, par serveur.
const guildCatalogCache = new TTLCache({ ttlMs: 10000, max: 500 });

// Serveurs dont le catalogue vient d'être vérifié (ou dont un enregistrement
// vient d'avoir lieu) : on ne repart pas sur le réseau.
const catalogueGele = new TTLCache({ ttlMs: CATALOGUE_GEL_MS, max: 2000 });

// Liste des serveurs Discord de l'utilisateur : ne sert qu'à vérifier ses
// droits. Pendant la rafale d'appels qui suit un enregistrement (réglages,
// niveaux, événements, auto-mod…), on ne relance pas deux requêtes Discord par
// appel.
const droitsFrais = new TTLCache({ ttlMs: 5000, max: 2000 });

// Un enregistrement réussi vient d'avoir lieu : les prochaines lectures
// relisent le catalogue une fois, puis se contentent du cache.
function gelerCatalogue(guildId) {
  try { catalogueGele.set(String(guildId), true); } catch {}
}

// Appelée par la route GET du module, et par les commandes du bot.
// `construire()` reçoit la guilde Discord et renvoie { channels, roles }.
async function lireCatalogue(dGuild, construire) {
  const key = String((dGuild && dGuild.id) || 'unknown');
  const cached = guildCatalogCache.get(key);
  if (cached) return cached;

  if (dGuild && !catalogueGele.get(key)) {
    try {
      if (dGuild.roles && typeof dGuild.roles.fetch === 'function') await dGuild.roles.fetch();
    } catch (e) { console.error('[Hoxera] resync rôles :', e.message); }
    try {
      if (dGuild.channels && typeof dGuild.channels.fetch === 'function') await dGuild.channels.fetch();
    } catch (e) { console.error('[Hoxera] resync salons :', e.message); }
    // Après une resynchronisation réussie, on garde la fraîcheur 15 s de plus :
    // sans cela, deux ouvertures de module à 11 s d'intervalle relançaient
    // chacune les deux appels REST.
    catalogueGele.set(key, true);
  }

  const data = construire(dGuild);
  return guildCatalogCache.set(key, data);
}

module.exports = {
  CATALOGUE_GEL_MS,
  guildCatalogCache,
  catalogueGele,
  droitsFrais,
  gelerCatalogue,
  lireCatalogue,
};
