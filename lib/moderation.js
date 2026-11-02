'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function adminIds(env){return new Set(String(env.OFFRYA_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(x=>UUID.test(x)));}
async function verifyAdmin(header,env=process.env,fetcher=fetch){
 const ids=adminIds(env);
 if(!ids.size||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SECRET_KEY)return {allowed:false,status:503,error:'Back-office non configuré.'};
 const jwt=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(String(header||''))?.[1];
 if(!jwt||jwt.split('.').length!==3)return {allowed:false,status:401,error:'Connexion requise.'};
 const url=env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/user';
 const response=await fetcher(url,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+jwt},signal:AbortSignal.timeout(8000)});
 if(!response.ok)return {allowed:false,status:401,error:'Session invalide.'};
 const user=await response.json();
 if(!ids.has(user.id)||user.is_anonymous||!user.email_confirmed_at)return {allowed:false,status:403,error:'Accès réservé à la modération OFFRYA.'};
 return {allowed:true,status:200,adminId:user.id};
}
async function queryData(resource,env=process.env,fetcher=fetch,{method='GET',body}={}){
 const base=env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/';
 const r=await fetcher(base+resource,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,
  Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,Accept:'application/json',
  ...(body?{'Content-Type':'application/json',Prefer:'return=representation'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Modération indisponible (HTTP '+r.status+').');
 return r.status===204?[]:r.json();
}
async function overview(env=process.env,fetcher=fetch){
 const [reports,missions,dossiers,manualRequests]=await Promise.all([
  queryData('offrya_reports?select=id,target_type,target_id,reason,details,status,created_at&order=created_at.desc&limit=70',env,fetcher),
  queryData('offrya_missions?select=id,title,category,city,department,status,created_at&order=created_at.desc&limit=70',env,fetcher),
  queryData('offrya_premium_requests?select=user_id,status,legal_name,siret,identity_status,authority_status,representative_kind,registry_name_matched&order=requested_at.desc&limit=70',env,fetcher),
  queryData('offrya_manual_identity_requests?select=user_id,status,requested_at&order=requested_at.desc&limit=70',env,fetcher)
 ]);
 const manualStatus=new Map(manualRequests.map(x=>[x.user_id,x.status]));
 return {reports,missions,dossiers:dossiers.map(x=>({...x,manual_request_status:manualStatus.get(x.user_id)||null}))};
}
async function moderationAction(payload,adminId,env=process.env,fetcher=fetch){
 const kind=payload?.kind,action=payload?.action,id=payload?.id;
 if(!UUID.test(String(id||'')))return {status:400,error:'Identifiant invalide.'};
 let table,filter,updates;
 if(kind==='report'&&['reviewing','closed'].includes(action)){
  table='offrya_reports';filter='id';updates={status:action};
 }else if(kind==='mission'&&action==='close'){
  table='offrya_missions';filter='id';updates={status:'closed',closed_at:new Date().toISOString()};
 }else if(kind==='dossier'&&action==='needs_information'){
  // Ne jamais approuver un compte Pro depuis le back-office.
  table='offrya_manual_identity_requests';filter='user_id';updates={status:'needs_information'};
 }else return {status:400,error:'Action non autorisée.'};
 // Journaliser avant action : si l'audit est indisponible, ne rien modifier.
 const audit=await queryData('offrya_moderation_audit',env,fetcher,{method:'POST',
  body:{actor_id:adminId,target_type:kind,target_id:id,action}});
 if(!Array.isArray(audit)||!audit[0]?.id)throw Error('Écriture de journal impossible.');
 const updated=await queryData(table+'?'+filter+'=eq.'+encodeURIComponent(id)+'&select='+filter,env,fetcher,
  {method:'PATCH',body:updates});
 if(!Array.isArray(updated)||!updated.length)throw Error('Enregistrement absent ou action non appliquée.');
 return {status:200,updated:true};
}
module.exports={verifyAdmin,overview,moderationAction,adminIds};
