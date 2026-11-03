'use strict';
// OFFRYA background BOAMP watch: sends no emails, never exposes private missions.
// The worker only reads eligible, opt-in accounts from a service-role-only RPC.
const {queryBoamp}=require('../lib/boamp');
const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SECRET_KEY;
const searches={'Nettoyage':'nettoyage','Espaces verts':'espaces verts','Bâtiment':'travaux','Informatique':'informatique','Transport':'transport','Restauration & Hôtellerie':'restauration','Bien-être & Beauté':'beauté','Autre':''};
async function rest(path,options={}){
 const response=await fetch(base+'/rest/v1/'+path,{
  ...options,headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
  signal:AbortSignal.timeout(14000)
 });
 if(!response.ok)throw Error('Supabase watch HTTP '+response.status+' '+path.split('?')[0]);
 return response.status===204?null:response.json();
}
function cleanRow(item,user){
 if(!item||!item.id||!item.title||!/^https:\/\/(www\.)?boamp\.fr\//.test(item.url||''))return null;
 if(item.deadline&&Date.parse(item.deadline)<=Date.now())return null;
 return {user_id:user,tender_id:String(item.id).slice(0,80),title:String(item.title).slice(0,500),url:item.url.slice(0,800),deadline:item.deadline};
}
async function run(){
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key){console.log('Veille BOAMP désactivée : configuration absente.');return;}
 const targets=await rest('rpc/offrya_watch_targets',{method:'POST',body:'{}'});
 if(!Array.isArray(targets))throw Error('Invalid watch targets response');
 let detected=0,processed=0,errors=0;
 for(const pref of targets.slice(0,60)){
  if(!/^[a-f0-9-]{36}$/i.test(pref.user_id||''))continue;
  processed++;
  const terms=(Array.isArray(pref.sectors)&&pref.sectors.length?pref.sectors.map(s=>searches[s]).filter(Boolean):[pref.keywords||'']).slice(0,4);
  if(!terms.length)terms.push('');
  const matches=new Map();
  for(const term of terms){
   try{
    const q=[term,pref.keywords||''].filter(Boolean).join(' ').slice(0,90);
    const res=await queryBoamp({q,dept:pref.department||'',limit:20});
    for(const item of res.items||[]){
     const row=cleanRow(item,pref.user_id);
     if(row)matches.set(row.tender_id,row);
    }
   }catch(error){errors++;console.warn('BOAMP scan unavailable:',error.message);}
  }
  if(matches.size){
   const rows=[...matches.values()];
   await rest('offrya_tender_alerts?on_conflict=user_id,tender_id',{
    method:'POST',
    headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(rows)
   });
   detected+=rows.length;
  }
 }
 console.log('Veille OFFRYA terminée. Comptes vérifiés:',processed,'avis examinés:',detected,'recherches indisponibles:',errors);
 if(errors&&processed&&detected===0)process.exitCode=1;
}
if(require.main===module)run().catch(err=>{console.error(err.message);process.exitCode=1});
module.exports={cleanRow,run};
