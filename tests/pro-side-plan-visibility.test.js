'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const a=pro.indexOf(' function render(){');
const b=pro.indexOf(' return {init,render,show,syncTab};',a);
assert.ok(a>=0&&b>a,'render routine must remain discoverable');
const renderSource=pro.slice(a,b);

function runRender({premium,verified,temporary}){
 const badge={hidden:false};
 const fields={
  proV3SidePlan:badge,
  proV3Hello:{textContent:'',title:''},
  proV3Status:{textContent:''},
  proV3PlanState:{textContent:''},
  proExperienceV3:{querySelectorAll:()=>[]}
 };
 let premiumReads=0;
 const state={
  session:{user:{id:'professional-user'}},
  premium:{status:verified?'verified':'pending'},
  profile:{role:'pro'},
  testPremiumUntil:temporary?'2099-01-01T00:00:00Z':null
 };
 const context={
  initialized:true,uid:null,view:'home',state,Date,
  canUsePremium:()=>{premiumReads++;return premium;},
  document:{body:{classList:{toggle(){}}}},
  $:name=>fields[name],metrics(){},missionPreview(){},recommendations(){},
  activity(){},alerts(){},placeMarketSearch(){},activeButtons(){}
 };
 vm.runInNewContext(renderSource+'\nrender();',context);
 return {badge,status:fields.proV3Status.textContent,premiumReads};
}
test('Active subscription never shows the subscription offer sidebar card',()=>{
 const result=runRender({premium:true,verified:true,temporary:false});
 assert.equal(result.badge.hidden,true);
 assert.match(result.status,/Compte vérifié/);
});
test('Temporary Premium access never shows the subscription offer card',()=>{
 const result=runRender({premium:true,verified:false,temporary:true});
 assert.equal(result.badge.hidden,true);
 assert.equal(result.status,'Accès temporaire');
});
test('Verified professional without subscription also cannot be targeted by the sidebar upsell',()=>{
 const result=runRender({premium:false,verified:true,temporary:false});
 assert.equal(result.badge.hidden,true);
});
test('Rendering the hidden card cannot be undone by its grid CSS',()=>{
 assert.match(css,/body\.offrya-pro-v3 #proV3SidePlan\[hidden\]\{display:none!important\}/);
 assert.match(pro,/if\(sidePlan\)sidePlan\.hidden=premium\|\|state\.premium\?\.status==='verified';/);
 assert.match(pro,/data-pro-screen="settings">Gérer mon abonnement/);
 assert.match(pro,/if\(!premium\)\{uid=null;return;\}/);
});
