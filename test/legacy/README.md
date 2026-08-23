# Tests hérités (non exécutés par la suite automatique)

Ces tests ont été écrits pour d'anciennes versions du système de tickets et
des modules associés (avant la refonte v85/v86 du 21-22 août 2026). La refonte
a **volontairement** changé les comportements qu'ils vérifiaient :

- accusé de réception immédiat (`deferReply`/`deferUpdate`) sur tous les boutons (v86)
- fiches `open_tickets` en base + numérotation par serveur (v85)
- boutons réservés au staff, bouton créateur supprimé (v86)
- titres/descriptions des panneaux mis à jour

Les fonctionnalités qu'ils couvraient sont testées par les tests **actuels**
(v85-test, v86 via v85/v87/v88, smoke) qui passent tous.

Ils sont conservés ici pour l'historique. **Ne pas les remettre dans `test/`**
sans les réécrire contre le comportement actuel.

| Fichier | Raison |
|---|---|
| tickets-types-test.js | titre du panneau changé depuis |
| tickets-v13-test.js | fiche open_tickets créée désormais (UNIQUE constraint dans le vieux scénario) |
| tickets-v14-test.js | fake interaction sans `editReply` (deferReply v86) |
| tickets-v15-test.js | description du menu changée |
| v24-test.js | fake interaction sans `editReply` (deferReply v86) |
| v33-test.js | comportements multiples remplacés |
| v39-test.js | flux d'ouverture de ticket refondu (v85) |
