'use strict';
// Read-only, premium-gated live discovery of public BOAMP notices.
// Caller MUST validate a paid/authorized professional BEFORE invoking this module.
const {queryBoamp}=require('./boamp');
const CACHE_TTL=5*60*1000;
const MAX_USERS=80;
const searchTerms={
 'Nettoyage':'nettoyage',
 'Espaces verts':'espaces verts',
 'Bâtiment':'travaux',
 'Informatique':'informatique',
 'Transport':'transport',
 'Restauration & Hôtellerie':'repas',
 'Bien-être & Beauté':'coiffure'
};
const cache=new Map();
function criteriaKey(userId,prefs={}){
 return JSON.stringify([userId,(Array.isArray(prefs.sectors)?prefs.sectors:[]).slice().sort(),
  String(prefs.department||'').toUpperCase(),String(prefs.keywords||'').trim().toLowerCase()]);
}
function safeNotice(item){
 if(!item||!(/^\d{2}-\d{3,9}$/.test(String(item.id||''))))return null;
 const url=String(item.url||'');
 if(!/^https:\/\/(www\.)?boamp\.fr\//i.test(url))return null;
 if(!item.title||!Number.isFinite(Date.parse(item.deadline||''))||Date.parse(item.deadline)<=Date.now())return null;
 return {
  tender_id:String(item.id),title:String(item.title).slice(0,500),buyer:String(item.buyer||'').slice(0,250),
  departments:String(item.departments||'').slice(0,100).toUpperCase(),
  description:String(item.description||'').slice(0,250),
  family:String(item.family||'').slice(0,120),nature:String(item.nature||'').slice(0,120),
  url,deadline:item.deadline,source:'BOAMP',detected_at:item.published||null
 };
}
function termsFor(prefs={}){
 const sectors=(Array.isArray(prefs.sectors)?prefs.sectors:[]).filter(s=>searchTerms[s]);
 const terms=[...new Set(sectors.length?sectors.slice(0,4).map(s=>searchTerms[s]):
  [String(prefs.keywords||'').trim().slice(0,60)])];
 return terms.length?terms:[''];
}
async function liveTenders(userId,prefs={}, {force=false,query=queryBoamp,now=Date.now()}={}){
 if(!userId)throw new Error('Identité Premium requise');
 const key=criteriaKey(userId,prefs),hit=cache.get(key);
 if(!force&&hit&&hit.until>now)return {notices:hit.notices,source:'cached'};
 const terms=termsFor(prefs),responses=await Promise.allSettled(
  terms.map(q=>query({q,dept:String(prefs.department||''),limit:30,offset:0})));
 const success=responses.filter(r=>r.status==='fulfilled');
 if(!success.length){
  if(hit&&hit.until>now)return {notices:hit.notices,source:'cached-unavailable'};
  return {notices:[],source:'unavailable'};
 }
 const matches=new Map();
 for(const result of success){
  for(const item of result.value.items||[]){
   const notice=safeNotice(item);
   if(notice&&!matches.has(notice.tender_id))matches.set(notice.tender_id,notice);
  }
 }
 const notices=[...matches.values()].slice(0,100);
 if(cache.size>=MAX_USERS)cache.delete(cache.keys().next().value);
 cache.set(key,{until:now+CACHE_TTL,notices});
 return {notices,source:success.length===terms.length?'fresh':'partial'};
}
module.exports={liveTenders,termsFor,safeNotice,criteriaKey};
