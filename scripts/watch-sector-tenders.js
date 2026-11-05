'use strict';
// OFFRYA read-only public-opportunity monitoring: BOAMP (France) + TED (EU).
// Every verified, paid professional is monitored automatically in-app. Optional profile filters narrow matching.
// No AI-generated reply, bid submission, external contact or unsolicited email.
const {queryBoamp}=require('../lib/boamp');
const {queryTed}=require('../lib/ted');
const {qualifyTender}=require('../lib/tender-assistant');
const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SECRET_KEY;
const defaultSectors=['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté'];
const termsBySector={
 'Nettoyage':'nettoyage','Espaces verts':'espaces verts','Bâtiment':'travaux',
 'Informatique':'informatique','Transport':'transport',
 'Restauration & Hôtellerie':'restauration','Bien-être & Beauté':'beauté'
};
async function rest(path,options={}){
 const r=await fetch(base+'/rest/v1/'+path,{
  ...options,headers:{apikey:key,Accept:'application/json',
   ...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
  signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('Supabase watch HTTP '+r.status+' '+path.split('?')[0]);
 const value=await r.text();
 return value?JSON.parse(value):null;
}
const canonical=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^a-z0-9]+/g,' ').trim().slice(0,100);
function fingerprint(row){
 return [canonical(row.title),canonical(row.buyer),String(row.deadline||'').slice(0,10)].join('|');
}
function cleanRow(item,user,prefs={},now=new Date()){
 const sectors=(Array.isArray(prefs.sectors)?prefs.sectors:[]).filter(s=>Boolean(termsBySector[s]));
 const ranked=qualifyTender(item,{...prefs,sectors:sectors.length?sectors:defaultSectors,user_id:user},now);
 if(!ranked)return null;
 // Discovery rows are solely notifications, not automatically prepared dossiers.
 const {first_steps:unused,...alert}=ranked;
 return {...alert,source:item.source==='TED'?'TED':'BOAMP'};
}
function queryTerms(pref){
 const selected=(Array.isArray(pref.sectors)?pref.sectors:[]).filter(s=>Boolean(termsBySector[s]));
 const sectorTerms=(selected.length?selected:defaultSectors).map(s=>termsBySector[s]).filter(Boolean);
 const keyword=String(pref.keywords||'').trim().slice(0,60);
 return [...new Set([...sectorTerms,...(keyword?[keyword]:[])])].slice(0,8);
}
async function run({boamp=queryBoamp,ted=queryTed,store=rest,logger=console}={}){
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
  throw Error('OFFRYA veille indisponible : vérifier les secrets Supabase du dépôt GitHub.');
 const targets=await store('rpc/offrya_agent_watch_targets',{method:'POST',body:'{}'});
 if(!Array.isArray(targets))throw Error('Invalid professional watch targets response');
 if(!targets.length)logger.warn('OFFRYA : aucun professionnel éligible à la veille (abonnement vérifié ou dérogation QA active), aucun avis interrogé.');
 const cache=new Map();
 let processed=0,qualified=0,insertedCandidates=0,failures=0,queries=0;
 for(const pref of targets.slice(0,60)){
  if(!/^[0-9a-f-]{36}$/i.test(pref.user_id||''))continue;
  const terms=queryTerms(pref);
  // A professional with no custom filters receives automatically discovered notices.
  processed++;
  const matches=new Map();
  for(const term of terms){
   // Cache results for paid professionals sharing the same criteria.
   const cacheKey=term+'|'+String(pref.department||'');
   if(!cache.has(cacheKey)){
    if(queries>=100){logger.warn('OFFRYA : limite de requêtes de veille atteinte');break;}
    queries++;
    cache.set(cacheKey,Promise.allSettled([
     boamp({q:term,dept:pref.department||'',limit:25}),
     ted(term)
    ]));
   }
   const results=await cache.get(cacheKey);
   for(let index=0;index<results.length;index++){
    const result=results[index];
    if(result.status!=='fulfilled'){
     failures++;
     logger.warn((index===0?'BOAMP':'TED')+' source indisponible: '+String(result.reason?.message||'erreur').slice(0,100));
     continue;
    }
    const notices=index===0?(result.value?.items||[]):result.value||[];
    for(const item of notices){
     const row=cleanRow(item,pref.user_id,pref);
     if(!row)continue;
     qualified++;
     const unique=fingerprint(row);
     const previous=matches.get(unique);
     // Prefer the France-specific official BOAMP record if both sources cover one notice.
     if(!previous||row.match_score>previous.match_score ||
       (row.match_score===previous.match_score&&row.source==='BOAMP'))
      matches.set(unique,row);
    }
   }
  }
  if(matches.size){
   const alerts=[...matches.values()].sort((a,b)=>b.match_score-a.match_score)
    .slice(0,20);
   await store('offrya_tender_alerts?on_conflict=user_id,tender_id',{
    method:'POST',
    headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(alerts)
   });
   insertedCandidates+=alerts.length;
  }
 }
 logger.log('OFFRYA veille officielle : abonnés actifs='+processed+
  ' évaluations='+qualified+' propositions='+insertedCandidates+
  ' sources indisponibles='+failures+' recherches='+queries);
 // Source outages are reported; never fabricate results or alter email consent.
 if(failures&&processed&&qualified===0)process.exitCode=1;
 return {processed,qualified,proposed:insertedCandidates,failures,queries};
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run,cleanRow,queryTerms,fingerprint};
