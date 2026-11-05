'use strict';
// Safe production smoke: no subscription is created and no push is delivered.
const assert=require('node:assert/strict');
const origin='https://offrya-app.onrender.com';
async function get(path,{method='GET',body}={}){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(origin+path,{method,headers:{
    'User-Agent':'OFFRYA-WebPush-Smoke/1.0',
    ...(body?{'Content-Type':'application/json'}:{})
   },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(100000),cache:'no-store'});
   const content=await response.text();
   let json=null;try{json=JSON.parse(content);}catch(_){}
   return {status:response.status,body:content,json};
  }catch(error){last=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,6000));}
 }
 throw last;
}
async function run(){
 const cfg=await get('/api/push/config');
 assert.equal(cfg.status,200,'Web Push config endpoint');
 assert.equal(cfg.json?.enabled,true,'Render has Web Push keys and Supabase credentials');
 assert.match(cfg.json?.publicKey||'',/^[A-Za-z0-9_-]{87}$/,'Valid public VAPID key');
 const [worker,manifest,ui,account]=await Promise.all([
  get('/sw.js'),get('/manifest.webmanifest'),get('/push-notifications.js'),get('/espace/reglages')
 ]);
 assert.equal(worker.status,200,'Service Worker accessible from /');
 assert.match(worker.body,/registration\.showNotification/);
 assert.match(worker.body,/notificationclick/);
 assert.equal(manifest.status,200,'Manifest PWA accessible');
 assert.equal(manifest.json?.display,'standalone');
 assert.equal(ui.status,200,'Browser opt-in module accessible');
 assert.match(ui.body,/Notification\.requestPermission/);
 assert.match(ui.body,/pushManager\.subscribe/);
 assert.equal(account.status,200,'Account settings accessible');
 assert.match(account.body,/id="pushNotificationToggle"/);
 const event={message_id:'11111111-1111-4111-8111-111111111111',timestamp:Math.floor(Date.now()/1000)};
 const spoofed=await get('/api/push/message',{method:'POST',body:event});
 assert.equal(spoofed.status,401,'Unsigned webhook must be rejected');
 for(const path of ['/api/push/subscribe','/api/push/unsubscribe']){
  const anonymous=await get(path,{method:'POST',body:{}});
  assert.equal(anonymous.status,401,path+' requires a real session');
 }
 console.log('PASS: production Web Push configured; worker and manifest visible; forged events and anonymous subscriptions rejected');
}
run().catch(error=>{console.error('OFFRYA Web Push smoke failed:',error.message);process.exitCode=1;});
