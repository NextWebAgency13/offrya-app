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
 const app=await request('/app.js');
 assert.equal(app.status,200,'Code client disponible');
 assert.match(app.text,/premium/i);
 console.log('PASS: JavaScript de l’application accessible');
 const cfg=await request('/api/config');
 assert.equal(cfg.status,200,'Configuration API');
 assert.equal(cfg.json?.supabaseUrl,'https://hhxtutvmvlphkutqscad.supabase.co');
 assert.equal(cfg.json?.premiumPriceEuros,19);
 assert.equal(typeof cfg.json?.billingEnabled,'boolean');
 assert.equal(cfg.json?.billingEnabled,health.json?.paymentsEnabled);
 console.log('PASS: configuration publique Supabase et prix Premium à 19 euros');
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
 console.log('ETAT FACTURATION RENDER: '+(cfg.json.billingEnabled?'ACTIVE (vérification production réelle non prouvée)':'DESACTIVEE'));
}
run().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
