'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {handle}=require('../server');

test('Les cinq documents contractuels et support répondent HTTP 200',async()=>{
 const server=createServer(handle);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const [pathname,required] of [
   ['/cgv.html',['34,99 €','renouvelé','résilier']],
   ['/remboursements.html',['14 jours','rétractation']],
   ['/confidentialite.html',['Stripe','Supabase','consentement']],
   ['/contact.html',['nextwebagency.contact@gmail.com','résilier']],
   ['/mentions-legales.html',['NextWebAgency','SIREN']]
  ]){
   const res=await fetch(base+pathname);
   assert.equal(res.status,200,pathname);
   assert.match(res.headers.get('content-type'),/text\/html/);
   const body=await res.text();
   for(const word of required)assert.ok(body.includes(word),pathname+' doit mentionner '+word);
   assert.match(body,/<html lang="fr">/);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Le site expose les liens légaux et la gestion de résiliation depuis Mon compte',()=>{
 const markup=fs.readFileSync(path.join(__dirname,'../public/espace.html'),'utf8');
 const publicHome=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 for(const href of ['/cgv.html','/confidentialite.html','/remboursements.html','/contact.html','/mentions-legales.html']){
  assert.ok(markup.includes('href="'+href+'"'),href);
  assert.ok(publicHome.includes('href="'+href+'"'),href+' accueil');
 }
 assert.match(markup,/id="premiumTermsAck"/);
 assert.match(app,/premiumTermsAck'\)\.checked/);
 assert.match(markup,/id="accountBillingPortal"/);
 assert.match(app,/accountBillingPortal'\)\.onclick/);
 assert.match(app,/select\('status,paid_through,stripe_customer_id'\)/);
});
