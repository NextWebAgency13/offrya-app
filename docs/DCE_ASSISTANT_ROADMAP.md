# OFFRYA Premium — DCE, préparation et validation humaine

## Périmètre de la PR 163 (6 novembre 2026)

Ajout isolé à l'onglet **Marchés publics** de l'espace Premium, sans changer l'algorithme BOAMP/TED, les missions, les droits de lecture RLS ni les cartes approuvées.

### Fonctionnalités développées sur la branche (non déployées)

1. **Import manuel ZIP** : le professionnel télécharge lui-même le DCE depuis le profil acheteur accessible dans l'avis officiel. Il importe une archive ZIP (20 Mo max) dans OFFRYA.
2. **Contrôles du ZIP** : signature ZIP, chemins sécurisés, pas d'archives imbriquées, macros, exécutables, liens symboliques ou ZIP chiffrés, plafonds par fichier/volume/ratio de compression/entrées ; traitement isolé dans un worker limité en durée et en mémoire.
3. **Extraction** : PDF texte (25 premières pages maximum par PDF, limite globale de 80 pages), DOCX texte (sans pagination fixe), XLSX tableaux limités (sans recalcul des formules), TXT. Jusqu'à 12 documents pris en charge. Les pages PDF scannées sans texte sont signalées comme nécessitant un OCR ; **pas d'OCR livré**.
4. **Provenance** : les indices de date limite, critères et pondérations, capacité, visites obligatoires, lots, durée, limite de pages, reprise de personnel, rectificatifs et pièces citées gardent document, page/feuille/section et extrait ; interprétation conservatrice « à vérifier ».
5. **Checklist** : documents relevés et cases de confirmation explicites. Leur présence dans un texte ne prouve pas qu'ils soient exigés : le professionnel doit relire le RC et contrôler les rectificatifs/Q-R.
6. **Brouillons** : fiches de données pour DC1 et DC2, ou DUME, et trame de mémoire technique par critère détecté. Le professionnel renseigne ses propres données puis les confirme avant insertion ; aucune déclaration automatique ni signature. **Ce ne sont pas les formulaires administratifs remplis officiellement**.
7. **Aide au chiffrage** : recherche facultative de montants d'attribution par code CPV via la source officielle DECP DAJ ; montants globaux, dates, durée et lien vers la source. Aucun prix unitaire ni prix conseillé inventé. En cas d'indisponibilité de la source, une erreur est affichée plutôt que des chiffres fictifs.
8. **Validation et remise** : contrôles spécifiques des pièces, engagements, prix, échéance et version du DCE, export JSON de préparation, retour vers l'avis officiel ; **aucun dépôt, envoi, signature ou engagement automatique**.

### Sécurité et confidentialité

- Routes POST /api/pro/dce/import et /api/pro/dce/prepare ; GET /api/pro/dce/awards, toutes protégées par la vérification Premium serveur existante.
- Traitement éphémère : originaux et texte non enregistrés en Supabase ni dans un stockage externe ; le dossier brouillon n'est conservé qu'en mémoire dans l'onglet ouvert et exportable à la demande. Ne pas inclure les données des documents dans les logs.
- Les données d'entreprise sont déclarées et confirmées par l'utilisateur, sans enrichissement externe. Une confirmation ne vaut pas vérification juridique.
- Le lien vers l'avis officiel doit appartenir aux domaines officiels BOAMP/TED ; aucune connexion automatique à un profil d'acheteur.
- Le traitement des fichiers importés est isolé, mais **il n'intègre pas encore d'antivirus** : une analyse complémentaire, un durcissement des scanners, un audit de sécurité et des tests de charge avec vraies archives sont nécessaires avant autorisation de production.
- L'extraction PDF/DOCX et XLSX reste partielle ; les limites, incertitudes et avertissements sont affichés à l'utilisateur.

### Tests sur la branche

Tests : accès serveur, extraction ZIP échantillon, rejet d'archive à traversée de chemin, citations, checklist, champs confirmés, données d'attribution simulées, absence de prix conseillé, absence de dépôt automatique et non-régression de l'interface Premium. GitHub Actions installe les dépendances du module avant de lancer la suite.

### Prochaines étapes avant déploiement

- Antivirus/CDR, durcissement des dépendances, politiques de rétention et limites plus fines de ressources.
- Tests de vrais DCE (PDF de différentes structures, DOCX/XLSX complexes), OCR isolé si nécessaire, extraction plus fiable des critères par sous-critère et pièces obligatoires.
- Intégration facultative d'un coffre privé avec RLS si une sauvegarde persistante est demandée, avec suppression maîtrisée.
- Prévisualisation/exports PDF ou DOCX et génération contrôlée de formulaires DC ou DUME conformes à la version officielle ; vérifier le cadre légal en vigueur.
- Liaison des Q/R et rectificatifs via flux autorisés selon chaque profil acheteur ; ne pas promettre une surveillance exhaustive.
- Tests Android et PC réels sur compte Premium, non-Premium, et deux comptes différents ; relecture juridique/confidentialité.

