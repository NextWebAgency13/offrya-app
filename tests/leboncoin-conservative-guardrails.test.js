'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {reserveBudget,MAX_REQUESTS_PER_RUN,MAX_REQUESTS_PER_DAY,MAX_REQUESTS_PER_MONTH,
 MIN_REQUEST_GAP_MS,SOURCE_WINDOW_HOURS}=require('../lib/leboncoin-collection-budget');
const {collect,allowedSearchUrls}=require('../scripts/collect-leboncoin');
const {cleanListing}=require('../lib/leboncoin-demand');
const env={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SECRET_KEY:'server-only-fixture'};
test('Shared quota endpoint is service-only, atomic and fails closed',async()=>{
 let called=0,request=null;
 const success=await reserveBudget(env,'request',{fetcher:async(url,options)=>{
  called++;request={url,options};return {ok:true,json:async()=>true};
 }});
 assert.equal(success,true);assert.equal(called,1);
 assert.equal(request.options.method,'POST');
 assert.match(request.url,/rpc\/offrya_claim_leboncoin_budget/);
 assert.equal(JSON.parse(request.options.body).p_kind,'request');
 await assert.rejects(()=>reserveBudget(env,'request',{fetcher:async()=>({ok:true,json:async()=>false})}),/Quota/);
 await assert.rejects(()=>reserveBudget(env,'request',{fetcher:async()=>({ok:false,status:403})}),/indisponible/);
 await assert.rejects(()=>reserveBudget(env,'run',{fetcher:async()=>{throw Error('secret');}}),/injoignable/);
 await assert.rejects(()=>reserveBudget({SUPABASE_URL:env.SUPABASE_URL},'request'),/service_role/);
 await assert.rejects(()=>reserveBudget(env,'invalid'),/inconnu/);
 assert.equal(MAX_REQUESTS_PER_RUN,6);assert.equal(MAX_REQUESTS_PER_DAY,20);
 assert.equal(MAX_REQUESTS_PER_MONTH,300);assert.equal(SOURCE_WINDOW_HOURS,4);
 assert.ok(MIN_REQUEST_GAP_MS>=5000);
});
test('Only one distinct targeted search query is accepted',()=>{
 assert.deepEqual(allowedSearchUrls([
  'https://www.leboncoin.fr/recherche?category=34&text=artisan',
  'https://www.leboncoin.fr/recherche?category=34&text=artisan'
 ]).length,1);
 assert.throws(()=>allowedSearchUrls([
  'https://www.leboncoin.fr/recherche?category=34&text=artisan',
  'https://www.leboncoin.fr/recherche?category=34&text=plombier'
 ]),/Une seule recherche/);
});
test('Live browser requests require consent and quota; no stored body in dry-run',async()=>{
 const opts={LEBONCOIN_COLLECTOR_ENABLED:'true',
  LEBONCOIN_SEARCH_URLS:JSON.stringify(['https://www.leboncoin.fr/recherche?category=34&text=artisan'])};
 await assert.rejects(()=>collect({env:opts}),/non autorisé/);
 const reservations=[],storage=[],delays=[];
 let browserClosed=false;
 const page={
  goto:async()=>({status:()=>200}),
  title:async()=> 'Annonce de jardinage',
  locator:(selector)=>{
   if(selector.startsWith('a['))return {evaluateAll:async()=>[
    'https://www.leboncoin.fr/ad/services/1234567890'
   ]};
   return {innerText:async()=> 'Annonce de recherche de prestation'};
  },
  evaluate:async()=>({
   title:'Recherche paysagiste pour mon jardin',
   description:'Je recherche un jardinier pour mon jardin et des travaux de tonte.',
   city:'Lyon',postalCode:'69001'
  }),
  close:async()=>{}
 };
 const result=await collect({env:{...opts,LEBONCOIN_COLLECTION_AUTHORIZED:'true',
  LEBONCOIN_ROBOTS_REVIEWED:'true',LEBONCOIN_DRY_RUN:'true'},
  browserFactory:async()=>({newPage:async()=>page,close:async()=>{browserClosed=true;}}),
  reserve:async(_,kind)=>{reservations.push(kind);return true;},
  pause:async n=>delays.push(n),store:async row=>storage.push(row),logger:{info(){}}});
 assert.equal(result.qualified,1);
 assert.equal(result.dryRun,true);assert.equal(result.published,0);
 assert.equal(storage.length,0);
 assert.deepEqual(reservations,['run','request','request']);
 assert.ok(delays.every(x=>x>=5000));
 assert.equal(browserClosed,true);
 assert.equal(result.rows[0].summary.includes('Je recherche'),false);
});
test('Premium feed has a seven-day freshness filter, no personal data or copied description',()=>{
 const server=fs.readFileSync('server.js','utf8');
 const sql=fs.readFileSync('sql/leboncoin_conservative_access_budget.sql','utf8');
 assert.match(server,/source_last_seen_at=gte/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/>= 20/);
 assert.match(sql,/>= 300/);
 assert.match(sql,/interval '4 hours'/);
 assert.match(sql,/revoke all on function public\.offrya_claim_leboncoin_budget\(text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.offrya_claim_leboncoin_budget\(text\) to service_role/);
 const row=cleanListing({
  url:'https://www.leboncoin.fr/ad/services/1234567890',
  title:'Recherche artisan pour monter ma cuisine',
  description:'Je recherche un artisan pour installer ma cuisine à la maison. Contact foo@example.fr et 0612345678',
  city:'Lyon',postalCode:'69001'
 });
 assert.ok(row);assert.doesNotMatch(JSON.stringify(row),/foo@example.fr|0612345678/);
 assert.doesNotMatch(row.summary,/Je recherche un artisan/);
 assert.match(row.summary,/Consulter les détails sur Leboncoin/);
});
