## OFFRYA Professionnel — configuration en vigueur au 31 octobre 2026

OFFRYA propose **une seule offre professionnelle à 34,99 € TTC par mois**. La publication et la gestion de ses propres missions restent gratuites pour tout profil inscrit. La consultation des missions d'autrui, la mise en relation commerciale, les alertes et les outils BOAMP intégrés demandent un **profil pro, une entreprise et un représentant validés par OFFRYA, et un abonnement Stripe actif et payé**.

Appliquer la migration **sql/professional_launch.sql** après les migrations initiales et d'abonnements. Elle interdit la lecture anonyme des missions, protège la messagerie commerciale et les alertes, autorise la publication par tous les profils et ajoute les informations du représentant. Le site vérifie le SIRET en direct sur le registre national avant d'enregistrer un dossier à statut **pending**, soumis à revue humaine. **Le contrôle de l'identité et de l'habilitation du représentant n'est pas automatisé** : l'opérateur doit réaliser et enregistrer cette vérification avant de définir le statut **verified**. Ne pas activer de dossiers sans preuves et ne pas collecter de pièces d'identité en clair dans l'application.

Tarif Stripe production : `price_1UWeKZ7WaxKMxAUvnyIgzOLy` (**3 499 centimes, mensuel, taxes incluses**). Mettre aussi `STRIPE_PRICE_ID` à cet identifiant dans Render pour maintenir une configuration cohérente ; le code Live accepte le nouveau prix de lancement tant que cette variable n'est pas actualisée. Aucune migration automatique des abonnements existants. Les anciennes sections du README ci-dessous sont conservées pour l'historique ; les règles ci-dessus prévalent.

---

undefined
## Vérification officielle du SIRET
Un compte Professionnel peut contrôler un SIRET via `/api/company/lookup` (JWT obligatoire). La source ouverte utilisée est l'API officielle Recherche d'Entreprises (DINUM, Sirene/RNE), avec comparaison exacte du SIRET et état actif. La raison sociale est fournie au formulaire. L'identité du représentant et son autorisation ne sont **pas** attestées par la seule API; le statut Premium reste soumis à examen humain avant activation. La saisie et la vérification ne sont pas un KYC automatisé complet.

## OFFRYA Premium — Préparation du paiement Stripe
Schéma à appliquer: `sql/subscriptions.sql` (table en lecture seule par les utilisateurs). `OFFRYA_BILLING_ENABLED=false` tant que le compte Stripe marchand, la fiscalité et les CGV ne sont pas prêts.

Créer dans Stripe un produit `OFFRYA Premium` avec un tarif récurrent **19 EUR TTC / mois** (1 900 centimes, pas 19 centimes) et activer le portail de facturation/résiliation. Le serveur valide le montant, la devise et la périodicité du tarif avant Checkout. Configurer dans Render les secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SUPABASE_SECRET_KEY` et `SITE_URL=https://offrya-app.onrender.com`. Ne jamais les saisir dans une conversation publique ou les commiter dans Git. Webhook Stripe : `https://offrya-app.onrender.com/api/billing/webhook`, événements Checkout, invoice et customer.subscription. Les notifications signées synchronisent les abonnements; retour de page Checkout seul ne donne aucun droit. D'abord tester avec les clés Stripe test, puis activer volontairement via `OFFRYA_BILLING_ENABLED=true`. Prévoir la résiliation depuis le portail Stripe.

Le statut vérifié entreprise reste une condition indépendante de la facture. L'offre commerciale est annoncée à **19 € TTC par mois**, montant total pour un abonnement. Vérifier que Stripe Checkout n'ajoute pas de TVA au-dessus de ce tarif ; configurer le comportement fiscal du tarif Stripe en prix TTC (tax_behavior=inclusive lorsque les taxes sont calculées) et faire valider le traitement fiscal selon le régime de l'exploitant avant ouverture. Ne pas activer en réel tant que la présentation des tarifs, les conditions contractuelles et les mentions obligatoires ne sont pas finalisées.

