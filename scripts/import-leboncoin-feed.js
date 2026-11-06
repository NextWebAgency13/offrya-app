'use strict';
// Import OFFRYA d'un export JSON fourni dans le cadre d'un accès autorisé.
// Aucun accès réseau à Leboncoin ni contournement de mesures anti-robot.
const fs=require('node:fs/promises');
const {qualifiedAd,parseSearchNextData}=require('../lib/leboncoin-next-data');
const {cleanListing}=require('../lib/leboncoin-demand');
const {storeRow}=require('./collect-leboncoin');
const MAX_ITEMS=40;

function inputAds(input){
 const source=typeof input==='string'?JSON.parse(input):input;
 if(Array.isArray(source))return source.map(qualifiedAd).filter(Boolean);
 const next=parseSearchNextData(source);
 if(next!==null)return next;
 if(Array.isArray(source?.ads))return source.ads.map(qualifiedAd).filter(Boolean);
 throw Error('Export JSON incompatible : tableau ads ou props.pageProps.searchData.ads requis.');
}
function prepare(input,now=new Date()){
 const seen=new Set(),rows=[];
 for(const item of inputAds(input)){
  if(seen.has(item.url))continue;
  seen.add(item.url);
  const row=cleanListing(item,now);
  if(row)rows.push(row);
  if(rows.length>=MAX_ITEMS)break;
 }
 return rows;
}
async function importFeed({env=process.env,readFile=fs.readFile,store=storeRow,logger=console,now=new Date()}={}){
 if(env.LEBONCOIN_FEED_ENABLED!=='true')throw Error('Import de flux non activé.');
 if(typeof env.LEBONCOIN_FEED_FILE!=='string'||!env.LEBONCOIN_FEED_FILE.trim())
  throw Error('LEBONCOIN_FEED_FILE est requis.');
 const text=await readFile(env.LEBONCOIN_FEED_FILE,'utf8');
 const rows=prepare(text,now);
 const dryRun=env.LEBONCOIN_DRY_RUN!=='false';
 const publish=env.LEBONCOIN_REPUBLICATION_AUTHORIZED==='true'&&env.LEBONCOIN_PUBLISH_ENABLED==='true';
 if(!dryRun){
  for(const row of rows)await store({...row,status:publish?'published':'staged',
   published_at:publish?now.toISOString():null});
 }
 logger.info('OFFRYA export autorisé : '+JSON.stringify({qualified:rows.length,dryRun,published:!dryRun&&publish?rows.length:0}));
 return {qualified:rows.length,dryRun,published:!dryRun&&publish?rows.length:0};
}
if(require.main===module)importFeed().catch(error=>{
 console.error('Import OFFRYA arrêté : '+error.message);process.exitCode=1;
});
module.exports={inputAds,prepare,importFeed,MAX_ITEMS};
