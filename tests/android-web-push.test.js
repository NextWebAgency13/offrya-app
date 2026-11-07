'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const push=require('../lib/push');

const client='11111111-1111-4111-8111-111111111111';
const professional='22222222-2222-4222-8222-222222222222';
const conversation='33333333-3333-4333-8333-333333333333';
const message='44444444-4444-4444-8444-444444444444';
const endpoint='https://fcm.googleapis.com/fcm/send/'+('token'.repeat(10));
const subscription={endpoint,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pub',
 SUPABASE_SECRET_KEY:'secret',VAPID_PUBLIC_KEY:'vapid-public',
 VAPID_PRIVATE_KEY:'vapid-private',OFFRYA_PUSH_WEBHOOK_SECRET:'unit-test-only-signature-key-with-enough-bytes'};

test('No push without the complete server configuration',()=>{
 assert.equal(push.publicConfig({}).enabled,false);
 assert.deepEqual(push.publicConfig(env),{enabled:true,publicKey:'vapid-public'});
});
test('Endpoint allowlist and key validation prevent arbitrary Web Push URLs',()=>{
 assert.equal(push.validSubscription(subscription),true);
 for(const unsafe of ['http://fcm.googleapis.com/send/123',
  'https://evil.example/collect','https://fcm.googleapis.com.evil.example/path',
  'https://localhost:8080','https://127.0.0.1/push']){
  assert.equal(push.safeEndpoint(unsafe),false,unsafe);
 }
 assert.equal(push.validSubscription({...subscription,keys:{p256dh:'wrong',auth:'short'}}),false);
});
test('Webhook signatures require an authentic, recently signed message ID',()=>{
 const now=Date.now(),timestamp=Math.floor(now/1000);
 const input={message_id:message,timestamp};
 const signature=crypto.createHmac('sha256',env.OFFRYA_PUSH_WEBHOOK_SECRET)
  .update(message+':'+timestamp).digest('hex');
 assert.equal(push.checkWebhook(input,signature,{env,now}),true);
 assert.equal(push.checkWebhook(input,'0'.repeat(64),{env,now}),false);
 assert.equal(push.checkWebhook({...input,timestamp:timestamp-301},signature,{env,now}),false);
 assert.equal(push.checkWebhook({message_id:client,timestamp},signature,{env,now}),false);
});
test('User JWT is verified by Supabase Auth and never inferred from request body',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({id:client,is_anonymous:false})};
 };
 const user=await push.authUser('Bearer '+('a'.repeat(50)),{env,fetchImpl});
 assert.equal(user,client);
 assert.equal(calls[0].url,'https://example.supabase.co/auth/v1/user');
 assert.equal(push.authUser('invalid',{env,fetchImpl}) instanceof Promise,true);
 assert.equal(await push.authUser('invalid',{env,fetchImpl}),null);
});
test('Push subscriptions are written and removed using server privileges only',async()=>{
 const calls=[],fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,status:204,json:async()=>[]};
 };
 await push.saveSubscription(client,subscription,{env,fetchImpl});
 await push.removeSubscription(client,endpoint,{env,fetchImpl});
 assert.match(calls[0].url,/on_conflict=endpoint/);
 assert.equal(calls[0].options.headers.apikey,'secret');
 assert.deepEqual(JSON.parse(calls[0].options.body).user_id,client);
 assert.match(calls[1].url,/user_id=eq\./);
 assert.equal(calls[1].options.method,'DELETE');
});
test('Supabase HTTP 201 with empty body confirms push subscription instead of throwing',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method,prefer:options.headers.Prefer});
  return {ok:true,status:201,text:async()=>''};
 };
 await assert.doesNotReject(push.saveSubscription(client,subscription,{env,fetchImpl}));
 assert.equal(calls.length,1);
 assert.equal(calls[0].method,'POST');
 assert.equal(calls[0].prefer,'resolution=merge-duplicates,return=minimal');
});

