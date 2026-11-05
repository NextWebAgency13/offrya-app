'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('public/mission-feed.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const mobile=fs.readFileSync('public/role-reference.css','utf8');
const now=Date.parse('2026-11-05T18:00:00Z');
const day=86400000;
const uid='pro-1';
const rows=[
 {id:'own-open',owner_id:uid,status:'open',title:'Ma publication',created_at:'2026-11-03T12:00:00Z'},
 {id:'own-closed',owner_id:uid,status:'closed',title:'Publication clôturée'},
 {id:'own-awarded',owner_id:uid,status:'awarded',title:'Publication pourvue'},
 {id:'available',owner_id:'client-1',status:'open',expires_at:new Date(now+day).toISOString()},
 {id:'followed',owner_id:'client-2',status:'open',expires_at:new Date(now+day).toISOString()},
 {id:'contacted',owner_id:'client-3',status:'open'},
 {id:'tracked',owner_id:'client-4',status:'open'},
 {id:'expired',owner_id:'client-5',status:'open',expires_at:new Date(now-day).toISOString()},
 {id:'hidden-closed',owner_id:'client-6',status:'closed'}
];
async function group(){return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).missionBuckets;}
test('Private requesters see only their own publications, including closed and awarded records',async()=>{
 const missionBuckets=await group();
 const result=missionBuckets({missions:rows,userId:uid,premium:false,now});
 assert.deepEqual(result.published.map(m=>m.id),['own-open','own-closed','own-awarded']);
 assert.deepEqual(result.available,[]);
 assert.deepEqual(result.followed,[]);
});
test('Premium lists do not mix owned, available and followed missions or expose expired private rows',async()=>{
 const missionBuckets=await group();
 const result=missionBuckets({missions:rows,userId:uid,premium:true,now,
  favorites:['followed','hidden-closed'],
  conversations:[{mission_id:'contacted',professional_id:uid},{mission_id:'available',professional_id:'another-pro'}],
  tracking:[{mission_id:'tracked',stage:'followup'},{mission_id:'available',stage:'new'}]});
 assert.deepEqual(result.published.map(m=>m.id),['own-open','own-closed','own-awarded']);
 assert.deepEqual(result.available.map(m=>m.id),['available','followed','contacted','tracked']);
 assert.deepEqual(result.followed.map(m=>m.id),['followed','contacted','tracked']);
});
test('RLS remains authoritative: the client never invents missions absent from its Supabase feed',async()=>{
 const missionBuckets=await group();
 const result=missionBuckets({missions:[rows[0],rows[1]],userId:uid,premium:true,
  favorites:['available','followed'],tracking:[{mission_id:'tracked',stage:'won'}],now});
 assert.equal(result.available.length,0);
 assert.equal(result.followed.length,0);
 assert.equal(result.published.length,2);
});
test('UI exposes three real scopes and reuses safe detail, contact and favorites',()=>{
 for(const view of ['available','published','followed'])assert.match(html,new RegExp('data-mission-view="'+view+'"'));
 for(const id of ['missionScopes','missionPageTitle','missionPageDescription','missionsListHeading','missionList',
  'missionQuery','missionDept','missionCategory','missionScopeAvailable','missionScopePublished','missionScopeFollowed'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/missionBuckets\(\{missions:state\.missions/);
 assert.match(app,/scope==='published'/);
 assert.match(app,/data-view-mission/);
 assert.match(app,/data-contact/);
 assert.match(app,/data-favorite/);
 assert.match(app,/data-close-mission/);
 assert.match(app,/scope=canBrowse\?missionView:'published'/);
 assert.doesNotMatch(app,/missionView='followed';[\s\S]*fetch\('https:\/\//);
});
test('Android cards use compact horizontal actions and footer keeps bottom navigation',()=>{
 assert.match(css,/#missions \.mission-listing-actions:has\(\.mission-favorite\)\{grid-template-columns/);
 assert.match(css,/#missions \.mission-listing-meta \.mission-meta-date\{display:none\}/);
 assert.match(css,/#missions \.mission-scopes button\{/);
 assert.match(mobile,/offrya-reference-ui:has\(#missions\.active\) \.app-shell \.main-content/);
 assert.match(mobile,/padding-bottom:14px!important/);
 assert.match(mobile,/offrya-global-footer/);
 const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 const client=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
 assert.equal(client.status,0,client.stderr);
});
