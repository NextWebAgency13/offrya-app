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
 const server={ownerByEndpoint,statusFails:false,configFails:false,configHangs:false,statusHangs:false,sessionHangs:false,subscribeCalls:0,unsubscribeCalls:0};
 return {store,device,server};
}

function createBrowser(env,userId=accountA){
 const {device,server,store}=env;
 const attributes=new Map();
 const button={disabled:true,setAttribute:(k,v)=>attributes.set(k,v),
  addEventListener(event,callback){if(event==='click')this.click=callback;}};
 const classes=new Set(['account-screen-reader-only']);
 const status={textContent:'',classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}};
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
  if(server.sessionHangs)return new Promise(()=>{});
  return {data:{session:{user:{id:userId},access_token:'token-'+userId}}};
 }}}};
 const fetchMock=async(url,options)=>{
  if(url==='/api/push/config'){
   if(server.configHangs)return new Promise(()=>{});
   return {ok:!server.configFails,json:async()=>server.configFails?{enabled:false}:{enabled:true,publicKey:'QUFBQQ'}};
  }
  const payload=JSON.parse(options.body);
  if(url==='/api/push/status'){
   if(server.statusHangs)return new Promise(()=>{});
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
  Notification:fakeNotification,fetch:fetchMock,setTimeout,clearTimeout,
  atob:str=>Buffer.from(str,'base64').toString('binary'),
  Uint8Array,console};
 const factory=vm.runInNewContext(source+';createPushNotifications',context);
 const module=factory({state,button,status,notify:text=>notifications.push(text),timeoutMs:60});
 return{module,button,status,attributes,notifications,classes};
}
const enabled=browser=>browser.attributes.get('aria-checked')==='true';
// Une explication est « visible » quand elle n'est plus réservée aux lecteurs d'écran.
const visible=browser=>!browser.classes.has('account-screen-reader-only')&&browser.classes.has('push-settings-problem');

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
 assert.equal(reopened.button.disabled,false,'le bouton reste utilisable : un appui relance la vérification');
 assert.match(reopened.status.textContent,/Votre choix reste enregistré/);
 assert.equal(visible(reopened),true,'la raison est affichée à l’écran');
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

test('Le bouton reprend ON immédiatement pendant la vérification asynchrone',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 const reopened=createBrowser(env);
 const initialization=reopened.module.init();
 assert.equal(enabled(reopened),true,'do not flash OFF on reloading the settings');
 await initialization;
 assert.equal(enabled(reopened),true);
});
test('Une inscription Supabase manquante est réparée pour le même compte avec opt-in',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 env.server.ownerByEndpoint.clear();
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(enabled(reopened),true);
 assert.equal(env.server.subscribeCalls,2);
 assert.equal(env.server.ownerByEndpoint.get(env.device.sub.endpoint),accountA);
});

// --- Le bouton ne doit jamais rester figé (régression constatée sur Chrome Android) ---
test('Une panne ponctuelle de configuration au chargement ne fige plus le bouton : un appui la relit et active',async()=>{
 const env=environment(),page=createBrowser(env);
 env.server.configFails=true;
 await page.module.init();
 assert.equal(page.button.disabled,false,'bouton utilisable malgré la panne');
 assert.equal(enabled(page),false);
 assert.equal(visible(page),true,'la raison est affichée, pas réservée aux lecteurs d’écran');
 env.server.configFails=false;
 await page.button.click();
 assert.equal(enabled(page),true,'la configuration est relue au moment de l’appui');
 assert.equal(env.server.subscribeCalls,1);
 assert.equal(visible(page),false,'plus de message de problème une fois rétabli');
});
test('Appui alors que le service reste indisponible : message clair et bouton toujours utilisable',async()=>{
 const env=environment(),page=createBrowser(env);
 env.server.configFails=true;
 await page.module.init();
 await page.button.click();
 assert.match(page.notifications.join(' '),/momentanément indisponibles/);
 assert.equal(page.button.disabled,false);
 assert.equal(env.server.subscribeCalls,0);
});
test('Une configuration qui ne répond jamais ne fige pas le bouton',async()=>{
 const env=environment(),page=createBrowser(env);
 env.server.configHangs=true;
 await page.module.init();
 assert.equal(page.button.disabled,false);
 assert.equal(visible(page),true);
});
test('Une vérification serveur qui ne répond jamais ne fige pas le bouton et garde le choix affiché',async()=>{
 const env=environment(),first=createBrowser(env);
 await first.module.init();
 await first.button.click();
 env.server.statusHangs=true;
 const reopened=createBrowser(env);
 await reopened.module.init();
 assert.equal(reopened.button.disabled,false);
 assert.equal(enabled(reopened),true,'le choix mémorisé reste affiché');
 assert.equal(visible(reopened),true);
});
test('Une session qui ne répond pas ne fige pas le bouton',async()=>{
 const env=environment(),page=createBrowser(env);
 env.server.sessionHangs=true;
 await page.module.init();
 assert.equal(page.button.disabled,false);
 assert.equal(visible(page),true);
});
test('Quand tout va bien, aucune explication de problème n’est affichée',async()=>{
 const env=environment(),page=createBrowser(env);
 await page.module.init();
 assert.equal(page.button.disabled,false);
 assert.equal(visible(page),false);
});
