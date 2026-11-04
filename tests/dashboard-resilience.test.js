'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const slice=(a,b)=>{const start=app.indexOf(a),end=app.indexOf(b,start+a.length);assert.ok(start>=0&&end>start);return app.slice(start,end)};

test('owned missions survive an optional Supabase query failure',async()=>{
 const refreshSource=slice('async function refresh(){','function row(m,');
 const uid='owned-user',errors=[];
 const owned=[{id:'mine',owner_id:uid,status:'open',title:'Mission existante',created_at:'2026-11-01T12:00:00Z'}];
 const state={db:{from(table){
  const q={
   select(){return q},eq(){return q},order(){return q},
   limit(){return Promise.resolve(table==='offrya_missions'?{data:owned,error:null}:{data:[],error:table==='offrya_conversations'?{code:'network_unavailable'}:null});},
   maybeSingle(){return Promise.resolve({data:table==='offrya_profiles'?{id:uid,role:'client'}:null,error:null});}
  };return q;
 }},session:{user:{id:uid}},missions:[],conversations:[],loaded:false,proStepUserId:null,proStep:1};
 let renders=0;
 const ctx={state,console:{warn:(...xs)=>errors.push(xs),error:(...xs)=>errors.push(xs)},render(){renders++},info(){},canUsePremium:()=>false,loadPriorityAlerts:async()=>{},loadMessages:async()=>{}};
 vm.runInNewContext(refreshSource,ctx);
 await ctx.refresh();
 assert.equal(state.missions[0].id,'mine');
 // The account now renders once after critical profile/billing data, then again
 // when optional sections settle; a failed optional query must not lose missions.
 assert.equal(renders,2);
 assert.equal(state.loaded,true);
 assert.ok(errors.some(e=>e.includes('conversations')));
});

test('render remains isolated by module and tolerates removed optional DOM elements',()=>{
 const renderSource=slice('function render(){','async function loadMessages(');
 assert.match(renderSource,/for\(const \[name,draw\] of \[/);
 assert.match(renderSource,/try\{draw\(\);\}catch\(error\)/);
 assert.match(renderSource,/querySelector\('#dashboard \.stats'\)\?\.classList/);
 assert.doesNotMatch(app,/\$\('missionAccessNotice'\)/);
});

test('navigation and reload stay mapped to five mobile destinations',()=>{
 for(const tab of ['dashboard','missions','professional','inbox','settings'])
  assert.match(html,new RegExp('class="nav-link[^"]*" data-tab="'+tab+'"'));
 assert.match(app,/window\.addEventListener\('popstate'/);
 assert.match(app,/tab\(pathsReverse\[location\.pathname\]\|\|'dashboard',true\)/);
 assert.match(app,/if\(!state\.session\)\{location\.replace\('\/connexion/);
});

test('account switch clears cached private mission data',()=>{
 const refreshSource=slice('async function refresh(){','function row(m,');
 assert.match(refreshSource,/if\(state\.currentUserId!==uid\)/);
 assert.match(refreshSource,/state\.currentUserId=uid;state\.missions=\[\]/);
 assert.match(refreshSource,/state\.missions=state\.missions\.filter\(m=>m\.owner_id===uid\)/);
});
