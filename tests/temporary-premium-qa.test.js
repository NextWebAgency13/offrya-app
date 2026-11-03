'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {verifyPremiumAccess}=require('../lib/premium');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jwt='aaa.bbb.ccc',env={url:'https://demo.supabase.co',key:'sb_publishable_test'};
const active=new Date(Date.now()+86400000).toISOString();
function mock({expiry=null,anon=false}={}){
 return async url=>{
  if(url.includes('/auth/v1/user'))return{ok:true,json:async()=>({id:uid,is_anonymous:anon})};
  if(url.includes('offrya_profiles'))return{ok:true,json:async()=>[{role:'client'}]};
  if(url.includes('offrya_premium_requests'))return{ok:true,json:async()=>[]};
  if(url.includes('offrya_premium_subscriptions'))return{ok:true,json:async()=>[]};
  if(url.includes('/rpc/offrya_test_premium_expires_at'))return{ok:true,json:async()=>expiry};
  throw Error('Unexpected '+url);
 };
}
test('temporary premium entitlement grants authorized account access without Stripe or false identity',async()=>{
 const r=await verifyPremiumAccess('Bearer '+jwt,env,mock({expiry:active}));
 assert.equal(r.allowed,true);
 assert.equal(r.test,true);
 assert.equal(r.expiresAt,active);
});
test('expired, missing or anonymous trial is denied',async()=>{
 for(const x of [{expiry:null},{expiry:'2026-01-01T00:00:00Z'},{expiry:active,anon:true}]){
  const r=await verifyPremiumAccess('Bearer '+jwt,env,mock(x));assert.notEqual(r.allowed,true);
 }
});
test('QA entitlement is private, expires at every read, cannot be self-assigned',()=>{
 const sql=fs.readFileSync('sql/temporary_premium_qa_grants.sql','utf8');
 const js=fs.readFileSync('public/app.js','utf8');
 assert.match(sql,/create table if not exists offrya_private\.temporary_premium_grants/);
 assert.match(sql,/revoke all on offrya_private\.temporary_premium_grants from public, anon, authenticated/);
 assert.match(sql,/g\.user_id=\(select auth\.uid\(\)\) and g\.expires_at>now\(\)/);
 assert.match(sql,/grant execute on function public\.offrya_test_premium_expires_at\(\) to authenticated/);
 assert.match(sql,/offrya_private\.has_temporary_premium_access\(\)/);
 assert.match(js,/state\.db\.rpc\('offrya_test_premium_expires_at'\)/);
 assert.match(js,/Premium de test — accès temporaire/);
 assert.doesNotMatch(sql,/insert into offrya_private\.temporary_premium_grants/);
});
