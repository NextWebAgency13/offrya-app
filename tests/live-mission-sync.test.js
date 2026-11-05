'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('public/mission-feed.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const user='owner-1',other='owner-2',now=Date.parse('2026-11-04T21:00:00Z');
const dates={future:'2026-12-04T21:00:00Z',past:'2026-10-31T21:00:00Z'};
const rows=[
 {id:'own',owner_id:user,status:'open',title:'Ma mission',category:'Autre',expires_at:dates.future,created_at:'2026-11-04T20:00:00Z'},
 {id:'old-own',owner_id:user,status:'closed',title:'Ma mission clôturée',expires_at:dates.future,created_at:'2026-11-01T20:00:00Z'},
 {id:'new',owner_id:other,status:'open',title:'Une mission publiée depuis un autre compte',category:'Autre',expires_at:dates.future,created_at:'2026-11-04T20:58:00Z'},
 {id:'expired',owner_id:other,status:'open',expires_at:dates.past,created_at:'2026-10-15T20:00:00Z'},
 {id:'closed',owner_id:other,status:'closed',expires_at:dates.future,created_at:'2026-11-03T20:00:00Z'}
];
async function getModule(){return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))}
function fakeDb(visible=rows,{errorOn=null}={}){
 const calls=[];
 return {calls,from(table){
  assert.equal(table,'offrya_missions');
  const filters=[];
  const query={
   select(){return query},
   eq(field,value){filters.push([field,value]);return query},
   order(){return query},
   limit(){
    calls.push(filters.slice());
    if(errorOn===calls.length)return Promise.resolve({data:null,error:new Error('offline')});
    return Promise.resolve({data:visible.filter(row=>filters.every(([field,value])=>row[field]===value)),error:null});
   }
  };
  return query;
 }};
}
test('A client never queries or receives another account’s mission',async()=>{
 const {fetchMissionFeed}=await getModule();const db=fakeDb();
 const result=await fetchMissionFeed(db,user,false,now);
 assert.deepEqual(result.map(x=>x.id).sort(),['old-own','own']);
 assert.deepEqual(db.calls,[[['owner_id',user]]]);
});
test('Authorized pro discovers a newly published mission from another account, without expired or closed missions',async()=>{
 const {fetchMissionFeed}=await getModule();const db=fakeDb();
 const result=await fetchMissionFeed(db,user,true,now);
 assert.deepEqual(result.map(x=>x.id),['new','own','old-own']);
 assert.deepEqual(db.calls,[[['owner_id',user]],[['status','open']]]);
});
test('RLS remains authoritative: a pro cannot display an external mission denied by Supabase',async()=>{
 const {fetchMissionFeed}=await getModule();
 const db=fakeDb(rows.filter(x=>x.owner_id===user));
 const result=await fetchMissionFeed(db,user,true,now);
 assert.deepEqual(result.map(x=>x.id).sort(),['old-own','own']);
});
test('Failed mission request is surfaced; missing session is safe',async()=>{
 const {fetchMissionFeed}=await getModule();
 assert.deepEqual(await fetchMissionFeed(null,user,true,now),[]);
 assert.deepEqual(await fetchMissionFeed(fakeDb(),null,true,now),[]);
 await assert.rejects(fetchMissionFeed(fakeDb(rows,{errorOn:2}),user,true,now),/offline/);
});
test('New client-side feed is syntactically valid, only served as an import and kept RLS-protected',()=>{
 const chk=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(chk.status,0,chk.stderr);
 assert.match(server,/\['\/mission-feed\.js','text\/javascript/);
 assert.match(app,/import \{fetchMissionFeed\} from '\.\/mission-feed\.js'/);
 assert.match(app,/const latest=await fetchMissionFeed\(state\.db,uid,premium\)/);
 assert.match(app,/uid!==state\.session\?\.user\?\.id\|\|uid!==state\.currentUserId\|\|premium!==canUsePremium\(\)/);
 assert.match(html,/id="missionRefresh"/);
 assert.match(app,/\$\('missionRefresh'\)\.onclick=async/);
 assert.match(app,/document\.addEventListener\('visibilitychange',refreshOnReturn\)/);
 assert.match(app,/window\.addEventListener\('focus',refreshOnReturn\)/);
 assert.match(app,/\},30000\)/);
 assert.match(app,/if\(\(name==='missions'\|\|name==='professional'\)\&\&state\.loaded\&\&state\.session\)/);
 assert.match(pro,/data-refresh-radar/);
 assert.doesNotMatch(source,/service_role|secret|supabaseKey|authorization|Bearer|create policy/);
});