Sources officielles :
- https://www.economie.gouv.fr/daj/les-formulaires-de-declaration-du-candidat
- https://entreprendre.service-public.gouv.fr/vosdroits/F32144
- https://entreprendre.service-public.gouv.fr/vosdroits/R44043
- https://data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/

**Statut : branche de préparation et PR brouillon, aucune fusion ni mise en production.**

## Durcissement antivirus et OCR — PR 163 (6 novembre 2026)

### ClamAV obligatoire et refus systématique en cas d'échec

- Contrôle Premium JWT côté serveur AVANT lecture du ZIP.
- La totalité du ZIP est transmise au démon ClamAV par le protocole zINSTREAM sur socket Unix local privé (variable serveur DCE_CLAMD_SOCKET).
- Seule une réponse explicite « stream: OK » autorise un parseur. Un résultat FOUND refuse le fichier (422) ; démon absent, erreur, timeout ou configuration absente : 503. Pas de mode de repli sans antivirus.
- 20 Mo par archive, flux fractionné en blocs de 64 Kio, durée bornée. Aucun transfert de documents vers un service antivirus externe.
- Tests de protocole avec faux démon : OK, FOUND, réponse invalide et scanner absent. Ces tests ne remplacent PAS un essai avec un vrai moteur ClamAV et des signatures de détection.
- **BLOQUEUR PRODUCTION :** le Render actuel ne dispose pas d'un démon clamd provisionné et testé. Prévoir installation et signatures actualisées, socket strictement local, StreamMaxLength supérieur à 20 Mo, test EICAR, surveillance de mise à jour et capacité mémoire. Ne pas exposer clamd sur TCP public.
- Un Node Worker plafonne mémoire/temps mais ne constitue pas un bac à sable de sécurité au niveau OS. Un conteneur/processus avec restrictions système et réseau est recommandé pour le traitement de fichiers non fiables avant ouverture générale.

### OCR hors ligne, non probant juridiquement

- OCR via /usr/bin/tesseract avec fichier linguistique français fra, flux image STDIN et texte TSV STDOUT, sans traitement cloud.
- Option serveur DCE_OCR_ENABLED=true ; désactivé par défaut. En l'absence du logiciel ou des modèles FR, les pages scannées sont déclarées non exploitées et à vérifier manuellement.
- Rendu raster de largeur 1100 pixels maximum ; OCR limité à trois pages par archive, à 4 Mo par image, avec plafonds de durée et de résultat.
- Conservation des sauts de ligne extraits du TSV, de la confiance indicative et du statut OCR incertain dans les citations par page.
- Le résultat d'une page OCR ne peut pas, seul, déterminer une inéligibilité financière.
- Une page non lue ne vaut pas absence d'exigences : contrôle humain requis.

### Essais sur deux véritables pièces publiques

Les deux documents ont été téléchargés temporairement sur les exécuteurs GitHub Actions depuis le site de leur acheteur public, la commune de Coupvray, puis supprimés.
- Règlement de consultation 01/ST/2025 : https://www.coupvray.fr/wp-content/uploads/2025/05/01ST2025_RC.pdf ; 12 pages, 23 indices, 9 pièces repérées.
- CCTP 04/MG/2022 : https://www.coupvray.fr/wp-content/uploads/2022/09/2022-CCTP.pdf ; 18 pages, 10 indices, 1 pièce repérée.
- Ces deux fichiers appartiennent à des procédures historiques différentes : ce ne sont PAS deux pièces d'un DCE complet unique.
- Une version purement image de la page 10 du vrai RC est générée pour le test OCR. Sa fidélité et les citations doivent être examinées ; une confiance OCR élevée ne vaut pas validation juridique.
- Avant déploiement, ajouter des essais de ZIP DCE complets, corrigés successifs et tableaux de prix complexes.

### DECP validée en conditions réelles

- API officielle : https://www.data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides/records
- Réponse observée : 741 010 enregistrements, champs id, objet, codecpv, montant, datenotification, dureemois.
- Requête de recherche du CPV 90910000 : 12 attributions réelles, premier code CPV renvoyé 90910000-9.
- Aucun montant d'attribution n'est assimilé automatiquement à un prix unitaire ni à un prix conseillé.
- Les erreurs d'API ne donnent lieu à aucun résultat fictif.

### Décision de sécurité

PR 163 conservée non fusionnée et non déployée. Activation production interdite tant que l'infrastructure ClamAV et les contrôles OS, antivirus réels, PDF scannés et comptes séparés n'ont pas été vérifiés.
