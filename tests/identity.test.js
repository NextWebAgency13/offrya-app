'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {handle}=require('../server');
const {configured,officialVerificationUrl,beginIdentity,processIdentityEvent}=require('../lib/identity');
const {createHmac}=require('node:crypto');
const {verifyStripeSignature}=require('../lib/billing');
const fs=require('node:fs'),path=require('node:path');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',siret='30613890001294';
const token='aaa.'+Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url')+'.ccc';
const env={SITE_URL:'https://offrya-app.onrender.com',SUPABASE_URL:'https://demo.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
 STRIPE_SECRET_KEY:'sk_test_mock',STRIPE_IDENTITY_WEBHOOK_SECRET:'whsec_identity_test',OFFRYA_IDENTITY_SELFIE_ENABLED:'true'};
test('Identité non activée si les secrets ne sont pas présents',async()=>{
 assert.equal(configured({}),false);
 assert.equal(configured({...env,STRIPE_SECRET_KEY:'rk_live_permissions_scoped'}),true);
 assert.equal(configured({...env,STRIPE_SECRET_KEY:'rk_test_permissions_scoped'}),true);
 assert.equal(configured({...env,STRIPE_SECRET_KEY:'pk_live_invalid'}),false);
 assert.equal((await beginIdentity('Bearer '+token,{},()=>{throw Error('never called')})).status,503);
 assert.equal(officialVerificationUrl('https://evil.example/steal'),null);
 assert.equal(officialVerificationUrl('http://verify.stripe.com/'),null);
 assert.match(officialVerificationUrl('https://verify.stripe.com/start/demo'),/^https:/);
});
test('Dossier en attente et SIRET requis avant création de la session',async()=>{
 let patched,created;
 const fake=async (url,opt={})=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:uid,email:'pro@example.com'})};
  if(url.includes('/rest/v1/offrya_profiles'))return {ok:true,json:async()=>[{role:'pro'}]};
  if(url.includes('/rest/v1/offrya_premium_requests')){
   if(opt.method==='PATCH'){patched=JSON.parse(opt.body);return {ok:true};}
   return {ok:true,json:async()=>[{user_id:uid,status:'pending',siret,identity_status:'not_started',representative_kind:'dirigeant'}]};
  }
  if(url.endsWith('/v1/identity/verification_sessions')){
   created=new URLSearchParams(opt.body);
   return {ok:true,json:async()=>({id:'vs_demo123',client_reference_id:uid,url:'https://verify.stripe.com/start/abc'})};
  }
  throw Error('Unexpected '+url);
 };
 const done=await beginIdentity('Bearer '+token,env,fake);
 assert.equal(done.status,200);
 assert.equal(created.get('client_reference_id'),uid);
 assert.equal(created.get('metadata[offrya_siret]'),siret);
 assert.equal(created.get('options[document][require_matching_selfie]'),'true');
 assert.equal(patched.identity_status,'processing');
 assert.equal(patched.stripe_identity_session_id,'vs_demo123');
 assert.equal((await beginIdentity('Bearer '+token,{...env,OFFRYA_IDENTITY_SELFIE_ENABLED:'false'},fake)).status,503);
 const simple='aaa.'+Buffer.from(JSON.stringify({aal:'aal1'})).toString('base64url')+'.ccc';
 assert.equal((await beginIdentity('Bearer '+simple,env,fake)).status,200);
});
test('Webhook identité: statut Stripe actuel + correspondance stricte session et dossier',async()=>{
 let patched,queries=0;
 const fake=async (url,opt={})=>{
  if(url.includes('/v1/identity/verification_sessions/'))return {ok:true,json:async()=>({
   id:'vs_demo123',type:'document',client_reference_id:uid,metadata:{offrya_siret:siret},
   status:'verified',livemode:true,options:{document:{require_matching_selfie:true}},
   verified_outputs:{first_name:'Alice',last_name:'Martin'}
  })};
  if(url.startsWith('https://recherche-entreprises.api.gouv.fr/search'))return {ok:true,json:async()=>({results:[{siren:'306138900',nom_raison_sociale:'EXEMPLE',etat_administratif:'A',siege:{siret,etat_administratif:'A'},dirigeants:[{nom:'MARTIN',prenoms:'ALICE',qualite:'Présidente'}]}]})};
  if(url.includes('/rest/v1/offrya_premium_requests')){
   if(opt.method==='PATCH'){patched=JSON.parse(opt.body);queries++;return {ok:true};}
   return {ok:true,json:async()=>[{siret,stripe_identity_session_id:'vs_demo123',status:'pending',representative_kind:'dirigeant',representative_name:'Alice Martin'}]};
  }
  throw Error('Unexpected '+url);
 };
 const event={type:'identity.verification_session.verified',data:{object:{id:'vs_demo123'}}};
 const liveEnv={...env,STRIPE_SECRET_KEY:'rk_live_mock'};
 assert.equal((await processIdentityEvent(event,liveEnv,fake)).identity_status,'verified');
 assert.equal(patched.identity_status,'verified');
 assert.equal(patched.identity_live_verified,true);
 assert.equal(patched.presence_method,'stripe_selfie');
 assert.equal(patched.registry_name_matched,true);
 assert.ok(patched.identity_verified_at);
 assert.equal(queries,1);
 assert.equal((await processIdentityEvent({type:'invoice.paid',data:{object:{id:'vs_demo123'}}},liveEnv,fake)).ignored,true);
});
test('Stripe test ne valide jamais une identité réelle',async()=>{
 let record;
 const f=async(url,opt={})=>{
  if(url.includes('/v1/identity/verification_sessions/'))return {ok:true,json:async()=>({
   id:'vs_demo123',type:'document',status:'verified',livemode:false,
   client_reference_id:uid,metadata:{offrya_siret:siret},options:{document:{require_matching_selfie:true}}
  })};
  if(url.includes('/rest/v1/offrya_premium_requests')&&opt.method==='PATCH'){record=JSON.parse(opt.body);return {ok:true};}
  if(url.includes('/rest/v1/offrya_premium_requests'))return {ok:true,json:async()=>[{siret,status:'pending',stripe_identity_session_id:'vs_demo123'}]};
  throw Error('Unexpected '+url);
 };
 const outcome=await processIdentityEvent({type:'identity.verification_session.verified',data:{object:{id:'vs_demo123'}}},env,f);
 assert.equal(outcome.identity_status,'requires_input');
 assert.equal(record.identity_live_verified,false);
 assert.equal(record.identity_verified_at,null);
 assert.equal(record.presence_method,null);
});
test('Signature dédiée : pas de webhook anonyme ou falsifié',async()=>{
 const raw=Buffer.from('{"type":"identity.verification_session.verified"}'),t=Math.floor(Date.now()/1000);
 const digest=createHmac('sha256',env.STRIPE_IDENTITY_WEBHOOK_SECRET).update(t+'.').update(raw).digest('hex');
 assert.equal(verifyStripeSignature(raw,'t='+t+',v1='+digest,env.STRIPE_IDENTITY_WEBHOOK_SECRET),true);
 assert.equal(verifyStripeSignature(raw,'t='+t+',v1='+digest,'whsec_wrong'),false);
 const server=createServer(handle);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/identity/start',{method:'POST'});
  assert.ok([401,503].includes(r.status));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('L’accès pro est verrouillé en SQL, API et travailleurs d’alertes',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../sql/professional_identity_mfa.sql'),'utf8');
 const withoutMfa=fs.readFileSync(path.join(__dirname,'../sql/professional_without_mfa.sql'),'utf8');
 const api=fs.readFileSync(path.join(__dirname,'../lib/premium.js'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const sender=fs.readFileSync(path.join(__dirname,'../scripts/send-alerts.js'),'utf8');
 assert.doesNotMatch(withoutMfa,/aal2|auth\.jwt\(\)->>'aal'/);
 assert.match(withoutMfa,/is_anonymous/);
 assert.match(withoutMfa,/v\.identity_live_verified is true/);
 assert.match(withoutMfa,/v\.authority_status='verified'/);
 assert.match(withoutMfa,/s\.status='active'/);
 assert.match(sql,/identity_status='verified'/);
 assert.match(sql,/authority_status='verified'/);
 assert.match(sql,/offrya_guard_professional_approval/);
 assert.doesNotMatch(api,/aal2|mfa/i);
 assert.doesNotMatch(client,/mfa|totp|double authentification/i);
 assert.match(sender,/identity_status==='verified'/);
});
