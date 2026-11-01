# OFFRYA — Audit technique du 1er novembre 2026

**Périmètre :** dépôt `NextWebAgency13/offrya-app`, branche `main` (commit de référence `599a8700708b7c6f17f617c81b705823a45efd51`), CI GitHub Actions, métadonnées Supabase OFFRYA accessibles en lecture seule. Aucun accès aux secrets, aucun paiement, aucune modification de schéma ni simulation réelle d'identité n'ont eu lieu.

## 1. Architecture

- **Runtime** : Node.js CommonJS sans framework (`server.js`), frontend HTML/CSS/JS statique (`public/`), API de consultation BOAMP et contrôles de droits professionnels (`lib/`).
- **Pages publiques** : `/`, `/deposer-une-mission`, `/professionnels`, `/connexion`, six pages `/secteurs/…`, documents légaux, robots et sitemap, 404 réelle.
- **Pages privées** : `/espace`, `/espace/missions`, `/espace/marches-publics`, `/espace/messagerie`, `/espace/reglages`, `/espace/professionnel`. Document HTML privé commun (`public/espace.html`) et navigation par History API (`public/app.js`).
- **Base** : 17 tables `public.offrya_*`, RLS activée sur les 17, plusieurs fonctions et triggers `offrya_private`. 16 migrations appliquées recensées ; production déjà migrée vers l'interdiction des nouvelles publications anonymes.
- **Connexions** : Supabase Auth (`public/connexion.js`). **Situation actuelle :** adresse e-mail confirmée et compte requis pour une nouvelle publication. Les anciennes sessions invitées sont conservées pour leur suivi historique.
- **Offre pro** : SIRET via API Recherche d'Entreprises, Stripe Identity (document et selfie), rapprochement avec les dirigeants officiels, revue administrative, Stripe Billing 34,99 € TTC mensuels.
- **Notifications** : alertes opt-in et récapitulatifs (Resend, GitHub Actions). Les modèles d'envoi vérifient les préférences et droits Premium.
- **Déploiement** : Render Node en plan gratuit déclaré dans `render.yaml`, GitHub Actions pour tests et contrôles HTTP.

## 2. Règles métier définitivement arrêtées et divergences documentaires

1. **Décision définitive du 1er novembre 2026 :** toute nouvelle mission nécessite un **compte gratuit avec adresse e-mail confirmée avant publication**. Le dépôt anonyme est abandonné. Ne pas réactiver les sessions invitées pour publier, ni affaiblir `sql/confirmed_mission_authors.sql`. Les anciens invités gardent uniquement les droits déjà acquis sur leurs propres missions, sans suppression ni réattribution automatique. Cette règle prime toute mention historique de « dépôt sans compte ».
2. Le cahier exige le CTA « Devenir professionnel », alors que la vitrine et les derniers choix éditoriaux utilisent « Devenir Premium ». Décision de vocabulaire requise avant harmonisation.
3. Certains documents historiques du dépôt décrivent 19 € et une consultation publique des missions ; ils sont désormais faux, contrairement aux contrôles actifs à 34,99 €. Mettre à jour ces documents **sans changer les textes juridiques**.

## 3. Couverture fonctionnelle — section 6 du cahier des charges

