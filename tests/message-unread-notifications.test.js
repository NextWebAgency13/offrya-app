'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const start=app.indexOf('const MESSAGE_READ_PREFIX=');
const end=app.indexOf('function toast(s){',start);
assert.ok(start>0&&end>start,'Notification helpers are present');
const helpers=app.slice(start,end);
const client='11111111-1111-4111-8111-111111111111';
const professional='22222222-2222-4222-8222-222222222222';
const conversation='33333333-3333-4333-8333-333333333333';
const otherConversation='44444444-4444-4444-8444-444444444444';
const message=(id,thread,sender,date)=>({id,conversation_id:thread,sender_id:sender,created_at:date});
const t1='2026-11-05T12:00:00Z',t2='2026-11-05T12:01:00Z',t3='2026-11-05T12:02:00Z';
function harness({user=client,rows=[],conversations=[{id:conversation}],storage=new Map(),fetches=null}={}){
 const nodes=new Map();
 function node(id){
  if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',attrs:{},setAttribute(key,value){this.attrs[key]=value;},classList:{contains:()=>false}});
  return nodes.get(id);
 }
 const alerts=[];
 const state={session:{user:{id:user}},currentUserId:user,conversations,messageHeaders:rows,messageUnreadCount:0,thread:null,db:null};
 let renderCount=0;
 const dbCalls=[];
 if(fetches)state.db={from(table){
  dbCalls.push(table);
  return {
   select(cols){dbCalls.push(cols);return this;},
   in(field,values){dbCalls.push([field,values]);return this;},
   order(){return this;},
   limit:async()=>({data:table==='offrya_conversations'?fetches.conversations:fetches.messages,error:null})
  };
 }};
 const ctx={state,localStorage:{
  getItem:key=>storage.get(key)||null,
  setItem:(key,value)=>storage.set(key,value)
 },$:node,document:{
  hidden:false,
  querySelector:()=>node('messageNavigation'),
  querySelectorAll:()=>[node('proUnreadBadge')]
 },toast:text=>alerts.push(text),loadMessages:async()=>{},renderInbox:()=>{renderCount++;},
 console:{warn(){}}};
 vm.runInNewContext(helpers+'\nthis.api={messageReadKey,readMessageCursors,messageUnread,paintMessageBadges,acknowledgeConversation,loadMessageNotifications};',ctx);
 return {state,api:ctx.api,node,storage,alerts,dbCalls,renderCount:()=>renderCount};
}
test('Incoming messages display badges for both user types; sent messages are excluded',()=>{
 for(const user of [client,professional]){
  const sender=user===client?professional:client;
  const app=harness({user,rows:[
   message('m1',conversation,sender,t1),
   message('m2',conversation,user,t2),
   message('m3',conversation,sender,t3)
  ]});
  assert.equal(app.api.messageUnread().total,2);
  app.api.paintMessageBadges();
  assert.equal(app.node('messageNavBadge').hidden,false);
  assert.equal(app.node('messageNavBadge').textContent,'2');
  assert.equal(app.node('messageShortcutBubble').textContent,'2');
  assert.equal(app.node('proUnreadBadge').textContent,'2');
  assert.match(app.node('messageShortcut').attrs['aria-label'],/2 messages non lus/);
 }
});
test('Opening a thread clears only its unread messages; a new response reactivates the badge',()=>{
 const rows=[
  message('m1',conversation,professional,t1),
  message('m2',otherConversation,professional,t2)
 ];
 const app=harness({rows,conversations:[{id:conversation},{id:otherConversation}]});
 assert.equal(app.api.messageUnread().total,2);
 app.api.acknowledgeConversation(conversation,[rows[0]]);
 assert.equal(app.api.messageUnread().total,1);
 const stored=JSON.parse(app.storage.get(app.api.messageReadKey(client)));
 assert.equal(stored[conversation],Date.parse(t1));
 app.state.messageHeaders.push(message('m3',conversation,professional,t3));
 assert.equal(app.api.messageUnread().total,2);
 app.api.acknowledgeConversation(conversation,[rows[0],app.state.messageHeaders[2]]);
 assert.equal(app.api.messageUnread().total,1);
 app.api.acknowledgeConversation(otherConversation,[rows[1]]);
 assert.equal(app.api.messageUnread().total,0);
 app.api.paintMessageBadges();
 assert.equal(app.node('messageNavBadge').hidden,true);
 assert.equal(app.node('messageNavBadge').textContent,'');
 assert.equal(app.node('messageShortcutBubble').hidden,true);
 assert.equal(app.node('messageShortcutBubble').textContent,'');
 assert.equal(app.node('proUnreadBadge').hidden,true);
 assert.equal(app.node('proUnreadBadge').textContent,'');
 assert.equal(app.node('messageNavigation').attrs['aria-label'],'Messages');
});
test('Read state is separate for each account and does not contain message bodies',()=>{
 const storage=new Map();
 const app=harness({storage,user:client,rows:[message('m1',conversation,professional,t1)]});
 app.api.acknowledgeConversation(conversation,[message('m1',conversation,professional,t1)]);
 assert.equal(app.api.messageUnread().total,0);
 const another=harness({storage,user:professional,rows:[message('m2',conversation,client,t2)]});
 assert.equal(another.api.messageUnread().total,1);
 assert.doesNotMatch(JSON.stringify([...storage]),/message text|access_token|token/);
});
test('Polling discovers new conversations and reads only RLS-protected message metadata',async()=>{
 const messages=[message('m1',conversation,professional,t1)];
 const app=harness({conversations:[],fetches:{conversations:[{id:conversation}],messages},rows:[]});
 await app.api.loadMessageNotifications();
 assert.equal(app.state.conversations.length,1);
 assert.equal(app.state.messageHeaders.length,1);
 assert.equal(app.api.messageUnread().total,1);
 assert.deepEqual(app.dbCalls.slice(0,5),['offrya_conversations','*','offrya_messages','id,conversation_id,sender_id,created_at',['conversation_id',[conversation]]]);
 assert.equal(app.node('messageShortcutBubble').textContent,'1');
 assert.equal(app.alerts.length,0,'No duplicate toast on first load');
});
test('Further messages generate an in-app toast without a new user action',async()=>{
 const source={conversations:[{id:conversation}],messages:[message('m1',conversation,professional,t1)]};
 const app=harness({fetches:source,conversations:[]});
 await app.api.loadMessageNotifications();
 source.messages=[...source.messages,message('m2',conversation,professional,t2)];
 await app.api.loadMessageNotifications();
 assert.equal(app.api.messageUnread().total,2);
 assert.equal(app.alerts.length,1);
});
test('Visible message UI is separate from professional opportunity alerts',()=>{
 assert.match(html,/id="messageNavBadge"/);
 assert.match(html,/id="messageShortcutBubble"/);
 assert.match(html,/id="messageShortcut"[^>]*data-tab="inbox"/);
 assert.match(css,/\.message-unread-badge\[hidden\]/);
 assert.match(css,/\.offrya-conversation\.has-unread/);
 assert.match(app,/await loadMessageNotifications\(\)/);
 assert.match(app,/loadMessageNotifications\(\)\.catch/);
 assert.match(app,/acknowledgeConversation\(id,state\.messages\)/);
 assert.match(pro,/Number\(state\.messageUnreadCount\|\|0\)/);
 assert.match(app,/\.select\('id,conversation_id,sender_id,created_at'\)/);
 assert.doesNotMatch(helpers,/canUsePremium\(\)/,'Clients also receive notifications');
 const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});

test('A zero unread count never renders a visible desktop or mobile navigation pill',()=>{
 const styles=fs.readFileSync('public/role-reference.css','utf8');
 const professional=fs.readFileSync('public/pro-experience.js','utf8');
 assert.match(styles,/\.sidebar #nav \.message-nav-link \.message-unread-badge\[hidden\]/);
 assert.match(styles,/\.header \.message-header-shortcut \.message-unread-badge\[hidden\]/);
 assert.match(styles,/\.pro-v3-nav-count\[hidden\]/);
 assert.match(styles,/display:none!important/);
 assert.match(app,/total>99\?'99\+':total\?String\(total\):''/);
 assert.match(professional,/count>99\?'99\+':count\?String\(count\):''/);
 const zero=harness({rows:[]});
 zero.api.paintMessageBadges();
 for(const id of ['messageNavBadge','messageShortcutBubble','proUnreadBadge']){
  assert.equal(zero.node(id).hidden,true,id);
  assert.equal(zero.node(id).textContent,'',id);
 }
});
