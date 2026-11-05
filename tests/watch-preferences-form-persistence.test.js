'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('public/opportunity-console.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');

function setup(){
 const checkboxValues=['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre'];
 const boxes=checkboxValues.map(value=>({value,checked:false}));
 const callbacks={};
 const savedMessages=[];
 const events=[];
 const navigation=[];
 const all=new Map();
 const generic=()=>({textContent:'',innerHTML:'',hidden:false,value:'',listeners:{},
  classList:{toggle(){}},addEventListener(name,callback){this.listeners[name]=callback;}});
 const form=generic();
 form.elements={department:{value:''},keywords:{value:''}};
 const submit={disabled:false};
 form.querySelector=()=>submit;
 const sectors=generic();
 sectors.querySelectorAll=(selector)=>selector==='input:checked'?boxes.filter(x=>x.checked):boxes;
 all.set('opWatchForm',form);all.set('opSectorChoices',sectors);
 const state={session:{user:{id:'pro-account-1'}},opportunityPrefs:null,
  missions:[],conversations:[],tenderTracking:[],opportunityAlerts:[],
  testPremiumUntil:null,radarMatches:null,db:{from(table){
   assert.equal(table,'offrya_opportunity_preferences');
   return {upsert(payload){
    callbacks.saved=payload;
    return {select(){return {single:async()=>callbacks.saveError?{data:null,error:callbacks.saveError}:{data:{...payload,updated_at:'2026-11-05T20:42:24.254Z'},error:null}}};
   }};
  }}};
 const element=id=>{if(!all.has(id))all.set(id,generic());return all.get(id)};
 const document={querySelectorAll:()=>[],addEventListener(){},dispatchEvent(event){events.push(event);}};
 const context=vm.createContext({document,queueMicrotask(){},setInterval(){},console,
  Date,CustomEvent:class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}}});
 vm.runInContext(source.replace(/^export /gm,'')+'\nthis.makeConsole=createOpportunityConsole;',context);
 const instance=context.makeConsole({state,element,canUsePremium:()=>true,tab:name=>navigation.push(name),renderMissions(){},notify:msg=>savedMessages.push(msg)});
 instance.init();
 return {instance,state,boxes,form,element,events,savedMessages,submit,callbacks,navigation};
}
test('Late-arriving saved preferences populate the already opened Premium form',()=>{
 const {instance,state,boxes,form}=setup();
 instance.render();
 assert.equal(form.elements.department.value,'');
 assert.equal(boxes.find(x=>x.value==='Espaces verts').checked,false);
 state.opportunityPrefs={user_id:'pro-account-1',sectors:['Espaces verts'],department:'13',
  keywords:'élagage',updated_at:'2026-11-05T20:42:24.254Z'};
 instance.render();
 assert.equal(boxes.find(x=>x.value==='Espaces verts').checked,true);
 assert.equal(boxes.find(x=>x.value==='Bâtiment').checked,false);
 assert.equal(form.elements.department.value,'13');
 assert.equal(form.elements.keywords.value,'élagage');
});
test('Rerender does not overwrite unsubmitted edits, and changed server values load after save',()=>{
 const {instance,state,boxes,form,element}=setup();
 state.opportunityPrefs={sectors:['Espaces verts'],department:'13',keywords:'',updated_at:'2026-11-05T20:00:00Z'};
 instance.render();
 form.elements.department.value='30';
 form.listeners.input();
 state.opportunityPrefs={sectors:['Bâtiment'],department:'83',keywords:'rénovation',updated_at:'2026-11-05T20:40:00Z'};
 instance.render();
 assert.equal(form.elements.department.value,'30','Do not overwrite unsaved input');
 assert.equal(boxes.find(x=>x.value==='Espaces verts').checked,true);
 assert.match(element('opWatchFeedback').textContent,/non enregistrées/);
});
test('Successful save returns the persisted row and a new account starts with cleared fields',async()=>{
 const {instance,state,boxes,form,events,submit,callbacks,navigation}=setup();
 state.opportunityPrefs={sectors:['Espaces verts'],department:'13',keywords:'',updated_at:'2026-11-05T20:00:00Z'};
 instance.render();
 form.elements.department.value='30';form.elements.keywords.value='tonte';
 boxes.find(x=>x.value==='Espaces verts').checked=false;
 boxes.find(x=>x.value==='Bâtiment').checked=true;
 form.listeners.change();
 await form.listeners.submit({preventDefault(){},currentTarget:form});
 assert.equal(submit.disabled,false);
 assert.equal(callbacks.saved.department,'30');
 assert.equal(callbacks.saved.sectors[0],'Bâtiment');
 assert.equal(state.opportunityPrefs.keywords,'tonte');
 assert.equal(events.find(e=>e.type==='offrya:preferences-updated')?.detail.userId,'pro-account-1');
 assert.deepEqual(navigation,['boamp'],'A successful save should return to the Premium workspace');
 state.session.user.id='pro-account-2';state.opportunityPrefs=null;
 instance.render();
 assert.equal(form.elements.department.value,'');
 assert.equal(form.elements.keywords.value,'');
 assert.equal(boxes.find(x=>x.value==='Bâtiment').checked,false);
});
test('Invalid or rejected filter saves keep the form open for correction',async()=>{
 const {instance,form,state,callbacks,navigation,events,element}=setup();
 state.opportunityPrefs={sectors:['Espaces verts'],department:'13',keywords:'',updated_at:'2026-11-05T20:00:00Z'};
 instance.render();
 form.elements.department.value='99';
 await form.listeners.submit({preventDefault(){},currentTarget:form});
 assert.deepEqual(navigation,[],'Invalid department must not navigate');
 assert.equal(events.length,0,'Invalid input must not notify radar');
 form.elements.department.value='13';
 callbacks.saveError=new Error('Network error');
 await form.listeners.submit({preventDefault(){},currentTarget:form});
 assert.deepEqual(navigation,[],'Failed Supabase save must not navigate');
 assert.equal(events.length,0,'Failed save must not notify radar');
 assert.match(element('opWatchFeedback').textContent,/Enregistrement impossible/);
});
test('Return to Espace Pro uses the existing guarded Premium navigation, not direct history manipulation',()=>{
 const pro=fs.readFileSync('public/app.js','utf8');
 assert.match(pro,/if\(name==='boamp'\)\{[\s\S]*?if\(canUsePremium\(\)\)\{proExperience\.show\('home',fromHistory\);return;\}/);
 assert.match(source,/tab\('boamp'\);/);
 assert.doesNotMatch(source,/location\.href\s*=|history\.pushState/);
});
test('Old fetch responses cannot roll back newly saved settings',()=>{
 assert.match(app,/else if\(key==='opportunityPrefs'\)/);
 assert.match(app,/Date\.parse\(current\?\.updated_at/);
 assert.match(app,/if\(savedAt>fetchedAt\)continue/);
});
test('Browser modules compile',()=>{
 for(const [name,src] of [['console',source],['app',app]]){
  const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:src,encoding:'utf8'});
  assert.equal(r.status,0,name+': '+r.stderr);
 }
});
