# OFFRYA DCE — mise en service contrôlée de ClamAV et de l'OCR

**État au 6 novembre 2026 : aucun déploiement, aucun changement de forfait ni d’environnement de production.**

## Hébergement existant

Le service Render `offrya-app` (`srv-dbihupsipgvc73bkp0qg`) est un service **Web gratuit, runtime Node.js natif**, branch `main`, avec auto-deploy activé. Il n’exécute pas ClamAV ni Tesseract. Ne jamais ajouter une installation système, un changement de runtime ou une hausse de forfait sur ce service sans approbation budgétaire et fenêtre de bascule.

ClamAV recommande un minimum de 3 Gio de RAM et plutôt 4 Gio en conteneur pour charger/recharger ses signatures. Les plans gratuits de Render offrent bien moins que ce volume. Un service de test **Docker** avec au moins 4 Gio est donc nécessaire ; l’exemple `deploy/dce/render-preview.example.yaml` est intentionnellement inactif et ne doit pas être synchronisé automatiquement.

Références :
- https://docs.clamav.net/manual/Installing/Docker.html
- https://render.com/docs/native-runtimes
- https://render.com/pricing

## Images préparées dans la PR

`Dockerfile.dce` installe Node 22, ClamAV/clamd/freshclam, Tesseract et le modèle français. `deploy/dce/clamd.conf` n’expose **aucun port TCP**, seulement le socket Unix privé `/run/clamav/clamd.ctl`. Les processus ClamAV et Node utilisent des identités système distinctes.

`deploy/dce/entrypoint.sh` démarre le serveur et relance le scanner si nécessaire. Le scanner peut être indisponible pendant le chargement des signatures ; la place de marché reste utilisable, mais les imports de DCE restent **bloqués** tant que le socket et la base quotidienne de signatures fraîches ne sont pas utilisables. Les signatures de plus de 72 h entraînent aussi un refus de l’upload.

Configurer uniquement dans l’environnement Docker de test :
- `DCE_CLAMD_SOCKET=/run/clamav/clamd.ctl`
- `DCE_CLAMDB_DIR=/var/lib/clamav`
- `DCE_OCR_ENABLED=true`
- `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` : variables publiques nécessaires à la vérification d’accès ; utiliser un environnement de préproduction, jamais des secrets de production copiés sans contrôle.

L'architecture reste **provisoire** : un Node worker n’est pas un sandbox OS. Avant la production, limiter les accès système des parseurs, revoir les budgets mémoire/réseau/CPU et les délais, les signatures ClamAV, le processus de mise à jour et l'absence de stockage des originaux.

## Procédure d'acceptation d'un environnement préproduction

1. Obtenir l’accord explicite pour le coût d’un service à 4 Gio (les tarifs Render évoluent), le créer séparément, **sans brancher le nom de domaine offrya.fr** et sans modifier `offrya-app`.
2. Déployer l'image `Dockerfile.dce` sur une branche test, en isolant les données et les comptes.
3. Vérifier `clamd` via `zPING`, la présence de `daily.cvd` ou `daily.cld` de moins de 72 h et la mise à jour FreshClam.
4. Exécuter l'essai officiel **EICAR** en archive ZIP : un ZIP bénin doit être autorisé, le ZIP contenant EICAR refusé sans entrer dans les parseurs.
5. Tester une page PDF uniquement image avec OCR français. Confirmer la citation de page, la confiance indicative et la validation humaine.
6. Tester un ZIP issu **d'une seule procédure publique** avec RC, CCAP, CCTP, AE, BPU et DQE et vérifier la présence des six pièces. Tester séparément les fichiers **fictifs** de rectificatif et de Q/R, sans les attribuer à l'acheteur réel.
7. Sur deux comptes Premium distincts, vérifier que chaque réponse est attachée à l'appelant, que les pièces ne sont pas persistées/partagées et que le cache est désactivé. Sur un compte non Premium ou sans JWT, vérifier le blocage HTTP avant lecture de contenu.
8. Réaliser le parcours Android et ordinateur, mesurer temps/mémoire, tester ZIP corrompu, password, macro, grosses images, PDF scannés, refus d'antivirus. Évaluer légalement confidentialité et rétention.
9. Revue technique et juridique, puis **approbation explicite** avant éventuelle migration ou déploiement du service public.

## Vérifications automatisées

- `.github/workflows/tests.yml` : Node, contrôles de sécurité, DCE réel, OCR FR réel en CI.
- `.github/workflows/dce-antivirus.yml` : vrai ClamAV sur runner isolé, téléchargement des signatures, scan d’archive propre et d'une archive contenant EICAR.
- Le test DCE intégral récupère les fichiers historiques de la consultation municipale `01/ST/2026` (dossier public sur le site de Coupvray). Il est constitué à la volée uniquement pour test, n'est pas conservé dans le dépôt, et les rectificatifs et Q/R de simulation sont **explicitement fictifs**.

**Une réussite CI ne prouve pas que la configuration Docker est déployée sur Render.** Tant que le changement de runtime/service et l'autorisation budgétaire n'ont pas été approuvés, aucune installation sur l'infrastructure réelle n'a eu lieu.