test('Signed database event only notifies the other participant, never includes message text',async()=>{
 const calls=[],notifications=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  let data=[];
  if(url.includes('offrya_messages?'))data=[{id:message,conversation_id:conversation,sender_id:client,created_at:new Date().toISOString(),body:'never send my message body'}];
  if(url.includes('offrya_conversations?'))data=[{id:conversation,client_id:client,professional_id:professional}];
  if(url.includes('offrya_push_subscriptions?'))data=[{endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}];
  return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
 };
 const pushClient={
  setVapidDetails(...args){notifications.push(['keys',args[0]]);},
  async sendNotification(sub,payload,opts){notifications.push(['push',sub,JSON.parse(payload),opts]);}
 };
 const result=await push.dispatchMessage({message_id:message},{env,fetchImpl,pushClient});
 assert.equal(result.sent,1);
 assert.match(calls[2].url,new RegExp(professional));
 assert.equal(notifications[1][2].body,'Vous avez reçu un nouveau message.');
 assert.equal(notifications[1][2].conversationId,conversation);
 assert.equal(notifications[1][2].messageId,message);
 assert.doesNotMatch(JSON.stringify(notifications),/never send my message body/);
 assert.equal(notifications[1][3].TTL,3600);
});
test('A push test targets only a registered subscription for the authenticated account',async()=>{
 const calls=[],delivered=[];
 const fetchImpl=async(url)=>{
  calls.push(url);
  const data=url.includes('user_id=eq.'+encodeURIComponent(client))
   ?[{endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}]
   :[];
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 const clientMock={
  setVapidDetails:(...args)=>delivered.push({vapid:args[0]}),
  sendNotification:async(sub,payload,options)=>delivered.push({endpoint:sub.endpoint,payload:JSON.parse(payload),ttl:options.TTL})
 };
 const good=await push.testDevicePush(client,endpoint,{env,fetchImpl,pushClient:clientMock});
 assert.deepEqual(good,{sent:true});
 assert.equal(delivered[1].endpoint,endpoint);
 assert.deepEqual(delivered[1].payload,{type:'test'});
 assert.equal(delivered[1].ttl,120);
 const wrong=await push.testDevicePush(professional,endpoint,{env,fetchImpl,pushClient:clientMock});
 assert.deepEqual(wrong,{sent:false,reason:'not_registered'});
 assert.equal(delivered.length,2,'Never send to subscriptions of a different account');
 assert.ok(calls[0].includes('user_id=eq.'+client));
 assert.ok(calls[0].includes('endpoint=eq.'));
});
test('Unknown and expired push devices are refused without a false success message',async()=>{
 let removed=false;
 const fetchImpl=async(url,options)=>{
  if(options.method==='DELETE'){removed=true;return {ok:true,status:204};}
  return {ok:true,status:200,text:async()=>JSON.stringify([{endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}])};
 };
 const expiredClient={
  setVapidDetails(){},
  async sendNotification(){const error=new Error('gone');error.statusCode=410;throw error;}
 };
 const result=await push.testDevicePush(client,endpoint,{env,fetchImpl,pushClient:expiredClient});
 assert.deepEqual(result,{sent:false,reason:'expired'});
 assert.equal(removed,true);
});
test('Android self-test and database registration are exposed as authenticated routes',()=>{
 const server=fs.readFileSync('server.js','utf8');
 const ui=fs.readFileSync('public/push-notifications.js','utf8');
 const html=fs.readFileSync('public/espace.html','utf8');
 const worker=fs.readFileSync('public/sw.js','utf8');
 assert.match(server,/p==='\/api\/push\/status'/);
 assert.match(server,/p==='\/api\/push\/test'/);
 assert.match(server,/await push\.authUser\(req\.headers\.authorization\)/);
 assert.match(server,/push\.testDevicePush\(user,input\.endpoint\)/);
 assert.match(server,/rateLimit\(req,p==='\/api\/push\/test'\?3:20\)/);
 assert.doesNotMatch(html,/id="pushTestNotification"/);
 assert.doesNotMatch(ui,/testButton|testPush\(/);
 assert.match(ui,/api\('status',\{endpoint:sub\.endpoint\},token\)/);
 assert.match(ui,/remote\.registered===true/);
 assert.match(ui,/Réactiver les notifications push/);
 assert.match(worker,/isTest\?'OFFRYA · Test Android':'OFFRYA'/);
 assert.match(worker,/self\.registration\.showNotification/);
 assert.doesNotMatch(worker,/caches\.open|message\.body/);
});
test('Android notification click opens the precise conversation and message even if no tab exists',async()=>{
 const source=fs.readFileSync('public/sw.js','utf8');
 const handlers={};
 let notification=null,opened=null,focused=0,closed=0;
 const client={async focus(){focused++;return client;}};
 const sandbox={
  URLSearchParams,
  console:{warn(){}},
  self:{
   location:{origin:'https://offrya.fr'},
   registration:{async showNotification(title,options){notification={title,options};}},
   addEventListener(name,handler){handlers[name]=handler;},
   clients:{
    async matchAll(){return [];},
    async openWindow(url){opened=url;return client;}
   }
  }
 };
 vm.runInNewContext(source,sandbox);
 const eventPush={data:{json:()=>({conversationId:conversation,messageId:message})},
  waitUntil(task){this.promise=task;}};
 handlers.push(eventPush);
 await eventPush.promise;
 assert.match(notification.options.tag,/offrya-message-/);
 const tap={notification:{data:notification.options.data,close(){closed++;}},
  waitUntil(task){this.promise=task;}};
 handlers.notificationclick(tap);
 await tap.promise;
 assert.equal(opened,'https://offrya.fr/espace/messagerie?conversation='+conversation+'&message='+message);
 assert.equal(focused,1);
 assert.equal(closed,1);
});
test('Android existing-window navigation failure falls back to focusing and opening the conversation in the SPA',async()=>{
 const source=fs.readFileSync('public/sw.js','utf8'),handlers={};
 let posted=null,focused=0,opened=0,closed=0;
 const existing={
  url:'https://offrya.fr/espace',
  async navigate(){throw Error('Android Custom Tab cannot navigate');},
  async focus(){focused++;return existing;},
  postMessage(payload){posted=payload;}
 };
 vm.runInNewContext(source,{
  URLSearchParams,console:{warn(){}},
  self:{
   location:{origin:'https://offrya.fr'},
   addEventListener(name,handler){handlers[name]=handler;},
   clients:{async matchAll(){return [existing];},async openWindow(){opened++;}}
  }
 });
 const event={notification:{
  data:{conversationId:conversation,messageId:message},close(){closed++;}
 },waitUntil(task){this.promise=task;}};
 handlers.notificationclick(event);
 await event.promise;
 assert.equal(posted.type,'OFFRYA_PUSH_OPEN');
 assert.equal(posted.conversationId,conversation);
 assert.equal(posted.messageId,message);
 assert.equal(focused,1);assert.equal(opened,0);assert.equal(closed,1);
});
test('Push deep links require a real RLS-authorized conversation, and the optional message gets focused',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 const auth=fs.readFileSync('public/connexion.js','utf8');
 assert.match(app,/function verifiedPushTarget\(/);
 assert.match(app,/event\.data\?\.type!=='OFFRYA_PUSH_OPEN'/);
 assert.match(app,/\.eq\('id',conversationId\)\.maybeSingle\(\)/);
 assert.match(app,/\[r\.data\.client_id,r\.data\.professional_id\]\.includes\(uid\)/);
 assert.match(app,/history\.replaceState\(\{tab:'inbox'\}/);
 assert.match(app,/data-message-id="/);
 assert.match(app,/bubble\.scrollIntoView\(/);
 assert.match(auth,/pushConversationPath\.test\(value\)/);
 assert.match(app,/encodeURIComponent\(location\.pathname\+location\.search\)/);
});
test('Closed-browser worker shows a generic Android notification and opens private inbox',()=>{
 const sw=fs.readFileSync('public/sw.js','utf8');
 const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
 const html=fs.readFileSync('public/espace.html','utf8');
 const app=fs.readFileSync('public/app.js','utf8');
 const sql=fs.readFileSync('sql/web_push_notifications.sql','utf8');
 const server=fs.readFileSync('server.js','utf8');
 assert.match(sw,/self\.addEventListener\('push'/);
 assert.match(sw,/self\.registration\.showNotification/);
 assert.match(sw,/self\.addEventListener\('notificationclick'/);
 assert.match(sw,/clients\.openWindow/);
 assert.doesNotMatch(sw,/caches\.open|message\.body|messageText/);
 assert.equal(manifest.display,'standalone');
 assert.match(html,/id="pushNotificationToggle"/);
 assert.match(html,/id="pushNotificationStatus"/);
 assert.match(app,/pushNotifications\.init\(\)/);
 assert.match(app,/pushNotifications\.disable\(\{silent:true\}\)/);
 assert.match(server,/if\(p==='\/api\/push\/message'/);
 assert.match(server,/push\.checkWebhook/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.offrya_push_subscriptions from public, anon, authenticated/);
 assert.match(sql,/vault\.decrypted_secrets/);
 assert.match(sql,/extensions\.hmac/);
 for(const path of ['server.js','public/sw.js','public/push-notifications.js']){
  const result=path==='public/push-notifications.js'
   ?spawnSync(process.execPath,['--input-type=module','--check'],{input:fs.readFileSync(path,'utf8'),encoding:'utf8'})
   :spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(result.status,0,path+': '+result.stderr);
 }
});
test('Notifications Android : explication visible seulement si une action est nécessaire',()=>{
 const ui=fs.readFileSync('public/push-notifications.js','utf8'),html=fs.readFileSync('public/espace.html','utf8'),app=fs.readFileSync('public/app.js','utf8');
 assert.match(html,/<p class="push-settings-hint" id="pushNotificationHint" hidden><\/p>/);
 assert.match(app,/hint:\$\('pushNotificationHint'\)/);
 assert.match(ui,/async function refreshStatus\(\)\{\n  active=false;advise\(''\);/);
 assert.match(ui,/advise\('Notifications bloquées dans Chrome\./);
 assert.match(ui,/if\(!active\)advise\('Ce téléphone reçoit peut-être les notifications d’un autre compte OFFRYA\./);
});
