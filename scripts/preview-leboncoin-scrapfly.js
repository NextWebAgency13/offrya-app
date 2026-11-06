'use strict';
// Aperçu ponctuel d'une page autorisée via Scrapfly. Aucun accès à la DB.
// Exige une autorisation explicite pour l'intermédiaire tiers : pas de proxy implicite présumé autorisé.
const fs=require('node:fs/promises');
const {allowedSearchUrls,detectChallenge}=require('./collect-leboncoin');
const {extractNextData}=require('../lib/leboncoin-next-data');
const {validateFeed}=require('../lib/leboncoin-feed-validation');
const {validationCsv}=require('./import-leboncoin-feed');

const API_ENDPOINT='https://api.scrapfly.io/scrape';
function parisHour(now){
 return Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(now));
}
function verifySettings(env,now=new Date()){
 if(env.LEBONCOIN_SCRAPFLY_ENABLED!=='true')throw Error('Scrapfly OFFRYA désactivé.');
 if(env.LEBONCOIN_SCRAPFLY_PARTNER_APPROVED!=='true')
  throw Error('Autorisation expresse de la collecte via Scrapfly non confirmée.');
 if(env.LEBONCOIN_SCRAPFLY_ROBOTS_REVIEWED!=='true')
  throw Error('Conformité robots.txt non vérifiée.');
 if(env.LEBONCOIN_DRY_RUN==='false')throw Error('Mode Scrapfly limité aux aperçus sans écriture.');
 if(!env.SCRAPFLY_API_KEY||env.SCRAPFLY_API_KEY==='VOTRE_CLE_SCRAPFLY')
  throw Error('Clé Scrapfly absente (secret serveur requis).');
 const hour=parisHour(now);
 if(hour<7||hour>=23)throw Error('Consultation hors de la plage 07:00–23:00 à Paris.');
 const seeds=allowedSearchUrls(env.LEBONCOIN_SEARCH_URLS||'[]');
 if(seeds.length!==1)throw Error('Un seul URL de recherche autorisée par aperçu.');
 return {key:env.SCRAPFLY_API_KEY,url:seeds[0]};
}
function scrapflyRequestUrl(config){
 const req=new URL(API_ENDPOINT);
 req.searchParams.set('key',config.key);
 req.searchParams.set('url',config.url);
 req.searchParams.set('asp','false');
 req.searchParams.set('render_js','false');
 req.searchParams.set('headers[User-Agent]','OFFRYA-Bot/1.0 (+mailto:contact@offrya.fr)');
 return req.toString();
}
async function previewScrapfly({env=process.env,now=new Date(),fetcher=fetch,
 writeFile=fs.writeFile,logger=console}={}){
 const config=verifySettings(env,now);
 let response;
 try{
  response=await fetcher(scrapflyRequestUrl(config),{
   headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(30000)
  });
 }catch{throw Error('Service de récupération indisponible, aucun nouvel essai automatique.');}
 if(!response.ok)throw Error('Scrapfly indisponible (HTTP '+response.status+').');
 const result=await response.json();
 const status=Number(result?.result?.status_code||0);
 if(status===401||status===403||status===429||status>=500)
  throw Error('Accès source refusé ou indisponible ; arrêt de la validation.');
 const content=result?.result?.content;
 if(typeof content!=='string'||content.length>5_000_000)throw Error('Document HTML absent ou trop volumineux.');
 if(detectChallenge(content.slice(0,20000)))throw Error('Protection anti-bot détectée : arrêt sans contournement.');
 const data=extractNextData(content);
 if(!data)throw Error('Données structurées indisponibles : aucune collecte.');
 const {rows,summary}=validateFeed(data,now);
 if(env.LEBONCOIN_VALIDATION_CSV)
  await writeFile(env.LEBONCOIN_VALIDATION_CSV,validationCsv(rows),'utf8');
 if(env.LEBONCOIN_VALIDATION_REPORT)
  await writeFile(env.LEBONCOIN_VALIDATION_REPORT,JSON.stringify({...summary,dryRun:true},null,2)+'\n','utf8');
 logger.info('Scrapfly aperçu OFFRYA : '+JSON.stringify({...summary,dryRun:true,stored:0}));
 return {...summary,stored:0,dryRun:true};
}
if(require.main===module){
 previewScrapfly().catch(err=>{console.error('Validation Scrapfly arrêtée : '+err.message);process.exitCode=1;});
}
module.exports={API_ENDPOINT,parisHour,verifySettings,scrapflyRequestUrl,previewScrapfly};
