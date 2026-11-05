'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const clip=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return app.slice(i,j)};
test('recent mission cards carry IDs instead of tab-only navigation',()=>{
 assert.match(app,/data-open-own-mission="\x27\+esc\(m\.id\)/);
 assert.doesNotMatch(app,/class="role-mission-row" data-tab="missions"/);
});
test('selecting a recent own mission opens its detail and clears filters',()=>{
 const source=clip("// Open the selected owner's mission, not merely the list tab.","$('missionScopes').addEventListener");
 const calls={};
 const rows=[{id:'own-1',owner_id:'user-1',status:'open'},{id:'other-1',owner_id:'other-user'}];
 const list={scrollIntoView:()=>{calls.scroll=true}};
 const wrap={contains:()=>true,addEventListener:(_name,fn)=>{calls.handler=fn}};
 const fields={missionQuery:{value:'previous'},missionCategory:{value:'Previous'},missionDept:{value:'75'}};
 const $=id=>id==='roleRecentMissions'?wrap:id==='missionList'?list:fields[id];
 const state={session:{user:{id:'user-1'}},missions:rows,selectedMissionId:null};
 const ctx={state,$,renderMissions:()=>{calls.render=true},tab:(name,fromHistory,preserve)=>{calls.tab=name;calls.preserve=preserve}};
 vm.runInNewContext(source,ctx);
 const click=id=>calls.handler({target:{closest:()=>({dataset:{openOwnMission:id}})}});
 click('other-1');assert.equal(state.selectedMissionId,null);
 click('own-1');
 assert.equal(state.selectedMissionId,'own-1');
 assert.equal(calls.tab,'missions');assert.equal(calls.preserve,true);assert.equal(calls.render,true);assert.equal(calls.scroll,true);
 for(const field of Object.values(fields))assert.equal(field.value,'');
});
test('Closed personal publications stay accessible while closed external missions stay hidden',()=>{
 assert.match(app,/const detail=selected&&displayed\.some\(m=>m\.id===selected\.id\)\?selected:null/);
 assert.match(app,/missionView='published'/);
 assert.match(app,/mission\.owner_id===state\.session\?\.user\?\.id\|\|\(canUsePremium\(\)&&mission\.status==='open'\)/);
 assert.match(app,/data-back-missions/);
 assert.match(app,/activeOwn=own\.filter\(m=>m\.status==='open'\)/);
});

test('Missions tab resets a prior detail but explicit card selection preserves it',()=>{
 const source=clip('function tab(name,','window.addEventListener(\'popstate\'');
 const calls={render:0};
 const state={selectedMissionId:'mission-1',boamp:[]};
 const nodes=new Map();
 const $=id=>{
  if(!nodes.has(id))nodes.set(id,{id,classList:{toggle(){}}});
  return nodes.get(id);
 };
 const doc={body:{classList:{toggle(){}}},querySelectorAll:()=>[],getElementById:()=>({removeAttribute(){}})};
 const ctx={state,$,document:doc,history:{pushState(){}},location:{pathname:'/espace/missions'},window:{scrollTo(){}},paths:{missions:'/espace/missions'},canUsePremium:()=>false,loadBoamp:()=>{},renderMissions:()=>{calls.render++}};
 vm.runInNewContext(source,ctx);
 ctx.tab('missions');
 assert.equal(state.selectedMissionId,null);
 assert.equal(calls.render,1);
 state.selectedMissionId='mission-2';
 ctx.tab('missions',false,true);
 assert.equal(state.selectedMissionId,'mission-2');
 assert.equal(calls.render,1);
 state.selectedMissionId='mission-3';
 ctx.tab('missions',true);
 assert.equal(state.selectedMissionId,null);
 assert.equal(calls.render,2);
});
