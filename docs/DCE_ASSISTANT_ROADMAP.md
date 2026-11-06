# OFFRYA — assistant DCE Premium : architecture et limites

## État actuel vérifié le 6 novembre 2026

Le moteur dispose déjà de lib/boamp.js (API officielle DILA), lib/ted.js (TED Search API v3), scripts/watch-sector-tenders.js (veille) et lib/ai-matching.js (classement). Ces composants ne lisent pas les documents de consultation, n'établissent pas un dossier de candidature et n'envoient pas de réponse.

Le menu « Assistant IA » actuel aide à répondre aux **missions OFFRYA** et ne doit pas être remplacé sans refonte validée.

## Phase 1 — base technique de l'analyse (cette PR)

Endpoint : POST /api/pro/dce/analyze. Il est soumis au JWT et à la vérification Premium **côté serveur**. Il accepte uniquement les textes déjà extraits et paginés, fournis volontairement par le professionnel.

Format :
    {"documents":[{"name":"RC.pdf","pages":[{"page":2,"text":"Date limite de remise des offres : 27 novembre 2026\nPrix : 40 %, valeur technique : 60 %"}]}],"company":{"turnover_eur":350000,"turnover_confirmed":false}}

Limites : 12 documents, 40 pages chacun, 160 000 caractères au total, quota de requêtes. Aucun document envoyé à OpenAI ou stocké ; traitement en mémoire, sans contenu dans les logs.

Extraction conservatrice : échéances, critères et pondérations, capacité, visites, lots, durée, reprise de personnel, limite de pages, rectificatifs et pièces citées (DC1, DC2, DUME, mémoire technique, BPU, DPGF, DQE, attestations). Chaque fait renvoie document, page et extrait original, plus une incertitude explicite.

La checklist distingue non confirmé et déclaré disponible, non vérifié. Le go/no-go n'a pas de score inventé : verdict A_VERIFIER par défaut ; NO_GO_POTENTIEL pour un minimum de chiffre d'affaires identifié incompatible avec un chiffre **confirmé** par le professionnel. Aucun GO automatique. La trame de mémoire comprend uniquement des consignes à compléter, sans affirmation inventée.

**N'est pas livré dans cette PR** : lecture de ZIP/PDF binaires, OCR, interface utilisateur, extraction tableaux DOCX/XLSX, stockage de dossiers, rédaction complète, DC1/DC2/DUME, extraction de prix attribués et dépôt. Le module n'est pas un assistant DCE complet.

## Phase 2 — import réel et suivi des versions

Ajouter dans l'onglet Marchés publics un bouton « Analyser mon DCE », puis un import volontaire des ZIP et fichiers PDF, DOCX, XLSX. Stocker les originaux en bucket privé Supabase avec RLS par utilisateur, clé d'objet imprévisible, accès vérifié à chaque lecture, quotas et politique de conservation/suppression.

Traiter les archives dans un worker isolé avec antivirus, contrôles de taille, ratio de décompression, nombre de fichiers, chemins ../ ou absolus, liens symboliques, macros, archives chiffrées et imbriquées. Les PDF reçoivent une extraction texte paginée ; uniquement les pages scannées passent par OCR et restent marquées « OCR à vérifier ». Préserver la structure des tableaux et les formules des bordereaux.

Versionner chaque document (nom, type RC/CCTP/CCAP/BPU, date, empreinte SHA-256) et les Q/R/rectificatifs. Chaque nouvelle version rend les anciennes conclusions « à revoir ». Le système ne peut garantir le suivi des Q/R d'une plateforme sans son connecteur autorisé.

## Phase 3 — dossier de candidature humainement validé

Créer un profil professionnel de capacités **confirmées** avec références, certifications, assurances, qualification, données financières et zones. Matrice exigence / justificatif / écart par lot, avec source page. Générer brouillons DC1, DC2 ou DUME, checklist et plan de mémoire technique suivant les sous-critères réellement détectés ; ne jamais signer, déposer ou déclarer sans confirmation humaine.

Ajouter l'aide au chiffrage via les données essentielles de la commande publique, en distinguant montants attribués (contextuels, parfois hétérogènes) et prix unitaires réellement comparables, avec année, CPV, zone, lot et source. Ne jamais fabriquer un prix.

## Phase 4 — enrichissement officiel et conformité

Améliorer la normalisation BOAMP (XML/eForms, versions, rectificatifs, attribution DILA) et TED (corrélation des avis, lots, modifications). Ajouter les profils d'acheteurs directs uniquement quand une API/flux est autorisé après revue des CGU. Le téléchargement manuel du DCE est le parcours par défaut. Apify ne dispense pas du respect des conditions d'utilisation ; aucune automatisation de connexion, aucun contournement de CAPTCHA.

Protéger les données de contacts (RGPD), limiter la conservation et empêcher tout accès inter-comptes. Les documents et profils d'entreprises ne partent pas chez un fournisseur IA externe sans information contractuelle, évaluation de confidentialité et activation explicite. Documents acheteurs considérés comme entrées non fiables (injections de prompt).

## Tests requis avant mise en production

- Demandeur, Pro non vérifié, non abonné, Premium vérifié, session expirée : refus/autorisation conforme.
- Contrôles de fichiers malveillants et volumineux, OCR douteux, correction d'index et de citations.
- Rectificatifs et Q/R invalident les analyses anciennes, absence de GO ou de déclaration inventés.
- Aucune fuite entre deux comptes Premium, rendu Android/ordinateur inchangé hors écran DCE approuvé.

Références officielles :
- https://www.data.gouv.fr/dataservices/api-bulletin-officiel-des-annonces-des-marches-publics-boamp
- https://docs.ted.europa.eu/api/latest/search.html
- https://data.economie.gouv.fr/pages/donnees-essentielles-de-la-commande-publique/
- https://www.marches-publics.gouv.fr/entreprise/footer/conditions-utilisation

**Statut : PR préparatoire, sans fusion, déploiement, migration de base ni modification des écrans Premium existants.**
