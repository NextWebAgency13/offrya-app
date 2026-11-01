# OFFRYA — Migration vers les routes publiques et privées

La version antérieure utilisait des fragments (`#dashboard`, etc.) dans un seul document HTML. La nouvelle architecture expose des **documents HTML publics distincts**, et l'application privée est servie uniquement aux chemins `/espace/*` reconnus.

## Tableau de correspondance des URL

| Ancien chemin ou fragment | Nouveau chemin |
|---|---|
| `/#dashboard` | `/espace` |
| `/#missions` | `/espace/missions` |
| `/#professional` | `/professionnels` |
| `/#professional-space` | `/espace/professionnel` |
| `/#boamp`, `/#tenders` | `/espace/marches-publics` |
| `/#inbox`, `/#messages` | `/espace/messagerie` |
| `/#settings` | `/espace/reglages` |
| `/` (vitrine et compte mêlés) | `/` (vitrine publique uniquement) |
| Dépôt dans le fragment `#missions` | `/deposer-une-mission` |
| Connexion dans une fenêtre de la page unique | `/connexion?next=%2Fespace` |
| Paiement Stripe réussi / annulé | `/espace/professionnel?checkout=success` / `?checkout=cancelled` |
| Retour de Stripe Identity | `/espace/professionnel?identity=returned` |
| Retour du portail Stripe | `/espace/reglages?billing=returned` |

Les anciens fragments sont redirigés **côté navigateur** par le petit script du document public `/`. Le serveur ne peut pas recevoir les fragments, et ne peut donc pas émettre un HTTP 301 pour ces URL.

## Paramètres Supabase Auth — intervention manuelle obligatoire

Projet : `hhxtutvmvlphkutqscad`

Dans **Authentication → URL Configuration** :

- **Site URL** : `https://offrya-app.onrender.com/`
- **Redirect URLs autorisées** : `https://offrya-app.onrender.com/connexion`, `https://offrya-app.onrender.com/connexion?**` et `https://offrya-app.onrender.com/espace/**`.
- Conserver temporairement l'ancien `https://offrya-app.onrender.com/` et les éventuelles anciennes redirections utilisées par des e-mails déjà envoyés, puis retirer les inutiles après expiration.
- **Authentication → Providers** : activer les inscriptions anonymes pour le dépôt sans compte, si ce n'est pas déjà fait.
- **Authentication → Identity Linking** : activer la liaison manuelle d'identité si l'option de récupération facultative du suivi invité par e-mail est utilisée. L'option déclenche `auth.updateUser({email})`, qui demande confirmation de l'adresse, **elle ne garantit pas un accès depuis un autre appareil avant cette confirmation**.
- Configurer les politiques de CAPTCHA/limitation de débit sur tous les parcours Auth avant d'activer le CAPTCHA Supabase global. La seule interface Turnstile du dépôt ne protège pas tous les formulaires d'authentification.
- Vérifier les modèles d'e-mail de confirmation et de récupération : leurs URLs doivent être compatibles avec `/connexion`, sans remplacer le token sécurisé ni supprimer `{{ .ConfirmationURL }}`.
- Les liens de suivi publiés en invité ne constituent pas une autorisation de consulter les missions des autres ; les politiques RLS restent l'unique autorité.

**Aucune de ces modifications du panneau d'authentification n'est effectuable via les commandes Supabase disponibles dans cette conversation.** Ne pas annoncer qu'elles ont été appliquées.

## Stripe — redirections et webhooks

Les retours de paiement et de résiliation sont générés côté serveur à partir de `SITE_URL` par `lib/billing.js`. Le retour Identity est généré par `lib/identity.js`. La nouvelle version du code les émet aux chemins indiqués dans le tableau.

Dans le compte Stripe de **production NextWebAgency** :

