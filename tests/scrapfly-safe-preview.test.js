'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verifySettings,scrapflyRequestUrl,previewScrapfly}=require('../scripts/preview-leboncoin-scrapfly');
const now=new Date('2026-11-06T10:00:00Z');
const fixture={
 list_id:1234567890,ad_type:'want',status:'active',
 url:'/ad/services/1234567890',
 subject:'Recherche artisan pour entretien de jardin',
 body:'Je recherche un jardinier pour la tonte et les travaux du jardin.',
 location:{city:'Lyon',zipcode:'69003'}
};
const env={
 LEBONCOIN_SCRAPFLY_ENABLED:'true',
 LEBONCOIN_SCRAPFLY_PARTNER_APPROVED:'true',
 LEBONCOIN_SCRAPFLY_ROBOTS_REVIEWED:'true',
 LEBONCOIN_DRY_RUN:'true',
 SCRAPFLY_API_KEY:'fake-test-key',
 LEBONCOIN_SEARCH_URLS:JSON.stringify(['https://www.leboncoin.fr/recherche?category=34&text=cherche']),
 LEBONCOIN_VALIDATION_CSV:'preview.csv',
 LEBONCOIN_VALIDATION_REPORT:'preview.json'
};
test('Scrapfly requires provider approval, robots review, safe hours and a secret',()=>{
 assert.throws(()=>verifySettings({...env,LEBONCOIN_SCRAPFLY_ENABLED:'false'},now),/désactivé/);
 assert.throws(()=>verifySettings({...env,LEBONCOIN_SCRAPFLY_PARTNER_APPROVED:'false'},now),/Autorisation/);
 assert.throws(()=>verifySettings({...env,LEBONCOIN_SCRAPFLY_ROBOTS_REVIEWED:'false'},now),/robots/);
 assert.throws(()=>verifySettings({...env,LEBONCOIN_DRY_RUN:'false'},now),/sans écriture/);
 assert.throws(()=>verifySettings({...env,SCRAPFLY_API_KEY:''},now),/Clé/);
 assert.throws(()=>verifySettings(env,new Date('2026-11-06T22:30:00Z')),/plage/);
});
test('Scrapfly sends one explicitly approved URL without advanced bypass, proxies or geospoofing',()=>{
 const url=new URL(scrapflyRequestUrl(verifySettings(env,now)));
 assert.equal(url.origin,'https://api.scrapfly.io');
 assert.equal(url.searchParams.get('asp'),'false');
 assert.equal(url.searchParams.get('render_js'),'false');
 assert.equal(url.searchParams.get('proxy_pool'),null);
 assert.equal(url.searchParams.get('country'),null);
 assert.match(url.searchParams.get('headers[User-Agent]'),/OFFRYA-Bot/);
});
test('Mocked Scrapfly JSON produces only sanitized validation data, never DB writes',async()=>{
 const written=new Map();
 let requested;
 const payload={props:{pageProps:{searchData:{ads:[fixture,{...fixture,ad_type:'offer'}]}}}};
 const html='<html><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(payload)+'</script></html>';
 const out=await previewScrapfly({env,now,reserve:async()=>true,fetcher:async url=>{
  requested=url;return {ok:true,json:async()=>({result:{status_code:200,content:html}})};
 },writeFile:async(path,content)=>written.set(path,content),logger:{info(){}}});
 assert.equal(out.ready,1);
 assert.equal(out.ignored,1);
 assert.equal(out.stored,0);
 assert.equal(out.dryRun,true);
 assert.match(requested,/api\.scrapfly\.io/);
 assert.match(written.get('preview.csv'),/Recherche artisan/);
 assert.equal(JSON.parse(written.get('preview.json')).ready,1);
});
test('A blocked or challenged source fails closed',async()=>{
 await assert.rejects(()=>previewScrapfly({env,now,reserve:async()=>true,fetcher:async()=>({
  ok:true,json:async()=>({result:{status_code:403,content:''}})
 })}),/refusé/);
 await assert.rejects(()=>previewScrapfly({env,now,reserve:async()=>true,fetcher:async()=>({
  ok:true,json:async()=>({result:{status_code:200,content:'<html>Captcha verification</html>'}})
 })}),/anti-bot/);
});
