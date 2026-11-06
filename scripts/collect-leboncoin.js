'use strict';
// Collecteur Leboncoin : nécessite une autorisation expresse couvrant ces URLs.
// Pas d'évitement des protections, pas de proxy rotatif, pas de connexion cachée.
// Par défaut : aperçu uniquement, aucune écriture en production.
const {leboncoinUrl,cleanListing,aiReview}=require('../lib/leboncoin-demand');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const raw=process.env.LEBONCOIN_SEARCH_URLS||'[]';
const maxPages=8,maxAds=40;
function allowedSearchUrls(value){
 const urls=typeof value==='string'?JSON.parse(value):value;
 if(!Array.isArray(urls)||urls.length>maxPages)throw Error('LEBONCOIN_SEARCH_URLS : 1 à 8 URL de recherche autorisées.');
 const checked=urls.map(u=>leboncoinUrl(u,{advert:false}));
 if(checked.some(u=>!u))throw Error('URL de recherche Leboncoin non autorisée.');
 return [...new Set(checked)];
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
 const head=(await page.title())+' '+(await page.locator('body').innerText({timeout:10000})).slice(0,350);
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
async function storeRow(row,{fetcher=fetch}={}){
 const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base)||!key)
  throw Error('Connexion Supabase OFFRYA non configurée (service_role serveur requis).');
 const response=await fetcher(base+'/rest/v1/offrya_external_opportunities?on_conflict=source,source_id',{
  method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,Prefer:'resolution=merge-duplicates,return=minimal','Content-Type':'application/json'},
  body:JSON.stringify(row),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('Import OFFRYA HTTP '+response.status);
}
async function collect({browserFactory,store=storeRow,logger=console,now=new Date(),env=process.env}={}){
 if(env.LEBONCOIN_COLLECTOR_ENABLED!=='true')
  throw Error('Collecteur désactivé : LEBONCOIN_COLLECTOR_ENABLED doit valoir true.');
 const seeds=allowedSearchUrls(env.LEBONCOIN_SEARCH_URLS||'[]');
 if(!seeds.length)throw Error('Aucune URL de recherche autorisée fournie.');
 const publish=env.LEBONCOIN_REPUBLICATION_AUTHORIZED==='true'&&env.LEBONCOIN_PUBLISH_ENABLED==='true';
 const dryRun=env.LEBONCOIN_DRY_RUN!=='false';
 const factory=browserFactory||(()=>require('playwright').chromium.launch({headless:true}));
 const browser=await factory();
 const page=await browser.newPage({locale:'fr-FR',viewport:{width:1280,height:900}});
 const found=new Set();const rows=[];
 let rejected=0;
 try{
  for(const seed of seeds){
   await readPage(page,seed);
   const links=await listingLinks(page);
   for(const link of links){
    if(found.size>=maxAds)break;
    if(found.has(link))continue;
    found.add(link);
    await sleep(3500);
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
   await sleep(3500);
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
module.exports={allowedSearchUrls,detectChallenge,listingLinks,details,collect,storeRow};