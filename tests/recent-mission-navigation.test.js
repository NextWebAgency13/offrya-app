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
 const source=clip("// Open the selected owner's mission, not merely the list tab.","$('missionList').onclick=");
 const calls={};
 const rows=[{id:'own-1',owner_id:'user-1',status:'closed'},{id:'other-1',owner_id:'other-user'}];
 const list={scrollIntoView:()=>{calls.scroll=true}};
 const wrap={contains:()=>true,addEventListener:(_name,fn)=>{calls.handler=fn}};
 const fields={missionQuery:{value:'previous'},missionCategory:{value:'Previous'},missionDept:{value:'75'}};
 const $=id=>id==='roleRecentMissions'?wrap:id==='missionList'?list:fields[id];
 const state={session:{user:{id:'user-1'}},missions:rows,selectedMissionId:null};
 const ctx={state,$,renderMissions:()=>{calls.render=true},tab:name=>{calls.tab=name}};
 vm.runInNewContext(source,ctx);
 const click=id=>calls.handler({target:{closest:()=>({dataset:{openOwnMission:id}})}});
 click('other-1');assert.equal(state.selectedMissionId,null);
 click('own-1');
 assert.equal(state.selectedMissionId,'own-1');
 assert.equal(calls.tab,'missions');assert.equal(calls.render,true);assert.equal(calls.scroll,true);
 for(const field of Object.values(fields))assert.equal(field.value,'');
});
test('existing mission detail remains available for closed owner missions',()=>{
 assert.match(app,/const detail=state\.selectedMissionId\?visible\.find/);
 assert.match(app,/m\.owner_id===uid\|\|m\.status==='open'/);
 assert.match(app,/data-back-missions/);
});
