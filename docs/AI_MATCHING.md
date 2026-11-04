# OFFRYA — moteur de correspondance Premium

## Fonctionnement

L'API GET /api/pro/matches classe les missions OFFRYA et les alertes officielles BOAMP/TED déjà présentes dans Supabase. Elle refuse les sessions anonymes, les non-professionnels et les comptes non autorisés via la vérification Premium existante. Chaque lecture utilise le JWT du professionnel et la clé publique Supabase : aucune lecture des missions via service_role.

Le classement local, explicable et gratuit fonctionne même sans API OpenAI : secteur/métier, département, mots-clés et synonymes métiers, budget connu, fraîcheur, urgence et échéance. Les missions clôturées, expirées ou publiées par l'utilisateur sont éliminées. Les marchés publics sont restreints aux alertes OFFRYA obtenues des sources officielles BOAMP/TED et validées par les politiques RLS.

Le tableau de bord affiche les cinq meilleures opportunités, un score estimatif et ses motifs, avec un accès direct à la mission ou à l'avis officiel. Il retombe sur le radar local autorisé si l'API est indisponible.

## Activer le classement sémantique IA

Le LLM est **désactivé par défaut**. Après validation juridique et mise à jour de la politique de confidentialité sur l'envoi des données d'annonce à un prestataire IA, configurer côté serveur Render uniquement :

- OPENAI_API_KEY : clé serveur (jamais dans JavaScript public).
- OFFRYA_AI_MATCHING_ENABLED=true : activer explicitement l'enrichissement sémantique.
- OFFRYA_AI_MODEL (facultatif) : modèle compatible avec chat/completions et response_format json_object ; défaut gpt-4.1-mini.

La requête IA contient au plus 10 candidatures réelles déjà autorisées, leurs titres/descriptions tronqués et partiellement dépourvus de contacts, plus la spécialité et les filtres métier. Le service ne reçoit pas les identifiants d'utilisateurs. La suppression automatique des données personnelles n'est **pas exhaustive** : le contrôle juridique/confidentialité est donc indispensable avant activation.

L'IA ne peut que réajuster les scores de ±15 points. Elle ne crée pas de missions, ne modifie pas les filtres, ne transmet pas de candidature et ne contacte personne. En cas de panne ou de réponse non conforme, le classement explicable prévaut. Une requête est espacée de cinq minutes par client actif. Les requêtes publiques sont limitées par IP côté serveur.

## Vérifications

Exécuter npm test avant fusion. Vérifier en préproduction avec un professionnel vérifié et abonné, un demandeur, un non-abonné et une session expirée ; vérifier que seules les annonces accessibles sous RLS figurent dans la réponse et que le modèle reste inactif tant que le drapeau n'est pas activé. La branche n'inclut ni changement SQL ni déploiement de production.
