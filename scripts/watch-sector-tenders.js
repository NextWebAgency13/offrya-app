'use strict';
// Scheduled BOAMP discovery and internal preparation for paid, verified professionals.
// No email, external contact, bid submission or autonomous commitments.
const {queryBoamp}=require('../lib/boamp');
const {qualifyTender}=require('../lib/tender-assistant');
const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SECRET_KEY;
const searches={'Nettoyage':'nettoyage','Espaces verts':'espaces verts','Bâtiment':'travaux','Informatique':'informatique','Transport':'transport','Restauration & Hôtellerie':'restauration','Bien-être & Beauté':'beauté','Autre':''};
async function rest(path,options={}){
 const response=await fetch(base+'/rest/v1/'+path,{
  ...options,headers:{apikey:key,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
  signal:AbortSignal.timeout(14000)
 });
 if(!response.ok)throw Error('Supabase watch HTTP '+response.status+' '+path.split('?')[0]);
 const payload=await response.text();
 return payload?JSON.parse(payload):null;
}
function cleanRow(item,user,prefs={},now=new Date()){
 return qualifyTender(item,{...prefs,user_id:user},now);
}
async function run(){
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
  throw Error('Veille BOAMP inactive : vérifier OFFRYA_SUPABASE_URL et OFFRYA_SUPABASE_SECRET_KEY.');
 // Unlike the legacy opt-in selector, this RPC excludes temporary premium QA grants.
 const targets=await rest('rpc/offrya_agent_watch_targets',{method:'POST',body:'{}'});
 if(!Array.isArray(targets))throw Error('Invalid watch targets response');
 let detected=0,processed=0,errors=0,ranked=0;
 for(const pref of targets.slice(0,60)){
  if(!/^[a-f0-9-]{36}$/i.test(pref.user_id||''))continue;
  processed++;
  const terms=(Array.isArray(pref.sectors)&&pref.sectors.length?pref.sectors.map(s=>searches[s]).filter(Boolean):[pref.keywords||'']).slice(0,4);
  if(!terms.length)terms.push(pref.keywords||'');
  const matches=new Map();
  for(const term of terms){
   try{
    const q=[term,pref.keywords||''].filter(Boolean).join(' ').slice(0,90);
    const res=await queryBoamp({q,dept:pref.department||'',limit:20});
    for(const item of res.items||[]){
     const row=cleanRow(item,pref.user_id,pref);
     if(!row)continue;
     ranked++;
     const prior=matches.get(row.tender_id);
     if(!prior||row.match_score>prior.match_score)matches.set(row.tender_id,row);
    }
   }catch(error){errors++;console.warn('BOAMP scan unavailable:',error.message);}
  }
  if(matches.size){
   const rows=[...matches.values()].sort((a,b)=>b.match_score-a.match_score).slice(0,15);
   await rest('offrya_tender_alerts?on_conflict=user_id,tender_id',{
    method:'POST',
    // Never overwrite previously read notifications or the user's state.
    headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(rows)
   });
   detected+=rows.length;
  }
 }
 console.log('Agent BOAMP terminé. Professionnels opt-in vérifiés et abonnés:',processed,
  'avis qualifiés:',ranked,'opportunités proposées:',detected,'recherches indisponibles:',errors);
 if(errors&&processed&&detected===0)process.exitCode=1;
}
if(require.main===module)run().catch(err=>{console.error(err.message);process.exitCode=1});
module.exports={cleanRow,run};
