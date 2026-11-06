'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DEMO_URL,checkScrapflyAuthentication}=require('../lib/scrapfly-auth-check');
function log(){const messages=[];return {messages,info:s=>messages.push(s),warn:s=>messages.push(s)};}
test('Successful single demo request confirms API, without exposing key',async()=>{
 const logger=log(),requests=[],secret='private-key-for-test';
 const answer=await checkScrapflyAuthentication({env:{SCRAPFLY_API_KEY:secret},logger,
  fetcher:async(url,init)=>{
   requests.push({url,init});
   return {ok:true,status:200,json:async()=>({result:{status_code:200,content:'<html><body><h1>Demo website</h1></body></html>'}})};
  }});
 assert.equal(answer.ok,true);
 assert.equal(requests.length,1);
 const url=new URL(requests[0].url);
 assert.equal(url.origin,'https://api.scrapfly.io');
 assert.equal(url.searchParams.get('url'),DEMO_URL);
 assert.equal(url.searchParams.get('asp'),'false');
 assert.equal(url.searchParams.get('render_js'),'false');
 assert.equal(requests[0].init.method,'GET');
 assert.equal(requests[0].init.redirect,'error');
 assert.ok(logger.messages.some(x=>x.includes('AUTHENTIFICATION_OK')));
 assert.doesNotMatch(logger.messages.join(' '),/private-key-for-test|httpbin.dev\/html/);
});
test('Missing key fails before network request',async()=>{
 let invoked=false;
 const out=await checkScrapflyAuthentication({env:{SCRAPFLY_API_KEY:''},logger:log(),
  fetcher:async()=>{invoked=true;}});
 assert.equal(out.ok,false);
 assert.equal(out.reason,'missing_key');
 assert.equal(invoked,false);
});
test('HTTP rejection is reported without leaking credentials or response body',async()=>{
 const logger=log();
 const out=await checkScrapflyAuthentication({env:{SCRAPFLY_API_KEY:'secret'},logger,
  fetcher:async()=>({status:401,ok:false,json:async()=>{throw Error('Never read rejection body');}})});
 assert.equal(out.ok,false);
 assert.equal(out.httpStatus,401);
 assert.doesNotMatch(logger.messages.join(' '),/secret/i);
});
test('Malformed answer and network failures do not retry',async()=>{
 const logger=log();let calls=0;
 const result=await checkScrapflyAuthentication({env:{SCRAPFLY_API_KEY:'token'},logger,
  fetcher:async()=>{calls++;return {status:200,ok:true,json:async()=>({result:{status_code:503,content:''}})};}});
 assert.equal(calls,1);
 assert.equal(result.ok,false);
 assert.equal(result.sourceStatus,503);
 const network=await checkScrapflyAuthentication({env:{SCRAPFLY_API_KEY:'token'},logger,
  fetcher:async()=>{throw Error('url contains secret token');}});
 assert.equal(network.reason,'network');
 assert.doesNotMatch(logger.messages.join(' '),/url contains/);
});
