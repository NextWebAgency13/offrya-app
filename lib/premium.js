'use strict';
// Fail closed: the browser cannot elevate its role or entitlement.
function parseBearer(v){
 if(typeof v!=='string'||v.length>4100)return null;
 const m=/^Bearer ([A-Za-z0-9_.\-]+)$/.exec(v);
 return m&&m[1].split('.').length===3?m[1]:null;
}
function deny(status,error){return {allowed:false,status,error};}
async function verifyPremiumAccess(header,env={},fetcher=fetch){
 const jwt=parseBearer(header);
 if(!jwt)return deny(401,'Connexion professionnelle requise.');
 const base=String(env.url||'').replace(/\/$/,'');
 const key=env.key;
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
   return deny(503,'Service de contrôle professionnel indisponible.');
 const h={apikey:key,Authorization:'Bearer '+jwt,Accept:'application/json'};
 const auth=await fetcher(base+'/auth/v1/user',{headers:h,signal:AbortSignal.timeout(8000)});
 if(!auth.ok)return deny(401,'Session invalide ou expirée.');
 const user=await auth.json();
 if(!/^[0-9a-f-]{36}$/i.test(String(user.id||'')))return deny(401,'Compte introuvable.');
 if(user.is_anonymous===true)return deny(403,'Un compte professionnel identifié est nécessaire.');
 const id=encodeURIComponent(user.id);
 const [profile,rights,subscriptions]=await Promise.all([
  fetcher(base+'/rest/v1/offrya_profiles?select=role&id=eq.'+id,{headers:h,signal:AbortSignal.timeout(8000)}),
  fetcher(base+'/rest/v1/offrya_premium_requests?select=status,premium_until,identity_status,authority_status,representative_kind,registry_name_matched&user_id=eq.'+id,{headers:h,signal:AbortSignal.timeout(8000)}),
  fetcher(base+'/rest/v1/offrya_premium_subscriptions?select=status,paid_through&user_id=eq.'+id,{headers:h,signal:AbortSignal.timeout(8000)})
 ]);
 if(!profile.ok||!rights.ok||!subscriptions.ok)return deny(503,'Impossible de vérifier les droits professionnels.');
 const [p,a,s]=await Promise.all([profile.json(),rights.json(),subscriptions.json()]);
 if(!Array.isArray(p)||!Array.isArray(a)||!Array.isArray(s))return deny(503,'Droits professionnels invalides.');
 if(p[0]?.role!=='pro')return deny(403,'Compte professionnel requis.');
 if(a[0]?.status!=='verified'||a[0]?.identity_status!=='verified'||a[0]?.authority_status!=='verified'||a[0]?.representative_kind!=='dirigeant'||a[0]?.registry_name_matched!==true||s[0]?.status!=='active'||!(Date.parse(s[0]?.paid_through||'')>Date.now()))
   return deny(403,'Vérification professionnelle et abonnement actif requis.');
 return {allowed:true,status:200};
}
module.exports={parseBearer,verifyPremiumAccess};
