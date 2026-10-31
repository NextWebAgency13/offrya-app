'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {norm,compareToDirectors,parseDirectors}=require('../lib/representatives');
const {processIdentityEvent}=require('../lib/identity');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',siret='30613890001294';
const env={SITE_URL:'https://offrya-app.onrender.com',SUPABASE_URL:'https://demo.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
 STRIPE_SECRET_KEY:'sk_live_demo',STRIPE_IDENTITY_WEBHOOK_SECRET:'whsec_demo',OFFRYA_IDENTITY_SELFIE_ENABLED:'true'};
const event={type:'identity.verification_session.verified',data:{object:{id:'vs_demo123'}}};
const official={results:[{siren:'306138900',nom_raison_sociale:'EXEMPLE',etat_administratif:'A',
 siege:{siret,etat_administratif:'A'},dirigeants:[{nom:'MARTIN',prenoms:'ALICE',qualite:'Gérante'}]}]};
function mock({first='Alice',last='Martin',declared='Alice Martin',kind='dirigeant',selfie=true,registry=official,live=true}={}){
 let patch,reads=0;
 const fetcher=async(url,opt={})=>{
  if(url.startsWith('https://recherche-entreprises.api.gouv.fr/search')){reads++;return {ok:true,json:async()=>registry};}
  if(url.includes('/v1/identity/verification_sessions/'))return {ok:true,json:async()=>({
   id:'vs_demo123',type:'document',status:'verified',livemode:live,
   client_reference_id:uid,metadata:{offrya_siret:siret},
   options:{document:{require_matching_selfie:selfie}},
   verified_outputs:{first_name:first,last_name:last}
  })};
  if(url.includes('/rest/v1/offrya_premium_requests')){
   if(opt.method==='PATCH'){patch=JSON.parse(opt.body);return {ok:true};}
   return {ok:true,json:async()=>[{siret,status:'pending',stripe_identity_session_id:'vs_demo123',representative_kind:kind,representative_name:declared}]};
  }
  throw Error('Unexpected '+url);
 };
 return {fetcher,record:()=>patch,registryQueries:()=>reads};
}
test('Seul le nom complet réel d’un dirigeant physique officiel concorde',()=>{
 const r=parseDirectors({dirigeants:[{nom:'Éloi-MARTIN',prenoms:'Alice Jeanne',qualite:'Gérante'},{denomination:'HOLDING SAS',nom:'HOLDING',prenoms:'SAS'}]});
 assert.equal(r.length,1);
 assert.equal(norm('Éloi-Martin'),norm('Eloi Martin'));
 assert.equal(compareToDirectors({first:'Alice Jeanne',last:'Éloi-Martin',declared:'Éloi Martin Alice Jeanne',representatives:r}),true);
 assert.equal(compareToDirectors({first:'Alice',last:'Éloi-Martin',declared:'Alice Éloi Martin',representatives:r}),false);
 assert.equal(compareToDirectors({first:'Alice Jeanne',last:'Dupond',declared:'Alice Jeanne Dupond',representatives:r}),false);
});
test('Nom de pièce+selfie et nom RNE identiques => preuve de rapprochement uniquement',async()=>{
 const m=mock();
 const x=await processIdentityEvent(event,env,m.fetcher);
 assert.equal(x.identity_status,'verified');
 assert.equal(x.registry_matched,true);
 assert.equal(m.record().registry_name_matched,true);
 assert.equal(m.record().registry_match_source,'official_search_rne');
 assert.equal(m.record().presence_method,'stripe_selfie');
 assert.equal(m.record().authority_status,undefined); // Approbation humaine toujours distincte.
});
test('Un salarié, un autre patronyme et un faux selfie ne peuvent jamais valider le rapprochement',async()=>{
 for(const arg of [
  {first:'Bob',last:'Martin',declared:'Bob Martin'},
  {first:'Alice',last:'Martin',declared:'Alice Durand'},
  {kind:'mandataire'},
  {selfie:false},
  {registry:{results:[{...official.results[0],dirigeants:[]}]}}
 ]){
  const m=mock(arg);
  const x=await processIdentityEvent(event,env,m.fetcher);
  assert.equal(x.registry_matched,false,JSON.stringify(arg));
  assert.equal(m.record().registry_name_matched,false);
  if(arg.selfie===false||arg.kind==='mandataire')assert.equal(x.identity_status,'requires_input');
 }
});
test('Mode test non accepté et documents sans selfie refusés',async()=>{
 const m=mock({live:false});
 await assert.rejects(()=>processIdentityEvent(event,env,m.fetcher),/environment mismatch/);
 const noSelfie=mock({selfie:false});
 assert.equal((await processIdentityEvent(event,env,noSelfie.fetcher)).identity_status,'requires_input');
});
