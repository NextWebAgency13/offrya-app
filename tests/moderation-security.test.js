'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {verifyAdmin,moderationAction,adminIds}=require('../lib/moderation');
const aid='a1234567-b123-4123-8123-123456789012';
const env={OFFRYA_ADMIN_USER_IDS:aid,SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'secret'};
test('Back-office fermé par défaut et limité à des UUID de comptes confirmés',async()=>{
 assert.equal((await verifyAdmin('Bearer a.b.c',{})).status,503);
 assert.equal((await verifyAdmin('bad',env)).status,401);
 const f=async()=>({ok:true,json:async()=>({id:aid,is_anonymous:false,email_confirmed_at:'2026-01-01'})});
 assert.deepEqual((await verifyAdmin('Bearer a.b.c',env,f)),{allowed:true,status:200,adminId:aid});
 assert.equal((await verifyAdmin('Bearer a.b.c',env,async()=>({ok:true,json:async()=>({id:'b1234567-b123-4123-8123-123456789012',email_confirmed_at:'2026-01-01'})}))).status,403);
 assert.equal(adminIds({OFFRYA_ADMIN_USER_IDS:'not_uuid'}).size,0);
});
test('Modération : refus de tout raccourci vers approbation professionnelle',async()=>{
 const noNetwork=()=>{throw Error('Le réseau ne doit pas être appelé');};
 for(const payload of [
  {kind:'dossier',action:'verified',id:aid},
  {kind:'dossier',action:'approve',id:aid},
  {kind:'mission',action:'open',id:aid},
  {kind:'report',action:'delete',id:aid}
 ])assert.equal((await moderationAction(payload,aid,env,noNetwork)).status,400);
});
test('Journal obligatoire avant toute action, et mise à jour filtrée',async()=>{
 const calls=[];
 const fake=async(url,init)=>{calls.push({url,method:init.method||'GET',body:init.body});return {ok:true,status:201,json:async()=>url.includes('offrya_moderation_audit')?[{id:'audit'}]:[{id:aid}]};};
 const res=await moderationAction({kind:'mission',action:'close',id:aid},aid,env,fake);
 assert.equal(res.updated,true);
 assert.match(calls[0].url,/offrya_moderation_audit/);
 assert.match(calls[1].url,/offrya_missions\?id=eq/);
 assert.equal(JSON.parse(calls[1].body).status,'closed');
 const noAudit=async(url)=>({ok:true,status:201,json:async()=>[]});
 await assert.rejects(()=>moderationAction({kind:'report',action:'closed',id:aid},aid,env,noAudit),/journal/);
});
