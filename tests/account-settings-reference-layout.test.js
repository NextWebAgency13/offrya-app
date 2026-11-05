'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/role-reference.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const push=fs.readFileSync('public/push-notifications.js','utf8');

test('Approved account screen has concise Android and subscription cards without legacy paragraphs',()=>{
 const section=html.slice(html.indexOf('<section class="tab" id="settings">'),html.indexOf('</section>\n   </div>\n   <footer',html.indexOf('<section class="tab" id="settings">')));
 assert.match(section,/id="pushSettingsTitle">Notifications Android/);
 assert.match(section,/id="pushNotificationToggle"[^>]+role="switch"/);
 assert.match(section,/class="push-settings-switch-thumb"/);
 assert.match(section,/id="pushNotificationStatus"/);
 assert.doesNotMatch(section,/Recevez une alerte lorsqu.un nouveau message/);
 assert.doesNotMatch(section,/Appareil enregistré pour ce compte/);
 assert.doesNotMatch(section,/ajoutez OFFRYA à l’écran d’accueil/);
 assert.match(section,/id="accountPlanBadge"/);
 assert.match(section,/id="accountPlanExpiry"/);
 assert.match(section,/id="accountBillingPortal"/);
 assert.match(section,/id="accountBillingInfo"/);
 assert.doesNotMatch(section,/Gérer \/ résilier mon abonnement/);
 assert.match(section,/id="profileSummary"/);
 assert.match(section,/id="preferencesForm"/);
 assert.match(html,/class="offrya-global-footer"/,'Legal links remain available');
});
test('Reference design is responsive, keeps accessible controls and visually-hidden status',()=>{
 assert.match(css,/\.offrya-settings-card/);
 assert.match(css,/\.account-setting-icon/);
 assert.match(css,/\.account-plan-badge/);
 assert.match(css,/\.account-billing-cta/);
 assert.match(css,/\.account-screen-reader-only/);
 assert.match(css,/\.push-settings-switch\[aria-checked="true"\]/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(html,/aria-label="Vérification des notifications"/);
 assert.match(html,/aria-live="polite"/);
});
test('Live subscription state alone controls label, expiration and Stripe button',()=>{
 assert.match(app,/const hasTest=Number\.isFinite\(trialExpires\)&&trialExpires>Date\.now\(\)/);
 assert.match(app,/const paid=state\.subscription\?\.status==='active'/);
 assert.match(app,/badge\.textContent=hasTest\?'Accès de test'/);
 assert.match(app,/expiry\.textContent=hasTest\?'Expiration le '/);
 assert.match(app,/\$\('accountBillingPortal'\)\.disabled=!canManage/);
 assert.match(app,/hasTest\?'Accès de test sans paiement : aucun abonnement Stripe à gérer\.'/);
 assert.doesNotMatch(app,/badge\.textContent='Accès de test'/,'No fake test badge on paid and free accounts');
});
test('The switch retains its thumb and reports server-confirmed subscription, not visual guesswork',async()=>{
 const source=push.replace(/^export /gm,'')+'\nthis.makePush=createPushNotifications;';
 const attrs=new Map(),handlers={};
 const button={
  disabled:true,title:'',addEventListener:(event,cb)=>{handlers[event]=cb},
  setAttribute:(key,val)=>attrs.set(key,val)
 };
 const status={textContent:''};
 const activeSub={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON(){return {endpoint:this.endpoint}}};
 let sub=null,registered=false;
 const serviceWorker={register:async()=>({pushManager:{
  getSubscription:async()=>sub,
  subscribe:async()=>activeSub
 }})};
 const state={db:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};
 const ctx=vm.createContext({
  window:{isSecureContext:true,PushManager:function(){},Notification:function(){}},
  navigator:{serviceWorker},Notification:{permission:'granted',requestPermission:async()=> 'granted'},
  fetch:async(url)=>{
   if(url.includes('/config'))return {ok:true,json:async()=>({enabled:true,publicKey:'AQ'})};
   if(url.includes('/status'))return {ok:true,json:async()=>({registered})};
   return {ok:true,json:async()=>({})};
  },
  console,atob:()=>'',Uint8Array
 });
 vm.runInContext(source,ctx);
 const manager=ctx.makePush({state,button,status,notify(){}});
 await manager.init();
 assert.equal(attrs.get('aria-checked'),'false');
 assert.equal(button.disabled,false);
 assert.match(attrs.get('aria-label'),/Activer/);
 assert.equal(button.textContent,undefined,'Never overwrite switch thumb');
 sub=activeSub;registered=true;
 await manager.syncExisting();
 assert.equal(attrs.get('aria-checked'),'true');
 assert.match(attrs.get('aria-label'),/Désactiver/);
 registered=false;
 await manager.syncExisting();
 assert.equal(attrs.get('aria-checked'),'false');
});
test('All affected JavaScript modules are syntactically valid',()=>{
 for(const [name,source] of [['app',app],['push',push]]){
  const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(check.status,0,name+': '+check.stderr);
 }
});
