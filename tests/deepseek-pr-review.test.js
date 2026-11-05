'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {redact,prepareDiff,reviewPullRequest}=require('../scripts/deepseek-pr-review');
test('Masque les clés et ignore fichiers sensibles',()=>{
 const safe=redact('API_KEY=abcdef12345 sk-testexample123456789 Bearer abcdefghijklmn');
 assert.doesNotMatch(safe,/abcdef12345|testexample123456789|abcdefghijklmn/);
 const result=prepareDiff([
  {filename:'.env',patch:'SECRET=abc12345'},
  {filename:'lib/feature.js',patch:'+console.log("ok")'},
  {filename:'private/credentials.json',patch:'+token=xyz'}
 ]);
 assert.equal(result.included,1);assert.equal(result.omitted,2);
 assert.match(result.text,/lib\/feature.js/);
});
test('Refuse absence de secret avant appel réseau',async()=>{
 let requested=false;
 await assert.rejects(reviewPullRequest({env:{GITHUB_REPOSITORY:'A/B',PR_NUMBER:'2'},fetchImpl:async()=>{requested=true;}}),/manquant/);
 assert.equal(requested,false);
});
test('Publication manuelle d’une revue, sans exécution ni fusion',async()=>{
 const calls=[],reply=(json)=>({ok:true,json:async()=>json});
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/pulls/42'))return reply({state:'open',base:{ref:'main'},head:{repo:{full_name:'NextWebAgency13/offrya-app'}},changed_files:1});
  if(url.includes('/files?'))return reply([{filename:'public/app.js',patch:'@@ -1 +1 @@\n+const a=1',status:'modified'}]);
  if(url==='https://api.deepseek.com/chat/completions')return reply({choices:[{message:{content:'Aucun problème vérifiable.'}}]});
  if(url.endsWith('/issues/42/comments'))return reply({id:10});
  throw Error('URL inattendue : '+url);
 };
 const env={GITHUB_TOKEN:'mock-token',DEEPSEEK_API_KEY:'mock-key',GITHUB_REPOSITORY:'NextWebAgency13/offrya-app',PR_NUMBER:'42'};
 const result=await reviewPullRequest({env,fetchImpl});
 assert.equal(result.included,1);assert.equal(calls.length,4);
 const req=JSON.parse(calls[2].options.body);
 assert.equal(req.model,'deepseek-flash');assert.match(req.messages[1].content,/public\/app.js/);
 const comment=JSON.parse(calls[3].options.body).body;
 assert.match(comment,/Aucun problème vérifiable/);assert.match(comment,/Validation humaine obligatoire/);
 assert.ok(!calls.some(c=>/\/merge$/.test(c.url)));
});
test('Rejette les PR externes avant communication au modèle',async()=>{
 const calls=[];
 const fetchImpl=async(url)=>{calls.push(url);return {ok:true,json:async()=>({state:'open',base:{ref:'main'},head:{repo:{full_name:'external/repo'}},changed_files:1})};};
 const env={GITHUB_TOKEN:'mock-token',DEEPSEEK_API_KEY:'mock-key',GITHUB_REPOSITORY:'NextWebAgency13/offrya-app',PR_NUMBER:'7'};
 await assert.rejects(reviewPullRequest({env,fetchImpl}),/internes/);
 assert.equal(calls.length,1);
});
