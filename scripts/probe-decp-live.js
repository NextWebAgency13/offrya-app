'use strict';
// Read-only live public schema probe. Does not send any client information.
const paths=[
 'https://www.data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides/records?limit=1',
 'https://opendatamef.opendatasoft.com/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides/records?limit=1',
 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides/records?limit=1'
];
async function main(fetcher=fetch){
 const results=[];
 for(const url of paths){
  try{
   const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(13000)});
   if(!response.ok){results.push(new URL(url).host+' '+response.status);continue;}
   const json=await response.json();
   if(!Array.isArray(json.results)||!json.results.length){results.push(new URL(url).host+' format sans resultats');continue;}
   const fieldNames=Object.keys(json.results[0]);
   const payload={host:new URL(url).host,total_count:json.total_count,fieldNames};
   console.log('DECP LIVE SCHEMA '+JSON.stringify(payload));
   return payload;
  }catch(error){results.push(new URL(url).host+' '+error.name);}
 }
 throw Error('DECP public endpoints unavailable: '+results.join('; '));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
