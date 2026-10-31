'use strict';
const {stripeCall,verifyStripeSignature}=require('./billing');
const {verifyProfessional}=require('./company');
const IDENTITY_EVENTS=new Set([
 'identity.verification_session.verified',
 'identity.verification_session.requires_input',
 'identity.verification_session.redacted',
 'identity.verification_session.canceled'
]);
function configured(env=process.env){
 return /^https:\/\//.test(String(env.SITE_URL||'')) &&
 /^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(String(env.SUPABASE_URL||'')) &&
 Boolean(env.SUPABASE_SECRET_KEY&&env.SUPABASE_PUBLISHABLE_KEY) &&
 /^sk_(?:test|live)_/.test(String(env.STRIPE_SECRET_KEY||'')) &&
 /^whsec_/.test(String(env.STRIPE_IDENTITY_WEBHOOK_SECRET||''));
}
const adminHeaders=env=>({apikey:env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,Accept:'application/json'});
async function dbRows(env,table,query,fetcher=fetch){
 const response=await fetcher(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+table+'?'+query,{
  headers:adminHeaders(env),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw Error('Identity storage read HTTP '+response.status);
 const rows=await response.json();
 if(!Array.isArray(rows))throw Error('Invalid identity storage response');
 return rows;
}
async function dbPatch(env,query,record,fetcher=fetch){
 const response=await fetcher(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/offrya_premium_requests?'+query,{
  method:'PATCH',headers:{...adminHeaders(env),'Content-Type':'application/json',Prefer:'return=minimal'},
  body:JSON.stringify(record),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw Error('Identity storage update HTTP '+response.status);
}
function officialVerificationUrl(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&url.hostname==='verify.stripe.com'?url.href:null;
 }catch{return null;}
}
async function beginIdentity(header,env=process.env,fetcher=fetch){
 if(!configured(env))return {status:503,error:'Contrôle d’identité en ligne indisponible. Contactez le support pour une alternative sécurisée.'};
 const actor=await verifyProfessional(header,{url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY},fetcher);
 if(!actor.allowed)return {status:actor.status,error:actor.error};
 if(actor.aal!=='aal2')return {status:403,error:'Activez la double authentification avant la vérification d’identité.'};
 const rows=await dbRows(env,'offrya_premium_requests',
  'select=user_id,siret,status,identity_status,stripe_identity_session_id&user_id=eq.'+encodeURIComponent(actor.userId),fetcher);
 const row=rows[0];
 if(!row||row.status!=='pending')return {status:403,error:'Déposez un dossier professionnel en attente avant le contrôle d’identité.'};
 if(row.identity_status==='verified')return {status:409,error:'Votre identité a déjà été vérifiée.'};
 const existing=row.stripe_identity_session_id;
 if(/^vs_[a-zA-Z0-9]+$/.test(String(existing||''))){
  const current=await stripeCall('/identity/verification_sessions/'+encodeURIComponent(existing),env.STRIPE_SECRET_KEY,{},fetcher);
  if(current.client_reference_id===actor.userId&&['requires_input','processing'].includes(current.status)){
   const link=officialVerificationUrl(current.url);
   if(link)return {status:200,url:link};
   if(current.status==='processing')return {status:202,error:'La vérification est en cours de traitement.'};
  }
 }
 const params=new URLSearchParams({
  type:'document',
  client_reference_id:actor.userId,
  'metadata[offrya_siret]':row.siret,
  return_url:env.SITE_URL.replace(/\/$/,'')+'/#boamp'
 });
 if(env.OFFRYA_IDENTITY_SELFIE_ENABLED==='true')params.set('options[document][require_matching_selfie]','true');
 const session=await stripeCall('/identity/verification_sessions',env.STRIPE_SECRET_KEY,{method:'POST',body:params},fetcher);
 const url=officialVerificationUrl(session.url);
 if(!/^vs_[a-zA-Z0-9]+$/.test(String(session.id||''))||!url||session.client_reference_id!==actor.userId)
  throw Error('Invalid Stripe Identity session');
 await dbPatch(env,'user_id=eq.'+encodeURIComponent(actor.userId)+'&status=eq.pending',{
  stripe_identity_session_id:session.id,identity_status:'processing',identity_verified_at:null,
  identity_live_verified:false,presence_method:null,presence_verified_at:null,presence_reviewed_by:null
 },fetcher);
 return {status:200,url};
}
async function processIdentityEvent(event,env=process.env,fetcher=fetch){
 if(!configured(env))throw Error('Stripe Identity not configured');
 if(!IDENTITY_EVENTS.has(event?.type))return {ignored:true};
 const sessionId=event.data?.object?.id;
 if(!/^vs_[a-zA-Z0-9]+$/.test(String(sessionId||'')))return {ignored:true};
 // Always fetch the most recent Stripe state: webhook delivery may be out of order.
 const session=await stripeCall('/identity/verification_sessions/'+encodeURIComponent(sessionId),env.STRIPE_SECRET_KEY,{},fetcher);
 if(session.id!==sessionId||session.type!=='document')throw Error('Unexpected Stripe Identity session');
 if(session.livemode!==env.STRIPE_SECRET_KEY.startsWith('sk_live_'))throw Error('Stripe Identity environment mismatch');
 const userId=String(session.client_reference_id||'');
 if(!/^[a-f0-9-]{36}$/i.test(userId))return {ignored:true};
 const rows=await dbRows(env,'offrya_premium_requests','select=siret,status,stripe_identity_session_id&user_id=eq.'+encodeURIComponent(userId),fetcher);
 const row=rows[0];
 if(!row||row.stripe_identity_session_id!==sessionId||session.metadata?.offrya_siret!==row.siret)return {ignored:true};
 const map={verified:'verified',requires_input:'requires_input',redacted:'redacted',canceled:'redacted',processing:'processing'};
 const status=map[session.status];
 if(!status)return {ignored:true};
 const liveVerified=status==='verified'&&session.livemode===true;
 const record={
  identity_status:status,
  identity_verified_at:liveVerified?new Date().toISOString():null,
  identity_live_verified:liveVerified
 };
 if(liveVerified&&session.options?.document?.require_matching_selfie===true){
  record.presence_method='stripe_selfie';
  record.presence_verified_at=new Date().toISOString();
  record.presence_reviewed_by=null;
 }
 if(!liveVerified){
  record.presence_method=null;
  record.presence_verified_at=null;
  record.presence_reviewed_by=null;
 }
 if(!liveVerified&&row.status==='verified'){
  // Revoke approved profile after Stripe revocation, redaction or stale test identity.
  record.status='pending';
  record.authority_status='pending';
  record.authority_verified_at=null;
  record.authority_review_method=null;
  record.authority_reviewed_by=null;
 }
 await dbPatch(env,'user_id=eq.'+encodeURIComponent(userId)+'&stripe_identity_session_id=eq.'+encodeURIComponent(sessionId),record,fetcher);
 return {updated:true,identity_status:status};
}
module.exports={configured,officialVerificationUrl,beginIdentity,processIdentityEvent,IDENTITY_EVENTS,verifyStripeSignature};
