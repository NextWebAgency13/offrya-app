'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHmac}=require('node:crypto'),{createServer}=require('node:http');
const {handle}=require('../server');
const {billingEnabled,verifyStripeSignature,syncSubscription}=require('../lib/billing');
test('Paiement explicitement désactivé par défaut',async()=>{
 assert.equal(billingEnabled({}),false);
 const server=createServer(handle);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  for(const ep of ['/api/billing/checkout','/api/billing/portal','/api/billing/webhook']){
   const r=await fetch('http://127.0.0.1:'+server.address().port+ep,{method:'POST'});
   assert.equal(r.status,503,ep);
  }
 }finally{await new Promise(ok=>server.close(ok));}
});
test('Webhook Stripe: HMAC SHA256 et tolérance 5 minutes',()=>{
 const secret='whsec_testsecret',raw=Buffer.from('{"id":"evt_test"}');
 const t=Math.floor(Date.now()/1000);
 const signed=createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');
 assert.equal(verifyStripeSignature(raw,'t='+t+',v1='+signed,secret),true);
 assert.equal(verifyStripeSignature(raw,'t='+t+',v1='+('0'.repeat(64)),secret),false);
 assert.equal(verifyStripeSignature(raw,'t='+(t-900)+',v1='+signed,secret),false);
});
test('Webhook Stripe valide synchronise un abonnement payé uniquement',async()=>{
 const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';let body;
 const f=async (url,o)=>{
  if(url.includes('/subscriptions/'))return {ok:true,json:async()=>({
   status:'active',metadata:{offrya_user_id:uid},customer:'cus_example',
   items:{data:[{price:{id:'price_example'},current_period_end:Math.floor(Date.now()/1000)+86400}]},
   latest_invoice:{paid:true,status:'paid'}
  })};
  if(url.includes('/rest/v1/offrya_premium_subscriptions')){body=JSON.parse(o.body);return {ok:true};}
  throw Error('Unexpected '+url);
 };
 const result=await syncSubscription({type:'invoice.paid',data:{object:{subscription:'sub_example'}}},{
  STRIPE_PRICE_ID:'price_example',STRIPE_SECRET_KEY:'sk_test_fake',
  SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fake'
 },f);
 assert.equal(result.active,true);assert.equal(body.status,'active');
 assert.ok(new Date(body.paid_through)>new Date());
});

test('La facturation accepte le mode Stripe test ou live avec activation explicite',()=>{
 const env={STRIPE_WEBHOOK_SECRET:'whsec_test',STRIPE_PRICE_ID:'price_example',SITE_URL:'https://offrya-app.onrender.com',SUPABASE_SECRET_KEY:'secret'};
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'false',STRIPE_SECRET_KEY:'sk_live_sample'}),false);
 assert.equal(billingEnabled({...env,STRIPE_SECRET_KEY:'sk_live_sample'}),false);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_sample'}),true);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'false',STRIPE_SECRET_KEY:'rk_live_restricted'}),false);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'rk_live_restricted'}),true);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'rk_test_restricted'}),true);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'pk_live_public'}),false);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_sample'}),true);
 assert.equal(billingEnabled({...env,OFFRYA_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'not_a_stripe_key'}),false);
});
