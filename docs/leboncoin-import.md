# OFFRYA — Import des demandes externes

Préparation sur branche uniquement. Aucune activation en production.

## Étapes d'activation
1. Vérifier que l'autorisation écrite couvre la collecte et la rediffusion des annonces, avec des limites de volume et de fréquence.
2. Tester les sélecteurs des pages Leboncoin dans le périmètre permis, sans contournement des contrôles.
3. Lancer les tests Node.js avec `npm test`.
4. Appliquer manuellement `sql/leboncoin_external_opportunities.sql` sur le projet Supabase OFFRYA, après les migrations Premium.
5. Installer Playwright uniquement dans l'environnement isolé d'exécution du collecteur, pas dans le serveur web.
6. Fournir `LEBONCOIN_SEARCH_URLS` (tableau JSON d'URL /recherche autorisées) et `LEBONCOIN_COLLECTOR_ENABLED=true`.
7. Conserver `LEBONCOIN_DRY_RUN=true` pour la première vérification.
8. Pour stocker en privé, utiliser `LEBONCOIN_DRY_RUN=false`; les annonces restent en attente par défaut.
9. Après validation du droit de rediffusion, positionner `LEBONCOIN_REPUBLICATION_AUTHORIZED=true` et `LEBONCOIN_PUBLISH_ENABLED=true`.
10. Enfin, activer `OFFRYA_LEBONCOIN_ENABLED=true` après des tests RLS sur tous les types de comptes.

## Garanties
Le collecteur rejette les offres de services, les emplois et les ventes ; masque les coordonnées ; ne crée jamais de compte client fictif ; n'accède pas à la messagerie des utilisateurs Leboncoin ; arrête la collecte en cas de CAPTCHA ou d'interdiction.

## Limites de cette version
Le dispositif n'est pas encore testé contre des pages Leboncoin autorisées réelles. Il n'inclut pas encore de suivi automatique des retraits d'annonces précédemment importées. Aucune tâche planifiée n'est activée.
