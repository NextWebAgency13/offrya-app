# Veille publique IA d'OFFRYA Premium — déploiement différé

**Statut : prêt pour revue, non activé.** Le code est dans la PR #119 et aucune
modification Supabase ou Render n'a été réalisée.

## Sources

- BOAMP : API officielle DILA (recherche, département, date limite).
- TED : API officielle européenne, annonces françaises et échéances ouvertes.
- PLACE, Maximilien, Mégalis, Bourgogne-Franche-Comté, Occitanie, Région Sud :
  **uniquement** un flux RSS officiel documenté, publiquement accessible et
  explicitement approuvé. Les pages HTML ne sont **jamais scrapées**.
  Sans URL RSS compatible, le portail reste hors ligne : pas de résultat inventé.

## Traitement prévu (horaire, UTC)

1. Render Cron (fichier d'exemple : `docs/render-veille-cron.example.yaml`)
   exécute `node scripts/watch-sector-tenders.js`.
2. Lit uniquement `offrya_agent_watch_targets`, qui sélectionne les comptes
   professionnels vérifiés ET abonnés. Le Premium de test ne déclenche pas
   de collecte ni d'alertes automatiques.
3. Regroupe BOAMP, TED et les flux régionaux autorisés ; élimine les doublons
   titre + acheteur + date limite. Calcule un score par métier, mots-clés et zone.
4. Le cache `offrya_public_tender_digest` évite de redemander plusieurs fois
   à l'IA le résumé d'un même avis. Seules les données **publiques** sont envoyées
   à l'API OpenAI, via la clé serveur. Maximum 12 nouveaux avis par exécution
   par défaut. Le budget n'est renseigné que si une preuve explicite figure
   dans le texte de l'avis.
5. Enregistre les recommandations dans `offrya_tender_alerts` avec résumé IA,
   catégorie, lieu, montant conditionnel, date officielle, source, score
   explicable et URL originale. Le droit de lecture reste contrôlé par RLS.
6. Les notifications **dans OFFRYA** sont déjà rafraîchies périodiquement.
   L'e-mail est **désactivé** tant que l'envoi transactionnel, le consentement
   et l'anti-doublon d'envoi n'ont pas été validés.

## Ordre de mise en production — uniquement après accord

1. Vérifier les conditions de chaque flux source, l'exactitude des liens et
   les champs des avis. PLACE et plateformes régionales désactivées par défaut.
2. Exécuter dans un environnement contrôlé les migrations
   `sql/approved_public_portal_sources.sql` et
   `sql/public_tender_ai_enrichment.sql`, après validation du schéma et de RLS.
3. Tester deux comptes non éligibles et un professionnel abonné, sans élargir
   la lecture des avis privés. Vérifier les dépenses OpenAI.
4. Configurer Render Cron, provisionner ses secrets et déclencher un essai.
   Un cron Render entraîne une **facturation**, selon la durée d'exécution et
   avec un minimum mensuel par service (consulter les tarifs actuels).
5. Après essai réussi, désactiver l'horaire GitHub Actions
   `.github/workflows/sector-tender-watch.yml` pour ne pas exécuter deux cron.
6. Contrôler sur Android et ordinateur la section « Appels d'offres du jour ».

**Ne jamais publier** les clés `SUPABASE_SECRET_KEY` ou `OFFRYA_AI_API_KEY`
dans le navigateur, le dépôt Git ou les logs.
