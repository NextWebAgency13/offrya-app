'use strict';
// Exécuté par le cron serveur/GitHub. Les notifications dans le site sont gérées
// directement par le trigger PostgreSQL ; l'e-mail reste strictement opt-in.
const {createHash}=require('node:crypto');
const {signToken}=require('../lib/unsubscribe');
const clean=s=>String(s??'').slice(0,250);
const html=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ready(env=process.env){return ['SUPABASE_URL','SUPABASE_SECRET_KEY','RESEND_API_KEY','EMAIL_FROM','SITE_URL','UNSUBSCRIBE_SECRET'].every(k=>Boolean(env[k]))
 && /^https:\/\//.test(env.SUPABASE_URL)&&/^https:\/\//.test(env.SITE_URL)&&env.UNSUBSCRIBE_SECRET.length>=32;}
async function rest(base,key,path,method='GET',body){
 const r=await fetch(base.replace(/\/$/,'')+'/rest/v1/'+path,{
  method,headers:{apikey:key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)
 });
 if(!r.ok)throw Error('Supabase alert worker HTTP '+r.status+' ('+path.split('?')[0]+')');
 return r.status===204?[]:r.json().catch(()=>[]);
}
function permitted(prefs,mission,alert,uid){
 return Boolean(alert.email_eligible&&prefs?.missions_enabled&&prefs.missions_consented_at
  &&Date.parse(prefs.missions_consented_at)<=Date.parse(alert.created_at)
  &&mission?.status==='open'&&mission.owner_id!==uid
  &&(!prefs.category||prefs.category===mission.category)
  &&(!prefs.department||prefs.department===mission.department));
}
function emailTemplate({mission,siteUrl,token}){
 const destination=siteUrl.replace(/\/$/,'')+'/#missions';
 const stop=siteUrl.replace(/\/$/,'')+'/api/unsubscribe?token='+encodeURIComponent(token);
 return {
  subject:'OFFRYA Premium — nouvelle mission : '+clean(mission.category)+' · '+clean(mission.department),
  html:`<div style="font:15px Arial,sans-serif;max-width:610px;color:#26304a">
   <h1>OFFRYA Premium</h1><p>Une nouvelle mission correspondant à vos critères vient d'être publiée.</p>
   <h2>${html(mission.title)}</h2>
   <p>${html(mission.category)} · ${html(mission.city)} (${html(mission.department)})</p>
   <p><a href="${html(destination)}">Consulter les missions sur OFFRYA</a></p>
   <hr><p style="font-size:12px;color:#777">Alerte de service envoyée parce que vous avez activé les alertes de missions.
   Aucune obligation de répondre. <a href="${html(stop)}">Se désabonner</a> ·
   <a href="${html(siteUrl.replace(/\/$/,'')+'/#settings')}">Gérer les préférences</a>.</p>
   </div>`,
  unsubscribeUrl:stop
 };
}
async function sendPriorityAlerts(env=process.env){
 if(!ready(env)){console.log('OFFRYA Priority: envoi e-mail désactivé (configuration Resend / Supabase absente).');return {sent:0,skipped:0,disabled:true};}
 const {SUPABASE_URL:base,SUPABASE_SECRET_KEY:key,RESEND_API_KEY:resend,EMAIL_FROM:from,SITE_URL:siteUrl,UNSUBSCRIBE_SECRET:secret}=env;
 const since=new Date(Date.now()-72*3600000).toISOString();
 const queue=await rest(base,key,'offrya_priority_alerts?select=id,recipient_id,mission_id,created_at,email_eligible,emailed_at&email_eligible=eq.true&emailed_at=is.null&created_at=gte.'+encodeURIComponent(since)+'&order=created_at.asc&limit=100');
 let sent=0,skipped=0;
 for(const a of queue){
  const uid=a.recipient_id;
  try{
   const [prefRows,missionRows,profileRows,requestRows,subscriptionRows]=await Promise.all([
    rest(base,key,'offrya_alert_preferences?select=missions_enabled,missions_consented_at,category,department&user_id=eq.'+uid),
    rest(base,key,'offrya_missions?select=id,owner_id,title,category,city,department,status&id=eq.'+a.mission_id),
    rest(base,key,'offrya_profiles?select=role&id=eq.'+uid),
    rest(base,key,'offrya_premium_requests?select=status,premium_until&user_id=eq.'+uid),
    rest(base,key,'offrya_premium_subscriptions?select=status,paid_through&user_id=eq.'+uid)
   ]);
   const prefs=prefRows[0],mission=missionRows[0],p=profileRows[0],req=requestRows[0],sub=subscriptionRows[0];
   const paid=sub?.status==='active'&&Date.parse(sub.paid_through||'')>Date.now();
   const beta=Date.parse(req?.premium_until||'')>Date.now();
   if(!permitted(prefs,mission,a,uid)||p?.role!=='pro'||req?.status!=='verified'||!(paid||beta)){skipped++;continue;}
   const response=await fetch(base.replace(/\/$/,'')+'/auth/v1/admin/users/'+uid,{headers:{apikey:key},signal:AbortSignal.timeout(12000)});
   if(!response.ok){skipped++;continue;}
   const user=await response.json();
   if(!user?.email||!user.email_confirmed_at){skipped++;continue;}
   const body=emailTemplate({mission,siteUrl,token:signToken(uid,secret)});
   const idempotency='offrya-priority-'+createHash('sha256').update(uid+':'+a.mission_id).digest('hex').slice(0,44);
   const result=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json','Idempotency-Key':idempotency},
    body:JSON.stringify({from,to:[user.email],subject:body.subject,html:body.html,headers:{'List-Unsubscribe':'<'+body.unsubscribeUrl+'>'}})
   });
   if(!result.ok)throw Error('Resend HTTP '+result.status);
   await rest(base,key,'offrya_priority_alerts?id=eq.'+a.id,'PATCH',{emailed_at:new Date().toISOString()});
   sent++;
  }catch(err){console.error('Priority alert '+a.id+': '+err.message);skipped++;}
 }
 console.log(JSON.stringify({sent,skipped,queued:queue.length}));
 return {sent,skipped};
}
if(require.main===module)sendPriorityAlerts().catch(e=>{console.error('OFFRYA Priority:',e.message);process.exitCode=1});
module.exports={ready,permitted,emailTemplate,sendPriorityAlerts};
