# OFFRYA — Import des demandes externes

Code intégré progressivement à OFFRYA, mais collecte, publication et synchronisation désactivées tant que les droits d'accès ne sont pas confirmés.

## Étapes d'activation
1. Vérifier que l'autorisation écrite couvre la collecte et la rediffusion des annonces, avec des limites de volume et de fréquence.
2. Tester les sélecteurs des pages Leboncoin dans le périmètre permis, sans contournement des contrôles.
3. Lancer les tests Node.js avec `npm test`.
4. Les migrations initiales d'opportunités externes et de retraits ont été appliquées au projet OFFRYA. Appliquer aussi `sql/leboncoin_conservative_access_budget.sql` avant toute consultation réelle (quota centralisé obligatoire).
5. Installer Playwright uniquement dans l'environnement isolé d'exécution du collecteur, pas dans le serveur web.
6. Après validation indépendante de l'accès, vérifier robots.txt puis renseigner `LEBONCOIN_COLLECTION_AUTHORIZED=true`, `LEBONCOIN_ROBOTS_REVIEWED=true`, `LEBONCOIN_SEARCH_URLS` (une URL de recherche catégorie 34 et intention de demande) et `LEBONCOIN_COLLECTOR_ENABLED=true`.
7. Conserver `LEBONCOIN_DRY_RUN=true` pour la première vérification.
8. Pour stocker en privé, utiliser `LEBONCOIN_DRY_RUN=false`; les annonces restent en attente par défaut.
9. Après validation du droit de rediffusion, positionner `LEBONCOIN_REPUBLICATION_AUTHORIZED=true` et `LEBONCOIN_PUBLISH_ENABLED=true`.
10. Enfin, activer `OFFRYA_LEBONCOIN_ENABLED=true` après des tests RLS sur tous les types de comptes.

## Garanties
Le collecteur rejette les offres de services, les emplois et les ventes ; masque les coordonnées ; ne crée jamais de compte client fictif ; n'accède pas à la messagerie des utilisateurs Leboncoin ; arrête la collecte en cas de CAPTCHA ou d'interdiction.

## Contrôle des annonces retirées
- Le script `scripts/sync-leboncoin-removals.js` relit au maximum 5 annonces déjà publiées par exécution, sous un quota centralisé, avec une fenêtre d'au moins quatre heures entre exécutions. Les deux confirmations d'indisponibilité doivent être espacées d'au moins 15 minutes.
- Le premier HTTP 404/410 ou un titre explicite d'annonce indisponible ouvre un état « absence suspectée ».
- Une seconde confirmation au moins 15 minutes après marque le statut `expired`, retire aussitôt l'annonce du flux Premium et conserve un horodatage et la raison de la décision.
- Si l'annonce est de nouveau disponible, le compteur d'absence est remis à zéro.
- Un CAPTCHA, un HTTP 401/403/429/5xx, une redirection inattendue ou une page indéterminée n'est **pas** une preuve de suppression. Les restrictions d'accès arrêtent la synchronisation.
- Une annonce masquée/rejetée ne peut pas être réactivée par réimport : le collecteur insère uniquement les ID encore absents (`resolution=ignore-duplicates`).
- Le script est en simulation tant que `LEBONCOIN_DRY_RUN` n'est pas à `false`. Son exécution exige aussi `LEBONCOIN_SYNC_ENABLED=true` et `LEBONCOIN_COLLECTOR_ENABLED=true`.
- La tâche GitHub `.github/workflows/leboncoin-sync.yml` est **préparée mais inerte par défaut**, car ses variables de déclenchement sont absentes/désactivées. La planification n'est active qu'après fusion et activation explicite des variables ; ne pas l'activer sans droits vérifiés.

## Limites avant activation
- La consultation automatisée réelle n'a **pas** été réalisée : l'outil de navigation de cette session ne peut pas ouvrir les pages d'annonces du site (restriction robots.txt). Le HTML courant, les sélecteurs, les URL et la classification réelle ne sont donc pas validés.
- Aucune licence ou autorisation écrite détaillant la republication OFFRYA n'a été fournie. Vérifier séparément l'extraction, le volume de navigation et les droits de rediffusion des titres/descriptions.
- Le retrait automatique ne repose que sur deux **preuves positives d'indisponibilité**, pas sur l'absence d'une annonce dans une recherche. Les annonces dont la disponibilité devient ambiguë nécessitent une revue manuelle.
- Les migrations initiales ont été appliquées à Supabase, mais la collecte et la republication restent inactives. La nouvelle migration de quota centralisé doit être appliquée avant toute consultation réelle. Les tests GitHub utilisent uniquement des pages simulées.


## Validation locale d'un fichier JSON autorisé
L'importeur `node scripts/import-leboncoin-feed.js` examine un export JSON fourni dans le cadre d'un accès autorisé. Il n'emploie ni Scrapfly, ni proxy, ni navigateur. L'export doit contenir un tableau `ads`, un tableau racine ou `props.pageProps.searchData.ads`.

Le filtre n'accepte que `ad_type=want`, un statut `active` ou `online` (ou non fourni), une URL d'annonce Leboncoin valide, un titre d'au moins huit caractères, une description d'au moins quinze caractères et une localisation. Il élimine les offres, les annonces inactives, les fausses demandes, les URL invalides et les doublons. Le nombre d'enregistrements qualifiés est limité à 40 par exécution.

