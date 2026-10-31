'use strict';
// Lancez avec un ordonnanceur (GitHub Actions ou cron), jamais depuis le navigateur.
// Aucun envoi si la configuration / le consentement manque.
const {signToken}=require('../lib/unsubscribe');
const {createHash}=require('node:crypto');
const trim=(s,n=160)=>String(s??'').slice(0,n);
const esc=s=>trim(s,1500).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function matchMission(pref,mission,uid){return Boolean(pref.missions_enabled && mission.owner_id!==uid && mission.status==='open' && (!pref.department || mission.department===pref.department) && (!pref.category||mission.category===pref.category));}
function inboxMessages(uid,pref,conversations,messages){if(!pref.messages_enabled)return [];
 const ids=new Set(conversations.filter(c=>c.client_id===uid||c.professional_id===uid).map(c=>c.id));
 return messages.filter(m=>m.sender_id!==uid&&ids.has(m.conversation_id));}
function buildDigest({missions,messages,siteUrl,token}){
 const link=siteUrl.replace(/\/$/,'')+'/api/unsubscribe?token='+encodeURIComponent(token);
 const mLines=missions.slice(0,10).map(m=>`<li><strong>${esc(m.title)}</strong> — ${esc(m.city)} (${esc(m.department)})</li>`).join('');
 const messageText=messages.length?`<p>Vous avez ${messages.length} nouveau(x) message(s) dans votre espace OFFRYA.</p>`:'';
 return {
  subject:`OFFRYA — ${missions.length} nouvelle(s) mission(s), ${messages.length} message(s)`,
  html:`<div style="font-family:Arial,sans-serif;max-width:650px;color:#153027"><h1>OFFRYA • Votre récapitulatif</h1>${missions.length?`<h2>Nouvelles missions correspondantes</h2><ul>${mLines}</ul>`:''}${messageText}<p><a href="${esc(siteUrl)}">Voir mon espace OFFRYA</a></p><hr><p style="font-size:12px;color:#52685f">Vous recevez cet e-mail parce que vous avez activé les alertes dans votre compte OFFRYA. Ce message ne contient aucune offre promotionnelle.</p><p><a href="${esc(link)}">Me désabonner de toutes les alertes</a> · <a href="${esc(siteUrl)}/#settings">Préférences</a></p></div>`,
  link
 };
}
function restHeaders(secret,extra={}){return {apikey:secret,Accept:'application/json',...extra};}
async function rest(url,secret,table,query='',method='GET',data,extra={}){
 const endpoint=`${url.replace(/\/$/,'')}/rest/v1/${table}${query}`;
 const res=await fetch(endpoint,{method,headers:restHeaders(secret,{'Content-Type':'application/json',...extra}),body:data?JSON.stringify(data):undefined});
 if(!res.ok){const body=await res.text();throw Error(`${table} HTTP ${res.status}: ${body.slice(0,250)}`);}
 const raw=await res.text();return raw?JSON.parse(raw):[];
}
async function sendDailyAlerts(){
 const {SUPABASE_URL:url,SUPABASE_SECRET_KEY:secret,RESEND_API_KEY:resend,EMAIL_FROM:from,SITE_URL:siteUrl,UNSUBSCRIBE_SECRET:unsub}=process.env;
 if(!url||!secret||!resend||!from||!siteUrl||!unsub||unsub.length<32)throw Error('Configuration e-mail incomplète : aucun e-mail envoyé');
 if(!/^https:\/\//.test(url)||!/^https:\/\//.test(siteUrl))throw Error('HTTPS requis');
 const since=new Date(Date.now()-36*3600*1000).toISOString();
 const prefs=await rest(url,secret,'offrya_alert_preferences','?select=*&or=(missions_enabled.eq.true,messages_enabled.eq.true)&limit=500');
 const missions=await rest(url,secret,'offrya_missions',`?select=id,owner_id,title,city,department,category,status,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1000`);
 const [profiles,checks,subscriptions]=await Promise.all([
  rest(url,secret,'offrya_profiles','?select=id,role&role=eq.pro&limit=5000'),
  rest(url,secret,'offrya_premium_requests','?select=user_id,status,identity_status,authority_status,representative_kind,registry_name_matched&status=eq.verified&limit=5000'),
  rest(url,secret,'offrya_premium_subscriptions','?select=user_id,status,paid_through&status=eq.active&limit=5000')
 ]);
 const professionals=new Set(profiles.map(p=>p.id));
 const verified=new Set(checks.filter(p=>p.identity_status==='verified'&&p.authority_status==='verified'&&p.representative_kind==='dirigeant'&&p.registry_name_matched===true).map(p=>p.user_id));
 const active=new Set(subscriptions.filter(s=>Date.parse(s.paid_through||'')>Date.now()).map(s=>s.user_id));
 const entitled=id=>professionals.has(id)&&verified.has(id)&&active.has(id);
 const messages=await rest(url,secret,'offrya_messages',`?select=id,conversation_id,sender_id,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1000`);
 const convs=await rest(url,secret,'offrya_conversations','?select=id,client_id,professional_id&limit=2000');
 // Évite le doublon : une mission annoncée en priorité ne repart pas dans le digest quotidien.
 const prioritySent=await rest(url,secret,'offrya_priority_alerts',
  '?select=recipient_id,mission_id&emailed_at=not.is.null&created_at=gte.'+encodeURIComponent(since)+'&limit=5000');
 const delivered=new Set(prioritySent.map(a=>a.recipient_id+':'+a.mission_id));
 const day=new Date().toISOString().slice(0,10);let sent=0,skipped=0;
 for(const pref of prefs){
  const uid=pref.user_id;
  const subset=entitled(uid)?missions.filter(m=>matchMission(pref,m,uid)&&!delivered.has(uid+':'+m.id)):[],unread=inboxMessages(uid,pref,convs,messages);
  if(!subset.length&&!unread.length){skipped++;continue;}
  // Create daily unique lock. Only retry an old pending attempt; Resend idempotency key prevents doubles.
  const query=`?user_id=eq.${uid}&digest_day=eq.${day}&select=status,created_at`;
  const existing=await rest(url,secret,'offrya_digest_runs',query);
  if(existing[0]?.status==='sent'||(existing.length&&Date.now()-new Date(existing[0].created_at).getTime()<30*60000)){skipped++;continue;}
  if(!existing.length){try{await rest(url,secret,'offrya_digest_runs','','POST',{user_id:uid,digest_day:day,status:'pending'},{Prefer:'return=minimal'});}catch(e){if(!e.message.includes('23505'))throw e;skipped++;continue;}}
  const nowPrefs=await rest(url,secret,'offrya_alert_preferences',`?user_id=eq.${uid}&select=missions_enabled,messages_enabled,department,category`);
  if(!nowPrefs[0]||(!nowPrefs[0].missions_enabled&&!nowPrefs[0].messages_enabled)){skipped++;continue;}
  const checkNow=await Promise.all([
   rest(url,secret,'offrya_profiles','?select=role&id=eq.'+uid),
   rest(url,secret,'offrya_premium_requests','?select=status,identity_status,authority_status,representative_kind,registry_name_matched&user_id=eq.'+uid),
   rest(url,secret,'offrya_premium_subscriptions','?select=status,paid_through&user_id=eq.'+uid)
  ]);
  const authorized=checkNow[0][0]?.role==='pro'&&checkNow[1][0]?.status==='verified'&&checkNow[1][0]?.identity_status==='verified'&&checkNow[1][0]?.authority_status==='verified'&&checkNow[1][0]?.representative_kind==='dirigeant'&&checkNow[1][0]?.registry_name_matched===true&&checkNow[2][0]?.status==='active'&&Date.parse(checkNow[2][0]?.paid_through||'')>Date.now();
  const actualMissions=authorized?subset.filter(m=>matchMission(nowPrefs[0],m,uid)):[];
  const actualMessages=nowPrefs[0].messages_enabled?unread:[];
  if(!actualMissions.length&&!actualMessages.length){skipped++;continue;}
  const userRes=await fetch(`${url.replace(/\/$/,'')}/auth/v1/admin/users/${uid}`,{headers:restHeaders(secret)});
  if(!userRes.ok){skipped++;continue;}
  const user=await userRes.json();if(!user.email||!user.email_confirmed_at){skipped++;continue;}
  const token=signToken(uid,unsub);
  const digest=buildDigest({missions:actualMissions,messages:actualMessages,siteUrl,token});
  const idempotency='offrya-'+createHash('sha256').update(uid+day).digest('hex').slice(0,45);
  const sendResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json','Idempotency-Key':idempotency},body:JSON.stringify({from,to:[user.email],subject:digest.subject,html:digest.html,headers:{'List-Unsubscribe':`<${digest.link}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}})});
  if(!sendResponse.ok)throw Error('Resend erreur '+sendResponse.status+': '+(await sendResponse.text()).slice(0,140));
  await rest(url,secret,'offrya_digest_runs',query,'PATCH',{status:'sent',sent_at:new Date().toISOString()},{Prefer:'return=minimal'});
  sent++;
 }
 console.log(JSON.stringify({sent,skipped,total:prefs.length}));
 return {sent,skipped};
}
if(require.main===module)sendDailyAlerts().catch(e=>{console.error('Échec envoi des alertes:',e.message);process.exitCode=1;});
module.exports={matchMission,inboxMessages,buildDigest,sendDailyAlerts};
