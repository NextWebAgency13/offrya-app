# Playwright et Supabase Queues — OFFRYA

## Tests Playwright

La suite Node existante reste gérée par `npm test`. La nouvelle suite navigateur
est indépendante : `npm run test:e2e`.

Installation locale : `npm install`, puis `npx playwright install chromium`.
Le serveur OFFRYA de test démarre sur `127.0.0.1:4173` sans configuration
Stripe ou Supabase de production. Sur GitHub, le workflow
`.github/workflows/playwright-e2e.yml` teste deux résolutions :
Chromium ordinateur (1440×900) et émulation Android Pixel 7.

Captures et rapport HTML : artefact `offrya-playwright-report` de chaque PR.
Les captures sont celles des pages publiques, **jamais des comptes réels**.
Les tests de droits Premium de bout en bout demanderaient des comptes jetables
dans un environnement Supabase de préproduction séparé : ne pas utiliser
des identifiants réels dans les tests de PR.

## Supabase Queues

Le schéma est dans `sql/offrya_background_queues.sql`, appliqué au seul
projet OFFRYA `hhxtutvmvlphkutqscad`.

- `offrya_ai_jobs` : analyse IA / DCE futurs.
- `offrya_import_jobs` : importations autorisées et synchronisations futures.
- `offrya_notification_jobs` : traitements de notification futurs.

Files **durables** (`pgmq.create`), stockées dans le schéma privé `pgmq`.
Aucun accès PostgREST public, aucun droit aux rôles `anon` /
`authenticated`. Ne pas exposer `pgmq_public` aux clients.

L'activation de l'extension et la création des files **n'installent pas un
consommateur** : aucun envoi, import ou appel IA n'est lancé. Les services
existants continuent de fonctionner sans modification.

Pour connecter ultérieurement un worker Render :
1. Utiliser une connexion PostgreSQL serveur sécurisée (jamais dans le navigateur).
2. Prévoir une clé d'idempotence par tâche; PGMQ peut redélivrer un message
   après expiration de son délai de visibilité.
3. Faire `pgmq.read`, traiter la tâche, puis `pgmq.archive` seulement
   **après** réussite; journaliser les erreurs et borner les tentatives.
4. Valider l'état Premium / consentement à l'instant du traitement des tâches
   sensibles, et ne jamais mettre de secret ni de document DCE en clair
   dans le message (stocker seulement une référence privée).
5. Tester sur un environnement non productif avant d'activer l'aiguillage
   des tâches existantes.

Documentation officielle : https://supabase.com/docs/guides/queues/pgmq
