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
  console.log(JSON.stringify({name,status:res.status,total:data.total_count,items:data.results?.length,fields:Object.keys(first).slice(0,35),sample:Object.fromEntries(['idweb','objet','dateparution','datelimitereponse','url_avis','code_departement'].map(k=>[k,first[k]])),error:!res.ok?body.slice(0,1700):undefined}));
 }catch(e){console.log(JSON.stringify({name,error:String(e)}))}
 finally{clearTimeout(timer)}
}
})();