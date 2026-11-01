# OFFRYA — Parcours de découverte inspiré des marketplaces de services

## Objectif
Conserver la marque OFFRYA (logo, violet/prune/corail, style des cartes, modèle gratuit/Pro) et faciliter la découverte des prestations comme sur les grandes plateformes de mise en relation. L'inspiration concerne les parcours et l'organisation, sans reprise de contenus, de logos ou de composants propriétaires d'AlloVoisins.

## Améliorations de la première phase
- Mettre les six catégories existantes au premier plan, juste après le message d'accueil.
- Rendre chaque carte explicite : icône originale au trait, secteur, exemples de prestations et lien vers une page existante.
- Ajouter dans le héros un lien direct vers les catégories.
- Assurer la lisibilité et le focus sur smartphone ; réduire les animations si demandé.
- Conserver les boutons actuels vers le dépôt gratuit et l'offre professionnelle ainsi que le texte véridique et les FAQ.

## Règles métier intangibles
- Un compte gratuit avec e-mail confirmé est obligatoire avant publication.
- Aucune annonce de mission privée ni information d'un demandeur dans la vitrine publique.
- La consultation des missions d'autrui et du BOAMP reste réservée aux professionnels officiellement vérifiés et abonnés à 34,99 € TTC/mois.
- La vérification professionnelle précède le paiement.
- Aucun chiffre de demandes, avis client, témoignage ou entreprise partenaire inventé.
- Ne pas modifier Stripe, les RLS, la structure SQL ou les contrôles d'accès dans une refonte visuelle.

## Phase ultérieure (non incluse)
- Parcours de dépôt plus guidé avec catégorie préremplie et assistance au formulaire.
- Améliorer l'espace professionnel avec filtres, recherche et alertes selon la zone et le domaine, uniquement après validation des droits.
- Faire tester la navigation sur écrans mobiles étroits, clavier, et lecteurs d'écran.

## Validation
Exécuter `npm test`, vérifier le rendu desktop/mobile et les redirections des six catégories avant toute fusion ou déploiement.
