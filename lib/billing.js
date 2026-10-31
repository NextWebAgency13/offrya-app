'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const {verifyProfessional}=require('./company');
const STRIPE_API='https://api.stripe.com/v1';
// Tarif public Live de lancement; la variable facultative OFFRYA_PRO_PRICE_ID permettra son remplacement.
const LIVE_LAUNCH_PRICE='price_1UWeKZ7WaxKMxAUvnyIgzOLy';
const LIVE_PRODUCT='prod_VXVVDHm0LH7POK';
function liveMode(env){return /^(?:sk|rk)_live_/.test(String(env.STRIPE_SECRET_KEY||''));}
function expectedPriceId(env){return liveMode(env)?(env.OFFRYA_PRO_PRICE_ID||LIVE_LAUNCH_PRICE):env.STRIPE_PRICE_ID;}
function billingEnabled(env=process.env){
 return env.OFFRYA_BILLING_ENABLED==='true' &&
  /^(?:sk|rk)_(?:test|live)_/.test(String(env.STRIPE_SECRET_KEY||'')) &&
  /^whsec_/.test(String(env.STRIPE_WEBHOOK_SECRET||'')) &&
  /^price_/.test(String(env.STRIPE_PRICE_ID||'')) &&
  /^https:\/\//.test(String(env.SITE_URL||'')) &&
  Boolean(env.SUPABASE_SECRET_KEY);
}
async function stripeCall(path,key,{method='GET',body}={},fetcher=fetch){
 const res=await fetcher(STRIPE_API+path,{method,headers:{
  Authorization:'Bearer '+key,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})
 },body:body?body.toString():undefined,signal:AbortSignal.timeout(13000)});
 if(!res.ok)throw new Error('Stripe indisponible, HTTP '+res.status);
 return res.json();
}
async function userSubscription(user,token,env=process.env,fetcher=fetch){
 const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:token,Accept:'application/json'};
 const res=await fetcher(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/offrya_premium_subscriptions?select=status,paid_through,stripe_customer_id&user_id=eq.'+encodeURIComponent(user),{headers,signal:AbortSignal.timeout(8500)});
 if(!res.ok)throw new Error('État abonnement indisponible');
 const rows=await res.json();
 if(!Array.isArray(rows))throw new Error('Données abonnement invalides');
 return rows[0]||null;
}
async function startCheckout(bearer,env=process.env,fetcher=fetch){
 if(!billingEnabled(env))return {status:503,error:'Abonnements non activés.'};
 const actor=await verifyProfessional(bearer,{url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY},fetcher);
 if(!actor.allowed)return {status:actor.status,error:actor.error};
 const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:bearer,Accept:'application/json'};
 const check=await fetcher(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/offrya_premium_requests?select=status&user_id=eq.'+encodeURIComponent(actor.userId),{headers,signal:AbortSignal.timeout(8500)});
 if(!check.ok)return {status:503,error:'Impossible de vérifier votre entreprise.'};
 const company=await check.json();
 if(!Array.isArray(company)||company[0]?.status!=='verified')return {status:403,error:'Entreprise non validée.'};
 const existing=await userSubscription(actor.userId,bearer,env,fetcher);
 if(existing?.status==='active'&&Date.parse(existing.paid_through||'')>Date.now())
  return {status:409,error:'Abonnement déjà actif.'};
 const selectedPrice=expectedPriceId(env);
 const price=await stripeCall('/prices/'+encodeURIComponent(selectedPrice),env.STRIPE_SECRET_KEY,{},fetcher);
 if(price.id!==selectedPrice||price.active!==true||price.currency!=='eur'||price.unit_amount!==3499||price.tax_behavior!=='inclusive'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||(liveMode(env)&&price.product!==LIVE_PRODUCT))
  return {status:503,error:'Le tarif Stripe doit être de 34,99 € TTC chaque mois.'};
 const params=new URLSearchParams({
  mode:'subscription',
  'line_items[0][price]':selectedPrice,
  'line_items[0][quantity]':'1',
  client_reference_id:actor.userId,
  'subscription_data[metadata][offrya_user_id]':actor.userId,
  success_url:env.SITE_URL.replace(/\/$/,'')+'/#boamp',
  cancel_url:env.SITE_URL.replace(/\/$/,'')+'/#boamp'
 });
 if(actor.email)params.set('customer_email',actor.email);
 // Reuse existing Stripe customer to avoid multiple subscriptions and enable portal.
 if(existing?.stripe_customer_id){
  params.delete('customer_email');params.set('customer',existing.stripe_customer_id);
 }
 const result=await stripeCall('/checkout/sessions',env.STRIPE_SECRET_KEY,{method:'POST',body:params},fetcher);
 if(typeof result.url!=='string'||!/^https:\/\/checkout\.stripe\.com\//.test(result.url))
  throw new Error('Session Stripe invalide');
 return {status:200,url:result.url};
}
function verifyStripeSignature(raw,header,secret,now=Date.now()){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||!/^whsec_/.test(String(secret||'')))return false;
 const parts=header.split(',').map(x=>x.trim());
 const t=parts.find(x=>/^t=\d+$/.test(x));
 const timestamp=t?Number(t.slice(2)):NaN;
 if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp*1000)>300000)return false;
 const expected=Buffer.from(createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex'),'hex');
 return parts.filter(x=>/^v1=[a-f0-9]{64}$/.test(x)).some(x=>timingSafeEqual(expected,Buffer.from(x.slice(3),'hex')));
}
async function syncSubscription(event,env=process.env,fetcher=fetch){
 const watched=new Set(['checkout.session.completed','invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted']);
 if(!watched.has(event.type))return {ignored:true};
 const obj=event.data?.object||{};
 let subId=event.type.startsWith('customer.subscription.')?obj.id:
  event.type==='checkout.session.completed'?obj.subscription:
  obj.subscription||obj.parent?.subscription_details?.subscription;
 if(!/^sub_[a-zA-Z0-9]+$/.test(String(subId||'')))return {ignored:true};
 // Use the current subscription state from Stripe rather than potentially stale webhook fields.
 const sub=await stripeCall('/subscriptions/'+encodeURIComponent(subId)+'?expand%5B%5D=latest_invoice',env.STRIPE_SECRET_KEY,{},fetcher);
 const uid=sub.metadata?.offrya_user_id;
 if(!/^[a-f0-9-]{36}$/i.test(String(uid||'')))return {ignored:true};
 const subPriceId=sub.items?.data?.[0]?.price?.id;
 if(!/^price_[a-zA-Z0-9]+$/.test(String(subPriceId||'')))return {ignored:true};
 if(liveMode(env)){
  // Les premiers abonnés à 34,99 € restent valides après une future hausse de tarif.
  const price=await stripeCall('/prices/'+encodeURIComponent(subPriceId),env.STRIPE_SECRET_KEY,{},fetcher);
  if(price.product!==LIVE_PRODUCT||price.currency!=='eur'||price.unit_amount<3499||price.tax_behavior!=='inclusive'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)return {ignored:true};
 }else if(subPriceId!==env.STRIPE_PRICE_ID)return {ignored:true};
 const period=sub.items?.data?.[0]?.current_period_end||sub.current_period_end;
 const invoice=sub.latest_invoice;
 const paid=invoice&&typeof invoice==='object'&&invoice.paid===true&&invoice.status==='paid';
 const good= sub.status==='active'&&paid&&Number.isSafeInteger(period)&&period*1000>Date.now();
 if(!sub.customer)throw Error('Stripe customer not present');
 const status=['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'].includes(sub.status)?sub.status:'inactive';
 const record={
  user_id:uid,
  stripe_customer_id:typeof sub.customer==='string'?sub.customer:sub.customer.id,
  stripe_subscription_id:subId,status,
  paid_through:good?new Date(period*1000).toISOString():null,
  last_checked_at:new Date().toISOString()
 };
 const response=await fetcher(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/offrya_premium_subscriptions?on_conflict=user_id',{
  method:'POST',
  headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
  body:JSON.stringify(record),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('Supabase subscription sync HTTP '+response.status);
 return {synced:true,active:good};
}
async function portal(bearer,env=process.env,fetcher=fetch){
 if(!billingEnabled(env))return {status:503,error:'Espace de facturation non actif.'};
 const actor=await verifyProfessional(bearer,{url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY},fetcher);
 if(!actor.allowed)return {status:actor.status,error:actor.error};
 const record=await userSubscription(actor.userId,bearer,env,fetcher);
 if(!/^cus_[a-zA-Z0-9]+$/.test(String(record?.stripe_customer_id||'')))return {status:404,error:'Aucun abonnement Stripe associé.'};
 const url=env.SITE_URL.replace(/\/$/,'')+'/#boamp';
 const res=await stripeCall('/billing_portal/sessions',env.STRIPE_SECRET_KEY,{
  method:'POST',body:new URLSearchParams({customer:record.stripe_customer_id,return_url:url})
 },fetcher);
 if(typeof res.url!=='string'||!/^https:\/\/billing\.stripe\.com\//.test(res.url))throw Error('Portail Stripe invalide');
 return {status:200,url:res.url};
}
module.exports={billingEnabled,stripeCall,verifyStripeSignature,startCheckout,syncSubscription,portal};
