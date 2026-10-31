'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http'),{handle}=require('../server');
const {parseBearer,verifyPremiumAccess}=require('../lib/premium');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const config={url:'https://demo.supabase.co',key:'sb_publishable_test'};
const jwt='aaa.'+Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url')+'.ccc';
function fake({role='pro',status='verified',identity_status='verified',authority_status='verified',subStatus='active',paid_through=new Date(Date.now()+3600000).toISOString(),unauth=false,guest=false,representative_kind='dirigeant',registry_name_matched=true}={}){
 return async url=>{
  if(url.includes('/auth/v1/user'))return {ok:!unauth,json:async()=>({id:uid,is_anonymous:guest})};
  if(url.includes('offrya_profiles'))return {ok:true,json:async()=>[{role}]};
  if(url.includes('offrya_premium_requests'))return {ok:true,json:async()=>[{status,identity_status,authority_status,representative_kind,registry_name_matched,premium_until:new Date(Date.now()+86400000).toISOString()}]};
  if(url.includes('offrya_premium_subscriptions'))return {ok:true,json:async()=>[{status:subStatus,paid_through}]};
  throw Error('Unexpected '+url);
 };
}
test('JWT requis, rôle pro et entreprise vérifiée',async()=>{
 assert.equal(parseBearer('Bearer sb_publishable_test'),null);
 assert.equal((await verifyPremiumAccess('',config,fake())).status,401);
 assert.equal((await verifyPremiumAccess('Bearer '+jwt,config,fake({unauth:true}))).status,401);
 assert.equal((await verifyPremiumAccess('Bearer '+jwt,config,fake())).allowed,true);
 for(const opts of [{role:'client'},{status:'pending'},{status:'rejected'},{identity_status:'processing'},{authority_status:'pending'},{representative_kind:'mandataire'},{registry_name_matched:false},{subStatus:'canceled'},{paid_through:new Date(Date.now()-3600000).toISOString()}]){
  const res=await verifyPremiumAccess('Bearer '+jwt,config,fake(opts));assert.equal(res.status,403);
 }
});
test('L’accès pro fonctionne sans TOTP si identité, habilitation et abonnement sont validés',async()=>{
 const passwordOnly='aaa.'+Buffer.from(JSON.stringify({aal:'aal1'})).toString('base64url')+'.ccc';
 assert.equal((await verifyPremiumAccess('Bearer '+passwordOnly,config,fake())).allowed,true);
 assert.equal((await verifyPremiumAccess('Bearer '+passwordOnly,config,fake({guest:true}))).status,403);
});
test('Aucune ancienne période gratuite ne remplace le paiement',async()=>{
 const res=await verifyPremiumAccess('Bearer '+jwt,config,fake({subStatus:'inactive'}));assert.equal(res.allowed,false);
});
test('Routes BOAMP et export refusées sans session JWT',async()=>{
 const server=createServer(handle);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const p of ['/api/annonces','/api/annonces?q=test','/api/export']){
  const res=await fetch('http://127.0.0.1:'+server.address().port+p);assert.equal(res.status,401,p);
 }}finally{await new Promise(resolve=>server.close(resolve));}
});
test('Frontend : accès conditionné et API via JWT',()=>{
 const fs=require('node:fs'),path=require('node:path');const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/id="premiumContent" class="hidden"/);assert.match(app,/canUsePremium\(\)/);assert.match(app,/Authorization:'Bearer '\+session.access_token/);
});
