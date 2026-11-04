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
const extract=(from,to)=>{const a=pro.indexOf(from),b=pro.indexOf(to,a+from.length);assert.ok(a>=0&&b>a);return pro.slice(a,b)};

test('Professional dashboard contains only other users missions, not public tender listings',()=>{
 const home=extract('data-pro-panel="home"','data-pro-panel="commercial"');
 for(const token of ['proV3MissionPreview','proV3MissionCount','proV3RecentMissionCount','proV3ConversationCount','proV3TrackingCount','proV3Alerts','proV3Chart','proV3Recommendations','data-refresh-missions'])assert.ok(home.includes(token),token);
 for(const forbidden of ['Marchés publics','Résultats BOAMP','proV3HomeMarketsSlot','pro-v3-markets-panel','proV3MarketCount','proV3BoampSlot','data-pro-screen="boamp"','Rechercher des marchés publics'])assert.equal(home.includes(forbidden),false,'Found tender data in home: '+forbidden);
 assert.match(pro,/const data=buildRadar\(\{missions:available\(\),alerts:\[\]/);
 assert.match(pro,/const node=\$\('premiumContent'\),target=\$\('proV3BoampSlot'\)/);
 assert.match(pro,/\$\('proV3BoampSlot'\)\.appendChild\(\$\('premiumContent'\)\)/);
 assert.match(pro,/\$\('proV3RecentMissionCount'\)\.textContent=String\(missions\.filter/);
 assert.match(pro,/\$\('proV3TrackingCount'\)\.textContent=String\(\(state\.salesTracking\|\|\[\]\)\.filter/);
 assert.doesNotMatch(home,/marché|appel d.offres|boamp/i);
});
test('Android dashboard displays four mission-related KPI tiles and readable mission cards',()=>{
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.pro-v3-metrics\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.pro-v3-metric:nth-child\(n\+3\)\{display:flex!important\}/);
 assert.match(css,/\.pro-v3-home-grid\{display:flex;flex-direction:column/);
 assert.match(css,/\.pro-v3-mission-preview\{grid-template-columns:1fr/);
 const home=extract('data-pro-panel="home"','data-pro-panel="commercial"');
 const i=home.indexOf('<div class="pro-v3-action-grid">'),j=home.indexOf('</div>',i);
 const actions=home.slice(i,j);
 for(const token of ['data-pro-screen="requests"','data-refresh-missions','data-pro-screen="tracking"','data-pro-screen="inbox"'])assert.ok(actions.includes(token));
 assert.match(html,/data-tab="professional"/);
});
test('Mission previews show external open missions only and safely escape untrusted text',()=>{
 const source=extract(' function missionPreview(){',' function show(next,fromHistory=false){');
 const fn=source.match(/function missionPreview\(\)\{[\s\S]*?\n \}/);
 assert.ok(fn);
 const dom={proV3MissionPreview:{innerHTML:''}};
 const all=[
  {id:'external',owner_id:'account-b',status:'open',expires_at:'2030-12-31',title:'<script>invalid</script>',category:'Autre',city:'Marseille',department:'13',created_at:'2026-11-04T20:00:00Z'},
  {id:'closed',owner_id:'account-b',status:'closed',expires_at:'2030-12-31',title:'Closed mission'},
  {id:'own',owner_id:'account-a',status:'open',expires_at:'2030-12-31',title:'Own mission'},
  {id:'expired',owner_id:'account-b',status:'open',expires_at:'2020-01-01',title:'Expired mission'}
 ];
 const available=()=>all.filter(m=>m.owner_id!=='account-a'&&m.status==='open'&&Date.parse(m.expires_at)>Date.now());
 vm.runInNewContext(fn[0]+'\nmissionPreview();',{
  $:k=>dom[k],available,icon:()=>'',Date,
  esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 });
 assert.match(dom.proV3MissionPreview.innerHTML,/&lt;script&gt;/);
 assert.match(dom.proV3MissionPreview.innerHTML,/data-pro-mission="external"/);
 assert.doesNotMatch(dom.proV3MissionPreview.innerHTML,/<script>|Own mission|Closed mission|Expired mission/);
});
test('Public tenders remain available in their separate Premium protected subtab',()=>{
 assert.match(pro,/\['boamp','Marchés publics','ic-boamp'\]/);
 assert.match(pro,/data-pro-panel="boamp"/);
 assert.match(pro,/loadMarkets\(\)\.catch/);
 assert.match(app,/if\(!canUsePremium\(\)\)\{renderPremium\(\);return;\}/);
 assert.match(app,/boamp:'\/espace\/marches-publics'/);
 assert.match(html,/id="boampList"/);
 assert.match(html,/id="exportBoamp"/);
});
test('Updated Pro script is syntactically valid and has no service keys',()=>{
 const p=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.doesNotMatch(pro,/service_role|stripe\.subscriptions\.create|DUMMY_TOKEN/);
});
