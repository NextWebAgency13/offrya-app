# Connexion Supabase — OFFRYA

- Projet Supabase : `hhxtutvmvlphkutqscad`, région `eu-west-3` (Paris).
- Installation réussie : migration `offrya_marketplace_initial`.
- Correction RLS : migration `offrya_fix_mission_rls_recursion`.
- 12 tables `public.offrya_*`, toutes protégées RLS et avec privilèges minimaux.
- Fonctions PostgreSQL privilégiées exclusivement dans `offrya_private` et wrappers RPC `SECURITY INVOKER` dans `public`.
- Tests SQL transactionnels effectués avec trois identités éphémères (ROLLBACK) : client → mission, pro → discussion/message/devis, client → acceptation/contrat ; tiers interdit de lecture des échanges et contrats.
- Tests Node à lancer avec `npm test`.
- Clé publique Supabase intégrée au fichier `.env.example` ; aucune clé secrète n'est intégrée.
- Notifications et paiements restent **désactivés**.

## Actions restantes

1. Configurer Auth Email avec confirmation obligatoire et URL de redirection de l'application.
2. Déployer le serveur Node.js HTTPS avec `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`.
3. Effectuer le cycle Auth avec de vrais comptes et confirmer les notifications emails uniquement une fois le domaine vérifié.
4. Tester la source BOAMP depuis l'hébergement.
5. Mettre à jour la politique de confidentialité et les mentions légales avant ouverture publique.

Le projet NextWeb Agency `akghlyxqgfblhrvzsqcc` n'a pas été modifié.

**Nouvelle version :** après la migration initiale et le correctif RLS, appliquer `sql/disable_quotes_contracts.sql` pour désactiver les anciens modules de devis et contrats, sans effacer leurs tables.
