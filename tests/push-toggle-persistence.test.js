'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const accountA='11111111-1111-4111-8111-111111111111';
const accountB='22222222-2222-4222-8222-222222222222';
const source=fs.readFileSync('public/push-notifications.js','utf8')
 .replace('export function createPushNotifications','function createPushNotifications');

function environment(){
 const store=new Map();
 const ownerByEndpoint=new Map();
 const device={sub:null,created:0};
 const server={ownerByEndpoint,statusFails:false,configFails:false,subscribeCalls:0,unsubscribeCalls:0};
 return {store,device,server};
}

function createBrowser(env,userId=accountA){
 const {device,server,store}=env;
 const attributes=new Map();
 const button={disabled:true,setAttribute:(k,v)=>attributes.set(k,v),
  addEventListener(event,callback){if(event==='click')this.click=callback;}};
 const status={textContent:''};
 const notifications=[];
 const localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const fakeNotification={permission:'granted',requestPermission:async()=>fakeNotification.permission};
 function newSubscription(){
  const endpoint='https://fcm.googleapis.com/fcm/send/push-device-'+(++device.created);
  return {endpoint,toJSON(){return{endpoint,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};},
   async unsubscribe(){if(device.sub===this)device.sub=null;return true;}};
 }
 const pushManager={
  async getSubscription(){return device.sub;},
  async subscribe(){device.sub=newSubscription();return device.sub;}
 };
 const registration={pushManager};
 const state={session:{user:{id:userId}},db:{auth:{async getSession(){
  return {data:{session:{user:{id:userId},access_token:'token-'+userId}}};
 }}}};
 const fetchMock=async(url,options)=>{
  if(url==='/api/push/config'){
   return {ok:!server.configFails,json:async()=>server.configFails?{enabled:false}:{enabled:true,publicKey:'QUFBQQ'}};
  }
  const payload=JSON.parse(options.body);
  if(url==='/api/push/status'){
   if(server.statusFails)return{ok:false,json:async()=>({error:'Service indisponible'})};
   return{ok:true,json:async()=>({registered:server.ownerByEndpoint.get(payload.endpoint)===userId})};
  }
  if(url==='/api/push/subscribe'){
   server.subscribeCalls++;
   server.ownerByEndpoint.set(payload.subscription.endpoint,userId);
   return{ok:true,json:async()=>({ok:true})};
  }
  if(url==='/api/push/unsubscribe'){
   server.unsubscribeCalls++;
   if(server.ownerByEndpoint.get(payload.endpoint)===userId)server.ownerByEndpoint.delete(payload.endpoint);
   return{ok:true,json:async()=>({ok:true})};
  }
  throw Error('Unexpected URL '+url);
 };
 const context={window:{isSecureContext:true,localStorage,
   PushManager:function(){},Notification:fakeNotification},
  navigator:{serviceWorker:{register:async()=>registration}},
  Notification:fakeNotification,fetch:fetchMock,
  atob:str=>Buffer.from(str,'base64').toString('binary'),
  Uint8Array,console};
 const factory=vm.runInNewContext(source+';createPushNotifications',context);
 const module=factory({state,button,status,notify:text=>notifications.push(text)});
 return{module,button,status,attributes,notifications};
}
const enabled=browser=>browser.attributes.get('aria-checked')==='true';

test('Notification Android: activation sauvegardée et conservée après rechargement',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 assert.equal(enabled(first),false);
 await first.button.click();
 assert.equal(enabled(first),true);
 assert.equal(env.store.get('offrya:push:enabled:v1:'+accountA),'1');
 const reloaded=createBrowser(env);
 await reloaded.module.init();
 assert.equal(enabled(reloaded),true);
 assert.equal(env.server.subscribeCalls,1,'no double registration on reload');
});
test('Retour Android: un abonnement Chrome perdu se rétablit avec le choix déjà autorisé',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 env.device.sub=null;
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(enabled(reopened),true);
 assert.equal(env.server.subscribeCalls,2);
 assert.match(reopened.status.textContent,/Appareil enregistré/);
});
test('Une panne temporaire du serveur ne décoche plus le bouton activé',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 env.server.statusFails=true;
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(enabled(reopened),true);
 assert.match(reopened.status.textContent,/ne peut pas être vérifiée/);
 assert.equal(env.server.subscribeCalls,1);
});
test('Une panne de configuration ne révoque pas la préférence enregistrée',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 env.server.configFails=true;
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(enabled(reopened),true);
 assert.equal(reopened.button.disabled,true);
 assert.match(reopened.status.textContent,/Votre choix reste enregistré/);
});
test('Une désactivation volontaire persiste et ne réactive pas le push sur la page suivante',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 await first.button.click();
 assert.equal(enabled(first),false);
 assert.equal(env.store.get('offrya:push:enabled:v1:'+accountA),'0');
 assert.equal(env.device.sub,null);
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(enabled(reopened),false);
 assert.equal(env.server.subscribeCalls,1);
 assert.equal(env.server.unsubscribeCalls,1);
});
test('Après une déconnexion, le choix reste enregistré et se restaure pour le même compte',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 await first.module.disable({silent:true});
 assert.equal(env.device.sub,null);
 assert.equal(env.store.get('offrya:push:enabled:v1:'+accountA),'1');
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(enabled(reopened),true);
 assert.equal(env.server.subscribeCalls,2);
});
test('Un autre compte sans opt-in ne récupère pas les notifications du précédent',async()=>{
 const env=environment(),first=createBrowser(env,accountA);
 await first.module.init();
 await first.button.click();
 const second=createBrowser(env,accountB);
 await second.module.init();
 assert.equal(enabled(second),false);
 assert.equal(env.store.has('offrya:push:enabled:v1:'+accountB),false);
 assert.equal(env.device.sub,null,'old browser subscription must be revoked');
 assert.equal(env.server.subscribeCalls,1,'do not register this endpoint for the new account');
});
