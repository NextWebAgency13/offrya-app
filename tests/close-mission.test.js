'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const sql=fs.readFileSync('sql/mission_close_purge.sql','utf8');
const me='11111111-1111-4111-8111-111111111111';
const pro='22222222-2222-4222-8222-222222222222';
const m1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const m2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const c1='33333333-3333-4333-8333-333333333333';
const c2='44444444-4444-4444-8444-444444444444';
const slice=(from,to)=>{const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>0&&b>a,from);return app.slice(a,b);};

function harness({confirmAnswer=true,rpcError=null,user=me,mission={}}={}){
 const calls=[],toasts=[];
 const state={session:{user:{id:user}},db:null,loaded:true,
  missions:[{id:m1,owner_id:me,title:'Tonte de pelouse',status:'open',...mission},{id:m2,owner_id:me,title:'Autre mission',status:'open'}],
  favorites:[m1,m2],salesTracking:[{mission_id:m1,stage:'new'},{mission_id:m2,stage:'new'}],
  priorityAlerts:[{id:'p1',mission_id:m1},{id:'p2',mission_id:m2}],
  radarMatches:{items:[{kind:'mission',id:m1},{kind:'mission',id:m2},{kind:'tender',id:m1}]},
  conversations:[{id:c1,mission_id:m1,client_id:me,professional_id:pro},{id:c2,mission_id:m2,client_id:me,professional_id:pro}],
  messageHeaders:[{id:'x1',conversation_id:c1},{id:'x2',conversation_id:c1},{id:'x3',conversation_id:c2}],
  messages:[{id:'x1',conversation_id:c1}],thread:c1,selectedMissionId:m1,hiddenConversations:new Set([c1])};
 state.db={rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {error:rpcError};}};
 const ctx={state,paths:{missions:'/espace/missions'},URLSearchParams,Set,Boolean,Number,Array,String,Date,
  location:{pathname:'/espace/missions',search:'?mission='+m1},
  history:{replaceState:(...a)=>calls.push(['replaceState',a[2]])},
  confirm:text=>{calls.push(['confirm',text]);return confirmAnswer;},
  render:()=>calls.push(['render']),refresh:async()=>{calls.push(['refresh']);},toast:t=>toasts.push(t),console};
 vm.runInNewContext(slice('function canCloseMission','// ---- fin clôture')+'\nthis.api={canCloseMission,closeMissionConfirmText,forgetMissionLocally,closeMission};',ctx);
 return {state,calls,toasts,api:ctx.api};
}

test('Cancelling the confirmation changes nothing',async()=>{
 const h=harness({confirmAnswer:false});
 assert.equal(await h.api.closeMission(m1),false);
 assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 assert.equal(h.state.missions.length,2);
});

test('Closing removes the mission everywhere in the app state and clears its exchanges',async()=>{
 const h=harness();
 assert.equal(await h.api.closeMission(m1),true);
 assert.equal(JSON.stringify(h.calls.find(c=>c[0]==='rpc')),JSON.stringify(['rpc','offrya_close_mission',{p_id:m1}]));
 const s=h.state;
 assert.equal(JSON.stringify(s.missions.map(m=>m.id)),JSON.stringify([m2]));
 assert.equal(JSON.stringify(s.favorites),JSON.stringify([m2]));
 assert.equal(JSON.stringify(s.salesTracking.map(t=>t.mission_id)),JSON.stringify([m2]));
 assert.equal(JSON.stringify(s.priorityAlerts.map(a=>a.id)),JSON.stringify(['p2']));
 assert.equal(JSON.stringify(s.radarMatches.items),JSON.stringify([{kind:'mission',id:m2},{kind:'tender',id:m1}]),'Seules les missions du radar sont retirées');
 assert.equal(JSON.stringify(s.conversations.map(c=>c.id)),JSON.stringify([c2]));
 assert.equal(JSON.stringify(s.messageHeaders.map(x=>x.id)),JSON.stringify(['x3']));
 assert.equal(s.thread,null,'La conversation ouverte se ferme');
 assert.equal(s.messages.length,0);
 assert.equal(s.selectedMissionId,null,'Le détail de la mission se ferme');
 assert.ok(!s.hiddenConversations.has(c1));
 assert.ok(h.calls.some(c=>c[0]==='replaceState'&&c[1]==='/espace/missions'),'Le lien ?mission= est nettoyé');
 assert.ok(h.calls.some(c=>c[0]==='render')&&h.calls.some(c=>c[0]==='refresh'),'Affichage immédiat puis rechargement');
 assert.match(h.toasts[0],/supprimés de votre messagerie/);
});

