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
 if(!jwt)return deny(401,'Connexion requise pour accéder à OFFRYA Premium.');
 const base=String(env.url||'').replace(/\/$/,'');
 const key=env.key;
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
   return deny(503,'Service de contrôle Premium indisponible.');
 const h={apikey:key,Authorization:'Bearer '+jwt,Accept:'application/json'};
 const auth=await fetcher(base+'/auth/v1/user',{headers:h,signal:AbortSignal.timeout(8000)});
 if(!auth.ok)return deny(401,'Session invalide ou expirée.');
 const user=await auth.json();
 if(!/^[0-9a-f-]{36}$/i.test(String(user.id||'')))return deny(401,'Compte introuvable.');
 const id=encodeURIComponent(user.id);
 const [profile,rights]=await Promise.all([
  fetcher(base+'/rest/v1/offrya_profiles?select=role&id=eq.'+id,{headers:h,signal:AbortSignal.timeout(8000)}),
  fetcher(base+'/rest/v1/offrya_premium_requests?select=status,premium_until&user_id=eq.'+id,{headers:h,signal:AbortSignal.timeout(8000)})
 ]);
 if(!profile.ok||!rights.ok)return deny(503,'Impossible de vérifier les droits Premium.');
 const [p,a]=await Promise.all([profile.json(),rights.json()]);
 if(!Array.isArray(p)||!Array.isArray(a))return deny(503,'Droits Premium invalides.');
 if(p[0]?.role!=='pro')return deny(403,'Accès réservé aux professionnels.');
 if(a[0]?.status!=='verified'||!(Date.parse(a[0]?.premium_until)>Date.now()))
   return deny(403,'Votre accès Premium est inactif ou votre entreprise reste à vérifier.');
 return {allowed:true,status:200};
}
module.exports={parseBearer,verifyPremiumAccess};
