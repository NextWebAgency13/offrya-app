# OFFRYA — validation de l'identité et du mandat professionnel


## Nouveau parcours et reprise du dossier (octobre 2026)

L'onglet **Espace professionnel** comporte quatre étapes : (1) identification de l'entreprise, (2) représentant et qualité de dirigeant ou mandataire, (3) dépôt du dossier et contrôles de l'identité et du mandat, (4) abonnement. Aucun code TOTP, QR code ni facteur MFA n'est exigé pour déposer le dossier. L'onglet **Marchés publics** est séparé et reste contrôlé par les autorisations RLS et côté serveur.

Les informations des deux premières étapes sont enregistrées uniquement au clic sur **Continuer** dans la table `offrya_professional_drafts`, avec une politique RLS limitée au propriétaire, et peuvent être reprises après connexion. Ces brouillons n'accordent aucun droit de consultation d'autres missions, de messagerie professionnelle ou d'abonnement. Après le dépôt réussi du dossier dans `offrya_premium_requests`, le brouillon est supprimé.

La reprise d'un dossier existant après connexion ne redéclenche **ni inscription ni paiement**. Les anciennes demandes dont le brouillon indique l'étape 3 continuent directement à la vérification du dossier. Ne pas approuver un dossier avant la validation indépendante de la qualité du représentant.

Le champ `representative_kind` permet de distinguer la déclaration d'un **dirigeant** ou d'un **mandataire** ; c'est une information déclarative à confirmer hors application par un opérateur. Aucune de ces déclarations ne prouve une autorisation.

Migration additionnelle à appliquer sur le projet OFFRYA : `sql/professional_onboarding_drafts.sql`.

## Prérequis (à ne pas confondre avec Stripe Billing)

Le SIRET est contrôlé au dépôt. Un SIRET valide ne prouve pas l'identité ni la qualité de représentant de la personne connectée. Un compte pro ne devient éligible **que si** :

1. la personne utilise un compte identifié (les sessions invitées sont explicitement exclues) ;
2. Stripe Identity a confirmé le contrôle du document de la personne (le selfie est une option à évaluer juridiquement, désactivée par défaut) ;
3. une présence réelle a été confirmée par la comparaison selfie de Stripe Identity **en mode live**, ou par un entretien sécurisé et documenté avec un opérateur ;
4. un opérateur OFFRYA a comparé l'identité déclarée avec celle vue chez le prestataire, confirmé la présence de l'entreprise au registre, puis contrôlé **indépendamment** le mandat du représentant ;
5. le dossier porte le statut `verified` **et** l'abonnement Stripe est actif et payé.

Les règles RLS et les API BOAMP/Stripe protègent ces étapes côté serveur. Les clients conservent le droit de publier gratuitement des missions.

## Configuration indispensable

1. Exécuter la migration historique `sql/professional_identity_mfa.sql` puis **sa mise à jour** `sql/professional_without_mfa.sql` sur le projet Supabase OFFRYA (jamais NextWeb). La seconde remplace la condition AAL2 par le refus des comptes invités, sans affaiblir les contrôles d'identité, de présence, d'habilitation et de paiement.
2. Vérifier que la clé secrète Stripe a les droits sur Stripe Identity. Les clés de paiement restreintes ne disposent pas nécessairement de ces permissions ; la configuration Identity requiert actuellement une clé `sk_test_` ou `sk_live_`.
3. Ajouter `STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_...` dans les variables **secrètes Render**, à partir d'un **nouvel endpoint Stripe Identity** `https://offrya-app.onrender.com/api/identity/webhook`.
4. Souscrire cet endpoint aux événements :
   - `identity.verification_session.verified`
   - `identity.verification_session.requires_input`
   - `identity.verification_session.redacted`
   - `identity.verification_session.canceled`
5. Contrôler `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` et `STRIPE_SECRET_KEY` côté serveur. Ne jamais exposer les secrets au navigateur.
6. Laisser `OFFRYA_IDENTITY_SELFIE_ENABLED=false` tant que l'analyse RGPD, l'information des personnes, le contrat du prestataire et, si nécessaire, l'AIPD n'ont pas été validés. Le contrôle de document fonctionne sans selfie. Prévoir une alternative non biométrique ou manuelle proportionnée au risque.

**Ne pas activer une vérification d'identité en direct sans avoir complété les obligations RGPD**, notamment l'identification du responsable de traitement, les durées de conservation, les transferts, les bases légales et la documentation d'un traitement biométrique éventuel.

## Revue manuelle : étape impérative

