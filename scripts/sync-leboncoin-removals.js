'use strict';
// Synchronisation prudente des annonces Leboncoin précédemment publiées sur OFFRYA.
// Refus, CAPTCHA, timeout, redirection inattendue et erreurs temporaires ne sont JAMAIS des suppressions.
// Deux constats explicites espacés d'au moins 15 minutes sont requis avant de masquer une annonce.
const {leboncoinUrl}=require('../lib/leboncoin-demand');
const {detectChallenge}=require('./collect-leboncoin');
const {MAX_REQUESTS_PER_RUN,MIN_REQUEST_GAP_MS,reserveBudget}=require('../lib/leboncoin-collection-budget');
const {installBrowserGuard}=require('../lib/leboncoin-browser-guard');
const MIN_RECHECK_MS=15*60*1000;
const MAX_CHECKS=MAX_REQUESTS_PER_RUN-1;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function supabaseConfig(env){
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=env.SUPABASE_SECRET_KEY;
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
  throw Error('Configuration Supabase OFFRYA indisponible.');
 return {base,key};
}
async function fetchRows(env,now=new Date(),fetcher=fetch){
 const {base,key}=supabaseConfig(env);
 const cutoff=new Date(now.getTime()-MIN_RECHECK_MS).toISOString();
 const query=new URLSearchParams({
  select:'id,source,source_id,source_url,status,last_checked_at,missing_checks,first_missing_at',
  source:'eq.leboncoin',status:'eq.published',
  or:'(last_checked_at.is.null,last_checked_at.lt.'+cutoff+')',
  order:'last_checked_at.asc.nullsfirst',limit:String(MAX_CHECKS)
 });
 const response=await fetcher(base+'/rest/v1/offrya_external_opportunities?'+query,{
  headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('Lecture synchronisation OFFRYA HTTP '+response.status);
 const rows=await response.json();
 if(!Array.isArray(rows))throw Error('Résultat de veille invalide.');
 return rows;
}
function safetyUrl(current,expected){
 return Boolean(leboncoinUrl(current)&&leboncoinUrl(current)===leboncoinUrl(expected));
}
async function inspect(page,row){
 const url=leboncoinUrl(row.source_url);
 if(!url||String(row.source_id)!==url.match(/\/(\d{7,12})\/?$/)?.[1])
  return {state:'unknown',reason:'invalid_url'};
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 if(!response)throw Error('Leboncoin : aucune réponse, arrêt de la synchronisation.');
 const status=response.status();
 if([401,403,429].includes(status)||status>=500)
  throw Error('Leboncoin : accès limité ou source indisponible (HTTP '+status+').');
 if(!safetyUrl(page.url(),url))
  return {state:'unknown',reason:'unexpected_redirect'};
 const heading=String(await page.title()||'');
 const text=String(await page.locator('body').innerText({timeout:10000})||'').slice(0,1600);
 if(detectChallenge(heading+' '+text))
  throw Error('Leboncoin : CAPTCHA ou contrôle anti-bot, arrêt.');
 if(status===404||status===410)return {state:'missing',reason:'http_'+status};
 if(status!==200)return {state:'unknown',reason:'http_'+status};
 const h1=String(await page.locator('h1').first().textContent({timeout:6000}).catch(()=>'')) .trim();
 // Un message explicite dans le titre (pas une simple absence des résultats).
 if(/^(?:cette |l['’])?annonce (?:n['’]est plus disponible|a été supprimée|est indisponible)$/i.test(h1))
  return {state:'missing',reason:'explicit_unavailable'};
 const description=String(await page.locator('[data-qa-id="adview_description_container"],[data-test-id="ad-description"]').first().textContent({timeout:4000}).catch(()=>'')) .trim();
 if(h1.length>=8&&description.length>=15)return {state:'active',reason:'detail_visible'};
 return {state:'unknown',reason:'insufficient_content'};
}
function transition(row,observation,now=new Date()){
 if(row.status!=='published')return null;
 const at=now.toISOString();
 if(observation.state==='active'){
  return {last_checked_at:at,missing_checks:0,first_missing_at:null};
 }
 if(observation.state==='missing'){
  const count=Math.max(0,Math.min(2,Number(row.missing_checks)||0));
  const first=Date.parse(row.first_missing_at||'');
  if(count>=1&&Number.isFinite(first)&&now.getTime()-first>=MIN_RECHECK_MS){
   return {last_checked_at:at,missing_checks:2,first_missing_at:row.first_missing_at,
    status:'expired',expired_at:at,removal_reason:observation.reason};
  }
  return {last_checked_at:at,missing_checks:1,first_missing_at:count&&Number.isFinite(first)?row.first_missing_at:at};
 }
 // État indéterminé : ne pas toucher au nombre de constats déjà accumulés.
 return {last_checked_at:at};
}
async function updateRow(env,row,changes,fetcher=fetch){
 if(!uuid.test(String(row.id||''))||!Number.isInteger(Number(row.missing_checks)))
  throw Error('Annonce externe : identifiant ou état invalide.');
 const {base,key}=supabaseConfig(env);
 const qs=new URLSearchParams({id:'eq.'+row.id,status:'eq.published',
  missing_checks:'eq.'+Number(row.missing_checks),select:'id'});
 const response=await fetcher(base+'/rest/v1/offrya_external_opportunities?'+qs,{
  method:'PATCH',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',
   Accept:'application/json',Prefer:'return=representation'},
  body:JSON.stringify(changes),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('Écriture synchronisation OFFRYA HTTP '+response.status);
 const entries=await response.json();
 return Array.isArray(entries)&&entries.length===1;
}
async function synchronize({env=process.env,browserFactory,load=fetchRows,save=updateRow,
 logger=console,pause=sleep,now=new Date(),reserve=reserveBudget}={}){
 if(env.LEBONCOIN_SYNC_ENABLED!=='true')throw Error('Synchronisation non activée.');
 if(env.LEBONCOIN_COLLECTOR_ENABLED!=='true')throw Error('Autorisation de collecte non activée.');
 if(env.LEBONCOIN_COLLECTION_AUTHORIZED!=='true'||env.LEBONCOIN_ROBOTS_REVIEWED!=='true')
  throw Error('Accès direct non autorisé ou robots.txt non contrôlé.');
 const dryRun=env.LEBONCOIN_DRY_RUN!=='false';
 const records=await load(env,now);
 await reserve(env,'run');
 if(!Array.isArray(records))throw Error('Liste de synchronisation invalide.');
 const factory=browserFactory||(()=>require('playwright').chromium.launch({headless:true}));
 const browser=await factory();
 const page=await browser.newPage({locale:'fr-FR',javaScriptEnabled:false,serviceWorkers:'block'});
 await installBrowserGuard(page,{allowMock:Boolean(browserFactory)});
 let checked=0,expired=0,uncertain=0;
 try{
  for(const row of records.slice(0,MAX_CHECKS)){
   if(row.status!=='published')continue;
   await pause(MIN_REQUEST_GAP_MS);
   await reserve(env,'request');
   const observed=await inspect(page,row); // Erreur source => arrêt global, pas de retrait.
   const changes=transition(row,observed,now);
   if(!changes)continue;
   checked++;
   if(observed.state==='unknown')uncertain++;
   if(!dryRun){
    const updated=await save(env,row,changes);
    if(updated&&changes.status==='expired')expired++;
   }
  }
 }finally{await page.close();await browser.close();}
 logger.info('Synchronisation externe : '+JSON.stringify({checked,expired,uncertain,dryRun}));
 return {checked,expired,uncertain,dryRun};
}
if(require.main===module){
 synchronize().catch(error=>{console.error('Synchronisation arrêtée : '+error.message);process.exitCode=1;});
}
module.exports={MIN_RECHECK_MS,fetchRows,inspect,transition,updateRow,synchronize};