## Priorité aux membres Premium lors d'une nouvelle mission

Le trigger PostgreSQL de `sql/premium_priority_alerts.sql` crée, à chaque publication, une notification privée pour chaque professionnel ayant une entreprise vérifiée et soit un accès bêta valide, soit un abonnement Stripe actif et payé. La correspondance utilise les préférences de catégorie et de département (valeur vide = France entière / tous secteurs). La mission reste accessible librement au public ; **seules les notifications sont prioritaires**.

Un bloc `Mes opportunités prioritaires` s'affiche sur le tableau de bord Premium. Les nouvelles notifications sont interrogées à l'ouverture et une fois par minute si la page reste ouverte. L'utilisateur peut les marquer comme consultées en ouvrant la mission. Aucune alerte n'est créée pour sa propre annonce.

Les e-mails ne sont envoyés que si le destinataire avait activé les alertes de missions au moment de la publication, que son adresse est confirmée et qu'il a toujours donné son accord au moment de l'envoi. Les rappels quotidiens continuent pour les autres utilisateurs avec opt-in ; une même mission envoyée en alerte prioritaire n'est pas répétée dans leur récapitulatif.

`.github/workflows/alerts.yml` prévoit un passage toutes les cinq minutes pour les alertes Premium et un passage quotidien pour les récapitulatifs. La cadence est indicative : GitHub Actions peut retarder les jobs. L'e-mail **n'est pas actif** sans configuration d'un domaine d'expédition vérifié chez Resend et sans secrets propres au dépôt OFFRYA :
`OFFRYA_SUPABASE_URL`, `OFFRYA_SUPABASE_SECRET_KEY`, `OFFRYA_RESEND_API_KEY`, `OFFRYA_EMAIL_FROM`, `OFFRYA_UNSUBSCRIBE_SECRET` (32 caractères ou plus).
Ne copiez pas de secrets d'autres projets ; ne les commitez jamais. Le travailleur Premium est inerte en leur absence.

## Correction du parcours Premium pour comptes existants
Un membre ayant déjà un profil Client n'a pas besoin de se réinscrire. Après connexion il peut vérifier son SIRET, déposer une demande de validation de son entreprise, obtenir le statut `verified` après contrôle administratif, puis utiliser l'accès bêta ou souscrire 19 EUR/mois lorsque Stripe est configuré. Les rôles restent inchangés, Premium est une autorisation liée à l'entreprise plutôt qu'au seul libellé du profil. Le profil initial conserve ses permissions de publication ; un Premium vérifié actif peut aussi répondre aux missions. Une demande `pending` ne permet ni Checkout ni consultation BOAMP. Le bouton de souscription désactivé indique explicitement que la configuration Render est incomplète. Ne pas modifier `OFFRYA_BILLING_ENABLED` sans essai Stripe test et vérification légale.

Le verrou supplémentaire `OFFRYA_LIVE_PAYMENTS_ENABLED` a été retiré. Avec toutes les variables requises configurées, `OFFRYA_BILLING_ENABLED=true` permet Checkout Stripe aussi bien en environnement test (`sk_test_`, `rk_test_`) qu'en production (`sk_live_`, `rk_live_`). Les clés restreintes Stripe (`rk_`) doivent disposer des droits de lecture sur les tarifs et abonnements, et de création de sessions Checkout et de portail de facturation, sinon l'API Stripe refusera les opérations. Laisser `OFFRYA_BILLING_ENABLED=false` jusqu'à l'activation voulue. Les contrôles de statut entreprise vérifiée, prix mensuel de 19 €, vérification du webhook signé et confirmation de paiement restent inchangés.

## Publication de missions : compte gratuit obligatoire (novembre 2026)

**Nouvelle règle :** avant d'accéder au formulaire sur `/deposer-une-mission`, le demandeur doit se connecter à un compte identifié avec une adresse e-mail **confirmée**. L'inscription est gratuite et le paiement Premium n'est jamais requis pour publier ou suivre ses propres missions.