test('The confirmation is explicit about visibility, deletion and irreversibility',()=>{
 const {api}=harness();
 const one=api.closeMissionConfirmText({title:'Tonte de pelouse'},1);
 assert.match(one,/Tonte de pelouse/);
 assert.match(one,/disparaîtra pour tous les comptes\./);
 assert.match(one,/1 échange lié à cette mission, avec tous leurs messages, sera supprimé définitivement de votre messagerie\. Le professionnel conserve sa copie/);
 assert.match(one,/irréversible/);
 assert.match(api.closeMissionConfirmText({title:'X mission'},3),/3 échanges liés .* seront supprimés définitivement/);
 assert.match(api.closeMissionConfirmText({title:'X mission'},0),/Aucun échange n’est lié/);
 assert.ok(api.closeMissionConfirmText({title:'T'.repeat(300)},0).length<400,'Le titre est tronqué');
});

test('A database refusal keeps everything in place and surfaces the error',async()=>{
 const h=harness({rpcError:{message:'Mission inaccessible ou déjà attribuée'}});
 const failure=await h.api.closeMission(m1).then(()=>null,error=>error);
 assert.match(failure?.message||'',/inaccessible/);
 assert.equal(h.state.missions.length,2);
 assert.equal(h.state.conversations.length,2);
 assert.equal(h.state.thread,c1);
});

test('Only the author can close; open, expired and awarded missions qualify',async()=>{
 const stranger=harness({user:pro});
 assert.equal(await stranger.api.closeMission(m1),false);
 assert.ok(!stranger.calls.some(c=>c[0]==='rpc'||c[0]==='confirm'));
 for(const status of ['open','expired','awarded']){
  const h=harness({mission:{status}});
  assert.equal(h.api.canCloseMission(h.state.missions[0]),true,status);
 }
 const closed=harness({mission:{status:'closed'}});
 assert.equal(closed.api.canCloseMission(closed.state.missions[0]),false);
 assert.equal(await closed.api.closeMission(m1),false);
 assert.equal(harness().api.canCloseMission({id:m1,owner_id:me,status:'open',withdrawn_at:'2026-11-06T10:00:00Z'}),false);
});

