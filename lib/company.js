'use strict';
const API='https://recherche-entreprises.api.gouv.fr/search';
function validSiret(siret){return /^[0-9]{14}$/.test(String(siret||''));}
async function lookupCompany(siret,fetcher=fetch){
 if(!validSiret(siret))return {ok:false,reason:'Le SIRET doit comporter 14 chiffres.',status:400};
 const url=new URL(API);url.searchParams.set('q',siret);url.searchParams.set('per_page','5');
 const res=await fetcher(url.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8500)});
 if(!res.ok)throw Error('Registre officiel indisponible (HTTP '+res.status+')');
 const data=await res.json();
 if(!Array.isArray(data.results))throw Error('Réponse du registre officiel invalide');
 const found=data.results.find(x=>x.siege?.siret===siret || x.matching_etablissements?.some(e=>e.siret===siret));
 if(!found)return {ok:false,status:404,reason:'Aucun établissement correspondant à ce SIRET dans les données publiques.'};
 const establishment=[found.siege,...(found.matching_etablissements||[])].find(x=>x?.siret===siret);
 if(found.etat_administratif!=='A'||establishment?.etat_administratif!=='A')
  return {ok:false,status:422,reason:'Cet établissement est signalé comme fermé ou inactif.'};
 const legalName=String(found.nom_raison_sociale||found.nom_complet||'').trim();
 if(!legalName)return {ok:false,status:422,reason:'Nom légal non fourni par le registre.'};
 return {ok:true,status:200,company:{
  siret,siren:found.siren,legal_name:legalName,
  activity_code:String(establishment.activite_principale||''),
  establishment_city:String(establishment.libelle_commune||''),
  registry_source:'Annuaire des Entreprises — DINUM / Sirene / RNE',
  registry_checked_at:new Date().toISOString()
 }};
}
async function verifyProfessional(header,env={},fetcher=fetch){
 const {parseBearer}=require('./premium');const jwt=parseBearer(header);
 if(!jwt)return {allowed:false,status:401,error:'Connexion professionnelle requise.'};
 const base=String(env.url||'').replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!env.key)
  return {allowed:false,status:503,error:'Vérification des comptes indisponible.'};
 const h={apikey:env.key,Authorization:'Bearer '+jwt,Accept:'application/json'};
 const auth=await fetcher(base+'/auth/v1/user',{headers:h,signal:AbortSignal.timeout(8000)});
 if(!auth.ok)return {allowed:false,status:401,error:'Veuillez vous reconnecter.'};
 const user=await auth.json();
 if(!/^[a-f0-9-]{36}$/i.test(String(user.id||'')))return {allowed:false,status:401,error:'Compte invalide.'};
 // The JWT is decoded only after Supabase Auth has verified this exact bearer token.
 let aal='aal1';
 try{aal=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString('utf8')).aal||'aal1';}catch{return {allowed:false,status:401,error:'Session invalide.'};}
 const prof=await fetcher(base+'/rest/v1/offrya_profiles?select=role&id=eq.'+encodeURIComponent(user.id),{headers:h,signal:AbortSignal.timeout(8000)});
 if(!prof.ok)return {allowed:false,status:503,error:'Vérification du profil indisponible.'};
 const rows=await prof.json();
 if(!Array.isArray(rows)||rows[0]?.role!=='pro')return {allowed:false,status:403,error:'Créez ou activez votre profil professionnel avant la vérification de votre entreprise.'};
 return {allowed:true,status:200,userId:user.id,email:user.email,aal};
}
module.exports={validSiret,lookupCompany,verifyProfessional};
