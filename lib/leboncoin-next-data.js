'use strict';
// Lecture des données intégrées aux pages PUBLIQUES expressément autorisées.
// Aucun accès caché, aucune API privée, aucun mécanisme d'évitement anti-bot.
const {leboncoinUrl}=require('./leboncoin-demand');

function extractNextData(html){
 if(typeof html!=='string'||html.length>5_000_000)return null;
 const match=/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
 if(!match)return null;
 try{return JSON.parse(match[1]);}catch{return null;}
}
function qualifiedAd(raw){
 if(!raw||typeof raw!=='object'||raw.ad_type!=='want')return null;
 if(['deleted','expired','inactive','removed'].includes(String(raw.status||'').toLowerCase()))return null;
 const supplied=String(raw.url||'');
 const url=leboncoinUrl(supplied.startsWith('/ad/')?'https://www.leboncoin.fr'+supplied:supplied);
 if(!url)return null;
 const location=raw.location&&typeof raw.location==='object'?raw.location:{};
 return {
  url,
  title:String(raw.subject||'').trim(),
  description:String(raw.body||'').trim(),
  city:String(location.city||'').trim(),
  postalCode:String(location.zipcode||'').trim(),
  department:String(location.department_code||'').trim(),
  ad_type:'want'
 };
}
function parseSearchNextData(data){
 if(!data||typeof data!=='object')return null;
 const props=data.props?.pageProps;
 if(!props)return null;
 const candidates=[props.searchData?.ads,props.initialProps?.searchData?.ads];
 const ads=candidates.find(Array.isArray);
 if(!ads)return null;
 const found=new Set();
 return ads.slice(0,200).map(qualifiedAd).filter(a=>{
  if(!a||found.has(a.url))return false;
  found.add(a.url);return true;
 });
}
function parseSearchJson(text){
 if(typeof text!=='string'||!text.trim()||text.length>5_000_000)return null;
 try{return parseSearchNextData(JSON.parse(text));}catch{return null;}
}
module.exports={extractNextData,qualifiedAd,parseSearchNextData,parseSearchJson};
