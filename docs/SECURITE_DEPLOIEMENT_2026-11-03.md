# Protection Auth OFFRYA — état de configuration
- Le navigateur charge Turnstile seulement si `OFFRYA_TURNSTILE_SITE_KEY` est configurée sur Render (clé publique).
- Pour rendre CAPTCHA **obligatoire**, créer un widget Cloudflare pour le domaine de production, renseigner la clé publique dans Render et le **secret privé** uniquement dans Supabase Auth > Bot and Abuse Protection. Activer Supabase CAPTCHA **seulement après vérification du widget**.
- Ne jamais ajouter le secret Turnstile à Git, au HTML ou à `/api/config`.
- Test à réaliser avant activation: connexion, inscription, demande de réinitialisation, lien confirmé, smartphone, erreur CAPTCHA expiré.
- TLS PostgreSQL observé au 03/11/2026: ssl=on; min TLSv1.2; liaison de diagnostic TLSv1.3. Toute nouvelle URL PostgreSQL directe doit imposer `sslmode=verify-full` avec certificat CA valide (ne pas utiliser `rejectUnauthorized:false`).
- Les règles RLS actives sont conservées. `SUPABASE_SECRET_KEY` et les clés Stripe ne doivent être disponibles que côté serveur.
- La protection des mots de passe compromis est réservée au forfait Supabase Pro et supérieur et n'a pas été activée ici.
