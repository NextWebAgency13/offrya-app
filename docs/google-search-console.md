# Google Search Console — OFFRYA

## Préparation déjà présente dans le dépôt

- Domaine public canonique : `https://offrya.fr`.
- Sitemap public : `https://offrya.fr/sitemap.xml`.
- `robots.txt` annonce ce sitemap.
- `/espace/*` et `/connexion` répondent avec `noindex`.
- Les URLs privées (missions, conversations, BOAMP Premium) ne sont pas dans le sitemap.

## Finalisation dans le compte Google du propriétaire

1. Ouvrir https://search.google.com/search-console et ajouter une propriété
   **Domaine** : `offrya.fr` (sans `https://`).
2. Copier l'enregistrement **TXT unique fourni par Google**.
   Dans le DNS Cloudflare du domaine, créer le TXT racine avec exactement
   cette valeur. **Ne pas inventer un jeton ni supprimer les autres TXT**.
3. Revenir sur Search Console et cliquer sur **Valider**. Attendre si la
   propagation DNS le nécessite.
4. Dans **Sitemaps**, envoyer `sitemap.xml`.
5. Contrôler ensuite le rapport d'indexation, les URL canoniques et les
   éventuelles erreurs de couverture ou d'exploration.

Cette étape demande les droits de propriété sur le compte Google et le DNS.
Un agent GitHub ou Supabase seul ne peut pas valider la propriété Google.
N'ajouter aucun jeton Google Search Console au dépôt tant qu'il n'a pas été
fourni par la plateforme et validé pour ce domaine.

Documentation officielle :
https://support.google.com/webmasters/answer/9008080?hl=fr
