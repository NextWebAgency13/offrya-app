'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {queryBoamp}=require('./lib/boamp');
const {verifyPremiumAccess}=require('./lib/premium');
const {lookupCompany,verifyProfessional}=require('./lib/company');
const {beginIdentity,processIdentityEvent,configured:identityConfigured,identityConfigChecks}=require('./lib/identity');
const {billingEnabled,startCheckout,verifyStripeSignature,syncSubscription,portal}=require('./lib/billing');
const {verifyToken}=require('./lib/unsubscribe');
const FINGERPRINTED_PUBLIC_CSS='/public.c2a613f9e5fe.css';
const staticMap=new Map([
 [FINGERPRINTED_PUBLIC_CSS,'text/css; charset=utf-8'],['/logo-offrya.svg','image/svg+xml'],
 ['/public.css','text/css; charset=utf-8'],['/auth.css','text/css; charset=utf-8'],['/activity.js','text/javascript; charset=utf-8'],['/deposer.js','text/javascript; charset=utf-8'],['/connexion.js','text/javascript; charset=utf-8'],['/auth-feedback.mjs','text/javascript; charset=utf-8'],['/legacy-redirect.js','text/javascript; charset=utf-8'],
 ['/index.html','text/html; charset=utf-8'],['/app.js','text/javascript; charset=utf-8'],
 ['/styles.css','text/css; charset=utf-8'],['/home.css','text/css; charset=utf-8'],['/pro.css','text/css; charset=utf-8'],['/favicon.svg','image/svg+xml'],
 ['/confidentialite.html','text/html; charset=utf-8'],['/mentions-legales.html','text/html; charset=utf-8'],
 ['/cgv.html','text/html; charset=utf-8'],['/remboursements.html','text/html; charset=utf-8'],['/contact.html','text/html; charset=utf-8']]);
const buckets=new Map();
function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));}
function rateLimit(req,max=50){const ip=req.socket.remoteAddress||'unknown',key=ip+':'+req.url.split('?')[0],now=Date.now();
 if(buckets.size>2000)for(const [k,v] of buckets)if(v.until<now)buckets.delete(k);
 let e=buckets.get(key);if(!e||e.until<now){e={count:0,until:now+60000};buckets.set(key,e);}return ++e.count<=max;}
function csvValue(v){let s=String(v??'');if(/^[\s]*[=+@\t\r-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function htmlEsc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function unsubscribePage(token,valid){return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OFFRYA • Désabonnement</title><style>body{font:16px system-ui;background:#09141c;color:#eff9ed;display:grid;place-items:center;min-height:90vh}main{max-width:460px;padding:35px;border:1px solid #466057;border-radius:20px}button{background:#c8f87c;color:#14271e;border:0;border-radius:9px;padding:14px 20px;font-weight:bold;cursor:pointer}a{color:#c8f87c}</style><main><h1>Gérer vos alertes OFFRYA</h1>${valid?`<p>Vous pouvez arrêter les alertes par e-mail sans vous connecter. Vos notifications seront désactivées.</p><form method="post" action="/api/unsubscribe"><input type="hidden" name="token" value="${htmlEsc(token)}"><button type="submit">Me désabonner</button></form>`:'<p>Ce lien est invalide. Connectez-vous à OFFRYA pour modifier vos préférences.</p>'}<p><a href="/">Retour à OFFRYA</a></p></main></html>`;}
async function readBody(req,cap=500){return new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>cap){reject(new Error('Body too large'));req.destroy();}});req.on('end',()=>resolve(data));req.on('error',reject);});}
async function unsubscribe(id){const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw Error('Unsubscribe storage not configured');
 const resp=await fetch(`${url.replace(/\/$/,'')}/rest/v1/offrya_alert_preferences?user_id=eq.${encodeURIComponent(id)}`,{
 method:'PATCH',headers:{apikey:key,'Content-Type':'application/json',Prefer:'return=representation'},
 body:JSON.stringify({missions_enabled:false,messages_enabled:false})});
 if(!resp.ok)throw Error('Preference update failed '+resp.status);
 return await resp.json();}
