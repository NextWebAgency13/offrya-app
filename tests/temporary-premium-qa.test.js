'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {verifyPremiumAccess}=require('../lib/premium');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jwt='aaa.bbb.ccc';
const env={url:'https://demo.supabase.co',key:'sb_publishable_test'};
const active=new Date(Date.now()+86400000).toISOString();
function mock({role='client',verified=false,paid=false,anon=false}={}){
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(url.includes('/auth/v1/user'))return{ok:true,json:async()=>({id:uid,is_anonymous:anon})};
  if(url.includes('offrya_profiles'))return{ok:true,json:async()=>[{role}]};
  if(url.includes('offrya_premium_requests'))return{ok:true,json:async()=>verified?[{
    status:'verified',identity_status:'verified',authority_status:'verified',
    representative_kind:'dirigeant',registry_name_matched:true}]:[]};
  if(url.includes('offrya_premium_subscriptions'))return{ok:true,json:async()=>paid?
   [{status:'active',paid_through:active}]:[]};
  throw Error('Unexpected test/QA endpoint call '+url);
 };
 return {fetcher,calls};
}
test('A test grant alone never provides professional access, including when not expired',async()=>{
 for(const config of [{},{role:'pro'},{role:'pro',verified:true},{role:'pro',paid:true}]){
  const m=mock(config);
  const r=await verifyPremiumAccess('Bearer '+jwt,env,m.fetcher);
  assert.equal(r.allowed,false);assert.equal(r.status,403);
  assert.ok(!m.calls.some(url=>url.includes('offrya_test_premium_expires_at')));
 }
});
test('Verified legal representative with an active paid subscription remains eligible',async()=>{
 const m=mock({role:'pro',verified:true,paid:true});
 const r=await verifyPremiumAccess('Bearer '+jwt,env,m.fetcher);
 assert.equal(r.allowed,true);assert.equal(r.status,200);
 const guest=mock({role:'pro',verified:true,paid:true,anon:true});
 assert.equal((await verifyPremiumAccess('Bearer '+jwt,env,guest.fetcher)).allowed,false);
});
test('Historic test-grant SQL remains documented, but the staged production fix disables it',()=>{
 const historical=fs.readFileSync('sql/temporary_premium_qa_grants.sql','utf8');
 const staged=fs.readFileSync('sql/security_rls_premium_staged_review.sql','utf8');
 const browser=fs.readFileSync('public/app.js','utf8');
 const server=fs.readFileSync('lib/premium.js','utf8');
 assert.match(historical,/create table if not exists offrya_private\.temporary_premium_grants/);
 assert.match(staged,/revoke all on function public\.offrya_test_premium_expires_at\(\) from public,anon,authenticated/);
 assert.doesNotMatch(staged,/offrya_private\.has_temporary_premium_access\(\)/);
 assert.doesNotMatch(browser,/state\.db\.rpc\('offrya_test_premium_expires_at'\)/);
 assert.doesNotMatch(server,/offrya_test_premium_expires_at/);
 assert.match(browser,/hasVerifiedProfessionalIdentity\(\)&&paid/);
});
