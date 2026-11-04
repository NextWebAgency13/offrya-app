'use strict';
// Explicit catalogue: websites are discovery links until a permitted, documented
// feed is configured. Never crawl HTML search pages or bypass access controls.
const crypto=require('node:crypto');
const CATALOG=Object.freeze([
 {id:'PLACE',label:'PLACE · Achats de l’État',region:'France',site:'https://www.marches-publics.gouv.fr/entreprise',domains:['www.marches-publics.gouv.fr'],env:'OFFRYA_PLACE_RSS_URL'},
 {id:'MAXIMILIEN',label:'Maximilien · Île-de-France',region:'Île-de-France',site:'https://marches.maximilien.fr/entreprise',domains:['marches.maximilien.fr'],env:'OFFRYA_MAXIMILIEN_RSS_URL'},
 {id:'MEGALIS',label:'Mégalis · Bretagne',region:'Bretagne',site:'https://marches.megalisbretagne.org/',domains:['marches.megalisbretagne.org'],env:'OFFRYA_MEGALIS_RSS_URL'},
 {id:'EBOURGOGNE',label:'Territoires numériques BFC',region:'Bourgogne-Franche-Comté',site:'https://e-bourgogne.fr/services/salle-marches-publics',domains:['e-bourgogne.fr','www.e-bourgogne.fr'],env:'OFFRYA_EBOURGOGNE_RSS_URL'},
 {id:'OCCITANIE',label:'Marchés Occitanie',region:'Occitanie',site:'https://www.marches-occitanie.fr/',domains:['www.marches-occitanie.fr','marches-occitanie.fr'],env:'OFFRYA_OCCITANIE_RSS_URL'},
 {id:'SUD',label:'Sud Marchés Publics · Région Sud',region:'Provence-Alpes-Côte d’Azur',site:'https://marches-publics.maregionsud.fr/',domains:['marches-publics.maregionsud.fr'],env:'OFFRYA_SUD_RSS_URL'}
]);
const DEP={MAXIMILIEN:['75','77','78','91','92','93','94','95'],
 MEGALIS:['22','29','35','56'],EBOURGOGNE:['21','25','39','58','70','71','89','90'],
 OCCITANIE:['09','11','12','30','31','32','34','46','48','65','66','81','82'],
 SUD:['04','05','06','13','83','84']};
function safeUrl(raw,source,forFeed=false){
 try{
  const url=new URL(String(raw||''));if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  if(!source.domains.includes(url.hostname.toLowerCase()))return null;
  if(forFeed&&(!/(\.rss|\.xml|\/rss(?:\/|$|\?))/.test(url.pathname)||url.search.length>500))return null;
  return url.toString();
 }catch{return null;}
}
function getApprovedFeeds(env=process.env){
 const out=[];
 for(const source of CATALOG){
  // No undocumented URL is invented. PLACE requires BOTH an operator-verified
  // official RSS URL and explicit confirmation of source-use conditions.
  const approved=source.id!=='PLACE'||String(env.OFFRYA_PLACE_RSS_APPROVED||'')==='true';
  const value=approved?env[source.env]:null;
  const feed=value&&safeUrl(value,source,true);
  if(feed)out.push({...source,feed});
 }
 return out;
}
function decode(s){
 return String(s||'').replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/,'$1')
  .replace(/&#x([0-9a-f]+);/gi,(a,h)=>String.fromCodePoint(Math.min(0x10ffff,parseInt(h,16))))
  .replace(/&#(\d+);/g,(a,n)=>String.fromCodePoint(Math.min(0x10ffff,Number(n))))
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,a=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[a]));
}
const clean=(s,n=300)=>decode(s).replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
function tag(xml,names){
 for(const name of names){
  const re=new RegExp('<(?:[A-Za-z_][\\w-]*:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w-]*:)?'+name+'>','i');
  const match=re.exec(xml);if(match)return match[1];
 }
 return '';
}
function asDate(v){
 const raw=clean(v,100);if(!raw)return null;
 const d=Date.parse(raw);return Number.isFinite(d)?new Date(d).toISOString():null;
}
function linkFrom(block){
 const h=tag(block,['link']);
 if(h)return clean(h,1100);
 const a=/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
 return a?decode(a[1]):'';
}
function itemKey(source,guid,link){
 const value=clean(guid,900)||link;
 const hash=crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
 return source.id+'-'+hash;
}
function parsePublicRss(xml,source,{now=new Date(),limit=120}={}){
 if(typeof xml!=='string'||xml.length>2_000_000)throw Error('Flux RSS trop volumineux');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Format XML risqué');
 const blocks=xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||
  xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)||[];
 const results=[],seen=new Set();
 for(const block of blocks.slice(0,Math.min(limit,200))){
  const title=clean(tag(block,['title']),550);
  const link=safeUrl(linkFrom(block),source);
  const guid=tag(block,['guid','id']);
  if(!title||!link)continue;
  const deadline=asDate(tag(block,['dateLimiteRemiseOffres','dateLimiteOffres','dateLimite','deadline','date_limite','closingDate']));
  // Never claim that an unstructured textual date is a verified deadline.
  if(!deadline||Date.parse(deadline)<=now.getTime())continue;
  const id=itemKey(source,guid,link);
  if(seen.has(id))continue;seen.add(id);
  const departments=clean(tag(block,['departement','codeDepartement','department']),100);
  const buyer=clean(tag(block,['acheteur','nomAcheteur','buyer']),250);
  results.push({id,title,buyer:buyer||'Acheteur à vérifier',departments,
   description:clean(tag(block,['description','summary']),600),
   family:clean(tag(block,['categorie','category']),110),nature:'',
   published:asDate(tag(block,['pubDate','published','updated','datePublication'])),
   deadline,url:link,source:source.id});
 }
 return results;
}
async function queryPublicPortals({env=process.env,fetcher=fetch,now=new Date()}={}){
 const sources=getApprovedFeeds(env);
 const results=await Promise.allSettled(sources.map(async s=>{
  const u=new URL(s.feed);const response=await fetcher(u.toString(),{
   headers:{Accept:'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8'},
   redirect:'manual',signal:AbortSignal.timeout(9500)});
  if(!response.ok||response.status>=300)throw Error('HTTP '+response.status);
  const type=response.headers?.get?.('content-type')||'';
  if(type&&!/xml|rss|atom|text\/plain/i.test(type))throw Error('Format inattendu');
  const body=await response.text();
  if(body.length>2_000_000)throw Error('Flux trop volumineux');
  return {id:s.id,rows:parsePublicRss(body,s,{now})};
 }));
 const items=[],health=[];
 for(let i=0;i<results.length;i++){
  const x=results[i],src=sources[i];
  if(x.status==='fulfilled'){items.push(...x.value.rows);health.push({id:src.id,status:'ok',count:x.value.rows.length});}
  else health.push({id:src.id,status:'unavailable',count:0});
 }
 return {items,health,sourcesEnabled:sources.length};
}
module.exports={CATALOG,DEP,getApprovedFeeds,safeUrl,parsePublicRss,queryPublicPortals};
