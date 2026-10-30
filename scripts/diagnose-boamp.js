'use strict';
const {queryBoamp}=require('../lib/boamp');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const upstream=await queryBoamp({q:'nettoyage',dept:'31',limit:3});
  console.log(JSON.stringify({check:'BOAMP officiel',total:upstream.total,items:upstream.items.length,firstId:upstream.items[0]?.id}));
  if(!upstream.items.length)throw Error('Source BOAMP: aucun avis décodé');
  const url='https://offrya-app.onrender.com/api/annonces?q=nettoyage&dept=31';
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(27000),headers:{Accept:'application/json'}});
      const payload=await response.json();
      console.log(JSON.stringify({check:'OFFRYA Render',attempt,status:response.status,total:payload.total,items:payload.items?.length,firstId:payload.items?.[0]?.id,error:payload.error}));
      if(response.ok && Array.isArray(payload.items) && payload.items.length>0)return;
      last=new Error('OFFRYA répond sans annonces');
    }catch(err){last=err;console.error('OFFRYA check',attempt,String(err))}
    if(attempt<4)await delay(5500);
  }
  throw last||Error('OFFRYA Render inaccessible');
})().catch(e=>{console.error(e);process.exitCode=1;});
