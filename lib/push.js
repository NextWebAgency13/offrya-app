'use strict';
// OFFRYA Web Push: opt-in only, protected subscriptions and generic payloads.
const crypto = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[A-Za-z0-9_-]{16,160}$/;

function configured(env=process.env) {
 return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY &&
  env.OFFRYA_PUSH_WEBHOOK_SECRET && env.SUPABASE_URL &&
  env.SUPABASE_SECRET_KEY && env.SUPABASE_PUBLISHABLE_KEY);
}
function publicConfig(env=process.env) {
 return {enabled:configured(env),publicKey:configured(env)?env.VAPID_PUBLIC_KEY:null};
}
function safeEndpoint(endpoint) {
 if(typeof endpoint!=='string'||endpoint.length>2048)return false;
 try {
  const u=new URL(endpoint);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
  const host=u.hostname.toLowerCase();
  return host==='fcm.googleapis.com' ||
   host==='updates.push.services.mozilla.com' ||
   host==='web.push.apple.com' ||
   /^[a-z0-9.-]+\.notify\.windows\.com$/.test(host);
 }catch(_){return false;}
}
function validSubscription(sub) {
 return Boolean(sub && typeof sub==='object' && safeEndpoint(sub.endpoint) &&
  sub.keys && typeof sub.keys==='object' &&
  SAFE_KEY.test(sub.keys.p256dh||'') &&
  SAFE_KEY.test(sub.keys.auth||'') &&
  sub.keys.p256dh.length>=80 && sub.keys.auth.length>=16);
}
async function authUser(header,{env=process.env,fetchImpl=fetch}={}) {
 const match=/^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(String(header||''));
 if(!match)return null;
 const response=await fetchImpl(env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/user',{
  headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+match[1]},
  signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)return null;
 const user=await response.json();
 return user && UUID.test(user.id) && !user.is_anonymous ? user.id : null;
}
async function rest(resource,{method='GET',body,env=process.env,fetchImpl=fetch,prefer}={}) {
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('Stockage push indisponible');
 const res=await fetchImpl(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+resource,{
  method,
  headers:{
   apikey:env.SUPABASE_SECRET_KEY,
   'Content-Type':'application/json',
   ...(prefer?{Prefer:prefer}:{})
  },
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(12000)
 });
 if(!res.ok)throw Error('Push DB HTTP '+res.status);
 if(res.status===204||method==='DELETE')return [];
 return res.json();
}
async function saveSubscription(user,sub,options={}) {
 if(!UUID.test(String(user||''))||!validSubscription(sub))throw Error('Abonnement push invalide');
 await rest('offrya_push_subscriptions?on_conflict=endpoint',{
  ...options,method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
  body:{endpoint:sub.endpoint,user_id:user,p256dh:sub.keys.p256dh,auth:sub.keys.auth,updated_at:new Date().toISOString()}
 });
}
async function removeSubscription(user,endpoint,options={}) {
 if(!UUID.test(String(user||''))||!safeEndpoint(endpoint))throw Error('Abonnement push invalide');
 await rest('offrya_push_subscriptions?user_id=eq.'+encodeURIComponent(user)+
  '&endpoint=eq.'+encodeURIComponent(endpoint),{...options,method:'DELETE'});
}
function checkWebhook(input,signature,{env=process.env,now=Date.now()}={}) {
 if(!configured(env)||!input||!UUID.test(input.message_id))return false;
 const seconds=Number(input.timestamp);
 if(!Number.isSafeInteger(seconds)||Math.abs(Math.floor(now/1000)-seconds)>300)return false;
 const received=String(signature||'');
 if(!/^[0-9a-f]{64}$/i.test(received))return false;
 const wanted=crypto.createHmac('sha256',env.OFFRYA_PUSH_WEBHOOK_SECRET)
  .update(input.message_id+':'+seconds).digest();
 return crypto.timingSafeEqual(Buffer.from(received,'hex'),wanted);
}
async function dispatchMessage(input,{env=process.env,fetchImpl=fetch,pushClient}={}) {
 if(!UUID.test(input.message_id))throw Error('Identifiant du message invalide');
 const source=await rest('offrya_messages?select=id,conversation_id,sender_id,created_at&id=eq.'+
  encodeURIComponent(input.message_id)+'&limit=1',{env,fetchImpl});
 const message=source?.[0];
 if(!message||!UUID.test(message.conversation_id)||!UUID.test(message.sender_id))return {sent:0};
 // This endpoint is only for freshly inserted messages, never a mass-notification API.
 if(!Number.isFinite(Date.parse(message.created_at))||
  Date.now()-Date.parse(message.created_at)>600000)return {sent:0};
 const conversations=await rest('offrya_conversations?select=id,client_id,professional_id&id=eq.'+
  encodeURIComponent(message.conversation_id)+'&limit=1',{env,fetchImpl});
 const conversation=conversations?.[0];
 if(!conversation)return {sent:0};
 const recipient=message.sender_id===conversation.client_id?conversation.professional_id:
  message.sender_id===conversation.professional_id?conversation.client_id:null;
 if(!recipient||!UUID.test(recipient))return {sent:0};
 const subscriptions=await rest('offrya_push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.'+
  encodeURIComponent(recipient)+'&limit=25',{env,fetchImpl});
 if(!Array.isArray(subscriptions)||!subscriptions.length)return {sent:0};
 // Dynamically loaded, so test runners and disabled deployments need no push package.
 let webpush=pushClient;
 if(!webpush){const library=await import('web-push');webpush=library.default||library;}
 webpush.setVapidDetails('https://offrya.fr',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
 const payload=JSON.stringify({title:'OFFRYA',body:'Vous avez reçu un nouveau message.',url:'/espace/messagerie'});
 let sent=0;
 for(const item of subscriptions){
  if(!validSubscription({endpoint:item.endpoint,keys:{p256dh:item.p256dh,auth:item.auth}}))continue;
  try {
   await webpush.sendNotification({endpoint:item.endpoint,keys:{p256dh:item.p256dh,auth:item.auth}},
    payload,{TTL:3600,urgency:'high',topic:'offrya-messages'});
   sent++;
  }catch(error){
   if([404,410].includes(error.statusCode)){
    try{await rest('offrya_push_subscriptions?endpoint=eq.'+encodeURIComponent(item.endpoint),{
     env,fetchImpl,method:'DELETE'});
    }catch(_){}
   }else console.warn('OFFRYA: push provider unavailable',error.statusCode||'network');
  }
 }
 return {sent};
}
module.exports={configured,publicConfig,safeEndpoint,validSubscription,authUser,saveSubscription,removeSubscription,checkWebhook,dispatchMessage};
