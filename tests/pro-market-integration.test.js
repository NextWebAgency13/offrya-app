'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const server=fs.readFileSync('server.js','utf8');
const slice=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return s.slice(i,j)};
test('Marchés publics appears as a real Pro subsection, with the original BOAMP search and export reused',()=>{
 assert.match(pro,/\['boamp','Marchés publics','ic-boamp'\]/);
 assert.match(pro,/data-pro-panel="boamp"/);
 assert.match(pro,/data-pro-panel="boamp"/);
 assert.match(pro,/\$\('proV3BoampSlot'\)\.appendChild\(\$\('premiumContent'\)\)/);
 for(const id of ['premiumContent','boampSearch','boampKeyword','boampDept','exportBoamp','boampList','boampMore'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(css,/#proV3BoampSlot #premiumContent/);
 assert.match(css,/#proV3BoampSlot \.filters/);
 assert.match(css,/#proV3BoampSlot #exportBoamp/);
});
test('Markets stay in their own Pro menu, outside dashboard quick actions and bottom tabs',()=>{
 const i=pro.indexOf('<div class="pro-v3-action-grid">'),j=pro.indexOf('</div>',i);
 const quick=pro.slice(i,j);
 assert.equal(quick.includes('data-pro-screen="boamp"'),false);
 assert.ok(quick.includes('data-pro-screen="requests"'));
 assert.match(css,/pro-v3-action-grid>\*:nth-child\(n\+3\)\{display:flex\}/);
 assert.match(css,/pro-v3-mobile-menu\{display:none!important\}/);
 assert.match(html,/data-tab="professional"/);
 assert.match(html,/class="nav-link" data-tab="boamp"/);
});
test('Old /espace/marches-publics link opens Pro panel without granting access to non-Premium sessions',()=>{
 const route=slice(app,'function tab(name,fromHistory=false,preserveMissionDetail=false){',"window.addEventListener('popstate'");
 assert.match(route,/if\(name==='boamp'\)\{/);
 assert.match(route,/if\(canUsePremium\(\)\)\{proExperience\.show\('boamp',fromHistory\);return;\}/);
 assert.match(route,/name='professional';/);
 assert.match(app,/boamp:'\/espace\/marches-publics'/);
 assert.match(pro,/if\(\['inbox','settings'\]\.includes\(next\)\)/);
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return;/);
 assert.match(pro,/route==='\/espace\/marches-publics'\)show\('boamp',true\)/);
 assert.match(pro,/loadMarkets\(\)\.catch/);
 assert.match(app,/loadMarkets:\(\)=>loadBoamp\(\)/);
});
test('Entering Markets from Pro menu activates the embedded panel and loads official listings',async()=>{
 const showSource=slice(pro,' function show(next,fromHistory=false){',' function openMission(');
 const sections=['home','boamp','watch','commercial'].map(name=>({
  dataset:{proPanel:name},hidden:false,classList:{toggle(flag,value){this[flag]=value}}
 }));
 const dom={
  proExperienceV3:{querySelectorAll:()=>sections},
  proV3FollowupSlot:{hidden:false},
  proV3PreferenceSlot:{querySelector:()=>({set open(v){this.isOpen=v}})}
 };
 const calls=[];
 const context={
  initialized:true,view:'home',canUsePremium:()=>true,
  tab:(...args)=>calls.push(['tab',...args]),
  syncTab:()=>{},activeButtons:()=>calls.push(['active']),
  state:{boampStatus:'idle'},loadMarkets:async()=>{calls.push(['marketFetch']);},
  placeMarketSearch:()=>calls.push(['moveSearch']),
  $:key=>dom[key],window:{scrollTo(){}},
  console:{warn(){}} 
 };
 vm.runInNewContext(showSource,context);
 context.show('boamp');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.view,'boamp');
 assert.equal(sections.find(s=>s.dataset.proPanel==='boamp').hidden,false);
 assert.equal(sections.find(s=>s.dataset.proPanel==='home').hidden,true);
 assert.deepEqual(Array.from(calls.find(x=>x[0]==='tab')),['tab','professional',false]);
 assert.equal(calls.filter(x=>x[0]==='moveSearch').length,1);
 assert.equal(calls.filter(x=>x[0]==='marketFetch').length,1);
});
test('The existing server-side subscription/QA checks remain in force for all BOAMP API requests',()=>{
 assert.match(server,/if\(p==='\/api\/annonces'\|\|p==='\/api\/export'\)/);
 assert.match(server,/premium=await verifyPremiumAccess\(req\.headers\.authorization/);
 assert.match(server,/if\(!premium\.allowed\)return json\(res,premium\.status/);
 assert.match(app,/if\(!canUsePremium\(\)\)\{renderPremium\(\);return;\}/);
 assert.match(app,/Authorization:'Bearer '\+session\.access_token/);
 assert.doesNotMatch(pro,/public\.offrya_missions|service_role/);
});