| Périmètre | État | Constat et suite |
| --- | --- | --- |
| Demandeur e-mail, téléphone, anti-abus | **Incomplet** | E-mail confirmé + anti-doublon natif Auth, limites SQL par compte et limites HTTP en mémoire; pas de preuve de possession du téléphone, CAPTCHA global et contrôle distribué non démontrés. |
| Modération, signalement de mission/message/profil | **Manquant** | Aucun formulaire/route/table de signalement ni file de modération recensé. Migration SQL et approbation nécessaires. |
| Back-office administrateur sécurisé et journal d'audit | **Manquant** | Procédures manuelles de vérification seulement ; `offrya_consent_audit` concerne le consentement, pas les actes administrateur. Rôles, RLS, historique et suspension à concevoir avec accord. |
| Cycle Stripe abonnement | **Incomplet** | Checkout, signature webhook, resynchronisation Stripe au dernier état, portail, statuts et restrictions actifs. Pas de matrice complète de tests bout en bout ni de reprise/surveillance des anomalies de webhooks. |
| Dirigeants atypiques, contrôle d'identité et revérification | **Incomplet** | Normalisation des noms, directeurs du registre, selfie Stripe live et contrôle manuel partiels ; pas de prise en charge complète des changements de dirigeant, recontrôles périodiques et alternatives documentées. |
| Suivi invité par e-mail facultatif | **Incomplet / suspendu** | Historique invité encore prévu par les migrations ; nouvelle publication invitée interdite. Dépend de la décision métier. |
| Alertes opt-in, préférences, opposition | **Existe (partiel)** | Travailleurs GitHub Actions, opt-in et désabonnement signés, pas de test de bout en bout de l'acheminement ni de surveillance générale des échecs. |
| Collaborateurs sous contrôle dirigeant | **Manquant** | Aucun mécanisme d'invitation/révocation et RLS associé. À distinguer du droit de souscrire, réservé au dirigeant. |
| Messagerie renforcée | **Incomplet** | Messages privés et limites de débit côté base, sans pièces jointes sécurisées, indicateurs lus, signalement ni blocage. |
| Export / suppression de compte RGPD | **Manquant dans l'interface** | Les suppressions administratives sont possibles dans Supabase, aucun parcours d'export/suppression utilisateur ou rétention documentée par fonctionnalité. |
| Export CSV BOAMP | **Existe** | Endpoint protégé, CSV échappé contre injection de formules et testé ; test de volume/source à compléter. |
| Pages secteurs, sitemap, JSON-LD, noindex | **Existe** | Routes publiques par secteur, sitemap public, meta private noindex et HTTP header. Contenu des secteurs à enrichir. |
| Observabilité et alertes d'incident | **Incomplet** | Journaux console et CI ; pas de suivi structuré des erreurs ou alertes de webhooks/CI. Attention aux erreurs détaillées de fournisseurs dans les journaux. |
| Sauvegardes et restauration | **Non démontré** | Aucun script/test de restauration recensé. Vérifier la capacité réelle selon l'offre Supabase avant de promettre une reprise. |
| Mesure d'audience respectueuse des données | **Manquant** | Aucun outil d'analytics confirmé. |
| Tests E2E avec utilisateur Stripe/Supabase réels | **Manquant** | Tests Node surtout unitaires, routes HTTP et faux prestataires; smoke production non authentifié. |
| Performance mobile, accessibilité | **Incomplet** | CSS responsive, pages HTML réelles et 404; aucun audit Lighthouse/axe ni mesure du démarrage à froid et des images sur appareils réels. |

## 4. Sécurité — constats vérifiés

