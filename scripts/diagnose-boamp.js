'use strict';
const {queryBoamp}=require('../lib/boamp');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const upstream=await queryBoamp({q:'nettoyage',dept:'31',limit:3});
 console.log(JSON.stringify({check:'BOAMP officiel',total:upstream.total,items:upstream.items.length}));
 if(!upstream.items.length)throw Error('BOAMP source returned no usable public notices');
 // Security regression: OFFRYA must not expose its Premium search/export anonymously.
 for(const endpoint of ['/api/annonces?q=nettoyage&dept=31','/api/export?q=nettoyage&dept=31']){
  let checked=false;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const response=await fetch('https://offrya-app.onrender.com'+endpoint,{signal:AbortSignal.timeout(28000),headers:{Accept:'application/json'}});
    const body=await response.text();
    console.log(JSON.stringify({check:'Premium access denied to anonymous',endpoint,attempt,status:response.status}));
    if(response.status!==401)throw Error('Premium route leaked: '+endpoint+' status '+response.status+' '+body.slice(0,120));
    checked=true;break;
   }catch(e){
    if(String(e).includes('Premium route leaked'))throw e;
    if(attempt===3)throw e;
    await delay(5000);
   }
  }
  if(!checked)throw Error('No result '+endpoint);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
