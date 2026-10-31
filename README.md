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