async function handle(req,res){
 try{const u=new URL(req.url,'http://localhost'),p=u.pathname;
  if(p==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'4.0.0',paymentsEnabled:billingEnabled(),emailsConfigured:Boolean(process.env.RESEND_API_KEY)});
  if(p==='/api/company/lookup'&&req.method==='GET'){
   if(!rateLimit(req,12))return json(res,429,{error:'Trop de demandes de vérification.'});
   try{
    const verified=await verifyProfessional(req.headers.authorization,{url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY});
    if(!verified.allowed)return json(res,verified.status,{error:verified.error});
    const result=await lookupCompany(u.searchParams.get('siret'));
    if(!result.ok)return json(res,result.status,{error:result.reason});
    const {registry_representatives,...publicCompany}=result.company;
    return json(res,200,publicCompany);
   }catch(err){console.error('Official company lookup:',err.message);return json(res,503,{error:'Registre national temporairement indisponible.'});}
  }
  if(p==='/api/company/verification-request'&&req.method==='POST'){
   if(!rateLimit(req,5))return json(res,429,{error:'Trop de tentatives. Réessayez plus tard.'});
   try{
    const actor=await verifyProfessional(req.headers.authorization,{url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY});
    if(!actor.allowed)return json(res,actor.status,{error:actor.error});
    if(!process.env.SUPABASE_SECRET_KEY)return json(res,503,{error:'Vérification indisponible.'});
    const data=JSON.parse(await readBody(req,1600));
    const siret=String(data.siret||'').trim();
    const representative_name=String(data.representative_name||'').trim();
    const representative_capacity=String(data.representative_capacity||'').trim();
    const representative_kind=String(data.representative_kind||'').trim();
    if(representative_name.length<4||representative_name.length>120||representative_capacity.length<3||representative_capacity.length>100||representative_kind!=='dirigeant')
     return json(res,400,{error:'Indiquez le nom complet et la fonction du représentant de l’entreprise.'});
    const official=await lookupCompany(siret);
    if(!official.ok)return json(res,official.status,{error:official.reason});
    const {norm}=require('./lib/representatives');
    const directors=official.company.registry_representatives||[];
    if(directors.length&&!directors.some(d=>[norm(d.first+' '+d.last),norm(d.last+' '+d.first)].includes(norm(representative_name))))
      return json(res,422,{error:'Le nom déclaré ne correspond pas aux dirigeants officiels de cette entreprise. Les salariés ne peuvent pas souscrire à OFFRYA Pro.'});
    const row={user_id:actor.userId,siret,legal_name:official.company.legal_name,representative_name,representative_capacity,representative_kind};
    const response=await fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/offrya_premium_requests',{
     method:'POST',headers:{apikey:process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
     body:JSON.stringify(row),signal:AbortSignal.timeout(10000)
    });
    if(response.status===409)return json(res,409,{error:'Un dossier de vérification existe déjà pour ce compte.'});
    if(!response.ok)throw Error('Supabase verification request HTTP '+response.status);
    return json(res,202,{status:'pending',legal_name:official.company.legal_name});
   }catch(err){console.error('Professional verification request:',err.message);return json(res,503,{error:'Le dossier de vérification ne peut pas être enregistré actuellement.'});}
  }
  if(p==='/api/identity/start'&&req.method==='POST'){
   if(!rateLimit(req,3))return json(res,429,{error:'Trop de vérifications. Réessayez plus tard.'});
   try{const result=await beginIdentity(req.headers.authorization);return json(res,result.status,result.error?{error:result.error}:{url:result.url});}
   catch(e){console.error('Identity verification start:',e.message);return json(res,503,{error:'Le contrôle d’identité est momentanément indisponible.'});}
  }
  if(p==='/api/identity/webhook'&&req.method==='POST'){
   if(!identityConfigured())return json(res,503,{error:'Service de vérification non configuré.'});
   try{
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>256000)return json(res,413,{error:'Taille excessive'});chunks.push(chunk);}
    const raw=Buffer.concat(chunks);
    const {verifyStripeSignature}=require('./lib/billing');
    if(!verifyStripeSignature(raw,req.headers['stripe-signature'],process.env.STRIPE_IDENTITY_WEBHOOK_SECRET))
     return json(res,400,{error:'Signature de vérification invalide.'});
    await processIdentityEvent(JSON.parse(raw.toString('utf8')));
    return json(res,200,{received:true});
   }catch(e){console.error('Identity webhook:',e.message);return json(res,503,{error:'Traitement de vérification indisponible.'});}
  }
  if(p==='/api/config'&&req.method==='GET')return json(res,200,{identityEnabled:identityConfigured(),supabaseUrl:process.env.SUPABASE_URL||null,supabaseKey:process.env.SUPABASE_PUBLISHABLE_KEY||null,paymentsEnabled:billingEnabled(),billingEnabled:billingEnabled(),premiumPriceEuros:34.99,guestCaptchaSiteKey:process.env.OFFRYA_TURNSTILE_SITE_KEY||null});
  if(p==='/api/billing/checkout'&&req.method==='POST'){
   if(!rateLimit(req,5))return json(res,429,{error:'Trop de tentatives.'});
   if(!billingEnabled())return json(res,503,{error:'Paiements OFFRYA non configurés.'});
   try{const d=await startCheckout(req.headers.authorization);return json(res,d.status,d.error?{error:d.error}:{url:d.url});}
   catch(e){console.error('Stripe Checkout:',e.message);return json(res,503,{error:'Checkout indisponible.'});}
  }
  if(p==='/api/billing/portal'&&req.method==='POST'){
   if(!rateLimit(req,6))return json(res,429,{error:'Trop de tentatives.'});
   if(!billingEnabled())return json(res,503,{error:'Paiements OFFRYA non configurés.'});
   try{const d=await portal(req.headers.authorization);return json(res,d.status,d.error?{error:d.error}:{url:d.url});}
   catch(e){console.error('Stripe Portal:',e.message);return json(res,503,{error:'Portail indisponible.'});}
  }
  if(p==='/api/billing/webhook'&&req.method==='POST'){
   if(!billingEnabled())return json(res,503,{error:'Paiements OFFRYA non configurés.'});
   try{
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>256000)return json(res,413,{error:'Taille excessive'});chunks.push(chunk);}
    const raw=Buffer.concat(chunks);
    if(!verifyStripeSignature(raw,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET))
     return json(res,400,{error:'Signature Stripe invalide.'});
    await syncSubscription(JSON.parse(raw.toString('utf8')));
    return json(res,200,{received:true});
   }catch(e){console.error('Stripe Webhook:',e.message);return json(res,503,{error:'Échec de traitement du webhook.'});}
  }
  if(p==='/api/unsubscribe'&&req.method==='GET'){
   const token=u.searchParams.get('token')||'';const valid=Boolean(verifyToken(token,process.env.UNSUBSCRIBE_SECRET));
   res.writeHead(valid?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});return res.end(unsubscribePage(token,valid));}
  if(p==='/api/unsubscribe'&&req.method==='POST'){
   if(!rateLimit(req,8))return json(res,429,{error:'Trop de demandes'});
   const body=await readBody(req);let token=u.searchParams.get('token')||'';try{token=new URLSearchParams(body).get('token')||token;}catch{}
   const userId=verifyToken(token,process.env.UNSUBSCRIBE_SECRET);
   if(!userId)return json(res,400,{error:'Lien invalide'});
   await unsubscribe(userId);
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   return res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>OFFRYA</title><body><h1>Désabonnement effectué</h1><p>Les alertes e-mail sont désactivées.</p><a href="/">Retour au site</a></body></html>');
  }
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Méthode non autorisée'});
  if(p==='/api/annonces'||p==='/api/export'){
   if(!rateLimit(req,p==='/api/export'?10:35))return json(res,429,{error:'Trop de requêtes'});
   let premium;
   try{premium=await verifyPremiumAccess(req.headers.authorization,{url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY});}
   catch(e){console.error('Premium verification',e.message);return json(res,503,{error:'Vérification Premium temporairement indisponible.'});}
   if(!premium.allowed)return json(res,premium.status,{error:premium.error});
   try{const data=await queryBoamp({q:u.searchParams.get('q'),dept:u.searchParams.get('dept'),offset:p==='/api/export'?0:u.searchParams.get('offset'),limit:p==='/api/export'?50:20});
    if(p==='/api/annonces')return json(res,200,data,{'Cache-Control':'private,no-store'});
    const rows=[['ID','Objet','Acheteur','Département','Publié','Date limite','BOAMP'],...data.items.map(x=>[x.id,x.title,x.buyer,x.departments,x.published,x.deadline,x.url])];
    const csv='\ufeff'+rows.map(row=>row.map(csvValue).join(';')).join('\r\n');
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="offrya-boamp.csv"','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'});
    return res.end(req.method==='HEAD'?undefined:csv);
   }catch(e){console.error('BOAMP',e.message);return json(res,502,{error:'Source BOAMP momentanément indisponible. Aucune annonce fictive n’est affichée.'});}
  }
  if(p.startsWith('/api/'))return json(res,404,{error:'Route inconnue'});
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Méthode non autorisée'});
  const publicPages=new Map([['/','index.html'],['/deposer-une-mission','deposer-une-mission.html'],['/professionnels','professionnels.html'],['/connexion','connexion.html'],['/secteurs/batiment','secteurs/batiment.html'],['/secteurs/nettoyage','secteurs/nettoyage.html'],['/secteurs/espaces-verts','secteurs/espaces-verts.html'],['/secteurs/transport','secteurs/transport.html'],['/secteurs/informatique','secteurs/informatique.html'],['/secteurs/autres-prestations','secteurs/autres-prestations.html']]);
  const privatePage=new Set(['/espace','/espace/missions','/espace/marches-publics','/espace/messagerie','/espace/reglages','/espace/professionnel']).has(p);
  const pageFile=privatePage?'espace.html':publicPages.get(p);
  const mime=pageFile?'text/html; charset=utf-8':p==='/robots.txt'?'text/plain; charset=utf-8':p==='/sitemap.xml'?'application/xml; charset=utf-8':staticMap.get(p);
  if(!mime){
    const missing=await fs.readFile(path.join(__dirname,'public','404.html'));
    res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    return res.end(req.method==='HEAD'?undefined:missing);
  }
  const asset=path.join(__dirname,'public',pageFile||(p===FINGERPRINTED_PUBLIC_CSS?'public.css':p.slice(1)));
  const buf=await fs.readFile(asset);
  res.writeHead(200,{'Content-Type':mime,...((privatePage||p==='/connexion')?{'X-Robots-Tag':'noindex, nofollow'}:{}),'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com; script-src 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.pexels.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",'Cache-Control':(privatePage||p==='/connexion')?'private, no-store':p===FINGERPRINTED_PUBLIC_CSS?'public, max-age=31536000, immutable':'public,max-age=60'});
  return res.end(req.method==='HEAD'?undefined:buf);
 }catch(e){console.error('OFFRYA',e.message);if(!res.headersSent)json(res,500,{error:'Erreur interne'});}
}
if(require.main===module){http.createServer(handle).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>{
 console.log('OFFRYA 4 prêt');
 const missing=Object.entries(identityConfigChecks()).filter(([,pass])=>!pass).map(([key])=>key);
 if(missing.length)console.warn('Stripe Identity : configuration à vérifier (noms seulement) : '+missing.join(', '));
 else console.log('Stripe Identity : variables reconnues. Autorisations Stripe et vérification réelle non testées.');
});}
module.exports={handle,csvValue,unsubscribePage};
