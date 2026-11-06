'use strict';
// Read-only official award database. Amounts are total awards, never unit prices.
const DATASET='https://www.data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/';
const API='https://www.data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides/records';
function queryUrl(cpv){
 if(!/^\d{8}$/.test(String(cpv||'')))throw new TypeError('Saisir les 8 chiffres du code CPV.');
 const u=new URL(API);
 u.searchParams.set('limit','12');
 u.searchParams.set('where','search(codecpv, "'+cpv+'")');
 u.searchParams.set('order_by','datenotification desc');
 return u.toString();
}
function awardRecord(raw){
 if(!raw||typeof raw!=='object')return null;
 const num=Number(raw.montant);
 const cpv=String(raw.codecpv||'').slice(0,16);
 const id=String(raw.id||'').slice(0,100);
 if(!Number.isFinite(num)||num<=0||num>1e12||!/^\d{8}/.test(cpv)||!id)return null;
 const date=String(raw.datenotification||'');
 const duration=Number(raw.dureemois);
 return {source:'DECP_DAJ',source_url:DATASET+'table/?q='+encodeURIComponent('id:"'+id+'"'),
  id,title:String(raw.objet||'').slice(0,250),cpv,
  amount_eur:num,
  awarded_at:/^\d{4}-\d{2}-\d{2}/.test(date)?date.slice(0,10):'',
  duration_months:Number.isInteger(duration)&&duration>=0&&duration<600?duration:null,
  note:'Montant global attribué dans les DECP (comparabilité à apprécier avec l’objet, la durée et le périmètre).'};
}
async function queryAwards(cpv,fetcher=fetch){
 const url=queryUrl(cpv);
 const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Source DECP indisponible (HTTP '+response.status+')');
 const data=await response.json();
 if(!Array.isArray(data.results))throw new Error('Format DECP inattendu');
 return {source:'DAJ / DECP',dataset_url:DATASET,
  rows:data.results.map(awardRecord).filter(x=>x&&String(x.cpv).startsWith(String(cpv).slice(0,6))),
  warning:'Les montants attribués ne sont pas des prix unitaires ; comparer les prestations, la période et la structure du marché avant tout chiffrage.'};
}
module.exports={queryAwards,queryUrl,awardRecord,DATASET};
