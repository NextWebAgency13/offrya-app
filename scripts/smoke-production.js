'use strict';
// Contrôle du site réellement déployé. N'appelle aucune API Stripe et ne crée aucun paiement.
const assert=require('node:assert/strict');
const base='https://offrya-app.onrender.com';
async function request(path,options={}){
 let last;
 for(let i=0;i<3;i++){
  try {
   const r=await fetch(base+path,{...options,redirect:'follow',signal:AbortSignal.timeout(100000),headers:{'User-Agent':'OFFRYA-Production-Smoketest/1.0',...(options.headers||{})}});
   const text=await r.text();
   let json=null;try{json=JSON.parse(text);}catch{}
   return {status:r.status,json,text,headers:r.headers};
  }catch(e){last=e;if(i<2)await new Promise(resolve=>setTimeout(resolve,6000));}
 }
 throw new Error('Render inaccessible sur '+path+': '+(last?.cause?.code||last?.message));
}
async function run(){
 const health=await request('/api/health');
 assert.equal(health.status,200,'Santé Render (HTTP /api/health)');
 assert.equal(health.json?.ok,true,'Santé backend');
 console.log('PASS: site Render joignable et sain');
 const page=await request('/');
 assert.equal(page.status,200,'Page d’accueil');
 assert.match(page.text,/<html/i);
 assert.match(page.text,/offrya/i);
 console.log('PASS: page d’accueil accessible');
 // Vérifier explicitement la publication du nouveau parcours d'accueil.
 // Render peut mettre plusieurs instants à reconstruire après le push : attendre une fois le backend joignable.
 let releaseVisible=false;
 for(let attempt=0;attempt<14;attempt++){
  const landing=await request('/');
  const authPage=await request('/connexion');
  const authScript=await request('/connexion.js');
  releaseVisible=landing.text.includes('class="header-signin"')
   &&landing.text.includes('class="header-signup"')
   &&landing.text.includes('id="choisir-compte"')
   &&authPage.text.includes('id="accountTypeChoice"')
   &&authScript.text.includes('offrya_signup_intent');
  if(releaseVisible)break;
  if(attempt<13)await new Promise(resolve=>setTimeout(resolve,15000));
 }
 assert.ok(releaseVisible,'La version Render ne présente pas encore Connexion / Inscription et les deux parcours du compte');
 console.log('PASS: nouvelle version OFFRYA (connexion, inscription, 2 parcours) visible en production');
 // Design approuvé : vérifier les éléments réellement servis, sans toucher
 // aux données clients ni appeler un paiement.
 let designVisible=false;
 for(let attempt=0;attempt<16;attempt++){
  const [landing,styles]=await Promise.all([request('/',{headers:{'Cache-Control':'no-cache'}}),request('/public.css',{headers:{'Cache-Control':'no-cache'}})]);
  designVisible=landing.status===200&&styles.status===200
   &&landing.text.includes('class="mock-hero"')
   &&landing.text.includes('Votre projet mérite<br>le bon <span>professionnel.</span>')
   &&landing.text.includes('class="mock-activity-title"')
   &&landing.text.includes('id="publicActivity"')
   &&landing.text.includes('class="mock-choice-grid"')
   &&landing.text.includes('class="mock-sector-grid"')
   &&landing.text.includes('class="mock-end"')
   &&styles.text.includes('.mock-home .mock-hero')
   &&styles.text.includes('@media(max-width:560px)');
  if(designVisible)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(designVisible,'Render ne présente pas encore le design photographique approuvé');
 console.log('PASS: maquette OFFRYA desktop/mobile fidèle servie sur Render');


 // Les routes doivent être vraies, pas un fallback global HTTP 200.
 const publicPaths=['/professionnels','/deposer-une-mission','/connexion','/secteurs/batiment','/secteurs/nettoyage','/secteurs/espaces-verts','/secteurs/transport','/secteurs/informatique','/secteurs/autres-prestations'];
 for(const route of publicPaths){
  const r=await request(route);assert.equal(r.status,200,route);assert.match(r.text,/<h1[^>]*>/i,route);
 }
 console.log('PASS: neuf pages publiques accessibles sur URL directe');
 for(const route of ['/espace','/espace/missions','/espace/marches-publics','/espace/messagerie','/espace/reglages','/espace/professionnel']){
  const r=await request(route);
  assert.equal(r.status,200,route);assert.match(r.headers.get('x-robots-tag')||'',/noindex/,route);assert.match(r.text,/name="robots" content="noindex,nofollow"/,route);
 }
 console.log('PASS: six chemins privés et en-têtes noindex');
 const robots=await request('/robots.txt'),map=await request('/sitemap.xml');
 assert.equal(robots.status,200);assert.equal(map.status,200);
 assert.match(robots.text,/Sitemap:/);assert.ok(!map.text.includes('<loc>https://offrya-app.onrender.com/espace'));
 console.log('PASS: robots.txt et sitemap.xml publics uniquement');
 const nonexistent=await request('/ce-chemin-n-existe-pas');assert.equal(nonexistent.status,404);
 console.log('PASS: véritable page 404');

 for(const [p,text] of [['/cgv.html','34,99'],['/confidentialite.html','Stripe'],['/remboursements.html','14 jours'],['/contact.html','nextwebagency.contact@gmail.com'],['/mentions-legales.html','SIREN']]){
   const r=await request(p);
   assert.equal(r.status,200,'Page légale '+p);
   assert.ok(r.text.includes(text),'Texte attendu sur '+p);
 }
 console.log('PASS: CGV, confidentialité, remboursements, support et mentions légales accessibles');
 const app=await request('/app.js');
 assert.equal(app.status,200,'Code client disponible');
 assert.match(app.text,/premium/i);
 console.log('PASS: JavaScript de l’application accessible');

 // Valider la version Render réellement servie, pas seulement le code GitHub.
 // La recherche de missions des tiers ne doit être activée qu'après vérification Pro.
 let missionGateDeployed=false;
 for(let attempt=0;attempt<18;attempt++){
  const [script,privatePage]=await Promise.all([
   request('/app.js',{headers:{'Cache-Control':'no-cache'}}),
   request('/espace',{headers:{'Cache-Control':'no-cache'}})
  ]);
  missionGateDeployed=script.status===200
   &&privatePage.status===200
   &&script.text.includes("const owned=await state.db.from('offrya_missions')")
   &&script.text.includes("if(canUsePremium()){")
   &&script.text.includes("missionSearchFilters")
   &&privatePage.text.includes('id="missionSearchFilters"');
  if(missionGateDeployed)break;
  if(attempt<17)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert.ok(missionGateDeployed,'Render ne sert pas encore le verrouillage des missions avant certification Pro');
 console.log('PASS: Render sert la version verrouillant la recherche des missions avant certification Premium');

 // Contrôle de restauration : vérifier que la version v2 à l'origine du repli
 // n'est plus distribuée par Render, y compris après invalidation de cache.
 let restored=false;
 for(let attempt=0;attempt<20;attempt++){
  const [script,publicPage,privatePage]=await Promise.all([
   request('/app.js',{headers:{'Cache-Control':'no-cache'}}),
   request('/deposer-une-mission',{headers:{'Cache-Control':'no-cache'}}),
   request('/espace',{headers:{'Cache-Control':'no-cache'}})
  ]);
  restored=script.status===200 && publicPage.status===200 && privatePage.status===200
   && !script.text.includes("from './mission-photos.mjs'")
   && !script.text.includes('offrya_pro_proof_requests')
   && !publicPage.text.includes('name="area_sqm"')
   && !privatePage.text.includes('id="reportDialog"');
  if(restored)break;
  if(attempt<19)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert.ok(restored,'Rollback non encore visible sur Render : l’ancienne interface v2 est toujours servie.');
 console.log('PASS: rollback effectif sur Render, interface stable servie sans fonctionnalites v2');

 const cfg=await request('/api/config');
 assert.equal(cfg.status,200,'Configuration API');
 assert.equal(cfg.json?.supabaseUrl,'https://hhxtutvmvlphkutqscad.supabase.co');
 assert.equal(cfg.json?.premiumPriceEuros,34.99);
 assert.equal(typeof cfg.json?.billingEnabled,'boolean');
 assert.equal(cfg.json?.billingEnabled,health.json?.paymentsEnabled);
 console.log('PASS: configuration publique Supabase et prix professionnel à 34,99 euros');

 // Validation de la deuxième étape en production : module autonome public,
 // aucune annonce consultée et aucune valeur fictive.
 let activityDeployed=false;
 for(let attempt=0;attempt<16;attempt++){
  const [landing,asset,professional]=await Promise.all([
   request('/'),request('/activity.js'),request('/professionnels')
  ]);
  activityDeployed=landing.status===200
   &&landing.text.includes('id="publicActivity"')
   &&asset.status===200
   &&asset.text.includes('offrya_public_mission_counts')
   &&professional.status===200
   &&professional.text.includes('OFFRYA Professionnel : développez votre activité')
   &&!professional.text.includes('Devenir Premium sur OFFRYA');
  if(activityDeployed)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(activityDeployed,'Nouvelle vitrine OFFRYA Professionnel et compteurs publics non encore servis sur Render');
 console.log('PASS: vitrine OFFRYA Professionnel et module public autonomes visibles sur Render');
 const publicConfig=cfg.json||{};
 assert.ok(typeof publicConfig.supabaseKey==='string'&&publicConfig.supabaseKey.length>10);
 const rpc=await fetch(publicConfig.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/offrya_public_mission_counts',{
  method:'POST',headers:{apikey:publicConfig.supabaseKey,'Content-Type':'application/json'},body:'{}',
  signal:AbortSignal.timeout(20000)
 });
 assert.equal(rpc.status,200,'RPC public de statistiques');
 const aggregates=await rpc.json();
 assert.ok(Array.isArray(aggregates)&&aggregates.length<=700,'Réponse agrégée');
 for(const entry of aggregates){
  assert.deepEqual(Object.keys(entry).sort(),['category','count','department']);
  assert.ok(Number.isSafeInteger(Number(entry.count))&&Number(entry.count)>=0);
 }
 console.log('PASS: statistiques réelles secteur/département accessibles sans aucune mission privée');

 const protectedApi=await request('/api/annonces');
 assert.equal(protectedApi.status,401,'BOAMP doit refuser les accès anonymes');
 console.log('PASS: recherche BOAMP protégée sans connexion');
 const checkout=await request('/api/billing/checkout',{method:'POST'});
 assert.equal(checkout.status,cfg.json.billingEnabled?401:503,'Checkout sans autorisation');
 console.log('PASS: Checkout refuse la demande non authentifiée ('+checkout.status+')');
 const portal=await request('/api/billing/portal',{method:'POST'});
 assert.equal(portal.status,cfg.json.billingEnabled?401:503,'Portail de facturation sans autorisation');
 console.log('PASS: portail de facturation protégé ('+portal.status+')');
 const webhook=await request('/api/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(webhook.status,cfg.json.billingEnabled?400:503,'Webhook doit rejeter une requête non signée');
 console.log('PASS: webhook rejette une requête non signée ('+webhook.status+')');
 const identityStart=await request('/api/identity/start',{method:'POST'});
 assert.equal(identityStart.status,cfg.json.identityEnabled?401:503,'Démarrage de vérification d’identité sans authentification');
 console.log('PASS: début de vérification d’identité protégé ('+identityStart.status+')');
 const identityWebhook=await request('/api/identity/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(identityWebhook.status,cfg.json.identityEnabled?400:503,'Webhook Identity refuse toute requête sans signature');
 console.log('PASS: webhook Identity rejette une requête non signée ('+identityWebhook.status+')');
 console.log('ETAT STRIPE IDENTITY RENDER: '+(cfg.json.identityEnabled?'ACTIVE (configuration reconnue, pièce et selfie réels non testés)':'DESACTIVEE (au moins un paramètre de configuration absent)'));
 console.log('ETAT FACTURATION RENDER: '+(cfg.json.billingEnabled?'ACTIVE (vérification production réelle non prouvée)':'DESACTIVEE'));
}
run().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
