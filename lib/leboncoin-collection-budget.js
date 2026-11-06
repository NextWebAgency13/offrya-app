'use strict';
// Réservations atomiques des accès Leboncoin entre tous les collecteurs OFFRYA.
// Doit refuser l'accès en cas de base indisponible ; aucun compteur local volatil.
const MAX_REQUESTS_PER_RUN=6;
const MIN_REQUEST_GAP_MS=5500;
const SOURCE_WINDOW_HOURS=4;
const MAX_REQUESTS_PER_DAY=20;
const MAX_REQUESTS_PER_MONTH=300;
async function reserveBudget(env=process.env,kind,{fetcher=fetch}={}){
 if(!['run','request'].includes(kind))throw Error('Type de budget inconnu.');
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const secret=String(env.SUPABASE_SECRET_KEY||'').trim();
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!secret)
  throw Error('Quota centralisé indisponible : Supabase service_role requis.');
 let response;
 try{
  response=await fetcher(base+'/rest/v1/rpc/offrya_claim_leboncoin_budget',{
   method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},
   body:JSON.stringify({p_kind:kind}),signal:AbortSignal.timeout(12000)
  });
 }catch{throw Error('Quota centralisé injoignable : collecte arrêtée.');}
 if(!response.ok)throw Error('Quota centralisé indisponible (HTTP '+response.status+').');
 let accepted;
 try{accepted=await response.json();}catch{throw Error('Quota centralisé : réponse invalide.');}
 if(accepted!==true)throw Error('Quota de collecte, délai minimal ou plage horaire atteint.');
 return true;
}
module.exports={MAX_REQUESTS_PER_RUN,MIN_REQUEST_GAP_MS,SOURCE_WINDOW_HOURS,
 MAX_REQUESTS_PER_DAY,MAX_REQUESTS_PER_MONTH,reserveBudget};
