'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {queryBoamp}=require('./lib/boamp');
const {verifyPremiumAccess}=require('./lib/premium');
const {verifyToken}=require('./lib/unsubscribe');
const staticMap=new Map([
 ['/index.html','text/html; charset=utf-8'],['/app.js','text/javascript; charset=utf-8'],
 ['/styles.css','text/css; charset=utf-8'],['/favicon.svg','image/svg+xml'],
 ['/confidentialite.html','text/html; charset=utf-8'],['/mentions-legales.html','text/html; charset=utf-8']]);
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
  if(p==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'4.0.0',paymentsEnabled:false,emailsConfigured:Boolean(process.env.RESEND_API_KEY)});
  if(p==='/api/config'&&req.method==='GET')return json(res,200,{supabaseUrl:process.env.SUPABASE_URL||null,supabaseKey:process.env.SUPABASE_PUBLISHABLE_KEY||null,paymentsEnabled:false});
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
  const asset=p==='/'?'/index.html':p;
  if(!staticMap.has(asset))return json(res,404,{error:'Introuvable'});
  const buf=await fs.readFile(path.join(__dirname,'public',asset));
  res.writeHead(200,{'Content-Type':staticMap.get(asset),'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; connect-src 'self' https://*.supabase.co; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",'Cache-Control':'public,max-age=60'});
  return res.end(req.method==='HEAD'?undefined:buf);
 }catch(e){console.error('OFFRYA',e.message);if(!res.headersSent)json(res,500,{error:'Erreur interne'});}
}
if(require.main===module){http.createServer(handle).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('OFFRYA 4 prêt'));}
module.exports={handle,csvValue,unsubscribePage};
