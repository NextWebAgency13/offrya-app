'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');

const pro=fs.readFileSync('public/pro-experience.js','utf8');
const start=pro.indexOf(' const acknowledgedMissionIds=new Map();');
const end=pro.indexOf(' function categoryIcon(category){',start);
assert.ok(start>=0&&end>start,'Notification state implementation exists');
const snippet=pro.slice(start,end);
const saved=new Map();

function harness({user='pro-1',missions=[{id:'a'},{id:'b'}],authorized=true,storage=saved}={}){
 const state={session:user?{user:{id:user}}:null};
 let metricsRuns=0;
 let items=missions;
 const win={localStorage:{
  getItem(key){return storage.get(key)||null;},
  setItem(key,value){storage.set(key,value);}
 }};
 const ctx={state,window:win,matched:()=>items,canUsePremium:()=>authorized,metrics:()=>{metricsRuns++;},Map,Set,JSON};
 vm.runInNewContext(snippet+'\nthis.api={alertReadKey,readMissionNotifications,unreadMatchedNotifications,acknowledgeMatchedNotifications};',ctx);
 return {api:ctx.api,state,setItems(next){items=next;},metricsRuns(){return metricsRuns;}};
}
test('Opening bell acknowledges all currently matched missions and hides badge',()=>{
 const store=new Map();
 const app=harness({storage:store});
 assert.deepEqual(Array.from(app.api.unreadMatchedNotifications(),m=>m.id),['a','b']);
 app.api.acknowledgeMatchedNotifications();
 assert.equal(app.api.unreadMatchedNotifications().length,0);
 assert.equal(app.metricsRuns(),1);
 assert.deepEqual(JSON.parse(store.get(app.api.alertReadKey('pro-1'))),['a','b']);
 app.setItems([{id:'a'},{id:'b'},{id:'c'}]);
 assert.deepEqual(Array.from(app.api.unreadMatchedNotifications(),m=>m.id),['c']);
});
test('Reading a mission acknowledges only that mission, persists on refresh and isolates account IDs',()=>{
 const store=new Map();
 const app=harness({storage:store});
 app.api.acknowledgeMatchedNotifications('a');
 assert.deepEqual(Array.from(app.api.unreadMatchedNotifications(),m=>m.id),['b']);
 const refreshed=harness({storage:store});
 assert.deepEqual(Array.from(refreshed.api.unreadMatchedNotifications(),m=>m.id),['b']);
 const anotherUser=harness({user:'pro-2',storage:store});
 assert.deepEqual(Array.from(anotherUser.api.unreadMatchedNotifications(),m=>m.id),['a','b']);
});
test('No Premium permission: no notification data or read-write operation',()=>{
 const store=new Map();
 const app=harness({authorized:false,storage:store});
 assert.equal(app.api.unreadMatchedNotifications().length,0);
 app.api.acknowledgeMatchedNotifications();
 assert.equal(store.size,0);
 const noUser=harness({user:null,storage:store});
 assert.equal(noUser.api.unreadMatchedNotifications().length,0);
});
test('Unavailable browser storage does not block immediate notification dismissal',()=>{
 const storage={getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');}};
 const app=harness({storage});
 assert.equal(app.api.unreadMatchedNotifications().length,2);
 assert.doesNotThrow(()=>app.api.acknowledgeMatchedNotifications());
 assert.equal(app.api.unreadMatchedNotifications().length,0);
});
test('Notification badge counts unread items, tapping bell or opening mission clears relevant item',()=>{
 assert.match(pro,/const missions=available\(\),count=unreadMatchedNotifications\(\)\.length/);
 assert.match(pro,/alertButton\.addEventListener\('click',\(\)=>\{if\(!canUsePremium\(\)\)return;acknowledgeMatchedNotifications\(\);openMatchedMissions\(\);\}\)/);
 assert.match(pro,/function openMatchedMissions\(\)\{\s*priorityOnly=false;radarFilter='mission';\s*show\('home'\);\s*recommendations\(\);/);
 assert.match(pro,/acknowledgeMatchedNotifications\(id\);\s*markRequestSeen\(id\);\s*if\(openProposal&&openProposal\(id\)\)/);
 assert.match(pro,/window\.addEventListener\('storage',event=>\{/);
 assert.match(pro,/if\(bubble\)\{bubble\.hidden=!count/);
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