**Parcours :** `/` → `/deposer-une-mission` → porte d'entrée « Créer mon compte gratuit » / « J'ai déjà un compte » → `/connexion?mode=signup&next=%2Fdeposer-une-mission` → e-mail Supabase de confirmation → passage par `/connexion?confirmation=1` pour traiter le jeton de confirmation → redirection automatique vers la vitrine `/` → depuis « Déposer une mission », formulaire disponible après vérification de la session → suivi `/espace/missions`. La destination est strictement filtrée contre les redirections externes.

**Base de données :** appliquer `sql/confirmed_mission_authors.sql` au **projet OFFRYA uniquement**. La politique RLS restrictive sur INSERT vérifie le propriétaire, la présence d'un utilisateur Supabase identifié (non anonyme) **et** `auth.users.email_confirmed_at`. La vérification a lieu côté PostgreSQL, et non seulement dans le navigateur. Les règles de lecture et les contrôles d'identité Premium sont conservés.

**Réglages Supabase Auth :** dans Authentication → Providers → Email, conserver la connexion par e-mail et activer l'option **Confirm email** (selon la version du tableau de bord). Dans Authentication → URL Configuration, utiliser le site `https://offrya-app.onrender.com` et autoriser `https://offrya-app.onrender.com/connexion` et les liens de confirmation `https://offrya-app.onrender.com/connexion?confirmation=1` (ou le motif sécurisé de même origine convenu dans la liste de redirection). Les liens de connexion magique et de réinitialisation gardent leur destination propre. Vérifier la capacité d'envoi SMTP / limites e-mail pour que l'utilisateur reçoive son lien de confirmation. Il n'est **plus nécessaire d'activer les connexions anonymes** pour publier.

**Anti-abus :** conserver les limitations Supabase Auth et les contrôles de débit PostgreSQL existants. Si CAPTCHA global est activé dans Supabase Auth, fournir son jeton **sur tous** les formulaires d'inscription, connexion et récupération avant de basculer le paramètre. L'ancien widget Turnstile dédié aux invités a été retiré et ne doit plus servir de protection de la publication.

**Comptes historiques invités :** ne pas supprimer les utilisateurs ni les missions. Un invité possédant encore sa session peut continuer à lire ses propres missions et à les clôturer, mais ne peut plus en publier. La conversion éventuelle d'un ancien compte invité vers un compte confirmé est un parcours séparé et ne doit jamais donner accès à d'autres missions. Ne pas réattribuer automatiquement les annonces à un nouvel utilisateur.

Pour consulter les missions publiées par d'autres, l'autorisation RLS continue d'exiger simultanément le rôle professionnel, une identité et une habilitation vérifiées, un compte identifié (jamais invité) et un abonnement payé à **34,99 € TTC/mois**. Le dépôt gratuit est indépendant du Premium.

## Compte professionnel réservé aux dirigeants officiels

Les salariés et les mandataires non inscrits comme représentants légaux ne sont pas éligibles au compte professionnel, même s’ils disposent d’un mandat privé. OFFRYA contrôle le SIRET, la qualité de dirigeant officiel dans les données RNE, la pièce d’identité et le selfie via Stripe Identity en mode réel. Le serveur compare les noms extraits par Stripe avec les dirigeants du registre. Un nom différent, un selfie absent, ou des informations officielles manquantes bloquent toute approbation. Un dossier créé avant cette règle peut demander une régularisation, mais ne bénéficie d’aucun droit acquis.

Migration à appliquer après les précédentes : `sql/legal_representative_only.sql`. La source officielle actuelle est API Recherche d’Entreprises (RNE/Sirene), dont les données de dirigeants peuvent être incomplètes ou non diffusibles : dans ce cas, OFFRYA doit rester bloqué jusqu’à un rapprochement manuel fondé sur une source officielle RNE vérifiable. Le contrôle administratif final reste indépendant du webhook.