- Positif : RLS activée sur toutes les tables OFFRYA, refus des missions privées pour les visiteurs, auth Premium contrôlée côté serveur et base, Stripe webhook HMAC vérifié, Stripe Identity en mode live exigé pour valider une personne, aucune copie de pièce d'identité dans le frontend.
- **À traiter** : advisor Supabase : protection contre les mots de passe compromis désactivée (WARN), [documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Activation dans Auth nécessite accord.
- Advisor Supabase (INFO) : 3 tables internes à RLS sans politique (`offrya_alert_deliveries`, `offrya_consent_audit`, `offrya_digest_runs`). C'est cohérent pour un journal/service interne inaccessible aux utilisateurs et ne doit pas être « corrigé » par une politique permissive.
- Advisor performance : index manquant pour la clé étrangère `offrya_priority_alerts.mission_id`; quatre index signalés non utilisés sur une base presque vide — ne pas supprimer d'index sur ce seul constat.
- Rate limiting serveur : compteurs mémoire par IP/route, non partagés entre instances; publication directe Supabase protégée par trigger mais sans vérification téléphone.
- Journaux : `showError` côté navigateur et certains travailleurs consignent `error.message` ou un extrait d'erreur de prestataire ; revoir systématiquement les éventuelles données privées.
- Le stockage des accès au paiement et aux données des clients ne repose pas sur `noindex`.

## 5. Assurance qualité

- CI `.github/workflows/tests.yml` : Node 22, `npm test`, diagnostic BOAMP et schéma de l'API entreprise.
- `.github/workflows/smoke-production.yml` : vérifie pages, status HTTP, CSP/noindex partiel, refus d'accès BOAMP et refus de webhooks Stripe non signés.
- Dernier `main` audité : tests, smoke production et alertes opt-in indiqués **success** dans GitHub Actions.
- `package.json` ne déclare ni `lint` ni `build`. Projet sans compilation : contrôle statique et syntaxique Node/ESM à ajouter. **Pas de preuve de parcours utilisateur réel** après authentification ou Stripe.
- Éviter de présenter une CI verte comme un paiement réel ou une vérification d'identité accomplie.

## 6. Plan priorisé (jours de développement, estimation indicative)

| Ordre | Travail | Effort | Accord préalable ? |
| --- | --- | --- | --- |
| P0 | Sécuriser les messages d'auth, erreurs réseau, états d'inscription et tests négatifs | 0,5–1 j | Non, comportement identique |
| P0 — **décision close** | Compte gratuit + e-mail confirmé avant publication ; RLS restrictive déjà appliquée. Compléter les tests négatifs et vérifier le parcours réel d'e-mail (Confirm email, redirections et capacité SMTP) | 1–2 j pour la validation, hors déploiement | **Non** pour tests et vérifications en lecture seule ; **oui** pour tout réglage Auth/SMTP payant ou modification RLS |
| P0 | Protection des demandeurs : téléphone OTP, CAPTCHA, anti-spam et contrôle distribué | 3–6 j | **Oui** si service, coût ou schéma ; interface/tests préparables |
| P0 | Signalement + modération des missions et messages | 3–5 j | **Oui : tables et RLS** |
| P0 | Back-office : validation, suspension, journal d'audit et contrôle d'accès administrateur | 5–9 j | **Oui : schéma et RLS** |
| P0 | Vérification pro : cas atypiques, rejet, revérification, récupération | 4–7 j | **Oui : Stripe Identity et RLS** |
| P0 | Cycle Stripe et audit idempotence, remboursement/échéance/relances | 3–5 j | **Oui : intégration Stripe** |
| P1 | RGPD export, suppression, rétention, consentements | 3–5 j | **Oui : schéma, suppression, textes légaux** |
| P1 | Collaborateurs et rôles / messagerie renforcée | 5–9 j | **Oui : permissions RLS** |
| P1 | Alertes e-mail, contrôle des doublons et tests de désinscription | 2–4 j | Selon fournisseur et modèle |
| P1 | SEO secteurs enrichi, FAQ et données structurées | 1–3 j | Non hors textes juridiques |
| P2 | CI E2E sur environnement de test, observabilité et sauvegardes | 4–8 j | Oui si nouveaux services payants |
| P2 | Performance mobile, accessibilité, nettoyage docs, scripts qualité | 2–4 j | Non |

**Risques restants :** conformité biométrique/RGPD, autorisations financières et mutations de base, coût des outils externes, aucune validation de paiement ni restauration de sauvegarde réelle dans cet audit.

## 7. Première amélioration autorisée

Branche `fix/auth-erreurs-francais-20261101` : mapper les codes d'erreur d'authentification en messages français sûrs, afficher « adresse déjà associée » **uniquement si Supabase confirme explicitement le doublon**, sans recherche publique des utilisateurs et sans modifier les droits. Tester syntaxe et fonctions localement, puis CI GitHub et PR. Aucun service, secret, tarif, politique RLS ou texte juridique modifié.

## 8. Mise à jour de décision — 1er novembre 2026

- **Demandeurs :** compte personnel gratuit obligatoire avant publication et confirmation effective de l'adresse e-mail. Aucun abonnement nécessaire pour publier ou consulter ses propres missions.
- **Professionnels :** lecture des missions d'autrui uniquement après vérification de l'entreprise, de l'identité et de la qualité de dirigeant officiel, puis abonnement payé à 34,99 € TTC/mois.
- **Déjà en place au moment de cette mise à jour :** migration `20261101105133 offrya_confirmed_account_required_for_mission_posts`, politique restrictive `missions_confirmed_email_insert`, contrôle réel de `auth.users.email_confirmed_at` et `is_anonymous=false` par `offrya_private.has_confirmed_mission_account()`, contrôle client `getUser()` sur `/deposer-une-mission`.
- **À vérifier avant généralisation des inscriptions :** option Supabase Auth « Confirm email », URL de retour, délivrance effective des e-mails aux adresses externes (quotas/SMTP), scénario de confirmation sur Android, tests de publication refusée sans confirmation, audit de permissions sur accès professionnel. Ne pas considérer la seule présence de la migration comme un test utilisateur de bout en bout.
- **Scope du changement documentaire :** aucune modification de prix, règles RLS, schéma Supabase, Stripe, secrets, textes juridiques ou environnement de production.
