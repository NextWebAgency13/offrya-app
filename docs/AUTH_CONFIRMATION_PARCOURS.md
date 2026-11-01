# OFFRYA — Confirmation e-mail des deux parcours
L’URL de retour après inscription reste fixe : `/connexion?confirmation=1`, comme dans la configuration Supabase existante décrite dans README.md.
Le choix de parcours, utilisé uniquement pour l'ergonomie, est placé dans les métadonnées utilisateur `offrya_signup_intent` (`client` ou `pro`). Il n'est jamais utilisé pour autoriser l’accès aux missions, aux marchés publics ou au paiement.
Après confirmation, la navigation est orientée vers le formulaire de dépôt gratuit pour un demandeur, ou vers le parcours de vérification pour un professionnel. Les anciens liens sans intention reviennent à l’accueil.
Les règles de publication (e-mail confirmé, propriétaire) et les règles d'accès professionnel (vérification, SIRET, identité, abonnement actif) demeurent contrôlées par le serveur et la base.
Vérifier sur le tableau de bord Supabase que `https://offrya-app.onrender.com/connexion?confirmation=1` est autorisé. Effectuer un test réel de délivrance SMTP et d'inscription avant d’annoncer le parcours comme validé en production.