La vérification par selfie biométrique doit faire l’objet d’un examen RGPD et de la configuration expresse `OFFRYA_IDENTITY_SELFIE_ENABLED=true`, avec `STRIPE_IDENTITY_WEBHOOK_SECRET` et une clé Stripe Identity en production. Tant que ces prérequis manquent, le système est volontairement fermé aux nouveaux comptes professionnels.

## Validation professionnelle sans TOTP

La procédure d'activation comporte désormais **4 étapes** : SIRET, informations du représentant, dépôt et vérification de la personne et de son mandat, abonnement. Aucun QR code ou code à six chiffres n'est requis. Après les migrations de création de schéma, appliquer `sql/professional_without_mfa.sql` (déjà appliquée à la base OFFRYA). Les comptes invités restent interdits d'accès Premium ; identité, présence, mandat et facturation demeurent obligatoires. Les anciens facteurs TOTP éventuellement enregistrés dans Supabase Auth ne sont pas supprimés automatiquement.

## Vérification d'identité manuelle lorsque Stripe est indisponible

Migration : `sql/manual_identity_review_requests.sql` (appliquée à Supabase OFFRYA). À l'étape 3, un professionnel dont le dossier est `pending` peut demander un contrôle manuel sans transmettre de document au site ou par e-mail. La demande est enregistrée dans une file RLS privée ; **elle ne valide aucune identité, aucune habilitation ni aucun abonnement**. Un opérateur doit consulter la file Supabase, contacter le titulaire du compte, vérifier réellement la pièce/présence et le mandat, puis décider. Voir `PROCEDURE_VERIFICATION_MANUELLE.md`.

## Compatibilité des clés restreintes pour Stripe Identity

Le serveur accepte les clés Stripe secrètes (`sk_live_`/`sk_test_`) et **restreintes** (`rk_live_`/`rk_test_`) pour les opérations Identity. Cela n'accorde aucune permission supplémentaire : la clé restreinte présente dans Render doit posséder les autorisations Stripe Identity nécessaires pour **créer** et **consulter** les sessions de vérification. Une clé sans les permissions suffisantes recevra une erreur HTTP 403 de Stripe lors d'un appel authentifié. Préférer les permissions minimales à une clé secrète globale.

Le statut `identityEnabled` sur `GET /api/config` confirme uniquement que les **variables requises sont configurées** ; il ne teste pas l'accès API Stripe ni le parcours document + selfie réel. Une fois la configuration Render enregistrée et déployée, le contrôle GitHub `OFFRYA — contrôle HTTP production` doit afficher `ETAT STRIPE IDENTITY RENDER: ACTIVE`, `401` pour un démarrage sans authentification et `400` pour un webhook Identity non signé.

Les paramètres biométriques et les obligations RGPD doivent être validés avant l'utilisation réelle. Ne jamais afficher ou copier les valeurs des clés dans les captures d'écran.

## Nouvelle architecture SEO et espace privé

La vitrine OFFRYA est désormais servie en HTML statique sur `/`, avec `/deposer-une-mission`, `/professionnels`, six routes `/secteurs/*` et une page `/connexion`. L'espace personnel et ses sous-pages utilisent `/espace/*` (document HTML privé, contrôles Supabase conservés, `noindex`), sans redirection globale masquant les erreurs 404. Voir **`MIGRATION_URLS_ET_TESTS.md`** pour toutes les anciennes URL, le plan de redirection, la configuration manuelle Supabase Auth, les retours Stripe et les tests.

La publication sur les nouveaux comptes est désormais liée à une adresse e-mail confirmée et retrouvable sur plusieurs appareils. Pour un ancien utilisateur invité, la récupération de ses missions doit passer par une procédure de rattachement explicite et sécurisée, pas par un changement arbitraire de propriétaire. Aucun abonnement, alerte ou e-mail promotionnel n'est activé automatiquement.
