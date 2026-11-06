'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const start=pro.indexOf(' const seenRequestIds=new Map();');
const end=pro.indexOf(' function categoryIcon(category){',start);
assert.ok(start>=0&&end>start);
const snippet=pro.slice(start,end);
function harness({user='pro-1',authorized=true,store=new Map()}={}){
 const state={session:user?{user:{id:user}}:null};
 const win={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 const ctx={state,window:win,canUsePremium:()=>authorized,Map,Set,JSON};
 vm.runInNewContext(snippet+'\nthis.api={unseenRequests,markRequestsSeen,requestsSeenKey};',ctx);
 return ctx.api;
}
const ms=ids=>ids.map(id=>({id}));
test('La pastille « Proposer mes services » tombe à zéro une fois l’écran ouvert',()=>{
 const store=new Map(),api=harness({store});
 assert.equal(api.unseenRequests(ms(['a','b','c'])).length,3);
 api.markRequestsSeen(ms(['a','b','c']));
 assert.equal(api.unseenRequests(ms(['a','b','c'])).length,0);
 assert.deepEqual(Array.from(api.unseenRequests(ms(['a','b','c','d'])),m=>m.id),['d']);
});
test('Les missions vues restent vues après rechargement, compte par compte',()=>{
 const store=new Map();
 harness({store}).markRequestsSeen(ms(['a','b']));
 assert.equal(harness({store}).unseenRequests(ms(['a','b'])).length,0);
 assert.equal(harness({store,user:'pro-2'}).unseenRequests(ms(['a','b'])).length,2);
});
test('Sans accès Premium ou sans stockage, aucune erreur',()=>{
 const api=harness({authorized:false});
 assert.equal(api.unseenRequests(ms(['a'])).length,0);
 api.markRequestsSeen(ms(['a']));
 const blocked=new Map();blocked.get=()=>{throw Error('bloqué')};blocked.set=()=>{throw Error('bloqué')};
 const b=harness({store:blocked});
 assert.equal(b.unseenRequests(ms(['a'])).length,1);
 b.markRequestsSeen(ms(['a']));
 assert.equal(b.unseenRequests(ms(['a'])).length,0);
});
test('La pastille est branchée sur le compteur des missions non vues et rafraîchie à l’ouverture',()=>{
 assert.match(pro,/if\(view==='requests'&&\$\('professional'\)\?\.classList\.contains\('active'\)\)markRequestsSeen\(missions\);/);
 assert.match(pro,/const unseen=unseenRequests\(missions\)\.length;/);
 assert.match(pro,/if\(next==='requests'\)metrics\(\);/);
 assert.doesNotMatch(pro,/el\.textContent=String\(missions\.length\);el\.hidden=!missions\.length;/);
});
