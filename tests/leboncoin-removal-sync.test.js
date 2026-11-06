'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {MIN_RECHECK_MS,inspect,transition,synchronize,updateRow}=require('../scripts/sync-leboncoin-removals');
const now=new Date('2026-11-06T14:00:00Z');
const source='https://www.leboncoin.fr/ad/services/1234567890';
const row={id:'11111111-1111-4111-8111-111111111111',source_id:'1234567890',
 source_url:source,status:'published',missing_checks:0,first_missing_at:null};
function mockPage({code=200,url=source,heading='Recherche un jardinier pour mon terrain',
 text='Annonce de particulier souhaitant une prestation de jardinage',
 documentTitle='Annonce Leboncoin',body='Page de détails'}={}){
 const page={
  goto:async()=>({status:()=>code}),url:()=>url,title:async()=>documentTitle,close:async()=>{},
  locator:selector=>({
   innerText:async()=>body,
   first:()=>({textContent:async()=>selector==='h1'?heading:text})
  })
 };
 return page;
}
test('HTTP 404 and 410 are considered missing only when the final URL matches the source',async()=>{
 assert.deepEqual(await inspect(mockPage({code:404}),row),{state:'missing',reason:'http_404'});
 assert.deepEqual(await inspect(mockPage({code:410}),row),{state:'missing',reason:'http_410'});
 assert.equal((await inspect(mockPage({code:404,url:'https://www.leboncoin.fr/recherche'}),row)).state,'unknown');
 assert.equal((await inspect(mockPage(),row)).state,'active');
});
test('Explicit deleted ad message is missing; generic or blank page is unknown',async()=>{
 assert.equal((await inspect(mockPage({heading:"Cette annonce n’est plus disponible"}),row)).state,'missing');
 assert.equal((await inspect(mockPage({heading:'Leboncoin',text:''}),row)).state,'unknown');
 assert.equal((await inspect(mockPage({code:302}),row)).state,'unknown');
});
test('Access refusal and CAPTCHA fail closed without marking the source deleted',async()=>{
 for(const code of [401,403,429,500,503]){
  await assert.rejects(()=>inspect(mockPage({code}),row),/accès limité|indisponible/i);
 }
 await assert.rejects(()=>inspect(mockPage({body:'Just a moment - robot verification'}),row),/CAPTCHA/);
});
test('Two observations at least 15 minutes apart are needed for expiration',()=>{
 const first=transition(row,{state:'missing',reason:'http_404'},now);
 assert.equal(first.missing_checks,1);
 assert.equal(first.status,undefined);
 const pending={...row,...first};
 const early=transition(pending,{state:'missing',reason:'http_404'},new Date(now.getTime()+MIN_RECHECK_MS-1000));
 assert.equal(early.status,undefined);
 const second=transition(pending,{state:'missing',reason:'http_410'},new Date(now.getTime()+MIN_RECHECK_MS));
 assert.equal(second.status,'expired');
 assert.equal(second.missing_checks,2);
 assert.equal(second.removal_reason,'http_410');
 assert.equal(second.expired_at,new Date(now.getTime()+MIN_RECHECK_MS).toISOString());
});
test('Active ad resets missing flags; uncertainty preserves them; already expired ignored',()=>{
 const pending={...row,missing_checks:1,first_missing_at:now.toISOString()};
 const active=transition(pending,{state:'active'},new Date(now.getTime()+1000));
 assert.equal(active.missing_checks,0);
 assert.equal(active.first_missing_at,null);
 const unknown=transition(pending,{state:'unknown'},new Date(now.getTime()+1000));
 assert.equal(unknown.missing_checks,undefined);
 assert.equal(unknown.first_missing_at,undefined);
 assert.equal(transition({...row,status:'expired'},{state:'missing'},now),null);
});
test('Dry run does not update Supabase; authorized active dry-run can inspect fake pages',async()=>{
 let written=0,closed=false;
 const browserFactory=async()=>({
  newPage:async()=>mockPage({code:404}),
  close:async()=>{closed=true;}
 });
 const res=await synchronize({env:{LEBONCOIN_SYNC_ENABLED:'true',
  LEBONCOIN_COLLECTOR_ENABLED:'true',LEBONCOIN_DRY_RUN:'true'},
  browserFactory,load:async()=>[row],save:async()=>{written++;return true;},
  pause:async()=>{},now,logger:{info:()=>{}}});
 assert.equal(res.checked,1);assert.equal(res.expired,0);assert.equal(written,0);assert.equal(closed,true);
});
test('Qualified second absence is marked expired only when writes explicitly enabled',async()=>{
 let changes=null;
 const pending={...row,missing_checks:1,first_missing_at:new Date(now.getTime()-MIN_RECHECK_MS).toISOString()};
 const res=await synchronize({env:{LEBONCOIN_SYNC_ENABLED:'true',LEBONCOIN_COLLECTOR_ENABLED:'true',
  LEBONCOIN_DRY_RUN:'false'},browserFactory:async()=>({
   newPage:async()=>mockPage({code:410}),close:async()=>{}
  }),load:async()=>[pending],save:async(_,r,c)=>{changes=c;return true;},
  pause:async()=>{},now,logger:{info:()=>{}}});
 assert.equal(res.expired,1);
 assert.equal(changes.status,'expired');
});
test('Concurrency guard in PostgREST PATCH includes status and missing count',async()=>{
 let target,request;
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'fake-server-only'};
 const fetcher=async(url,opts)=>{target=url;request=opts;return {ok:true,json:async()=>[{id:row.id}]};};
 const saved=await updateRow(env,row,{last_checked_at:now.toISOString()},fetcher);
 assert.equal(saved,true);
 assert.equal(request.method,'PATCH');
 assert.match(target,/status=eq.published/);
 assert.match(target,/missing_checks=eq.0/);
 assert.match(request.headers.Prefer,/return=representation/);
});
test('Imports cannot reactivate removed announcements, data remain Premium-only',()=>{
 const importer=fs.readFileSync('scripts/collect-leboncoin.js','utf8');
 const migration=fs.readFileSync('sql/leboncoin_removal_sync.sql','utf8');
 const access=fs.readFileSync('sql/leboncoin_external_opportunities.sql','utf8');
 assert.match(importer,/resolution=ignore-duplicates/);
 assert.doesNotMatch(importer,/resolution=merge-duplicates/);
 assert.match(migration,/first_missing_at/);
 assert.match(migration,/missing_checks/);
 assert.match(migration,/expired_at/);
 assert.match(access,/external_premium_only/);
});
