# Notifications Android OFFRYA (Web Push)

## Fonctionnement
- Un utilisateur connecté (demandeur ou professionnel) ouvre **Mon compte → Notifications Android** et choisit **Activer les notifications push**.
- Le navigateur Android demande son autorisation. Aucune notification n'est activée sans consentement.
- Le service worker OFFRYA reçoit une notification générique lors d'un nouveau message, y compris si la page OFFRYA est fermée, lorsque le navigateur et Android autorisent les tâches en arrière-plan.
- Un appui sur la notification ouvre **/espace/messagerie**. Le serveur ne transmet ni texte de message, ni identité du contact, ni titre de mission au service push.
- **Désactiver** supprime l'abonnement serveur et celui du navigateur. La déconnexion tente également de retirer l'abonnement de l'appareil.

## Activation technique (en production)
1. La migration `sql/web_push_notifications.sql` crée la table privée `offrya_push_subscriptions` (RLS sans aucune politique accessible aux utilisateurs) et un trigger sur les insertions de `offrya_messages`. Elle active `pg_net`.
2. Générer une paire de clés **VAPID** P-256. Stocker sur Render :
   - `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (clé privée **jamais** envoyée au navigateur).
   - `OFFRYA_PUSH_WEBHOOK_SECRET` : secret aléatoire d'au moins 32 caractères.
3. Enregistrer **le même** `OFFRYA_PUSH_WEBHOOK_SECRET` dans Supabase Vault sous le nom `offrya_push_webhook_secret`. Ne jamais mettre les secrets en dépôt ou dans une migration.
4. Le trigger HMAC envoie un identifiant de message signé, via `pg_net`, à `https://offrya-app.onrender.com/api/push/message`. Le serveur vérifie la signature et l'ancienneté de l'événement, retrouve le destinataire en base, puis envoie le push par les fournisseurs de navigateurs. Les réponses 404/410 suppriment les abonnements expirés.
5. Le service Render est en plan gratuit : il peut se mettre en veille après 15 minutes. `pg_net` attend jusqu'à 90 secondes pour laisser le service redémarrer. **Il n'y a toutefois aucune garantie de livraison** si Render est indisponible, si Android force l'arrêt du navigateur ou si le téléphone est hors réseau.

## Test réel Android
1. Dans Chrome sur Android, visiter `https://offrya.fr`, puis ajouter OFFRYA à l'écran d'accueil lorsque cette option est disponible.
2. Se connecter à un compte OFFRYA puis ouvrir **Mon compte** et appuyer sur **Activer les notifications push**.
3. Autoriser les notifications au niveau de Chrome/Android.
4. Fermer complètement la page ou l'application OFFRYA **sans forcer l'arrêt de Chrome**.
5. Envoyer un nouveau message privé depuis un **autre** compte dans une conversation OFFRYA. Une notification générique OFFRYA doit apparaître.
6. Appuyer dessus pour ouvrir **Messages**. Désactiver depuis **Mon compte** puis refaire le test pour vérifier l'arrêt.

## Sécurité et coûts
- Toute requête d'abonnement doit présenter une session Supabase vérifiée via `auth/v1/user`.
- Le tableau des abonnements est inaccessible en lecture et écriture directe aux utilisateurs connectés.
- Le webhook est signé HMAC-SHA256 ; le secret reste dans Vault et sur Render. Aucun secret n'est transmis par `pg_net`.
- Les clés d'abonnement (endpoint + p256dh + auth) sont des données de routage sensibles, stockées côté serveur seulement.
- Push Web n'utilise aucune API d'IA payante ; les limites des offres Render/Supabase et des fournisseurs Web Push s'appliquent.
- Il ne s'agit pas d'une APK native, et le fonctionnement reste conditionné au navigateur et aux paramètres Android.

## Vérification de l'abonnement et test réel (à partir de la PR #132)
- Le bouton **Activer/Réactiver** n'est considéré actif que si `POST /api/push/status` confirme l'abonnement sur le serveur pour **le compte actuellement connecté**.
- **Envoyer une notification de test** utilise `POST /api/push/test`, une session valide et l'abonnement de cet appareil. Le serveur transmet une véritable notification Web Push au fournisseur du navigateur. Il ne crée ni conversation ni message fictif.
- Un retour de test OK signifie **acceptation par le fournisseur push**, pas garantie d'affichage par Android : régler les autorisations de Chrome, les notifications de site et les restrictions de batterie.
- **Se déconnecter retire l'abonnement pour ce compte**. Pour tester avec deux comptes, utiliser deux navigateurs distincts sans déconnecter le compte destinataire, ou préférer le bouton de test autonome.
- Les notifications internes (bandeaux dans la page) ne prouvent pas le fonctionnement du Web Push. Il faut voir une alerte système dans le volet Android.
