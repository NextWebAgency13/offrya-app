'use strict';
// APProch : projets d'achats publics de l'État publiés AVANT l'appel d'offres.
// Données ouvertes (Licence Ouverte Etalab 2.0) via l'API data.economie.gouv.fr.
// Lecture seule. Le champ « responsable » (nom d'un agent) n'est jamais demandé.
const {cleanUrl}=require('./tender-links');
const ENDPOINT='https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/projets-dachats-publics/records';
const PROJECT_URL='https://projets-achats.marches-publics.gouv.fr/project/';
const FIELDS=['code','libelle','description','categorie_d_achat','code_s_cpv',
 'date_previsionnelle_de_publication','date_cible_de_remise_des_offres','lien_vers_la_consultation',
 'montant_estime_du_marche','duree_previsionnelle_du_marche','departement_s_d_execution_du_marche'];
// Au-delà, le marché est national : on ne l'attache à aucun département précis.
const MAX_LOCAL_DEPARTMENTS=15;

function cleanTerm(value){
 return String(value||'').normalize('NFKC').replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/["\\]/g,'')
  .replace(/\s+/g,' ').trim().slice(0,60);
}
function cleanDepartment(value){
 const code=String(value||'').trim().toUpperCase();
 return /^(\d{2,3}|2A|2B)$/.test(code)?code:'';
}
function dayEnd(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(value))return null;
 const time=Date.parse(value.slice(0,10)+'T23:59:59Z');
 return Number.isFinite(time)?new Date(time).toISOString():null;
}
function departments(value){
 const codes=String(value||'').split(/[^0-9AB]+/i).map(x=>x.trim().toUpperCase()).filter(Boolean);
 return codes.length&&codes.length<=MAX_LOCAL_DEPARTMENTS?codes.join(', '):'';
}
function normalizeApproch(raw,now=Date.now()){
 if(!raw||typeof raw!=='object')return null;
 const code=String(raw.code??'');
 if(!/^\d{1,9}$/.test(code))return null;
 const title=String(raw.libelle||'').replace(/\s+/g,' ').trim().slice(0,500);
 if(!title)return null;
 // Date limite des offres si connue, sinon date prévue de publication de l'appel d'offres.
 const deadline=dayEnd(raw.date_cible_de_remise_des_offres)||dayEnd(raw.date_previsionnelle_de_publication);
 if(!deadline||Date.parse(deadline)<=now)return null;
 const details=[raw.montant_estime_du_marche&&'Montant estimé : '+raw.montant_estime_du_marche,
  raw.duree_previsionnelle_du_marche&&'Durée : '+raw.duree_previsionnelle_du_marche+' mois',
  raw.date_previsionnelle_de_publication&&'Publication prévue le '+raw.date_previsionnelle_de_publication]
  .filter(Boolean).join(' · ');
 const consultation=cleanUrl(raw.lien_vers_la_consultation);
 return {id:'APPROCH-'+code,title,buyer:'Achat public de l’État (projet APProch)',
  departments:departments(raw.departement_s_d_execution_du_marche),
  description:[String(raw.description||'').replace(/\s+/g,' ').trim(),details].filter(Boolean).join(' — ').slice(0,400),
  family:String(raw.categorie_d_achat||'').slice(0,120),nature:'',
  deadline,published:null,source:'APPROCH',url:PROJECT_URL+code,
  ...(consultation?{respondUrl:consultation,respondKind:'platform'}:{})};
}
function approchQuery(term,dept,today){
 const clean=cleanTerm(term);
 if(clean.length<3)return null;
 const filters=['(search(libelle,"'+clean+'") or search(description,"'+clean+'"))',
  'date_previsionnelle_de_publication>=date\''+today+'\''];
 const department=cleanDepartment(dept);
 if(department)filters.push('departement_s_d_execution_du_marche like "'+department+'"');
 return new URLSearchParams({select:FIELDS.join(','),where:filters.join(' and '),
  order_by:'date_previsionnelle_de_publication',limit:'25'});
}
async function queryApproch(term,{dept='',fetcher=fetch,now=new Date()}={}){
 const params=approchQuery(term,dept,now.toISOString().slice(0,10));
 if(!params)return [];
 const r=await fetcher(ENDPOINT+'?'+params,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('APProch public source HTTP '+r.status);
 const data=await r.json();
 if(!Array.isArray(data?.results))throw Error('Unexpected APProch API response');
 return data.results.map(x=>normalizeApproch(x,now.getTime())).filter(Boolean);
}
module.exports={queryApproch,normalizeApproch,approchQuery,ENDPOINT,PROJECT_URL};
