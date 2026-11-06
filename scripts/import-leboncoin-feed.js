'use strict';
// Validation et import de flux JSON obtenus avec un accès expressément autorisé.
// Ne démarre aucun scraping et ne conserve ni contacts ni annonces rejetées.
const fs=require('node:fs/promises');
const {qualifiedAd}=require('../lib/leboncoin-next-data');
const {rawAds,validateFeed,MAX_ROWS}=require('../lib/leboncoin-feed-validation');
const {storeRow}=require('./collect-leboncoin');
const MAX_ITEMS=MAX_ROWS;

function inputAds(input){return rawAds(input).map(qualifiedAd).filter(Boolean);}
function prepare(input,now=new Date()){return validateFeed(input,now).rows;}
const CSV_HEADERS=['source','source_id','source_url','title','summary','category','department','city','confidence','source_last_seen_at','status_import'];
function csvCell(value){
 let text=value==null?'':String(value);
 // Empêche les formules exécutables lors de l'ouverture dans un tableur.
 if(/^[\s]*[=+@-]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
function validationCsv(rows){
 return CSV_HEADERS.join(',')+'\n'+rows.map(row=>
  CSV_HEADERS.map(key=>csvCell(key==='status_import'?'ready':row[key])).join(',')
 ).join('\n')+'\n';
}
const MAX_FEED_BYTES=5_000_000;
// Télécharge l'export remis par Leboncoin ou un partenaire autorisé (URL HTTPS + jeton facultatif).
async function downloadFeed(rawUrl,token,{fetcher=fetch}={}){
 let url;
 try{url=new URL(String(rawUrl).trim());}catch{throw Error('LEBONCOIN_FEED_URL invalide.');}
 if(url.protocol!=='https:')throw Error('LEBONCOIN_FEED_URL doit être en HTTPS.');
 if(url.username||url.password)throw Error('LEBONCOIN_FEED_URL ne doit pas contenir d’identifiants.');
 const headers={Accept:'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetcher(url.toString(),{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Téléchargement du flux HTTP '+response.status);
 const declared=Number(response.headers?.get?.('content-length')||0);
 if(declared>MAX_FEED_BYTES)throw Error('Export trop volumineux');
 const text=await response.text();
 if(text.length>MAX_FEED_BYTES)throw Error('Export trop volumineux');
 return text;
}
async function loadFeed(env,{readFile,fetcher}){
 const url=typeof env.LEBONCOIN_FEED_URL==='string'?env.LEBONCOIN_FEED_URL.trim():'';
 if(url)return downloadFeed(url,env.LEBONCOIN_FEED_TOKEN,{fetcher});
 if(typeof env.LEBONCOIN_FEED_FILE!=='string'||!env.LEBONCOIN_FEED_FILE.trim())
  throw Error('LEBONCOIN_FEED_URL ou LEBONCOIN_FEED_FILE est requis.');
 return readFile(env.LEBONCOIN_FEED_FILE,'utf8');
}
async function importFeed({env=process.env,readFile=fs.readFile,writeFile=fs.writeFile,store=storeRow,
 logger=console,now=new Date(),fetcher=fetch}={}){
 if(env.LEBONCOIN_FEED_ENABLED!=='true')throw Error('Import de flux non activé.');
 const text=await loadFeed(env,{readFile,fetcher});
 const {rows,summary}=validateFeed(text,now);
 const dryRun=env.LEBONCOIN_DRY_RUN!=='false';
 const publish=env.LEBONCOIN_REPUBLICATION_AUTHORIZED==='true'&&env.LEBONCOIN_PUBLISH_ENABLED==='true';
 if(env.LEBONCOIN_VALIDATION_CSV)await writeFile(env.LEBONCOIN_VALIDATION_CSV,validationCsv(rows),'utf8');
 if(env.LEBONCOIN_VALIDATION_REPORT)await writeFile(env.LEBONCOIN_VALIDATION_REPORT,
  JSON.stringify({...summary,dryRun,publicationEnabled:publish},null,2)+'\n','utf8');
 let sent=0;
 if(!dryRun)for(const row of rows){
  await store({...row,status:publish?'published':'staged',published_at:publish?now.toISOString():null});
  sent++;
 }
 logger.info('OFFRYA export autorisé : '+JSON.stringify({...summary,dryRun,sent,
  published:!dryRun&&publish?sent:0}));
 return {...summary,qualified:rows.length,dryRun,sent,published:!dryRun&&publish?sent:0};
}
if(require.main===module)importFeed().catch(error=>{
 console.error('Import OFFRYA arrêté : '+error.message);process.exitCode=1;
});
module.exports={inputAds,prepare,importFeed,downloadFeed,validationCsv,MAX_ITEMS};
