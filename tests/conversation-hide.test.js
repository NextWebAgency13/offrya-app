'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const sql=fs.readFileSync('sql/conversation_hides.sql','utf8');
const me='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const c1='33333333-3333-4333-8333-333333333333';
const c2='44444444-4444-4444-8444-444444444444';
const slice=(from,to)=>{const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>0&&b>a,from);return app.slice(a,b);};
function harness({hidden=[],confirmAnswer=true,insertError=null}={}){
 const calls=[],toasts=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'',textContent:'',classList:{toggle(){},contains:()=>false},querySelector:()=>({disabled:false})});return nodes.get(id);};
 const state={session:{user:{id:me}},currentUserId:me,db:null,thread:c1,messages:[{id:'m'}],messageHeaders:[],
  conversations:[{id:c1,mission_id:'a',client_id:me,professional_id:other,created_at:'2026-11-01T10:00:00Z'},
   {id:c2,mission_id:'b',client_id:me,professional_id:other,created_at:'2026-11-02T10:00:00Z'}],
  hiddenConversations:new Set(hidden),showHiddenConversations:false};
 state.db={from(table){return {
  insert:async row=>{calls.push(['insert',table,row]);return {error:insertError};},
  delete:()=>({eq:(a,b)=>({eq:async(c,d)=>{calls.push(['delete',table,[a,b],[c,d]]);return {error:null};}})}),
  select:async()=>({data:[...state.hiddenConversations].map(conversation_id=>({conversation_id})),error:null})
 };}};
 const ctx={state,paths:{inbox:'/espace/messagerie'},location:{pathname:'/espace/messagerie',search:'?conversation='+c1},
  history:{replaceState(){calls.push(['replaceState']);}},URLSearchParams,Set,Boolean,Array,console,
  confirm:()=>confirmAnswer,requireAuth:()=>true,showError:e=>{throw new Error(e.message);},renderMessages(){},toast:t=>toasts.push(t),
  render:()=>calls.push(['render']),$:node,esc:s=>String(s??''),date:s=>s,profileName:()=>'Contact',titleForMission:id=>'Mission '+id,
  messageUnread:()=>({total:0,byThread:new Map()}),paintMessageBadges(){}};
 const source=slice('function isConversationHidden','function messageUnread(){')
  +slice('async function setConversationHidden','$(\'missionSearch\').onclick')
  +slice('const TRASH_ICON','function renderMessages(){');
 vm.runInNewContext(source+'\nthis.api={isConversationHidden,setConversationHidden,hideConversation,restoreConversation,renderInbox};',ctx);
 return {state,calls,toasts,api:ctx.api,node};
}
test('Hiding asks for confirmation and writes only the current user’s own row',async()=>{
 const h=harness({confirmAnswer:false});
 await h.api.hideConversation(c1);
 assert.equal(h.calls.length,0,'Annuler ne doit rien écrire');
 const ok=harness();
 await ok.api.hideConversation(c1);
 assert.equal(JSON.stringify(ok.calls.find(c=>c[0]==='insert')),JSON.stringify(['insert','offrya_conversation_hides',{conversation_id:c1}]));
 assert.ok(ok.state.hiddenConversations.has(c1));
 assert.equal(ok.state.thread,null,'La conversation ouverte se ferme');
 assert.equal(ok.state.messages.length,0);
 assert.ok(ok.calls.some(c=>c[0]==='render'));
 assert.ok(!ok.calls.some(c=>c[1]==='offrya_conversations'||c[1]==='offrya_messages'),'Aucune suppression de conversation ni de message');
});
test('Hiding twice is harmless and restoring deletes only the own row',async()=>{
 const dup=harness({insertError:{code:'23505'}});
 await dup.api.hideConversation(c2);
 assert.ok(dup.state.hiddenConversations.has(c2));
 const back=harness({hidden:[c2]});
 await back.api.restoreConversation(c2);
 assert.ok(!back.state.hiddenConversations.has(c2));
 assert.equal(JSON.stringify(back.calls.find(c=>c[0]==='delete')),JSON.stringify(['delete','offrya_conversation_hides',['conversation_id',c2],['user_id',me]]));
});
test('A real database error leaves the exchange visible',async()=>{
 const h=harness({insertError:{code:'42501',message:'refusé'}});
 await assert.rejects(h.api.hideConversation(c1),/refusé/);
 assert.ok(!h.state.hiddenConversations.has(c1));
});
test('The list hides retired exchanges, offers a way to show and restore them',()=>{
 const h=harness({hidden:[c2]});
 h.api.renderInbox();
 const list=h.node('conversationList').innerHTML;
 assert.ok(list.includes('data-thread="'+c1+'"')&&list.includes('data-hide-thread="'+c1+'"'));
 assert.ok(!list.includes('data-thread="'+c2+'"'),'Un échange retiré n’apparaît pas');
 assert.match(list,/data-toggle-hidden[^>]*aria-expanded="false"[^>]*>Voir les échanges retirés \(1\)/);
 h.state.showHiddenConversations=true;
 h.api.renderInbox();
 const open=h.node('conversationList').innerHTML;
 assert.ok(open.includes('data-restore-thread="'+c2+'"')&&!open.includes('data-thread="'+c2+'"'));
});
test('Badges ignore hidden exchanges and the database refresh brings them back',()=>{
 const source=slice('const MESSAGE_READ_PREFIX=','function toast(s){');
 const build=hidden=>{
  const state={session:{user:{id:me}},currentUserId:me,thread:null,messageUnreadCount:0,
   conversations:[{id:c1}],hiddenConversations:new Set(hidden),
   messageHeaders:[{id:'m1',conversation_id:c1,sender_id:other,created_at:'2026-11-05T12:00:00Z'}]};
  const ctx={state,localStorage:{getItem:()=>null,setItem(){}},$:()=>({hidden:false,setAttribute(){},classList:{contains:()=>false}}),
   document:{hidden:false,querySelector:()=>null,querySelectorAll:()=>[]},toast(){},loadMessages:async()=>{},renderInbox(){},console};
  vm.runInNewContext(source+'\nthis.api={messageUnread};',ctx);
  return ctx.api;
 };
 assert.equal(build([c1]).messageUnread().total,0);
 assert.equal(build([]).messageUnread().total,1);
});
test('Reopening, contacting or following a push link shows a hidden exchange again',()=>{
 assert.match(app,/if\(isConversationHidden\(c\.id\)\)await setConversationHidden\(c\.id,false\)/);
 assert.match(app,/if\(isConversationHidden\(conversationId\)\)await setConversationHidden\(conversationId,false\)/);
});
test('Page markup and database migration are consistent',()=>{
 assert.match(html,/id="threadHide"/);
 assert.match(app,/offrya_conversation_hides/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/grant select, insert, delete on public\.offrya_conversation_hides to authenticated/);
 assert.match(sql,/user_id = \(select auth\.uid\(\)\)/);
 assert.match(sql,/after insert on public\.offrya_messages/);
 assert.doesNotMatch(sql,/delete from public\.offrya_(conversations|messages)/);
});
