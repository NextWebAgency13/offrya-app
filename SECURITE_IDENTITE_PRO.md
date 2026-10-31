# OFFRYA — validation de l'identité et du mandat professionnel


## Nouveau parcours et reprise du dossier (octobre 2026)

L'onglet **Espace professionnel** comporte cinq étapes : (1) identification de l'entreprise, (2) représentant et qualité de dirigeant ou mandataire, (3) MFA TOTP, (4) contrôle de l'identité et du mandat, (5) abonnement. L'onglet **Marchés publics** est séparé et reste contrôlé par les autorisations RLS et côté serveur.

Les informations des deux premières étapes sont enregistrées uniquement au clic sur **Continuer** dans la table `offrya_professional_drafts`, avec une politique RLS limitée au propriétaire, et peuvent être reprises après connexion. Ces brouillons n'accordent aucun droit de consultation d'autres missions, de messagerie professionnelle ou d'abonnement. Après le dépôt réussi du dossier dans `offrya_premium_requests`, le brouillon est supprimé.

La reprise du second facteur MFA d'un professionnel ayant un dossier en cours ou un abonnement déjà payé ne redéclenche **ni inscription ni paiement**. Ne pas approuver un dossier avant la validation indépendante de la qualité du représentant.

Le champ `representative_kind` permet de distinguer la déclaration d'un **dirigeant** ou d'un **mandataire** ; c'est une information déclarative à confirmer hors application par un opérateur. Aucune de ces déclarations ne prouve une autorisation.

Migration additionnelle à appliquer sur le projet OFFRYA : `sql/professional_onboarding_drafts.sql`.

## Prérequis (à ne pas confondre avec Stripe Billing)

Le SIRET est contrôlé au dépôt. Un SIRET valide ne prouve pas l'identité ni la qualité de représentant de la personne connectée. Un compte pro ne devient éligible **que si** :

1. l'utilisateur a activé et validé un second facteur TOTP (niveau Supabase AAL2) ;
2. Stripe Identity a confirmé le contrôle du document de la personne (le selfie est une option à évaluer juridiquement, désactivée par défaut) ;
3. une présence réelle a été confirmée par la comparaison selfie de Stripe Identity **en mode live**, ou par un entretien sécurisé et documenté avec un opérateur ;
4. un opérateur OFFRYA a comparé l'identité déclarée avec celle vue chez le prestataire, confirmé la présence de l'entreprise au registre, puis contrôlé **indépendamment** le mandat du représentant ;
5. le dossier porte le statut `verified` **et** l'abonnement Stripe est actif et payé.

Les règles RLS et les API BOAMP/Stripe protègent ces étapes côté serveur. Les clients conservent le droit de publier gratuitement des missions.

## Configuration indispensable

1. Exécuter `sql/professional_identity_mfa.sql` **sur le projet Supabase OFFRYA**, jamais sur celui de NextWeb.
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
- Pro sans AAL2 : aucun accès aux missions/BOAMP et aucun abonnement.
- Pro AAL2, SIRET valide, identité non vérifiée : aucun accès.
- Pro avec Stripe Identity `verified`, sans mandat approuvé : aucun accès.
- Pro avec mandat approuvé, sans abonnement actif : aucun accès.
- Pro remplissant toutes les conditions : accès.
- Webhook non signé, rejoué hors fenêtre, ou session non correspondante : rejet / aucune élévation.
- Révocation/redaction Stripe après approbation : identité révoquée et dossier de nouveau en attente.

Le résultat d'un test Stripe (`sk_test_`) n'est **pas** une vérification d'identité réelle et ne peut pas servir de justificatif pour valider un dossier de production. Les clés Stripe test et live ne doivent pas être mélangées.

## Documentation

- Supabase MFA : https://supabase.com/docs/guides/auth/auth-mfa
- Stripe Identity : https://docs.stripe.com/identity
- CNIL : https://www.cnil.fr
