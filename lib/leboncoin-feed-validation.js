'use strict';
// Validation hors ligne d'exports remis dans un cadre autorisé. Aucun appel à Leboncoin.
const {qualifiedAd}=require('./leboncoin-next-data');
const {cleanListing,getSourceId}=require('./leboncoin-demand');
const MAX_ROWS=40;
const MAX_RAW=5000;

function rawAds(input){
 let value=input;
 if(typeof input==='string'){
  if(input.length>5_000_000)throw Error('Export trop volumineux');
  try{value=JSON.parse(input);}catch{throw Error('Export JSON invalide');}
 }
 const props=value?.props?.pageProps;
 const list=Array.isArray(value)?value:
  Array.isArray(value?.ads)?value.ads:
  Array.isArray(props?.searchData?.ads)?props.searchData.ads:
  Array.isArray(props?.initialProps?.searchData?.ads)?props.initialProps.searchData.ads:null;
 if(!list)throw Error('Export JSON incompatible : ads ou props.pageProps.searchData.ads requis');
 if(list.length>MAX_RAW)throw Error('Export trop volumineux : découper en lots');
 return list;
}
function examine(raw,now){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {reason:'format_invalide'};
 if(raw.ad_type!=='want')return {reason:'pas_une_demande'};
 if(raw.status&&!['active','online'].includes(String(raw.status).toLowerCase()))
  return {reason:'statut_inactif'};
 const normalized=qualifiedAd(raw);
 if(!normalized)return {reason:'url_ou_identifiant_invalide'};
 if(raw.list_id!=null&&String(raw.list_id)!==getSourceId(normalized.url))
  return {reason:'identifiant_incoherent'};
 if(normalized.title.length<8)return {reason:'titre_incomplet'};
 if(normalized.description.length<15)return {reason:'description_incomplete'};
 if(!normalized.city&&!normalized.postalCode)return {reason:'localisation_manquante'};
 const row=cleanListing(normalized,now);
 if(!row)return {reason:'prestation_non_confirmee'};
 return {row};
}
function validateFeed(input,now=new Date()){
 const seen=new Set(),rows=[];
 const summary={total:0,ready:0,ignored:0,duplicates:0,reasons:{}};
 function ignore(reason){summary.ignored++;summary.reasons[reason]=(summary.reasons[reason]||0)+1;}
 for(const raw of rawAds(input)){
  summary.total++;
  const inspected=examine(raw,now);
  if(inspected.reason){ignore(inspected.reason);continue;}
  const row=inspected.row;
  if(seen.has(row.source_id)){summary.duplicates++;continue;}
  seen.add(row.source_id);
  if(rows.length>=MAX_ROWS){ignore('plafond_de_validation');continue;}
  rows.push(row);
 }
 summary.ready=rows.length;
 return {rows,summary};
}
module.exports={MAX_ROWS,rawAds,examine,validateFeed};
