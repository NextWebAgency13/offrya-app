'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const {liveTenders}=require('../lib/live-tender-discovery');
const {rankCandidates}=require('../lib/ai-matching');
const js=fs.readFileSync('public/pro-experience.js','utf8');
const consoleJs=fs.readFileSync('public/opportunity-console.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const nextDeadline=new Date(Date.now()+31*86400000).toISOString();
function official(i=1){
 return {id:'26-'+String(i).padStart(6,'0'),title:'Entretien et élagage des espaces verts',
  buyer:'Commune de Test',departments:'13',url:'https://www.boamp.fr/pages/avis/?q=idweb:26-'+String(i).padStart(6,'0'),
  source:'BOAMP · DILA',deadline:nextDeadline};
}
test('Live BOAMP uses user-scoped and preference-scoped caching, forcing refresh on save',async()=>{
 let calls=0;
 const query=async()=>{calls++;return {items:[official(1)]}};
 const userA='pro-test-refresh-A',userB='pro-test-refresh-B';
 const first=await liveTenders(userA,{sectors:['Espaces verts'],department:'13'},{query});
 assert.equal(first.source,'fresh');
 assert.equal(first.notices.length,1);
 assert.equal(first.notices[0].source,'BOAMP');
 await liveTenders(userA,{sectors:['Espaces verts'],department:'13'},{query});
 assert.equal(calls,1,'Same criteria should use short cache');
 await liveTenders(userA,{sectors:['Bâtiment'],department:'13'},{query});
 assert.equal(calls,2,'Different sectors require fresh official discovery');
 await liveTenders(userA,{sectors:['Espaces verts'],department:'83'},{query});
 assert.equal(calls,3,'Changed department requires fresh official discovery');
 await liveTenders(userB,{sectors:['Espaces verts'],department:'13'},{query});
 assert.equal(calls,4,'Different professional cannot share account cache');
 await liveTenders(userA,{sectors:['Espaces verts'],department:'13'},{query,force:true});
 assert.equal(calls,5,'Explicit refresh ignores cached results');
});
test('Failed BOAMP source never creates fictitious new notices',async()=>{
 const search=async()=>{throw Error('Source indisponible')};
 const result=await liveTenders('test-source-down-1100',{sectors:['Bâtiment']},{query:search,force:true});
 assert.equal(result.source,'unavailable');
 assert.deepEqual(result.notices,[]);
});
test('Official live candidates really change the radar result count after a sector switch',()=>{
 const current={...official(3),tender_id:'26-000003',source:'BOAMP',match_score:85};
 assert.equal(rankCandidates({alerts:[current],preferences:{sectors:['Bâtiment'],department:'13'}}).total,0);
 const ranked=rankCandidates({alerts:[current],preferences:{sectors:['Espaces verts'],department:'13'}});
 assert.equal(ranked.total,1);
 assert.equal(ranked.items[0].category,'Espaces verts');
});
test('Preference save dispatches immediate scoped update; counters show a pending indicator',()=>{
 assert.match(consoleJs,/await state\.db\.from\('offrya_opportunity_preferences'\)\s*\.upsert/);
 assert.match(consoleJs,/document\.dispatchEvent\(new CustomEvent\('offrya:preferences-updated'/);
 assert.match(consoleJs,/userId:current\(\)/);
 assert.match(js,/document\.addEventListener\('offrya:preferences-updated'/);
 assert.match(js,/event\.detail\?\.userId!==user/);
 assert.match(js,/forceLiveRadar=true/);
 assert.match(js,/radarAt=0/);
 assert.match(js,/for\(const id of \['proAiTabAll'/);
 assert.match(js,/\.textContent='—'/);
 assert.match(js,/Actualisation des opportunités selon vos critères/);
 assert.doesNotMatch(js,/serverRadar\?\.items\|\|fallback\.items/);
 assert.doesNotMatch(js,/buildRadar\(\{missions:available\(\),alerts:state\.opportunityAlerts/);
 assert.match(js,/serverRadar\.items\.filter/);
});
test('BOAMP searches started under old criteria cannot overwrite the latest selection',()=>{
 assert.match(consoleJs,/watchRevision\+\+/);
 assert.match(consoleJs,/if\(uid===current\(\)&&revision===watchRevision\)/);
 assert.match(consoleJs,/if\(revision!==watchRevision\)/);
 assert.match(consoleJs,/queueMicrotask\(\(\)=>refreshTenders\(\)\)/);
});
test('Out-of-order responses are ignored; live results merge safely with RLS imports',()=>{
 assert.match(js,/key!==radarKey\|\|!canUsePremium\(\)\)return/);
 assert.match(js,/else if\(state\.session\?\.user\?\.id===user&&canUsePremium\(\)\)/);
 assert.match(js,/queueMicrotask\(\(\)=>loadMatchedRadar\(radarKey,user\)\)/);
 assert.match(js,/cache:'no-store'/);
 assert.match(js,/live\?'\?refresh=1'/);
 assert.match(js,/\[\.\.\.\(serverRadar\.liveNotices\|\|\[\]\),\.\.\.\(state\.opportunityAlerts\|\|\[\]\)\]/);
 assert.match(js,/serverRadar\?\.liveNotices\|\|\[\]/);
 assert.match(server,/premium=await verifyPremiumAccess/);
 const gated=server.indexOf("if(p==='/api/pro/matches')");
 assert.ok(gated>=0);
 const permitted=server.indexOf("if(!premium.allowed)return json",gated);
 const discovery=server.indexOf("await liveTenders",gated);
 assert.ok(permitted>gated&&discovery>permitted,'Live lookup must run after entitlement verification');
 assert.match(server,/alerts:\[\.\.\.newNotices,\.\.\.rows\[1\]\]/);
 assert.match(server,/liveNotices:live\.notices\.map/);
 assert.doesNotMatch(server.slice(gated,server.indexOf("if(p==='/api/annonces'",gated)),/process\.env\.SUPABASE_SECRET_KEY|apikey:process\.env\.SUPABASE_SECRET_KEY/);
});
test('Browser, server and official discovery JavaScript parse',()=>{
 for(const [name,source] of [['pro-experience',js],['opportunity-console',consoleJs],['server',server],
  ['live-discovery',fs.readFileSync('lib/live-tender-discovery.js','utf8')]]){
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(result.status,0,name+': '+result.stderr);
 }
});
