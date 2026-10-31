# OFFRYA — Contrôle humain de l'identité professionnelle

Lorsque Stripe Identity n'est pas configuré dans Render, l'espace professionnel affiche **Demander une vérification manuelle** au lieu d'un bouton automatique désactivé.

## Flux côté professionnel

1. Le dossier professionnel doit être déjà déposé : SIRET contrôlé et statut `pending`.
2. Le professionnel clique sur « Demander une vérification manuelle ».
3. Une ligne est créée dans `public.offrya_manual_identity_requests` pour son propre utilisateur. Le dossier **ne passe pas en `verified`**.
4. La page affiche la réception et l'état d'avancement de la demande, y compris après reconnexion.
5. Un responsable OFFRYA consulte la file d'attente dans Supabase, organise un contrôle documentaire et de présence sécurisé, vérifie le mandat par un canal indépendant, puis prend une décision.

**Aucun document d'identité ni photo de pièce ne doit être envoyé par e-mail ou intégré dans cette table.**
La table contient uniquement un identifiant de compte, un statut et des dates. Les utilisateurs peuvent demander et consulter **uniquement leur propre dossier**, jamais modifier eux-mêmes le statut.

## Traitement par un opérateur habilité

Depuis l'éditeur SQL privé du projet Supabase OFFRYA :

```sql
-- File d'attente administrative : ne pas partager les résultats publiquement.
select q.user_id, u.email, q.status, q.requested_at
from public.offrya_manual_identity_requests q
join auth.users u on u.id=q.user_id
order by q.requested_at asc;
```

Le support peut utiliser l'adresse **du compte Supabase Auth** pour organiser la prise de contact. Ne pas suivre un numéro ou une adresse non vérifié fourni par le demandeur pour confirmer le mandat. Ne pas demander d'envoyer la pièce d'identité par e-mail.

Avant toute approbation, vérifier **indépendamment** :
- l'authenticité du document d'identité et sa correspondance avec la personne présente, par un entretien contrôlé en direct ou en présence ;
- la concordance du nom vérifié avec le nom de représentant indiqué dans OFFRYA ;
- le statut actif de l'entreprise dans les registres officiels ;
- la qualité de représentant légal (RNE/INPI) ou, pour un mandataire, le mandat authentifié auprès de l'entreprise sur un canal indépendant ;
- l'information RGPD, la proportionnalité et les modalités de conservation du dossier de contrôle.

L'opérateur peut marquer `contacting`, `scheduled`, `needs_information` ou `rejected` dans la table privée pour informer l'utilisateur, sans valider aucun privilège.

### Approbation uniquement après vérification réelle

Un opérateur avec les droits SQL administratifs peut, **après avoir lui-même effectué et documenté les contrôles**, effectuer la mise à jour ci-dessous en remplaçant les UUIDs et la méthode du mandat. L'exemple est une procédure administrative, **pas une commande à exécuter automatiquement**.

```sql
begin;

-- Doit rester 'pending' si la preuve réelle d'identité et du mandat manque.
update public.offrya_premium_requests
set identity_status='verified',
    identity_verified_at=now(),
    identity_live_verified=true,
    presence_method='manual_live_check',
    presence_verified_at=now(),
    presence_reviewed_by='REVIEWER_UUID'::uuid,
    authority_status='verified',
    authority_verified_at=now(),
    authority_review_method='registry_representative',
    authority_reviewed_by='REVIEWER_UUID'::uuid
where user_id='USER_UUID'::uuid and status='pending';

-- Le déclencheur offrya_guard_professional_approval empêche toute
-- approbation sans les preuves nécessaires.
update public.offrya_premium_requests
set status='verified', reviewed_at=now()
where user_id='USER_UUID'::uuid and status='pending'
  and identity_status='verified' and identity_live_verified=true
  and presence_method='manual_live_check' and presence_reviewed_by is not null
  and authority_status='verified' and authority_reviewed_by is not null;

update public.offrya_manual_identity_requests
set status='completed', updated_at=now(), reviewed_at=now(),
    reviewed_by='REVIEWER_UUID'::uuid
where user_id='USER_UUID'::uuid;
commit;
```

Pour un salarié/mandataire, utiliser `authority_review_method='independent_mandate'` **uniquement après confirmation authentique par l'entreprise**. Ne pas renseigner des résultats `verified` pour tester l'interface ni contourner Stripe Identity.

Le passage en `verified` **n'active aucun abonnement** : le professionnel doit ensuite souscrire à 34,99 € TTC/mois et le paiement doit être confirmé par Stripe. La RLS interdit toujours la lecture des missions d'autrui tant que l'ensemble des conditions n'est pas satisfait.

## Mise en service

- Migration : `sql/manual_identity_review_requests.sql`, projet Supabase **OFFRYA** exclusivement.
- Le bouton intégré au site n'envoie **pas automatiquement d'e-mail à l'opérateur**. Le support doit examiner régulièrement la file d'attente Supabase et recontacter les demandeurs.
- Si Stripe Identity est activé plus tard, le bouton de vérification automatique réapparaît, et l'alternative manuelle reste proposée.
- Configurer un processus administratif effectif et contrôlé avant de promouvoir la disponibilité de ce service.

## Sécurité et confidentialité

- Toute demande n'est qu'un ticket administratif. L'accès professionnel reste protégé par `offrya_private.has_active_professional_access()` et `offrya_private.guard_professional_approval()`.
- Aucun droit de mise à jour du statut n'est accordé à `authenticated`, aucun droit de lecture à `anon`.
- La validation physique nécessite une procédure concrète, un opérateur formé et une documentation de l'examen. Ne pas conserver d'images de documents dans Supabase.