- Conserver le webhook de facturation existant `https://offrya-app.onrender.com/api/billing/webhook`.
- Conserver le webhook Identity existant `https://offrya-app.onrender.com/api/identity/webhook`.
- Conserver deux secrets de signature **distincts** dans Render.
- Contrôler les autorisations de la clé restreinte `rk_live_` sur les sessions Identity. Un test HTTP 401 sans authentification n'établit **pas** que la clé peut créer une vraie session Stripe.
- Vérifier dans la configuration du portail client Stripe que la résiliation est proposée selon les CGV.
- La page de retour ne rend aucun compte Premium actif sans confirmation côté webhook et autorisation Supabase.

## Render — déploiement, routes et vitesse

Conserver le service Node sur `https://offrya-app.onrender.com` ; `server.js` sert directement les documents publics, les routes de l'application privée et les API. **Ne pas ajouter de règle de réécriture globale** `/* → /index.html` qui transformerait les 404 en réponses 200. Les URL inconnues répondent HTTP 404 avec le document 404.

Dans **Environment** : `SITE_URL=https://offrya-app.onrender.com` (sans chemin), `SUPABASE_URL=https://hhxtutvmvlphkutqscad.supabase.co`, les clés déjà configurées et les secrets Stripe. Ne pas copier ces secrets dans les tickets, logs ou captures.

**Démarrage à froid** : un service web gratuit Render est mis en veille après environ 15 minutes d'inactivité et peut mettre près d'une minute à redémarrer. Le HTML statique servi depuis le service Node reste soumis à cette latence. Deux solutions :

1. **Recommandée pour OFFRYA au même domaine :** passer ce web service au plus petit forfait payant toujours actif (Render Starter, environ **7 USD/mois**, hors éventuels frais et taxes). Cela maintient une seule origine pour l'authentification, les cookies, le formulaire et les webhooks. Nécessite la décision du propriétaire : aucun changement de forfait n'est effectué automatiquement.
2. Déployer une **vitrine statique gratuite** sur un hébergement séparé et conserver l'API privée sur le service existant : le public chargerait instantanément mais exige un nouveau découpage de domaines, une stratégie CORS et les redirections Stripe/Supabase correspondantes. Ne pas procéder sans plan de migration DNS et de sécurité.

Les polices publiques utilisent une pile système, sans chargement de Google Fonts ni bibliothèque bloquante. Aucun appel réseau personnel n'a lieu au chargement de `/`.

## Protocole de recette

### Tests automatiques sans données réelles

- Ouvrir les 15 pages publiques et les 6 routes privées directement et vérifier HTTP 200.
- Vérifier H1 unique, titre, description, canonical, liens légaux.
- Vérifier `/espace/*` : meta noindex, en-tête `X-Robots-Tag`, `Cache-Control: private, no-store`.
- Vérifier un chemin inexistant renvoie HTTP 404 et une page HTML dédiée.
- Vérifier `robots.txt`, `sitemap.xml` sans chemin privé.
- Vérifier les fragments historiques dans le script public.
- Vérifier les retours Stripe dans les tests unitaires, ainsi que le rejet des webhooks non signés.
- Vérifier que la route BOAMP sans connexion renvoie HTTP 401, et les paiements sans autorisation sont refusés.

### Recette réelle à réaliser uniquement avec un utilisateur autorisé

- Sans session, `/espace/messagerie` conduit à `/connexion?next=%2Fespace%2Fmessagerie` et revient au chemin demandé après authentification.
- Publication réelle en invité depuis `/deposer-une-mission` : conservation de sa seule annonce, suppression des données du navigateur et récupération par email **uniquement si l'adresse est confirmée**.
- Inscription d'un dirigeant inscrit au registre, preuve documentaire + selfie consentis, webhook Stripe Identity signé, validation administrative et activation Premium uniquement après facture réellement payée.
- Essai de résiliation dans le portail Stripe et vérification de mise à jour d'abonnement par webhook.

**Ne pas injecter de faux statut `verified` ni créer un paiement réel uniquement pour satisfaire un test.** Les scénarios réels ne peuvent être déclarés « réussis » sans les avoir effectivement exécutés.
