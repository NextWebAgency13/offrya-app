'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {downloadFeed,importFeed}=require('../scripts/import-leboncoin-feed');
const ok=(body,headers={})=>({ok:true,status:200,headers:new Map(Object.entries(headers)),text:async()=>body});
test('Feed download requires HTTPS, no embedded credentials and sends the bearer token',async()=>{
 await assert.rejects(downloadFeed('http://partner.example/feed.json'),/HTTPS/);
 await assert.rejects(downloadFeed('https://u:p@partner.example/feed.json'),/identifiants/);
 await assert.rejects(downloadFeed('pas une url'),/invalide/);
 let seen;
 const text=await downloadFeed('https://partner.example/feed.json','abc',{fetcher:async(u,o)=>{seen={u,o};return ok('{"ads":[]}');}});
 assert.equal(text,'{"ads":[]}');
 assert.equal(seen.o.headers.Authorization,'Bearer abc');
 assert.equal(seen.o.redirect,'error');
});
test('Feed download rejects HTTP errors and oversized exports',async()=>{
 await assert.rejects(downloadFeed('https://partner.example/f',null,{fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
 await assert.rejects(downloadFeed('https://partner.example/f',null,{fetcher:async()=>ok('{}',{'content-length':'9000000'})}),/volumineux/);
});
test('Import uses the URL when set and never reads a local file then',async()=>{
 const env={LEBONCOIN_FEED_ENABLED:'true',LEBONCOIN_FEED_URL:'https://partner.example/feed.json',LEBONCOIN_DRY_RUN:'true'};
 const result=await importFeed({env,readFile:async()=>{throw Error('lecture interdite');},
  fetcher:async()=>ok('{"ads":[]}'),logger:{info(){}}});
 assert.equal(result.total,0);
 assert.equal(result.sent,0);
 await assert.rejects(importFeed({env:{LEBONCOIN_FEED_ENABLED:'true'},logger:{info(){}}}),/requis/);
});
test('Scheduled feed workflow is gated, never scrapes and defaults to simulation',()=>{
 const yml=fs.readFileSync('.github/workflows/leboncoin-feed-import.yml','utf8');
 assert.match(yml,/schedule:/);
 assert.match(yml,/vars\.LEBONCOIN_FEED_ENABLED == 'true'/);
 assert.match(yml,/secrets\.LEBONCOIN_FEED_URL/);
 assert.match(yml,/LEBONCOIN_DRY_RUN: \$\{\{ vars\.LEBONCOIN_DRY_RUN \|\| 'true' \}\}/);
 assert.doesNotMatch(yml,/playwright|collect-leboncoin/);
});
