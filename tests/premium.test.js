'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http'),{handle}=require('../server');
const {parseBearer,verifyPremiumAccess}=require('../lib/premium');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const config={url:'https://demo.supabase.co',key:'sb_publishable_test'};
const jwt='aaa.bbb.ccc';
function fake({role='pro',status='verified',premium_until=new Date(Date.now()+3600000).toISOString(),unauth=false}={}){
 return async url=>{
  if(url.includes('/auth/v1/user'))return {ok:!unauth,json:async()=>({id:uid})};
  if(url.includes('offrya_profiles'))return {ok:true,json:async()=>[{role}]};
  if(url.includes('offrya_premium_requests'))return {ok:true,json:async()=>[{status,premium_until}]};
  throw Error('URL inattendue: '+url);
 };
}
test('JWT utilisateur obligatoire; clé publique insuffisante',async()=>{
 assert.equal(parseBearer('Bearer sb_publishable_test'),null);
 assert.equal((await verifyPremiumAccess('',config,fake())).status,401);
 assert.equal((await verifyPremiumAccess('Bearer '+jwt,config,fake({unauth:true}))).status,401);
});
test('Accès Premium: professionnel vérifié et période active uniquement',async()=>{
 assert.equal((await verifyPremiumAccess('Bearer '+jwt,config,fake())).allowed,true);
 for(const opts of [{role:'client'},{status:'pending'},{status:'rejected'},
  {premium_until:new Date(Date.now()-3600000).toISOString()}]){
   const res=await verifyPremiumAccess('Bearer '+jwt,config,fake(opts));
   assert.equal(res.allowed,false);assert.equal(res.status,403);
 }
});
test('Routes BOAMP et export refusées sans session JWT',async()=>{
 const server=createServer(handle);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const p of ['/api/annonces','/api/annonces?q=test','/api/export']){
   const res=await fetch(base+p);assert.equal(res.status,401,p);
   assert.match((await res.json()).error,/connexion/i);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Frontend: premium caché et API via Authorization Bearer',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/id="premiumContent" class="hidden"/);
 assert.match(app,/canUsePremium\(\)/);
 assert.match(app,/Authorization:'Bearer '\+session.access_token/);
});
