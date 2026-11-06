'use strict';
// Official European public procurement search (TED). Read-only, no web scraping,
// credential collection or application submission.
const {tedRespondLink}=require('./tender-links');
const ENDPOINT='https://api.ted.europa.eu/v3/notices/search';
function localized(value){
 if(typeof value==='string')return value.trim();
 if(Array.isArray(value))return value.map(localized).find(Boolean)||'';
 if(value&&typeof value==='object'){
  for(const language of ['fra','fr','eng','en'])if(value[language])return localized(value[language]);
  return Object.values(value).map(localized).find(Boolean)||'';
 }
 return '';
}
function endDate(value){
 const raw=localized(value);
 const day=/^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
 if(!day)return null;
 const timestamp=Date.parse(day+'T23:59:59Z');
 return Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
}
function normalizeTedNotice(raw){
 if(!raw||typeof raw!=='object')return null;
 const id=localized(raw['publication-number']);
 if(!/^\d{4,8}-20\d{2}$/.test(id))return null;
 const title=localized(raw['notice-title']).slice(0,500);
 const buyer=localized(raw['buyer-name']).slice(0,250);
 const deadline=endDate(raw['deadline-receipt-tender-date-lot']||raw.deadline);
 if(!title||!deadline||Date.parse(deadline)<=Date.now())return null;
 const country=localized(raw['buyer-country']).toUpperCase();
 if(country&&country!=='FRA')return null;
 const link=tedRespondLink(raw);
 return {id:'TED-'+id,title,buyer,departments:'',description:localized(raw['description-lot']).slice(0,400),
  deadline,published:endDate(raw['publication-date']),source:'TED',
  url:'https://ted.europa.eu/fr/notice/-/detail/'+id,
  ...(link?{respondUrl:link.url,respondKind:link.kind}:{})};
}
// Champs « lien pour répondre » (eForms BT-15, BT-18, BT-508). Si l'API les refuse,
// la recherche est relancée sans eux : la veille ne doit jamais s'interrompre.
const LINK_FIELDS=['document-url-lot','submission-url-lot','buyer-profile'];
function tedSearchBody(term,withLinks=true){
 const clean=String(term||'').normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,60);
 if(clean.length<3)return null;
 const escaped=clean.replace(/"/g,'');
 return {
  query:'FT~"'+escaped+'" AND buyer-country=FRA SORT BY publication-date DESC',
  fields:['publication-number','notice-title','buyer-name','buyer-country','publication-date',
   'deadline','deadline-receipt-tender-date-lot',...(withLinks?LINK_FIELDS:[])],
  scope:'ACTIVE',limit:25,page:1,paginationMode:'PAGE_NUMBER',onlyLatestVersions:true
 };
}
async function queryTed(term,fetcher=fetch){
 const request=tedSearchBody(term);
 if(!request)return [];
 const call=body=>fetcher(ENDPOINT,{method:'POST',
  headers:{'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 let r=await call(request);
 if(r.status===400)r=await call(tedSearchBody(term,false));
 if(!r.ok)throw Error('TED public source HTTP '+r.status);
 const data=await r.json();
 if(!Array.isArray(data.notices))throw Error('Unexpected TED API response');
 return data.notices.map(normalizeTedNotice).filter(Boolean);
}
module.exports={queryTed,normalizeTedNotice,tedSearchBody,localized,endDate,LINK_FIELDS};
