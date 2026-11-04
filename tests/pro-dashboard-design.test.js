'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');

function extract(start,end){
 const a=pro.indexOf(start),b=pro.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'block not found '+start);
 return pro.slice(a,b);
}
test('Desktop mockup sections use one secure BOAMP widget, real metrics, real alerts and real missions',()=>{
 for(const token of ['proV3MarketsTitle','proV3HomeMarketsSlot','proV3MissionPreview','proV3MissionCount',
  'proV3MarketCount','proV3ConversationCount','proV3TrackingCount','proV3Alerts','proV3ActivityStats',
  'proV3Chart','proV3Recommendations','proV3BoampSlot'])assert.match(pro,new RegExp(token));
 assert.match(pro,/\$\('proV3BoampSlot'\)\.appendChild\(\$\('premiumContent'\)\)/);
 assert.match(pro,/function placeMarketSearch\(\)/);
 assert.match(pro,/target=\$\(view==='boamp'\?'proV3BoampSlot':'proV3HomeMarketsSlot'\)/);
 assert.match(pro,/state\.boampStatus/);
 assert.match(pro,/state\.missions\|\|\[\]/);
 assert.match(pro,/state\.conversations\|\|\[\]/);
 assert.doesNotMatch(pro,/24\s*missions|12\s*conversations|2 nouvelles demandes|50\s*000\s*€/);
});
test('Android portrait restores all four KPI tiles, six touch friendly actions and vertical mission cards',()=>{
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.pro-v3-metrics\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.pro-v3-metric:nth-child\(n\+3\)\{display:flex!important\}/);
 assert.match(css,/\.pro-v3-home-grid\{display:flex;flex-direction:column/);
 assert.match(css,/\.pro-v3-mission-preview\{grid-template-columns:1fr/);
 assert.match(css,/\.pro-v3-action-grid>\*:nth-child\(n\+3\)\{display:flex\}/);
 assert.match(css,/\.pro-v3-markets-panel #premiumContent>\.panel\.filters\{display:flex;flex-direction:column/);
 const quick=pro.match(/<div class="pro-v3-action-grid">[^']+/)?.[0]||'';
 for(const action of ['boamp','requests','watch','tracking','preferences','inbox'])assert.match(quick,new RegExp('data-pro-screen="'+action+'"'));
 assert.match(html,/data-tab="professional"/);
});
test('Mission previews render only RLS-retrieved, open, unexpired external missions, and escape HTML',()=>{
 const preview=extract(' function missionPreview(){',' function show(next,fromHistory=false){');
 const matches=preview.match(/function missionPreview\(\)\{[\s\S]*?\n \}/);
 assert.ok(matches);
 const dom={proV3MissionPreview:{innerHTML:''}};
 const all=[
  {id:'valid',owner_id:'someone-else',status:'open',expires_at:'2030-12-31',title:'<script>x</script>',category:'Bâtiment',description:'Réparation',city:'Marseille',department:'13',created_at:'2026-11-04T20:00:00Z'},
  {id:'expired',owner_id:'someone-else',status:'open',expires_at:'2020-01-01',title:'Expirée'},
  {id:'own',owner_id:'my-account',status:'open',expires_at:'2030-12-31',title:'Ma mission'}
 ];
 const available=()=>all.filter(m=>m.owner_id!=='my-account'&&m.status==='open'&&Date.parse(m.expires_at)>Date.now());
 const context={
  $:name=>dom[name],available,
  icon:()=>'<svg></svg>',
  esc:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
  Date
 };
 vm.runInNewContext(matches[0]+'\nmissionPreview();',context);
 assert.match(dom.proV3MissionPreview.innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(dom.proV3MissionPreview.innerHTML,/<script>/);
 assert.doesNotMatch(dom.proV3MissionPreview.innerHTML,/Expirée|Ma mission/);
 assert.match(dom.proV3MissionPreview.innerHTML,/data-pro-mission="valid"/);
});
test('Markets filters invoke the existing official search and preserve Premium/RLS safeguards',()=>{
 assert.match(pro,/\$\('boampKeyword'\)\.value=filter\.dataset\.marketQuery/);
 assert.match(pro,/\$\('boampSearch'\)\.click\(\)/);
 assert.match(pro,/if\(filter&&canUsePremium\(\)\)/);
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
 assert.match(app,/if\(!canUsePremium\(\)\)\{renderPremium\(\);return;\}/);
 assert.match(app,/fetch\('\/api\/annonces\?'/);
 assert.match(pro,/if\(!canUsePremium\(\)\|\|!current\)return \[\]/);
 assert.match(pro,/m\.owner_id!==current&&m\.status==='open'/);
});
test('Pro JavaScript parses as an ECMAScript module, and existing connected services are not changed',()=>{
 const p=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.match(app,/boamp:'\/espace\/marches-publics'/);
 assert.match(pro,/\['boamp','Marchés publics','ic-boamp'\]/);
 assert.match(html,/id="boampList"/);
 assert.match(html,/id="exportBoamp"/);
 assert.doesNotMatch(pro,/createClient\(|service_role|stripe\.subscriptions\.create|DUMMY_TOKEN/);
});
