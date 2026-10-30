# OFFRYA — Connexion Supabase (projet créé)

**Projet cible confirmé :** `hhxtutvmvlphkutqscad` (OFFRYA, Paris). Aucun changement à NextWeb Agency.

**Migration SQL :** `sql/schema.sql` est destinée à une base OFFRYA vierge ; les tables sont protégées par RLS. Les fonctions ayant besoin de privilèges élevés se trouvent dans `offrya_private`, un schéma non exposé à la Data API. Les trois fonctions RPC publiques sont `SECURITY INVOKER`, pour éviter d'exposer directement une fonction privilégiée.

## Démarrer

1. Dans Supabase → Project Settings → API Keys, récupérer la clé **publishable** (clé publique). Ne jamais partager `sb_secret_` ni le mot de passe PostgreSQL.
2. Dans Supabase → Authentication → Providers → Email, activer les inscriptions et **Confirm Email** ; désactiver la création de comptes anonymes. Dans URL Configuration, déclarer l'URL HTTPS finale du site comme Site URL, et les URL de redirection autorisées.
3. Copier `.env.example` vers `.env.local`. La valeur `SUPABASE_URL` est déjà celle du projet OFFRYA. Renseigner uniquement la clé `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` sur le serveur et lancer :

```sh
npm test
npm run dev
```

4. Ouvrir http://localhost:3000. Vérifier une inscription, confirmation e-mail, connexion, profil Client, mission, compte Pro, discussion privée, prise de contact, clôture de mission et favoris.
5. Déployer sur HTTPS avec `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` dans les variables d'environnement de l'hébergeur. Ne pas exposer les clés `sb_secret_`.

**Alertes email :** non activées. Ne renseigner `SUPABASE_SECRET_KEY`, `UNSUBSCRIBE_SECRET` et `RESEND_API_KEY` que lorsqu'un domaine d'envoi et le consentement auront été correctement configurés.

**Statut :** migration exécutée sur Supabase mais tests d'intégration multi-comptes et mise en ligne à faire. Le nom OFFRYA reste une identité candidate en attendant la vérification juridique définitive.

## Mode mise en relation — simplification

L’interface OFFRYA est centrée sur la publication, les filtres, la messagerie privée, les favoris et les alertes opt-in. Les prix, devis éventuels, accords et paiements se gèrent directement entre les parties **hors de la plateforme**. Aucune commission ni facturation ne sont actives.

La migration `sql/disable_quotes_contracts.sql` bloque les anciennes routes de devis/contrats au niveau des permissions Supabase. Les tables existantes sont conservées pour éviter toute suppression irréversible de données.
