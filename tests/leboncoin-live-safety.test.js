'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {BOT_USER_AGENT,collect,readPage,details,detectChallenge,storeRow}=require('../scripts/collect-leboncoin');
const {synchronize,inspect,transition}=require('../scripts/sync-leboncoin-removals');
const {cleanListing,aiReview}=require('../lib/leboncoin-demand');
const source='https://www.leboncoin.fr/ad/services/1234567890';
const search='https://www.leboncoin.fr/recherche?category=34&text=artisan';
const baseEnv={LEBONCOIN_COLLECTOR_ENABLED:'true',LEBONCOIN_COLLECTION_AUTHORIZED:'true',
 LEBONCOIN_ROBOTS_REVIEWED:'true',LEBONCOIN_SEARCH_URLS:JSON.stringify([search]),
 LEBONCOIN_DRY_RUN:'true'};
function pageWithStatus(code,url=source){
 return {goto:async()=>({status:()=>code}),url:()=>url,
  title:async()=>{throw Error('Missing pages must not read title');},
  locator:()=>({innerText:async()=>{throw Error('Missing pages must not inspect body');}})};
}
test('Browser is explicitly identifiable in both collection and removal',async()=>{
 assert.match(BOT_USER_AGENT,/^OFFRYA-Bot\/1\.0 \(\+mailto:contact@offrya\.fr\)$/);
 let options=null;
 const page={goto:async()=>({status:()=>200}),url:()=>search,title:async()=> 'Recherche',
  locator:selector=>({innerText:async()=> 'Annonces publiques',evaluateAll:async()=>[]}),close:async()=>{}};
 await collect({env:baseEnv,browserFactory:async()=>({
  newPage:async opts=>{options=opts;return page;},close:async()=>{}}),
  reserve:async()=>true,pause:async()=>{},logger:{info:()=>{}}});
 assert.equal(options.userAgent,BOT_USER_AGENT);
 let syncOpts=null;
 await synchronize({env:{...baseEnv,LEBONCOIN_SYNC_ENABLED:'true'},
  load:async()=>[],browserFactory:async()=>({
   newPage:async opts=>{syncOpts=opts;return {...page};},close:async()=>{}}),
  reserve:async()=>true,logger:{info:()=>{}}});
 assert.equal(syncOpts.userAgent,BOT_USER_AGENT);
});
test('404/410 detail ignored, search page fails and does not masquerade as demand',async()=>{
 for(const code of [404,410]){
  assert.equal((await details(pageWithStatus(code),source)).removed,true);
  await assert.rejects(()=>readPage(pageWithStatus(code,search),search),/Recherche Leboncoin absente/);
 }
});
test('Denied traffic and CAPTCHA stop immediately without fallback',async()=>{
 for(const code of [401,403,429,500]){
  await assert.rejects(()=>readPage(pageWithStatus(code),source),/refusé|indisponible/);
 }
 assert.equal(detectChallenge('Just a moment robot verification CAPTCHA'),true);
 const page={goto:async()=>({status:()=>200}),url:()=>source,title:async()=> 'Robot verification',
  locator:()=>({innerText:async()=> 'CAPTCHA required'})};
 await assert.rejects(()=>readPage(page,source),/CAPTCHA/);
});
test('Sanitization and duplicate protection are fail-closed',async()=>{
 const candidate=cleanListing({url:source,title:'Recherche jardinier pour ma maison',
  description:'Je cherche un jardinier pour tonte et entretien. Contact 0612345678 ou test@example.com.',
  city:'Lyon',postalCode:'69001'});
 assert.ok(candidate);
 assert.doesNotMatch(JSON.stringify(candidate),/0612345678|test@example\.com/);
 let options=null;
 await storeRow({...candidate,status:'staged'},{fetcher:async(url,request)=>{
  options={url,request};return {ok:true};
 }}).catch(e=>{
  // The production storage function requires configured server secrets.
  assert.match(e.message,/Connexion Supabase/);
 });
 const sql=fs.readFileSync('sql/leboncoin_external_opportunities.sql','utf8');
 assert.match(sql,/unique\(source,source_id\)/);
 const collector=fs.readFileSync('scripts/collect-leboncoin.js','utf8');
 assert.match(collector,/resolution=ignore-duplicates/);
});
test('AI cannot override deterministic sector or qualify service offers',async()=>{
 const row=cleanListing({url:source,title:'Recherche jardinier pour mon terrain',
  description:'Je recherche un jardinier pour tondre mon terrain cette semaine.',
  city:'Lyon',postalCode:'69001'});
 assert.ok(row);
 const wrong={choices:[{message:{content:JSON.stringify({is_demand:true,confidence:0.99,category:'Bâtiment'})}}]};
 assert.equal(await aiReview(row,{apiKey:'test',fetcher:async()=>({ok:true,json:async()=>wrong})}),null);
 assert.equal(cleanListing({url:source,title:'Jardinier disponible pour vos travaux',
  description:'Je propose mes services de jardinier devis gratuit pour tous.'}),null);
});
test('Removal requires two positive observations; unsure stays published',()=>{
 const original={status:'published',missing_checks:0};
 const at=new Date('2026-11-06T14:00:00Z');
 const first=transition(original,{state:'missing',reason:'http_404'},at);
 assert.equal(first.status,undefined);
 const second=transition({...original,...first},{state:'missing',reason:'http_410'},new Date(at.getTime()+900000));
 assert.equal(second.status,'expired');
 assert.equal(transition({...original,...first},{state:'unknown'},new Date(at.getTime()+900000)).status,undefined);
});
test('Premium-only access is required in SQL and API before external results',()=>{
 const sql=fs.readFileSync('sql/leboncoin_external_opportunities.sql','utf8');
 const server=fs.readFileSync('server.js','utf8');
 assert.match(sql,/external_premium_only/);
 assert.match(sql,/has_active_professional_access/);
 assert.match(sql,/status='published'/);
 assert.match(server,/OFFRYA_LEBONCOIN_ENABLED==='true'/);
 assert.match(server,/verifyPremiumAccess/);
 assert.match(server,/source_last_seen_at=gte/);
});

test('Collector releases Chromium when page creation or request interception fails',async()=>{
 for(const failAt of ['newPage','route']){
  let browserClosed=0,pageClosed=0;
  const browserFactory=async()=>({
   newPage:async()=>{
    if(failAt==='newPage')throw Error('Page creation failed');
    return {route:async()=>{throw Error('Routing failed');},close:async()=>{pageClosed++;}};
   },
   close:async()=>{browserClosed++;}
  });
  await assert.rejects(()=>collect({env:baseEnv,browserFactory,
   reserve:async()=>true,pause:async()=>{},logger:{info(){}}}),/failed/i);
  assert.equal(browserClosed,1,'browser must close on '+failAt);
  assert.equal(pageClosed,failAt==='route'?1:0);
 }
});
test('Removal sync releases Chromium when initialization fails',async()=>{
 let browserClosed=0;
 const browserFactory=async()=>({
  newPage:async()=>{throw Error('Page setup failed');},
  close:async()=>{browserClosed++;}
 });
 await assert.rejects(()=>synchronize({
  env:{...baseEnv,LEBONCOIN_SYNC_ENABLED:'true'},
  browserFactory,load:async()=>[],reserve:async()=>true,
  logger:{info(){}}}),/Page setup failed/);
 assert.equal(browserClosed,1);
});
