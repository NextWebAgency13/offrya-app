'use strict';
// Collecteur Leboncoin : nécessite une autorisation expresse couvrant ces URLs.
// Pas d'évitement des protections, pas de proxy rotatif, pas de connexion cachée.
// Par défaut : aperçu uniquement, aucune écriture en production.
const {leboncoinUrl,cleanListing,aiReview}=require('../lib/leboncoin-demand');
const {MAX_REQUESTS_PER_RUN,MIN_REQUEST_GAP_MS,reserveBudget}=require('../lib/leboncoin-collection-budget');
const {installBrowserGuard}=require('../lib/leboncoin-browser-guard');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const BOT_USER_AGENT='OFFRYA-Bot/1.0 (+mailto:contact@offrya.fr)';
const raw=process.env.LEBONCOIN_SEARCH_URLS||'[]';
const maxPages=1,maxAds=MAX_REQUESTS_PER_RUN-1;
function allowedSearchUrls(value){
 const urls=typeof value==='string'?JSON.parse(value):value;
 if(!Array.isArray(urls)||urls.length>8)throw Error('LEBONCOIN_SEARCH_URLS : tableau limité à 8 entrées.');
 const checked=urls.map(u=>leboncoinUrl(u,{advert:false}));
 if(checked.some(u=>!u))throw Error('URL de recherche Leboncoin non autorisée.');
 for(const safe of checked){
  const q=new URL(safe).searchParams;
  if(q.get('category')!=='34'||!/\b(?:cherche|recherche|besoin|demande|devis|artisan|plombier|jardinier|paysagiste)\b/i.test(q.get('text')||''))
   throw Error('Recherche non ciblée : catégorie services et intention de demande exigées.');
 }
 const unique=[...new Set(checked)];
 if(unique.length>maxPages)throw Error('Une seule recherche ciblée autorisée par exécution.');
 return unique;
}
function detectChallenge(content){
 const t=String(content||'').toLowerCase();
 return /captcha|access denied|just a moment|vérification de sécurité|verification de securite|unusual traffic|robot verification/.test(t);
}
async function readPage(page,url){
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 const code=response?.status()||0;
 if(code===403||code===429||code===401)throw Error('Accès Leboncoin refusé (HTTP '+code+') ; collecte arrêtée.');
 if(code>=500||!response)throw Error('Source Leboncoin indisponible (HTTP '+code+').');
 if(url.includes('/recherche')&&(code===404||code===410))throw Error('Recherche Leboncoin absente (HTTP '+code+').');
 const isSearch=url.includes('/recherche');
 if(typeof page.url==='function'){
  const landed=leboncoinUrl(page.url(),{advert:!isSearch});
  if(landed!==leboncoinUrl(url,{advert:!isSearch}))throw Error('Redirection inattendue : collecte arrêtée.');
 }
 if(code===404||code===410)return code;
 const head=(await page.title())+' '+(await page.locator('body').innerText({timeout:10000})).slice(0,4000);
 if(detectChallenge(head))throw Error('Protection anti-bot ou CAPTCHA détecté : arrêt sans contournement.');
 return code;
}
async function listingLinks(page){
 const hrefs=await page.locator('a[href*="/ad/"]').evaluateAll(anchors=>anchors.map(a=>a.href));
 return [...new Set(hrefs.map(u=>leboncoinUrl(u)).filter(Boolean))].slice(0,maxAds);
}
async function details(page,url){
 const code=await readPage(page,url);
 if(code===404||code===410)return {removed:true,url};
 const payload=await page.evaluate(()=>{
  const meta=document.querySelector('meta[name="description"]')?.content||'';
  const h1=document.querySelector('h1')?.textContent||'';
  const block=document.querySelector('[data-qa-id="adview_description_container"]')
   ||document.querySelector('[data-test-id="ad-description"]');
  let item={};
  for(const node of document.querySelectorAll('script[type="application/ld+json"]')){
   try{
    const parsed=JSON.parse(node.textContent);
    const arr=Array.isArray(parsed)?parsed:[parsed];
    for(const x of arr){
     const candidate=Array.isArray(x?.['@graph'])?x['@graph'].find(v=>v?.description):x;
     if(candidate?.description&&String(candidate.description).length>String(item.description||'').length)
      item=candidate;
    }
   }catch{/* JSON-LD source may be absent or invalid. */}
  }
  const address=item.address||item.location?.address||{};
  const local=(typeof address==='object'&&address)||{};
  return {title:String(h1||item.name||''),description:String(block?.textContent||item.description||meta||''),
   postalCode:String(local.postalCode||''),city:String(local.addressLocality||'')};
 });
 return {...payload,url};
}
// Insertion immuable/idempotente : une annonce expired/rejected n'est jamais réactivée.
async function storeRow(row,{fetcher=fetch}={}){
 const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
  throw Error('Connexion Supabase OFFRYA non configurée (service_role serveur requis).');
 const response=await fetcher(base+'/rest/v1/offrya_external_opportunities?on_conflict=source,source_id',{
  method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,Prefer:'resolution=ignore-duplicates,return=minimal','Content-Type':'application/json'},
  body:JSON.stringify(row),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('Import OFFRYA HTTP '+response.status);
}
async function collect({browserFactory,store=storeRow,logger=console,now=new Date(),env=process.env,
 reserve=reserveBudget,pause=sleep}={}){
 if(env.LEBONCOIN_COLLECTOR_ENABLED!=='true')
  throw Error('Collecteur désactivé : LEBONCOIN_COLLECTOR_ENABLED doit valoir true.');
 const seeds=allowedSearchUrls(env.LEBONCOIN_SEARCH_URLS||'[]');
 if(!seeds.length)throw Error('Aucune URL de recherche autorisée fournie.');
 if(env.LEBONCOIN_COLLECTION_AUTHORIZED!=='true'||env.LEBONCOIN_ROBOTS_REVIEWED!=='true')
  throw Error('Accès direct non autorisé ou robots.txt non contrôlé.');
 const publish=env.LEBONCOIN_REPUBLICATION_AUTHORIZED==='true'&&env.LEBONCOIN_PUBLISH_ENABLED==='true';
 const dryRun=env.LEBONCOIN_DRY_RUN!=='false';
 await reserve(env,'run'); // Interdit une nouvelle collecte avant quatre heures.
 const factory=browserFactory||(()=>require('playwright').chromium.launch({headless:true}));
 const browser=await factory();
 const page=await browser.newPage({locale:'fr-FR',viewport:{width:1280,height:900},
  javaScriptEnabled:false,serviceWorkers:'block',userAgent:BOT_USER_AGENT});
 await installBrowserGuard(page,{allowMock:Boolean(browserFactory)});
 const found=new Set();const rows=[];
 let rejected=0;
 try{
  for(const seed of seeds){
   await reserve(env,'request');
   await readPage(page,seed);
   const links=await listingLinks(page);
   for(const link of links){
    if(found.size>=maxAds)break;
    if(found.has(link))continue;
    found.add(link);
    await pause(MIN_REQUEST_GAP_MS);
    await reserve(env,'request');
    const item=await details(page,link);
    if(item.removed)continue;
    let row=cleanListing(item,now);
    if(!row){rejected++;continue;}
    if(env.LEBONCOIN_AI_REVIEW==='true'){
     if(!env.OPENAI_API_KEY)throw Error('La revue IA a été demandée sans OPENAI_API_KEY.');
     row=await aiReview(row,{apiKey:env.OPENAI_API_KEY});
     if(!row){rejected++;continue;}
    }
    rows.push({...row,status:publish?'published':'staged',published_at:publish?now.toISOString():null});
   }
   if(found.size>=maxAds)break;
   await pause(MIN_REQUEST_GAP_MS);
  }
  if(!dryRun)for(const row of rows)await store(row);
 }finally{await page.close();await browser.close();}
 logger.info('Leboncoin → OFFRYA : '+JSON.stringify({visited:found.size,qualified:rows.length,rejected,
  dryRun,publish:!dryRun&&publish,status:dryRun?'simulation':publish?'published':'staged'}));
 return {visited:found.size,qualified:rows.length,rejected,dryRun,published:!dryRun&&publish?rows.length:0,rows};
}
if(require.main===module){
 collect().catch(e=>{console.error('OFFRYA collecteur arrêté : '+e.message);process.exitCode=1;});
}
module.exports={BOT_USER_AGENT,allowedSearchUrls,detectChallenge,readPage,listingLinks,details,collect,storeRow};
