# DeepSeek — assistant de revue du code OFFRYA

Cette fonctionnalité aide les développeurs à analyser les pull requests. Elle ne modifie pas le Radar Premium ni le site en production.

## Activation
1. **Révoquer immédiatement** toute clé API envoyée dans une conversation. Créer une nouvelle clé sur https://platform.deepseek.com.
2. Dépôt GitHub NextWebAgency13/offrya-app → Settings → Secrets and variables → Actions → New repository secret.
3. Nommer le secret **DEEPSEEK_API_KEY** et enregistrer la nouvelle clé. Ne pas la publier dans le code ou une conversation.
4. GitHub → Actions → OFFRYA — revue de code DeepSeek (manuelle) → Run workflow. Choisir main et indiquer le numéro d'une PR interne ouverte.
5. La revue apparaît comme commentaire sur la PR. Toute correction est évaluée et testée par un humain avant fusion.

## Limites et confidentialité
- Aucune analyse automatique à chaque push : déclenchement manuel seulement. Aucun accès direct à Render, Stripe ou Supabase.
- Le fournisseur DeepSeek reçoit un extrait des différences de la PR interne, jamais la clé API. Des fichiers sensibles connus sont exclus et certaines valeurs sont masquées, mais **aucun filtrage automatique ne garantit l'absence d'informations confidentielles**. Inspecter le diff avant lancement.
- Ne pas déclencher sur du code privé qu'il n'est pas autorisé de partager avec DeepSeek ni sur des données personnelles sensibles.
- La sortie IA est indicative. Aucune modification, exécution, fusion ou déploiement automatique.
- DeepSeek facture potentiellement les appels API.
