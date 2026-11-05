'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');

const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const settings=html.slice(html.indexOf('<section class="tab" id="settings">'),html.indexOf('<footer class="offrya-global-footer"'));
const start=app.indexOf("$('preferencesForm').onsubmit=");
const end=app.indexOf('async function loadBoamp(',start);
assert.ok(start>=0&&end>start);
const handler=app.slice(start,end);

test('Email preferences include only consent toggles, no sector or department selector',()=>{
 const start=settings.indexOf('<form id="preferencesForm"');
 const end=settings.indexOf('</form>',start);
 assert.ok(start>=0&&end>start);
 const form=settings.slice(start,end);
 assert.match(form,/name="missions_enabled"/);
 assert.match(form,/name="messages_enabled"/);
 assert.match(form,/Sauvegarder mes préférences/);
 assert.doesNotMatch(form,/name="category"|name="department"|Secteur surveillé|Tous les secteurs|Département/);
 assert.doesNotMatch(settings,/Aucun filtre défini\. Sélectionnez un secteur/);
 assert.match(settings,/id="filterStatus">Préférences de notification en cours de chargement/);
});

function makeSubmit(existing){
 const writes=[],notices=[],form={elements:{
  missions_enabled:{checked:true},messages_enabled:{checked:false}
 }};
 const state={session:{user:{id:'user-123'}},prefs:existing};
 const db={from(table){
  assert.equal(table,'offrya_alert_preferences');
  return {update(payload){return {eq(field,id){
   assert.equal(field,'user_id');assert.equal(id,'user-123');
   writes.push({mode:'update',payload});return Promise.resolve({error:null});
  }};},insert(payload){writes.push({mode:'insert',payload});return Promise.resolve({error:null});}};
 }};
 state.db=db;
 const elements={preferencesForm:{}};
 const ctx=vm.createContext({state,requireAuth:()=>true,$:id=>elements[id],toast:t=>notices.push(t),
  refresh:async()=>notices.push('refresh'),showError:err=>{throw err}});
 vm.runInContext(handler,ctx);
 return {submit:()=>elements.preferencesForm.onsubmit({preventDefault(){},currentTarget:form}),writes,notices};
}

test('Saving toggles preserves existing hidden filters without expanding alert coverage',async()=>{
 const x=makeSubmit({missions_enabled:false,messages_enabled:true,category:'Nettoyage',department:'13'});
 await x.submit();
 assert.equal(x.writes.length,1);
 assert.equal(x.writes[0].mode,'update');
 assert.equal(x.writes[0].payload.category,'Nettoyage');
 assert.equal(x.writes[0].payload.department,'13');
 assert.equal(x.writes[0].payload.missions_enabled,true);
 assert.equal(x.writes[0].payload.messages_enabled,false);
 assert.deepEqual(x.notices,['Préférences enregistrées.','refresh']);
});

test('New e-mail consent settings save without any removed inputs',async()=>{
 const x=makeSubmit(null);
 await x.submit();
 assert.equal(x.writes[0].mode,'insert');
 assert.equal(x.writes[0].payload.user_id,'user-123');
 assert.equal(x.writes[0].payload.category,'');
 assert.equal(x.writes[0].payload.department,'');
});

test('No removed form field is referenced in settings rendering or submission',()=>{
 const render=app.slice(app.indexOf('function renderSettings(){'),app.indexOf('function renderPremium(){'));
 assert.doesNotMatch(render,/p\.elements\.(?:category|department)/);
 assert.doesNotMatch(handler,/f\.elements\.(?:category|department)/);
 assert.match(render,/Alertes e-mail configurées/);
 const p=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
});