Pour chaque demande en attente :
- lire le SIRET, la raison sociale, le nom complet déclaré et la fonction ;
- contrôler le résultat **Stripe Identity** en affichant le dossier correspondant à `stripe_identity_session_id` dans le tableau de bord Stripe, sans télécharger de copie dans OFFRYA ; comparer **l'identité réellement vérifiée** au nom déclaré ;
- comparer le représentant au registre INPI/RNE lorsque disponible ; sinon, obtenir un mandat via un canal sécurisé et confirmer son authenticité **auprès de l'entreprise par un canal indépendant du demandeur** ;
- si le contrôle selfie n'a pas été activé, conduire un entretien permettant de vérifier que le porteur du document correspond bien au demandeur ; dater le contrôle et saisir la méthode `manual_live_check`, la date et l'identifiant de l'opérateur ;
- dater l'examen, conserver la méthode et l'identifiant de l'opérateur ; décider du dossier `verified` ou `rejected`.

Le propriétaire du projet doit créer le canal opérationnel de vérification. À défaut, **ne pas approuver**. La vérification du document par Stripe ne valide jamais automatiquement l'habilitation.

### Exemple de validation SQL à adapter par un opérateur autorisé

```sql
-- Après consultation indépendante des justificatifs et concordance de l'identité.
-- Remplacer les UUIDs par ceux du dossier et de l'opérateur autorisé.
-- Si le représentant figure au registre : registry_representative
-- Si mandat confirmé indépendamment : independent_mandate
begin;
update public.offrya_premium_requests
set presence_method='manual_live_check',
    presence_verified_at=now(),
    presence_reviewed_by='REVIEWER_UUID'::uuid,
    authority_status='verified',
    authority_verified_at=now(),
    authority_review_method='registry_representative',
    authority_reviewed_by='REVIEWER_UUID'::uuid
where user_id='USER_UUID'::uuid
  and status='pending'
  and identity_status='verified'
  and identity_live_verified is true
  and identity_verified_at is not null;
update public.offrya_premium_requests
set status='verified', reviewed_at=now()
where user_id='USER_UUID'::uuid
  and status='pending'
  and identity_status='verified'
  and identity_live_verified is true
  and presence_verified_at is not null
  and authority_status='verified'
  and authority_verified_at is not null;
commit;
```

Le déclencheur SQL empêche une approbation tant que les preuves ne sont pas renseignées ; les utilisateurs et le navigateur n'ont aucun droit d'écriture sur ces champs.

## Tests d'acceptation

- Visiteur : pas de lecture des missions d'autrui.
- Client : publication gratuite, accès à ses propres missions.
- Pro identifié avec une session classique AAL1, identité, mandat, entreprise vérifiés et abonnement payé : accès aux missions/BOAMP.
- Pro avec SIRET valide mais identité non vérifiée : aucun accès.
- Session invitée ou non authentifiée : aucun accès aux missions d'autrui, quel que soit le reste du dossier.
- Pro avec Stripe Identity `verified`, sans mandat approuvé : aucun accès.
- Pro avec mandat approuvé, sans abonnement actif : aucun accès.
- Pro remplissant toutes les conditions : accès.
- Webhook non signé, rejoué hors fenêtre, ou session non correspondante : rejet / aucune élévation.
- Révocation/redaction Stripe après approbation : identité révoquée et dossier de nouveau en attente.

Le résultat d'un test Stripe (`sk_test_`) n'est **pas** une vérification d'identité réelle et ne peut pas servir de justificatif pour valider un dossier de production. Les clés Stripe test et live ne doivent pas être mélangées.

## Documentation

- Stripe Identity : https://docs.stripe.com/identity
- CNIL : https://www.cnil.fr

## Simplification de l'authentification (31 octobre 2026)

La MFA TOTP obligatoire a été retirée de tous les écrans et appels API professionnels. **Ce changement ne désinscrit pas automatiquement les facteurs qu'un utilisateur avait déjà activés auprès de Supabase Auth.** Ces facteurs existants doivent être révoqués individuellement si nécessaire, avec les mécanismes sécurisés de Supabase. Une capture contenant un QR code ou une clé TOTP d'inscription doit être traitée comme un secret divulgué : si la clé a été activée, révoquer le facteur et ne jamais réutiliser cette clé.

La vérification réelle du représentant, la preuve de présence, le mandat indépendant, la validation administrative et le paiement sont toujours exigés. Le contrôle d'accès SQL dépend de `offrya_private.has_active_professional_access()` mis à jour par `sql/professional_without_mfa.sql`.

## Règle obligatoire (31 octobre 2026)

Tout passage en statut professionnel `verified` impose un compte de dirigeant (pas salarié/mandataire), la vérification **document et selfie** live Stripe Identity, la concordance exacte du nom vérifié avec un **dirigeant personne physique du registre officiel RNE/Sirene** et l’approbation administrative. L’ancienne procédure de contrôle purement manuel ne suffit plus. `sql/legal_representative_only.sql` est la migration faisant autorité et remplace les règles historiques plus permissives, y compris `independent_mandate` et `manual_live_check`. Le mode test Stripe ne prouve rien.
