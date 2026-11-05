'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const app=fs.readFileSync('public/app.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const sales=fs.readFileSync('public/pro-commercial.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const start=app.indexOf('function authorizedMissionForRoute(id){');
const end=app.indexOf('const PUSH_MESSAGE_UUID=',start);
assert.ok(start>0&&end>start,'Contextual helper functions exist');

function navigatorState(initial='/espace/missions',isPremium=false){
 const stack=[{url:initial,state:{tab:'missions'}}];let current=0;
 const location=new URL('https://offrya.fr'+initial);
 const setUrl=url=>{
  const u=new URL(url,'https://offrya.fr');location.pathname=u.pathname;location.search=u.search;
 };
 const history={
  get state(){return stack[current].state;},
  get length(){return stack.length;},
  pushState(state,title,url){stack.splice(++current);stack.push({url,state});setUrl(url);},
  replaceState(state,title,url){stack[current]={url,state};setUrl(url);},
  back(){if(current>0)setUrl(stack[--current].url);},
  forward(){if(current<stack.length-1)setUrl(stack[++current].url);}
 };
 const uid='owner-1';
 const state={session:{user:{id:uid}},profile:{role:'pro'},premium:null,proStep:1,
  draft:{step:2},selectedMissionId:null,missions:[
   {id:'own-1',owner_id:uid,status:'open'},
   {id:'client-1',owner_id:'client-2',status:'open'},
   {id:'closed-client',owner_id:'client-2',status:'closed'}
  ],conversations:[{id:'conv-1'},{id:'conv-2'}]};
 const calls=[];
 const ctx=vm.createContext({
  location,history,state,URLSearchParams,paths:{
   missions:'/espace/missions',inbox:'/espace/messagerie',professional:'/espace/professionnel'
  },canUsePremium:()=>isPremium,renderPremium:()=>calls.push('renderWizard'),
  tab:(...args)=>calls.push(['tab',...args]),renderMissions:()=>calls.push('renderMissions'),
  renderInbox:()=>calls.push('renderInbox'),loadMessages:()=>Promise.resolve(),console
 });
 vm.runInContext(app.slice(start,end)+'\nthis.routeMission=rememberMissionRoute;this.routeThread=rememberConversationRoute;this.backToRoute=restoreContextualRoute;this.routeStep=rememberProfessionalStep;this.routeWizard=restoreProfessionalStep;this.routeAllowed=authorizedMissionForRoute;',ctx);
 return {ctx,state,location,history,stack,calls};
}
test('Mission detail Back returns to the list; Forward restores only RLS-authorized details',()=>{
 const x=navigatorState('/espace/missions');
 x.ctx.routeMission('own-1');
 assert.equal(x.location.search,'?mission=own-1');
 x.history.back();
 assert.equal(x.location.search,'');
 x.ctx.backToRoute('missions');
 assert.equal(x.state.selectedMissionId,null);
 x.history.forward();
 x.ctx.backToRoute('missions');
 assert.equal(x.state.selectedMissionId,'own-1');
 assert.ok(x.calls.some(x=>Array.isArray(x)&&x[0]==='tab'&&x[2]===true));
});
test('Mission ID in URL cannot bypass Professional Premium access',()=>{
 const personal=navigatorState('/espace/missions');
 assert.equal(personal.ctx.routeAllowed('client-1'),null);
 personal.ctx.routeMission('client-1');
 assert.equal(personal.location.search,'');
 assert.ok(personal.ctx.routeAllowed('own-1'));
 const premium=navigatorState('/espace/missions',true);
 assert.ok(premium.ctx.routeAllowed('client-1'));
 assert.equal(premium.ctx.routeAllowed('closed-client'),null);
});
test('Android Back and Forward navigate between authorized conversations and the conversation list',()=>{
 const x=navigatorState('/espace/messagerie');
 x.ctx.routeThread('conv-1');
 x.ctx.routeThread('conv-2');
 assert.equal(x.location.search,'?conversation=conv-2');
 x.history.back();x.ctx.backToRoute('inbox');
 assert.equal(x.state.thread,'conv-1');
 x.history.back();x.ctx.backToRoute('inbox');
 assert.equal(x.state.thread,null);
 x.history.forward();x.ctx.backToRoute('inbox');
 assert.equal(x.state.thread,'conv-1');
 assert.ok(x.calls.includes('renderInbox'));
 x.ctx.routeThread('unknown');
 assert.equal(x.location.search,'?conversation=conv-1','Unknown conversation must not be navigable');
});
test('Professional registration steps return to their actual previous step, never jump over a stage',()=>{
 const x=navigatorState('/espace/professionnel');
 x.ctx.routeStep(2);
 assert.equal(x.location.search,'?step=2');
 assert.equal(x.history.state.onboardingStep,2);
 x.history.back();x.ctx.routeWizard();
 assert.equal(x.state.proStep,1);
 x.history.forward();x.ctx.routeWizard();
 assert.equal(x.state.proStep,2);
 x.state.draft.step=3;x.ctx.routeStep(3);
 assert.equal(x.location.search,'?step=3');
 x.history.back();x.ctx.routeWizard();
 assert.equal(x.state.proStep,2);
});
test('Professional registration history cannot skip verification via crafted URL',()=>{
 const x=navigatorState('/espace/professionnel?step=3');
 x.ctx.routeWizard();
 assert.equal(x.state.proStep,1,'Incomplete saved draft must not be upgraded by a URL');
 assert.match(app,/if\(canUsePremium\(\)\|\|!state\.session\|\|state\.profile\?\.role!=='pro'\|\|state\.premium\)return/);
});
test('The correct Back action is bound in each place, without cross-user history storage',()=>{
 assert.match(app,/history\.state\?\.detailId===state\.selectedMissionId/);
 assert.match(app,/history\.state\?\.onboardingStep===previous\+1/);
 assert.match(app,/inboxBackToList'\)\.onclick/);
 assert.match(app,/history\.replaceState\(\{tab:'inbox'\}/);
 assert.match(app,/rememberConversationRoute\(id\)/);
 assert.match(sales,/onNavigate\('back'\)/);
 assert.match(app,/screen==='back'\?proExperience\.back\(\):proExperience\.show\(screen\)/);
 assert.match(html,/id="proBackRepresentative"/);
 assert.match(html,/id="proBackReview"/);
 assert.match(css,/\.pro-v3-context-back/);
 assert.doesNotMatch(app,/localStorage\.setItem\(['"]offrya:navigation/);
});
test('All changed JavaScript source files parse without errors',()=>{
 for(const [label,source] of [['main app',app],['Premium',pro],['commercial',sales]]){
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(result.status,0,label+': '+result.stderr);
 }
});
