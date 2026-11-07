# OFFRYA Visual Agent — surveillance et ajustements visuels

## Couverture

Le bot prend de vraies captures Chromium en 360, 393, 768 et 1440 px
de toutes les URLs du sitemap, et des écrans connexion, inscription
demandeur/pro et récupération. Il mesure les débordements, les cibles
tactiles inférieures à 40 px, les textes sous 14 px et les espaces
vides sous les pieds de page. Chaque exécution conserve des captures
complètes, un diagnostic JSON et un rapport Markdown.

Option IA : lorsque le secret GitHub OFFRYA_VISUAL_OPENAI_API_KEY est
configuré, il examine jusqu'à 8 captures publiques par exécution
via la Responses API. Le modèle est défini dans la variable
OFFRYA_VISUAL_MODEL (par défaut gpt-4.1-mini). Il peut alors identifier
des problèmes plus qualitatifs : alignement, hiérarchie et contraste.

La clé API OpenAI est distincte de l'abonnement ChatGPT et peut entraîner
des frais d'utilisation. Ne pas la placer dans Git, le JavaScript public,
une capture ou une variable client Render.

## Lancer

GitHub > Actions > OFFRYA — Agent de qualité visuelle > Run workflow.

- Mode audit : captures et rapport du site public https://offrya.fr, sans
  modification de code. Exécution automatique le lundi à 06 h 20 UTC,
  même sans clé API.
- Mode propose : nécessite la clé IA. Utilise une instance locale de
  développement (sans effet sur offrya.fr). Propose au maximum 6 corrections CSS,
  refait les captures et restaure l'ancien CSS si un nouveau problème grave
  est détecté. La proposition est soumise à une pull request ; elle n'est
  jamais fusionnée ou déployée automatiquement.
- route_filter (facultatif) : par exemple deposer-une-mission.

Télécharger le rapport sous Actions > artefact offrya-audit-visuel.
Les correctifs acceptés sont ajoutés uniquement à
public/visual-agent-fixes.css (vide au départ). Le serveur inclut
cette feuille en dernier sur toutes les pages HTML, sans modification
des fichiers de gabarit.

## Exécuter localement

Installer npm install et npx playwright install chromium.
Démarrer OFFRYA avec PORT=4199 node server.js.
Puis exécuter npm run visual:audit, ou avec la clé API configurée,
npm run visual:propose. Les rapports sont créés sous visual-report/,
dossier ignoré de Git.

## Comptes demandeur et professionnel Premium

Les tableaux privés ne sont pas audités sans compte de test isolé.
En préproduction seulement, il est possible de définir
OFFRYA_VISUAL_STATE_FILE (état de navigateur Playwright)
et OFFRYA_VISUAL_ALLOW_PRIVATE=1. Ne jamais utiliser des comptes réels,
des captures de messages privés ni des jetons utilisateurs de production
dans les artefacts GitHub ou les appels IA.
Le workflow planifié n'active pas ce mode.

## Garde-fous

Le bot ne publie aucune mission, ne modifie pas Stripe, Supabase, les
habilitations, les messages, la tarification, le contenu ni l'identité.
Les propositions CSS sont limitées à des sélecteurs existants, des
propriétés typographiques, des espacements et des couleurs contrôlées.
Les changements sont revérifiés sur toutes les largeurs de l'audit.
Une correction qui aggrave les débordements ou les erreurs critiques
est annulée. Les résultats visuels doivent être approuvés par une
personne avant fusion.

Les détecteurs DOM peuvent donner des faux positifs. Les captures et
l'inspection humaine restent indispensables. Un audit esthétique ne
prouve pas le bon fonctionnement des parcours métier.

Pour créer des PR automatiquement, GitHub Actions doit autoriser
les pull requests avec GITHUB_TOKEN. Si bloqué par les paramètres du
dépôt, configurer un jeton de bot à droits minimaux dans le secret
VISUAL_BOT_PR_TOKEN. Si les Actions sont désactivées, la planification
ne fonctionnera pas.
