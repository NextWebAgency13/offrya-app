'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {lookupCompany,validSiret,verifyProfessional}=require('../lib/company');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const siret='30613890001294';
const jwt='aaa.'+Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url')+'.ccc';
function reg({etat='A',est='A',matching=true}={}){
 return async()=>({ok:true,json:async()=>({results:[{
  siren:'306138900',nom_raison_sociale:'DECATHLON',etat_administratif:etat,
  siege:{siret,etat_administratif:est,activite_principale:'70.10Z',libelle_commune:"VILLENEUVE-D'ASCQ"},
  matching_etablissements:matching?[{siret,etat_administratif:est}]:[]
 }]})});
}
test('SIRET officiel exact, établissement actif et nom légal',async()=>{
 assert.equal(validSiret('123'),false);
 const res=await lookupCompany(siret,reg());
 assert.equal(res.ok,true);
 assert.equal(res.company.siret,siret);
 assert.equal(res.company.legal_name,'DECATHLON');
 assert.equal((await lookupCompany(siret,reg({etat:'F'}))).status,422);
 assert.equal((await lookupCompany(siret,reg({est:'F'}))).status,422);
 assert.equal((await lookupCompany('00000000000000',reg())).status,404);
});
test('Consultation officielle réservée au profil professionnel identifiable, sans TOTP',async()=>{
 const fetcher=async url=>{
  if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:uid,email:'pro@example.com'})};
  return {ok:true,json:async()=>[{role:'pro'}]};
 };
 const yes=await verifyProfessional('Bearer '+jwt,{url:'https://demo.supabase.co',key:'publishable'},fetcher);
 assert.equal(yes.allowed,true);
 const client=await verifyProfessional('Bearer '+jwt,{url:'https://demo.supabase.co',key:'publishable'},async u=>
  u.includes('/auth/v1/user')?{ok:true,json:async()=>({id:uid,email:'client@example.com'})}:{ok:true,json:async()=>[{role:'client'}]});
 assert.equal(client.allowed,false);
 assert.equal(client.status,403);
 assert.equal((await verifyProfessional('',{url:'https://demo.supabase.co',key:'publishable'},fetcher)).status,401);
 const guest=await verifyProfessional('Bearer '+jwt,{url:'https://demo.supabase.co',key:'publishable'},async u=>
  u.includes('/auth/v1/user')?{ok:true,json:async()=>({id:uid,email:null,is_anonymous:true})}:{ok:true,json:async()=>[{role:'pro'}]});
 assert.equal(guest.allowed,false);
 assert.equal(guest.status,403);
});
test('API société: route protégée sans JWT',async()=>{
 const {handle}=require('../server');
 const {createServer}=require('node:http');
 const server=createServer(handle);
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/company/lookup?siret='+siret);
  assert.equal(r.status,401);
 }finally{await new Promise(ok=>server.close(ok));}
});
