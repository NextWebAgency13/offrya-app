# OFFRYA — autorisation : procédure de validation avant production

**Statut : préparation uniquement. Ne pas fusionner ni déployer sans validation.**

## Incidents confirmés dans la base de production (lecture seule)

- `offrya_missions` : politique `missions_guest_owner_only` déployée comme **PERMISSIVE**, bien que le fichier SQL historique la définisse **RESTRICTIVE**. Les politiques SELECT permissives sont combinées en OR. Compte connecté ≠ autorisation de lire toute mission.
- `offrya_profiles` : `profile_read USING (true)` pour `authenticated` ; la table contient notamment des noms affichés, rôles, villes et spécialités.
- `offrya_conversations` et `offrya_messages` : les politiques actuelles imposent les participants et, pour le professionnel, un accès actif. Il faut les tester, sans les élargir.
- `offrya_private.has_active_professional_access()` : contient encore une branche `has_temporary_premium_access()`. Au dernier audit, **un** octroi temporaire était actif. Le SQL proposé le rend sans effet sans effacer la trace d'audit.
- `public.offrya_test_premium_expires_at()` : EXECUTE encore accessible à `authenticated` ; révocation proposée. La fonction n'attribue pas elle-même de droit.

## Séquence de validation

1. Créer une **branche Supabase jetable** avec copie des règles et des données de test non personnelles. Ne pas appliquer le script `sql/security_rls_premium_staged_review.sql` dans la base de production.
2. Exécuter le script proposé sur cette branche, après examen SQL par l'administrateur de la base. Vérifier `pg_policies.permissive = 'RESTRICTIVE'` pour `missions_guest_owner_only`.
3. Construire les identités **de test** A (demandeur confirmé), B (autre demandeur confirmé), C (dirigeant vérifié avec abonnement actif), D (professionnel non abonné), E (utilisateur invité historique). Utiliser les vrais JWT ou la simulation des claims PostgREST dans une transaction dédiée.
4. Publier deux missions de test avec A et B ; contrôler en lecture, avec les authentifications distinctes :
   - A voit sa mission, pas celle de B ; B voit la sienne, pas celle de A.
   - C voit les missions ouvertes pertinentes ; D et un visiteur non connecté n'en voient aucune, sauf leurs propres données.
   - E peut **consulter une mission historique dont il est propriétaire**, mais pas publier une nouvelle mission avec l'ancienne session invitée.
   - Une mission `closed` appartenant à A demeure visible à A ; elle ne devient pas publique pour C.
5. Créer des conversations tests A↔C, B↔C et deux messages distincts :
   - A voit A↔C et les messages associés, jamais B↔C ; B voit seulement B↔C.
   - C voit les conversations auxquelles il participe lorsque son droit Premium est actif.
   - D, E et le compte non connecté ne peuvent consulter aucune conversation tierce.
   - A et C peuvent voir le profil de leur correspondant ; B ne peut pas parcourir tous les profils.
6. Refuser le Premium quand le paiement est absent, expiré ou annulé, quand l'identité dirigeant est invalide, ou lorsque **seule** une ancienne autorisation de test existe. C doit rester autorisé tant qu'il est vérifié et payé.
7. Réaliser les parcours complets sur Android et ordinateur : inscription après confirmation e-mail ; publication et consultation propriétaire ; souscription Stripe ; messagerie privée ; veille BOAMP/TED ; retour entre Accueil et Espace pro.
8. Vérifier le comportement en cas d'échec d'une requête Supabase : aucune permission supplémentaire ne doit être accordée. Examiner les journaux, mesures RLS et les tests GitHub.

## Rollout sécurisé

- Le SQL est un **script de revue**, pas une migration appliquée. Une future migration doit être créée selon la CLI du projet et testée sur une branche.
- Prévoir une sauvegarde, une procédure de retour arrière contrôlée, et déployer **de concert** frontend/serveur et politiques SQL. Une mise à jour du code seule ne suffit pas à verrouiller les accès directs via l'API Supabase.
- Impact attendu : le compte disposant de la concession temporaire active **perdra l'accès Premium** jusqu'à la vérification réelle du dirigeant et l'activation de son abonnement. Ne pas supprimer les octrois historiques sans approbation et stratégie d'audit.
- La politique de profils réduit l'accès au profil personnel et aux correspondants des conversations : tester les noms des participants et l'annuaire professionnel. Si un annuaire public est requis, utiliser des vues/RPC explicitement filtrés et des champs publics minimaux, jamais `SELECT *` sur les profils privés.

## Travaux séparés avant la prochaine production

- **Turnstile :** configurer la clé publique via Render et valider la configuration CAPTCHA côté Supabase Auth ; vérifier effectivement le jeton par le fournisseur. Une clé publique seule ne sécurise pas un flux.
- **Envoi e-mail :** `RESEND_API_KEY` actuellement absent d'après le diagnostic ; activer seulement après vérification du domaine, consentement et tests de délivrabilité.
- **Information publique :** réduire `/api/health` à la disponibilité, éviter les indicateurs IA, paiement et messagerie.
- **DNS / TLS :** rediriger `offrya-app.onrender.com` vers `offrya.fr` selon la configuration de Render et ses possibilités ; vérifier tous les sous-domaines avant `includeSubDomains` HSTS.
- **Dépendances et politique de sécurité :** verrouiller le chargement de Supabase JS (auto-hébergé ou intégrité vérifiable), publier `/.well-known/security.txt` avec une adresse de contact confirmée.
- **Avis Supabase :** vérifier séparément les fonctions `SECURITY DEFINER` intentionnellement publiques et activer la détection des mots de passe compromis si elle est disponible.

**Aucune action d'administration sur Render, Stripe ou Supabase production n'est prévue dans cette PR.**
