'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {handle}=require('../server');
const accounts=new Map([
 ['Bearer aaa.bbb.ccc',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',paid:true}],
 ['Bearer ddd.eee.fff',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',paid:true}],
 ['Bearer ggg.hhh.iii',{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',paid:false}]
]);
function mockSupabase(url,options={}){
 const value=String(url);
 const token=options.headers?.Authorization;
 const account=accounts.get(token);
 const response=(status,data)=>({ok:status===200,status,json:async()=>data});
 if(!account)return Promise.resolve(response(401,{}));
 const decoded=value.includes('user_id=eq.')?value.split('user_id=eq.')[1].split('&')[0]:
  value.includes('id=eq.')?value.split('id=eq.')[1].split('&')[0]:null;
 if(value.endsWith('/auth/v1/user'))return Promise.resolve(response(200,{id:account.id,is_anonymous:false}));
 if(decoded&&decoded!==account.id)return Promise.resolve(response(200,[]));
 if(value.includes('/offrya_profiles?'))return Promise.resolve(response(200,[{role:'pro'}]));
 if(value.includes('/offrya_premium_requests?'))return Promise.resolve(response(200,[{
  status:'verified',identity_status:'verified',authority_status:'verified',
  representative_kind:'dirigeant',registry_name_matched:true
 }]));
 if(value.includes('/offrya_premium_subscriptions?'))
  return Promise.resolve(response(200,[{status:account.paid?'active':'inactive',
   paid_through:new Date(Date.now()+3600_000).toISOString()}]));
 if(value.includes('/rpc/offrya_test_premium_expires_at'))return Promise.resolve(response(403,null));
 throw Error('Unexpected Supabase URL: '+value);
}
const doc={documents:[{name:'RC.pdf',pages:[{page:1,text:'Critère d’attribution : prix des prestations'}]}],
 facts:[{type:'criteria',label:'Critère',value:'Critère d’attribution : prix des prestations',
  source:{document:'RC.pdf',page:1,excerpt:'Critère d’attribution : prix des prestations'}}],
 checklist:[{id:'DC1',source:{document:'RC.pdf',page:1,excerpt:'DC1'}}]};
function payload(company){
 return {evidence:doc,company:{company_name:company,siret:'12345678901234',confirmed_fields:['company_name','siret']}};
}
test('Independent Premium accounts never receive each other’s transient DCE drafts',async()=>{
 const previousEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,
  socket:process.env.DCE_CLAMD_SOCKET};
 const originalFetch=global.fetch;
 process.env.SUPABASE_URL='https://demo.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_public_only';
 delete process.env.DCE_CLAMD_SOCKET;
 global.fetch=(url,opts)=>String(url).includes('demo.supabase.co')?
  mockSupabase(url,opts):originalFetch(url,opts);
 const server=createServer(handle);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const [token,company] of [['aaa.bbb.ccc','Entreprise alpha'],['ddd.eee.fff','Entreprise bêta']]){
   const response=await originalFetch(base+'/api/pro/dce/prepare',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(payload(company))});
   const data=await response.json();
   assert.equal(response.status,200,JSON.stringify(data));
   assert.equal(data.drafts.dc1.fields.candidat,company);
   assert.ok(!JSON.stringify(data).includes(company==='Entreprise alpha'?'Entreprise bêta':'Entreprise alpha'));
   assert.equal(data.filing.can_submit_automatically,false);
   assert.equal(response.headers.get('cache-control'),'private,no-store');
  }
  const denied=await originalFetch(base+'/api/pro/dce/prepare',{
   method:'POST',headers:{Authorization:'Bearer ggg.hhh.iii','Content-Type':'application/json'},
   body:JSON.stringify(payload('Entreprise alpha'))});
  assert.equal(denied.status,403,'Non-Premium blocked even when copying a Premium client payload');
  const unsigned=await originalFetch(base+'/api/pro/dce/prepare',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload('Entreprise alpha'))});
  assert.equal(unsigned.status,401);
  // An untrusted upload cannot reach the archive parser while ClamAV is missing,
  // and an inactive professional cannot reach antivirus work at all.
  const binary=Buffer.concat([Buffer.from('PK\x03\x04','binary'),Buffer.alloc(150)]);
  const inactive=await originalFetch(base+'/api/pro/dce/import',{
   method:'POST',headers:{Authorization:'Bearer ggg.hhh.iii','Content-Type':'application/zip'},
   body:binary});
  assert.equal(inactive.status,403);
  const protectedScan=await originalFetch(base+'/api/pro/dce/import',{
   method:'POST',headers:{Authorization:'Bearer aaa.bbb.ccc','Content-Type':'application/zip'},
   body:binary});
  assert.equal(protectedScan.status,503,'Authenticated upload fails closed without ClamAV');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  global.fetch=originalFetch;
  for(const [key,val] of [['SUPABASE_URL',previousEnv.url],['SUPABASE_PUBLISHABLE_KEY',previousEnv.key],
   ['DCE_CLAMD_SOCKET',previousEnv.socket]]){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});
