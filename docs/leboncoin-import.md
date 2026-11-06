# OFFRYA — Import des demandes externes

Préparation sur branche uniquement. Aucune activation en production.

## Étapes d'activation
1. Vérifier que l'autorisation écrite couvre la collecte et la rediffusion des annonces, avec des limites de volume et de fréquence.
2. Tester les sélecteurs des pages Leboncoin dans le périmètre permis, sans contournement des contrôles.
3. Lancer les tests Node.js avec `npm test`.
4. Appliquer manuellement `sql/leboncoin_external_opportunities.sql`, puis `sql/leboncoin_removal_sync.sql` sur le projet Supabase OFFRYA, après les migrations Premium.
5. Installer Playwright uniquement dans l'environnement isolé d'exécution du collecteur, pas dans le serveur web.
6. Fournir `LEBONCOIN_SEARCH_URLS` (tableau JSON d'URL /recherche autorisées) et `LEBONCOIN_COLLECTOR_ENABLED=true`.
7. Conserver `LEBONCOIN_DRY_RUN=true` pour la première vérification.
8. Pour stocker en privé, utiliser `LEBONCOIN_DRY_RUN=false`; les annonces restent en attente par défaut.
9. Après validation du droit de rediffusion, positionner `LEBONCOIN_REPUBLICATION_AUTHORIZED=true` et `LEBONCOIN_PUBLISH_ENABLED=true`.
10. Enfin, activer `OFFRYA_LEBONCOIN_ENABLED=true` après des tests RLS sur tous les types de comptes.

## Garanties
Le collecteur rejette les offres de services, les emplois et les ventes ; masque les coordonnées ; ne crée jamais de compte client fictif ; n'accède pas à la messagerie des utilisateurs Leboncoin ; arrête la collecte en cas de CAPTCHA ou d'interdiction.

## Contrôle des annonces retirées
- Le script `scripts/sync-leboncoin-removals.js` relit au maximum 30 annonces déjà publiées, à intervalles espacés de 15 minutes minimum.
- Le premier HTTP 404/410 ou un titre explicite d'annonce indisponible ouvre un état « absence suspectée ».
- Une seconde confirmation au moins 15 minutes après marque le statut `expired`, retire aussitôt l'annonce du flux Premium et conserve un horodatage et la raison de la décision.
- Si l'annonce est de nouveau disponible, le compteur d'absence est remis à zéro.
- Un CAPTCHA, un HTTP 401/403/429/5xx, une redirection inattendue ou une page indéterminée n'est **pas** une preuve de suppression. Les restrictions d'accès arrêtent la synchronisation.
- Une annonce masquée/rejetée ne peut pas être réactivée par réimport : le collecteur insère uniquement les ID encore absents (`resolution=ignore-duplicates`).
- Le script est en simulation tant que `LEBONCOIN_DRY_RUN` n'est pas à `false`. Son exécution exige aussi `LEBONCOIN_SYNC_ENABLED=true` et `LEBONCOIN_COLLECTOR_ENABLED=true`.
- La tâche GitHub `.github/workflows/leboncoin-sync.yml` est **préparée mais inerte par défaut**, car ses variables de déclenchement sont absentes/désactivées. La planification n'est active qu'après fusion et activation explicite des variables ; ne pas l'activer sans droits vérifiés.

## Limites avant activation
- La consultation automatisée réelle n'a **pas** été réalisée : l'outil de navigation de cette session ne peut pas ouvrir les pages d'annonces du site (restriction robots.txt). Le HTML courant, les sélecteurs, les URL et la classification réelle ne sont donc pas validés.
- Aucune licence ou autorisation écrite détaillant la republication OFFRYA n'a été fournie. Vérifier séparément l'extraction, le volume de navigation et les droits de rediffusion des titres/descriptions.
- Le retrait automatique ne repose que sur deux **preuves positives d'indisponibilité**, pas sur l'absence d'une annonce dans une recherche. Les annonces dont la disponibilité devient ambiguë nécessitent une revue manuelle.
- Aucune migration Supabase n'a été exécutée, aucun environnement de production ni variable de planification n'a été modifié. Les tests GitHub utilisent des pages simulées.

