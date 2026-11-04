'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {handle}=require('../server');
const {rankCandidates,aiRerank,sectorFor,official}=require('../lib/ai-matching');
const now=Date.parse('2026-11-05T12:00:00Z');
const plus=days=>new Date(now+days*86400000).toISOString();
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mission={id:'m1',owner_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 title:'Élagage et tonte de jardin',description:'Besoin de tailler les arbres et de tondre le jardin.',
 category:'Espaces verts',city:'Marseille',department:'13',budget_cents:120000,urgency:'urgent',
 status:'open',created_at:plus(-1),expires_at:plus(10)};
const tender={tender_id:'26-123456',title:'Entretien et tonte des jardins municipaux',
 url:'https://www.boamp.fr/pages/avis/?q=idweb:26-123456',source:'BOAMP',
 match_score:86,match_reason:'secteur : Espaces verts · département : 13',
 departments:'13',deadline:plus(15),detected_at:plus(-1)};
test('The ranking includes only authorized-shape, open, non-owned and relevant opportunities',()=>{
 const candidates=rankCandidates({missions:[mission,
  {...mission,id:'my-own',owner_id:uid},
  {...mission,id:'closed',status:'closed'},
  {...mission,id:'wrong-sector',category:'Bâtiment'},
  {...mission,id:'expired',expires_at:plus(-1)},
  {...mission,id:'wrong-dept',department:'75'},
  {...mission,id:'cheap',budget_cents:100}],
  alerts:[tender,{...tender,tender_id:'invalid',url:'https://boamp.fr.evil.test/'}],
  preferences:{sectors:['Espaces verts'],department:'13',keywords:'jardin',min_budget_cents:10000},
  profile:{specialty:'Jardinier paysagiste'},userId:uid,now});
 assert.equal(candidates.total,2);
 assert.deepEqual(new Set(candidates.items.map(x=>x.kind)),new Set(['mission','tender']));
 assert.ok(candidates.items.every(x=>x.score>=0&&x.score<=100));
 assert.equal(candidates.items.find(x=>x.kind==='mission').id,'m1');
});
test('An undefined trade yields broader discovery; explicit preferences remain strict',()=>{
 assert.equal(sectorFor('Entreprise de plomberie et chauffage'),'Bâtiment');
 const broad=rankCandidates({missions:[mission],userId:uid,now});
 assert.equal(broad.total,1);
 assert.equal(rankCandidates({missions:[mission],userId:uid,now,
  preferences:{keywords:'ordinateur'}}).total,0);
 assert.equal(rankCandidates({missions:[mission],userId:uid,now,
  preferences:{keywords:'jardinage'}}).total,1);
});
test('Unknown, spoofed or expired official notices are never displayed',()=>{
 assert.equal(official(tender),true);
 assert.equal(official({...tender,url:'https://evil.example.com'}),false);
 assert.equal(rankCandidates({alerts:[{...tender,deadline:plus(-1)}],userId:uid,now}).total,0);
 assert.equal(rankCandidates({alerts:[{...tender,url:'https://evil.example'}],userId:uid,now}).total,0);
});
test('Optional AI can only change scores of existing candidates by 15 points',async()=>{
 const initial=rankCandidates({missions:[{...mission,description:'Ecrivez à foo@example.com ou au 0612345678 pour échanger'}],
  userId:uid,now});
 let request;
 const fake=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  request=JSON.parse(opts.body);
  return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({adjustments:[
   {id:'mission:m1',delta:12},{id:'mission:invented',delta:15},{id:'mission:m1',delta:25}
  ]})}}]})};
 };
 const result=await aiRerank(initial,{apiKey:'test',fetcher:fake,profile:{specialty:'Jardinage'}});
 assert.equal(result.mode,'ai');assert.equal(result.items.length,1);
 assert.equal(result.items[0].score,Math.min(100,initial.items[0].score+12));
 assert.doesNotMatch(JSON.stringify(request),/foo@example.com|0612345678/);
});
test('AI outage is a deterministic fallback, never an invented lead',async()=>{
 const initial=rankCandidates({missions:[mission],userId:uid,now});
 assert.equal((await aiRerank(initial,{apiKey:'',fetcher:()=>{throw Error('called');}})).mode,'rules');
 const fail=await aiRerank(initial,{apiKey:'test',fetcher:async()=>{throw Error('API offline');}});
 assert.equal(fail.mode,'rules');assert.deepEqual(fail.items,initial.items);
});
test('Premium AI endpoint never returns matches to anonymous callers',async()=>{
 const server=createServer(handle);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/pro/matches');
  assert.equal(response.status,401);
  const data=await response.json();assert.ok(data.error);assert.equal(data.items,undefined);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
