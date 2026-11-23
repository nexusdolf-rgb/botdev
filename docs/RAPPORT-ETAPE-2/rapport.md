# Étape 2 — En-têtes de sécurité et CSP du dashboard (v398)

## Constat de départ, corrigé

Contrairement à ce que je pensais avant de regarder, le dépôt **avait déjà** des
en-têtes de sécurité : `server/security.js` les pose depuis la v388
(`securityHeaders`), et `server/index.js:90` les applique avant tout le reste.
Une CSP existait donc déjà, avec `script-src 'self'` (aucun script en ligne).

Le travail de cette étape n'est donc pas d'en ajouter une, mais de **vérifier
ce qui est réellement envoyé** et de fermer ce qui restait ouvert.

## Mesure avant / après

Requêtes réelles contre le serveur local, sur `/`, `/js/dashboard.js`, une page
inconnue (`404`) et une route d'API inconnue (`404`).

| En-tête | Avant v398 | Après v398 |
|---|---|---|
| `Content-Security-Policy` | CSP présente | CSP complétée (`media-src`, `object-src`, `manifest-src`, `upgrade-insecure-requests`) |
| `X-Content-Type-Options` | `nosniff` | identique |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | identique |
| `Permissions-Policy` | caméra, micro, géoloc | + `payment`, `usb`, `interest-cohort` |
| `Cross-Origin-Resource-Policy` | **absent** | `same-origin` |
| `X-Permitted-Cross-Domain-Policies` | **absent** | `none` |
| `X-Frame-Options` / COOP | `SAMEORIGIN` / `same-origin` | identiques |
| `Strict-Transport-Security` | seulement en HTTPS | identique (jamais en http local) |
| `Cache-Control` sur `/api` | `no-store` | identique |

Point vérifié au passage : les en-têtes sont bien posés sur **toutes** les
réponses, y compris les 404 et les pages d'erreur, parce que le middleware est
monté en tête de chaîne. Une page d'erreur est aussi une page rendue.

## Ce qui a changé

1. **La politique est devenue une constante nommée et exportée** (`CSP` dans
   `server/security.js`). Un test peut désormais comparer exactement la chaîne
   envoyée au navigateur, au lieu de relire une chaîne littérale dans le source.
2. **`media-src 'none'`** : le dashboard n'a ni `<audio>` ni `<video>`.
   **`object-src 'none'`** : ni `<object>` ni `<embed>`.
3. **`upgrade-insecure-requests`** : un lien `http://` oublié ne part pas en
   clair vers un réseau tiers.
4. **`Cross-Origin-Resource-Policy: same-origin`** : un site tiers ne peut pas
   récupérer nos réponses d'API ni nos avatars depuis son propre contexte.
5. **Bac à sable sur les types passifs** : un fichier servi en `application/pdf`
   ou `text/plain` reçoit `default-src 'none'; sandbox`, donc il ne s'exécute
   pas dans notre origine. Les pages HTML du site ne sont pas concernées.

## L'entorse assumée : `style-src 'unsafe-inline'`

Le dashboard pose **563 attributs `style="..."`** produits par ses gabarits et
positionne des couleurs via `.style`. Sans `'unsafe-inline'` sur les styles,
chaque écran perd sa mise en page. C'est la seule entorse de la politique, et
elle est sans effet sur l'exécution de code : un style injecté ne peut pas
exécuter de script. Une CSP à base de nonce demanderait de réécrire les 563
sites, ce qui dépasse le périmètre de cette étape et se ferait mieux après
l'étape 1 (faite) qu'avant.

## Défenses déjà présentes, vérifiées et laissées telles quelles

- `/api/img` : liste blanche de quatre hôtes Discord, refus des ports, des
  identifiants et des fragments, type MIME contraint à cinq formats d'image,
  6 Mo et 12 s maximum.
- `/api/uploads/:fichier` : nom de fichier filtré par expression régulière,
  résolution de chemin vérifiée (pas de `..`), liste blanche d'extensions,
  `Content-Type` imposé, `nosniff` et `default-src 'none'; sandbox`.
- Aucune iframe, aucun script tiers, aucun gestionnaire `on*` en ligne dans
  `public/`. Les images Discord passent toutes par le proxy `/api/img`.

## Tests

`test/v398-test.js` — **59 vérifications**, en trois parties :

1. la politique elle-même (directives présentes, une seule entorse) ;
2. **le serveur réel** : en-têtes reçus sur 5 chemins, y compris 404, API et
   derrière un proxy qui annonce `https` (HSTS), et absence de `x-powered-by` ;
3. la cohérence du front avec la politique (pas d'iframe, pas de script tiers,
   aucun `fetch()` absolu qui serait refusé par `connect-src`).

Les tests v131, v364 et v388 ont été adaptés : v364 et v388 lisaient la CSP par
expression régulière dans le source, ils interrogent maintenant le module ; v131
attendait l'ancienne liste de `Permissions-Policy`, désormais plus large.

Suite complète : **301 ✅ / 0 ❌**.

## Ce qui reste ouvert (et pourquoi)

- `style-src 'unsafe-inline'` : voir ci-dessus.
- La CSP d'une route peut être abaissée volontairement (les uploads le font,
  en restant sur notre origine). C'est un choix, pas un oubli ; aucun autre
  point du dépôt ne le fait.
- `Cross-Origin-Embedder-Policy` n'est **pas** posé : il casserait le service
  worker et les images, pour un bénéfice nul tant que le site n'utilise ni
  `SharedArrayBuffer` ni horloge haute résolution précise.
