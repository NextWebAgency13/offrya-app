'use strict';
// Deterministic security regression for the code under review. Production HTTP
// is checked separately by the OFFRYA — contrôle HTTP production workflow.
// Do not depend on the obsolete offrya-app.onrender.com hostname in pull requests.
const http=require('node:http');
const {queryBoamp}=require('../lib/boamp');
const {handle}=require('../server');

(async()=>{
 const upstream=await queryBoamp({q:'nettoyage',dept:'31',limit:3});
 console.log(JSON.stringify({check:'BOAMP officiel',total:upstream.total,items:upstream.items.length}));
 if(!upstream.items.length)throw Error('BOAMP source returned no usable public notices');

 const app=http.createServer((req,res)=>handle(req,res));
 await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});
 try{
  const addr=app.address();
  for(const endpoint of ['/api/annonces?q=nettoyage&dept=31','/api/export?q=nettoyage&dept=31']){
   const response=await fetch('http://127.0.0.1:'+addr.port+endpoint,{
    signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}
   });
   const body=await response.text();
   console.log(JSON.stringify({check:'Premium access denied to anonymous (local server)',endpoint,status:response.status}));
   if(response.status!==401)throw Error('Premium route leaked: '+endpoint+' status '+response.status+' '+body.slice(0,120));
  }
 }finally{
  await new Promise((resolve,reject)=>app.close(error=>error?reject(error):resolve()));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
