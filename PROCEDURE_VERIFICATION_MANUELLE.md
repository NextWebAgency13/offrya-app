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

Le support peut utiliser l'adresse **du compte Supabase Auth** pour organiser la prise de contact. **La demande d'assistance ne permet plus de contourner l'étape pièce d'identité + selfie vérifiés via Stripe Identity en mode live.** Ne pas suivre un numéro ou une adresse non vérifié fourni par le demandeur pour confirmer le mandat. Ne pas demander d'envoyer la pièce d'identité par e-mail.

Avant toute approbation, vérifier **indépendamment** :
- l'authenticité du document d'identité et sa correspondance avec la personne présente, par un entretien contrôlé en direct ou en présence ;
- la concordance du nom vérifié avec le nom de représentant indiqué dans OFFRYA ;
- le statut actif de l'entreprise dans les registres officiels ;
- la qualité de représentant légal (RNE/INPI) ou, pour un mandataire, le mandat authentifié auprès de l'entreprise sur un canal indépendant ;
- l'information RGPD, la proportionnalité et les modalités de conservation du dossier de contrôle.

L'opérateur peut marquer `contacting`, `scheduled`, `needs_information` ou `rejected` dans la table privée pour informer l'utilisateur, sans valider aucun privilège.

### Décision administrative sous la nouvelle règle

Une demande d'assistance n'est pas une vérification biométrique. Aucun opérateur ne doit tenter de valider un dossier via une procédure SQL de présence manuelle. **Seuls la pièce et le selfie contrôlés par Stripe Identity en mode réel, puis le rapprochement du nom avec le dirigeant officiel, peuvent fournir les preuves requises.**

Une fois ces preuves collectées et rapprochées (`registry_name_matched=true` depuis la source gouvernementale), un opérateur autorisé peut examiner le dossier et l'approuver par une procédure administrative contrôlée. La base rejette toute approbation si le demandeur est salarié ou mandataire non inscrit, si le selfie n'a pas été vérifié ou si la concordance officielle manque. L'abonnement à 34,99 € TTC/mois n'est proposé qu'après approbation réelle.

## Mise en service

- Migration : `sql/manual_identity_review_requests.sql`, projet Supabase **OFFRYA** exclusivement.
- Le bouton intégré au site n'envoie **pas automatiquement d'e-mail à l'opérateur**. Le support doit examiner régulièrement la file d'attente Supabase et recontacter les demandeurs.
- Si Stripe Identity est activé plus tard, le bouton de vérification automatique réapparaît, et l'alternative manuelle reste proposée.
- Configurer un processus administratif effectif et contrôlé avant de promouvoir la disponibilité de ce service.

## Sécurité et confidentialité

- Toute demande n'est qu'un ticket administratif. L'accès professionnel reste protégé par `offrya_private.has_active_professional_access()` et `offrya_private.guard_professional_approval()`.
- Aucun droit de mise à jour du statut n'est accordé à `authenticated`, aucun droit de lecture à `anon`.
- La validation physique nécessite une procédure concrète, un opérateur formé et une documentation de l'examen. Ne pas conserver d'images de documents dans Supabase.