test('The Clôturer button exists in the list and in the mission detail, for the author only',()=>{
 assert.match(app,/if\(canCloseMission\(m\)\)actions\+='<button[^']*data-close-mission="'/);
 const state={session:{user:{id:me}}};
 const ctx={state,canCloseMission:null,canUsePremium:()=>false,esc:s=>String(s??''),euro:v=>v+' €',date:s=>s,Number,Boolean,String};
 vm.runInNewContext(slice('function canCloseMission','function closeMissionConfirmText')+'\n'+slice('function renderMissionDetail','function followedMissionStatus')+'\nthis.detail=renderMissionDetail;',ctx);
 const own=ctx.detail({id:m1,owner_id:me,title:'Tonte de pelouse',status:'open',description:'x',category:'Espaces verts',created_at:'2026-11-06'});
 assert.match(own,/data-close-mission="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"[^>]*>Clôturer la mission</);
 const pourvue=ctx.detail({id:m1,owner_id:me,title:'Tonte de pelouse',status:'awarded',description:'x',category:'Espaces verts',created_at:'2026-11-06'});
 assert.match(pourvue,/data-close-mission/,'Une mission pourvue est aussi clôturable');
 const cloturee=ctx.detail({id:m1,owner_id:me,title:'Tonte de pelouse',status:'closed',description:'x',category:'Espaces verts',created_at:'2026-11-06'});
 assert.ok(!/data-close-mission/.test(cloturee));
 state.session.user.id=pro;
 ctx.canUsePremium=()=>true;
 const other=ctx.detail({id:m1,owner_id:me,title:'Tonte de pelouse',status:'open',description:'x',category:'Espaces verts',created_at:'2026-11-06'});
 assert.ok(!/data-close-mission/.test(other),'Un professionnel ne peut pas clôturer la mission d’un autre');
 assert.match(css,/\.mission-close\{[^}]*color:#b42343/);
});

test('The click handler delegates to closeMission and the old reassuring wording is gone',()=>{
 assert.match(app,/if\(btn\.dataset\.closeMission\)\{try\{await closeMission\(btn\.dataset\.closeMission\);\}catch\(err\)\{showError\(err\);\}return;\}/);
 assert.doesNotMatch(app,/conversations resteront accessibles/);
});

test('Other open sessions pick the removal up on every main tab',()=>{
 assert.match(app,/\$\('dashboard'\)\.classList\.contains\('active'\)\|\|\$\('missions'\)\.classList\.contains\('active'\)\|\|\$\('professional'\)\.classList\.contains\('active'\)/);
});

test('Database migration: author-only atomic closure, exchange removed on the author side only',()=>{
 assert.match(sql,/add column if not exists withdrawn_at timestamptz/);
 assert.match(sql,/add column if not exists mission_title text/,'Titre conservé pour le professionnel');
 assert.match(sql,/using \(\s*withdrawn_at is null\s+and/,'Mission retirée illisible pour tous');
 assert.match(sql,/create or replace function offrya_private\.close_mission/);
 assert.match(sql,/security definer/);
 assert.match(sql,/v_uid is null then raise exception 'Authentification requise'/);
 assert.match(sql,/owner_id = v_uid and status in \('open', 'expired', 'awarded'\) and withdrawn_at is null\s+for update/);
 assert.match(sql,/status in \('active', 'delivered', 'disputed'\)\) then\s+raise exception/,'Jamais avec un contrat en cours');
 assert.match(sql,/insert into public\.offrya_conversation_purges\(conversation_id, user_id\)\s+select id, p_owner from public\.offrya_conversations where mission_id = p_mission/);
 assert.doesNotMatch(sql,/delete from public\.offrya_conversations|delete from public\.offrya_messages/,'Les messages restent en base : le professionnel les conserve');
 assert.doesNotMatch(sql,/delete from public\.offrya_pro_lead_tracking/,'Le suivi du professionnel est conservé');
 for(const table of ['offrya_favorites','offrya_priority_alerts'])
  assert.match(sql,new RegExp('delete from public\\.'+table+' where mission_id = p_mission'));
 assert.match(sql,/set status = 'closed', closed_at = coalesce\(closed_at, now\(\)\), withdrawn_at = now\(\)/,'La ligne reste (anti-doublon des imports, avis, contrats)');
 assert.doesNotMatch(sql,/delete from public\.offrya_missions|delete from public\.offrya_reviews|delete from public\.offrya_contracts/);
});

test('Policies hide purged exchanges from their purger only and make closed exchanges read-only',()=>{
 const policy=name=>sql.slice(sql.indexOf('create policy '+name),sql.indexOf(';',sql.indexOf('create policy '+name)));
 assert.match(policy('conversation_read'),/not offrya_private\.conversation_purged_for\(id, \(select auth\.uid\(\)\)\)/);
 assert.match(policy('messages_read'),/not offrya_private\.conversation_purged_for\(c\.id, \(select auth\.uid\(\)\)\)/);
 assert.match(policy('messages_write'),/not offrya_private\.mission_withdrawn\(c\.mission_id\)/);
 assert.match(policy('messages_write'),/not offrya_private\.conversation_purged_for/);
 assert.match(sql,/revoke all on table public\.offrya_conversation_purges from anon, authenticated/,'Table des suppressions fermée à l’API');
 assert.match(sql,/grant execute on function offrya_private\.conversation_purged_for\(uuid, uuid\) to authenticated/);
});

test('Past closed missions are purged by the same procedure in the migration',()=>{
 assert.match(sql,/for r in select id, owner_id from public\.offrya_missions where status = 'closed' and withdrawn_at is null loop\s+perform offrya_private\.withdraw_mission\(r\.id, r\.owner_id\)/);
});

test('The closure journal stores counts only and is closed to every API role',()=>{
 assert.match(sql,/create table if not exists public\.offrya_mission_closures/);
 assert.match(sql,/revoke all on table public\.offrya_mission_closures from anon, authenticated/);
 const table=sql.slice(sql.indexOf('create table if not exists public.offrya_mission_closures'),sql.indexOf(');',sql.indexOf('create table if not exists public.offrya_mission_closures')));
 assert.doesNotMatch(table,/body|title|description/,'Aucun contenu conservé');
});