Configurer `LEBONCOIN_FEED_ENABLED=true`, `LEBONCOIN_FEED_FILE` avec le chemin du fichier JSON et conserver `LEBONCOIN_DRY_RUN=true` pour simuler. Facultativement, `LEBONCOIN_VALIDATION_CSV` spécifie le CSV des seules annonces qualifiées et `LEBONCOIN_VALIDATION_REPORT` le rapport JSON de comptage par motif de rejet. Le rapport ne contient ni titres refusés ni coordonnées de contact. Le CSV ne contient que les champs assainis et `status_import=ready` : il ne s'agit pas du statut de publication Supabase.

L'écriture Supabase n'intervient que si `LEBONCOIN_DRY_RUN=false`. L'annonce reste `staged` tant que les deux interrupteurs de publication ne sont pas activés. Les données personnelles, images et prix bruts ne sont pas recopiés. La contrainte `(source, source_id)` empêche les réimports, et les annonces supprimées ne sont pas réactivées.

## Connecteur Scrapfly — aperçu ponctuel, désactivé par défaut
Le programme `node scripts/preview-leboncoin-scrapfly.js` sait interroger l'API Web Scraping Scrapfly pour UNE URL de recherche Leboncoin configurée puis passer son HTML structuré dans le validateur OFFRYA. Il ne modifie pas Supabase et ne publie aucune annonce. Il ne peut être lancé que de 07 h à 23 h, heure de Paris.

Conditions impératives avant toute exécution : confirmer indépendamment l'authenticité et la portée de l'accord Leboncoin, obtenir la permission écrite d'employer Scrapfly (prestataire tiers et éventuels proxys compris), confirmer les règles robots.txt, puis configurer manuellement les variables suivantes dans un environnement serveur privé :

```env
SCRAPFLY_API_KEY=<secret-dans-la-plateforme-seulement>
LEBONCOIN_SCRAPFLY_ENABLED=true
LEBONCOIN_SCRAPFLY_PARTNER_APPROVED=true
LEBONCOIN_SCRAPFLY_ROBOTS_REVIEWED=true
LEBONCOIN_DRY_RUN=true
LEBONCOIN_SEARCH_URLS=["https://www.leboncoin.fr/recherche?category=34&text=cherche"]
LEBONCOIN_VALIDATION_REPORT=validation.json
LEBONCOIN_VALIDATION_CSV=demandes_validation.csv
```

Le connecteur désactive `asp`, n'active pas les proxys ni le ciblage géographique par paramètre et ne fournit aucun système d'évitement des CAPTCHA. **Attention : les infrastructures Scrapfly peuvent toutefois utiliser des mandataires par défaut ; l'absence de paramètre explicite ne suffit pas à les autoriser.** Les réponses bloquées ou les CAPTCHA provoquent l'arrêt immédiat sans contournement. Aucun cron n'est créé ; respecter le plafond contractuel d'une collecte toutes les quatre heures, les volumes et les obligations de retrait et de purge avant d'autoriser une exploitation réelle.

Placer `SCRAPFLY_API_KEY` uniquement dans un gestionnaire de secrets serveur (Render Environment ou GitHub Actions Secrets, selon le futur environnement isolé). Ne jamais transmettre la clé dans un dépôt public, une capture, une page HTML ni un lien partagé.

## Politique de parcimonie et minimisation — contrôle bloquant

- **Source et pertinence :** un seul URL de recherche Leboncoin par exécution, exclusivement catégorie `34` (services) et mots-clés de recherche de prestations. Les offres de services, annonces d'emploi et ventes ne sont pas conservées. Maximum cinq consultations de fiches par recherche.
- **Quotas atomiques :** six requêtes au maximum par exécution, y compris la page de recherche ; 20 requêtes par jour et 300 par mois (calendrier Europe/Paris), au moins cinq secondes entre deux accès et quatre heures entre deux tâches réseau. La procédure SQL `public.offrya_claim_leboncoin_budget` réserve les consultations dans une transaction avec verrou PostgreSQL, commune à Playwright, Scrapfly et au suivi des retraits. Toute erreur ou plafond atteint **arrête** la collecte, y compris en mode simulation. Ne jamais se fier au seul cron pour appliquer un quota.
- **Accès légitime :** `LEBONCOIN_COLLECTION_AUTHORIZED=true` ET `LEBONCOIN_ROBOTS_REVIEWED=true` sont requis pour le collecteur direct et la synchronisation, en plus des interrupteurs existants. Pour Scrapfly, la vérification écrite du recours au prestataire et de ses éventuels proxys reste obligatoire. Pas de résolution de CAPTCHA, mode anti-bot ou reprise automatique sur erreur de source.
- **Données :** le navigateur bloque en amont les images, scripts, traqueurs et sous-ressources non documentaires et désactive les service workers et le JavaScript de page. Il n'autorise que les navigations HTML vers les domaines et chemins autorisés. Ni images, coordonnées personnelles, prix bruts ou corps complets d'annonce ne sont stockés. OFFRYA enregistre un titre expurgé et une description **générique rédigée par OFFRYA**, la catégorie, le département/commune et un lien explicite vers l'annonce d'origine.
- **Retrait :** deux signaux vérifiables d'indisponibilité font expirer une annonce ; toute annonce non vérifiée depuis plus de sept jours est exclue du flux Premium même si son état en base demeure `published`. Une purge durable des anciennes lignes et une surveillance de la conformité légale de la durée de conservation doivent être configurées séparément.

**Limite juridique :** de faibles volumes ne confèrent pas par eux-mêmes un droit d'extraction ou de republication. L'accord Leboncoin/Scrapfly doit être vérifié indépendamment avant de mettre les interrupteurs à `true`.
