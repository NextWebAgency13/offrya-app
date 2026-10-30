# OFFRYA Studio — Refonte complète de l'interface

Cette édition reprend la base fonctionnelle **OFFRYA 4.0** sans changer les opérations du serveur ni le schéma SQL.

## Direction artistique

- Avant : tableau de bord sombre, vert fluo, effet radar.
- Maintenant : design B2B clair, bleu vif, blanc, composants aérés et navigation organisée.
- Page d'accueil avec illustration vectorielle en HTML/CSS montrant les étapes d'une mission.
- Mobile : navigation fixe à cinq onglets et réglages accessibles depuis l'en-tête.
- Formulaires, messages, devis et fiches d'annonces re-stylisés.
- Typographies : Plus Jakarta Sans + DM Sans, avec polices système de secours.
- Design accessible : états focus visibles, support des animations réduites.

## Fichiers livrés

- `public/index.html` : nouvelle structure visuelle de l'application.
- `public/styles.css` : charte graphique responsive neuve.
- `public/favicon.svg` : symbole V bleu.
- `public/app.js` : logique métier de OFFRYA 4.0 conservée.
- `OFFRYA_Apercu_Interactif.html` : démo visuelle autonome ; elle **n'effectue aucune opération serveur**.
- `previews/desktop.png` / `previews/mobile.png` : captures d'écran de référence.

## Utilisation

Pour voir l'interface sans serveur, ouvrir `OFFRYA_Apercu_Interactif.html` dans le navigateur : on peut visiter les onglets et les formulaires, mais les données ne seront pas enregistrées.

Pour faire fonctionner l'application avec de vrais comptes, annonces BOAMP et messages, consulter `README.md`, puis :

```
npm test
npm start
```

Avant la production, créer une instance Supabase OFFRYA séparée de NextWeb Agency et déployer sur un hébergement HTTPS. L'intégration serveur est **préparée mais pas encore déployée** ; les intégrations réseau réelles ne sont pas validées.

Cette refonte ne réactive pas de facturation Stripe ni d'autres paiements. Les alertes e-mail sont toujours à activer explicitement et nécessitent un domaine d'envoi vérifié.
