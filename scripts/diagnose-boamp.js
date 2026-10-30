'use strict';
const {buildBoampUrl}=require('../lib/boamp');
const base='https://boamp-datadila.opendatasoft.com/api/explore/v2.0/catalog/datasets/boamp/records';
const cases=[
['baseline',base+'?limit=2'],
['date',buildBoampUrl({limit:2}).toString()],
['keyword',buildBoampUrl({q:'nettoyage',limit:2}).toString()],
['department',buildBoampUrl({dept:'31',limit:2}).toString()],
['both',buildBoampUrl({q:'nettoyage',dept:'31',limit:2}).toString()],
['recent',base+'?limit=2&order_by=dateparution%20desc'],
];
(async()=>{
for (const [name,url] of cases){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);
 try{
  const res=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});
  const body=await res.text();
  let data={};try{data=JSON.parse(body)}catch{}
  const first=data.results?.[0]||{};
  console.log(JSON.stringify({name,status:res.status,total:data.total_count,items:data.results?.length,topLevel:Object.keys(data),fields:Object.keys(first).slice(0,35),sampleBody:name==='baseline'?body.slice(0,1600):undefined,sample:Object.fromEntries(['idweb','objet','dateparution','datelimitereponse','url_avis','code_departement'].map(k=>[k,first[k]])),error:!res.ok?body.slice(0,1700):undefined}));
 }catch(e){console.log(JSON.stringify({name,error:String(e)}))}
 finally{clearTimeout(timer)}
}
})();
(async()=>{
 const {queryBoamp}=require('../lib/boamp');
 for(const options of [{limit:3},{q:'nettoyage',dept:'31',limit:3}]){
  try{
   const found=await queryBoamp(options);
   console.log(JSON.stringify({smoke:'OFFRYA queryBoamp',options,total:found.total,items:found.items.map(x=>({id:x.id,title:x.title.slice(0,60),url:x.url}))}));
   if(!found.items.length || !found.total)process.exitCode=1;
  }catch(e){console.error('OFFRYA smoke failed',e.message);process.exitCode=1;}
 }
})();
