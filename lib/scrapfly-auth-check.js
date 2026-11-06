'use strict';
// Vérification ponctuelle de la clé serveur Scrapfly sur un endpoint de démonstration.
// Aucun accès à Leboncoin, aucun stockage de contenu, aucune publication, aucun retry.
const ENDPOINT='https://api.scrapfly.io/scrape';
const DEMO_URL='https://httpbin.dev/html';
async function checkScrapflyAuthentication({env=process.env,fetcher=fetch,logger=console}={}){
 const key=String(env.SCRAPFLY_API_KEY||'').trim();
 if(!key||key==='VOTRE_CLE_SCRAPFLY'){
  logger.warn('Scrapfly diagnostic : CLE_ABSENTE');
  return {ok:false,reason:'missing_key'};
 }
 const request=new URL(ENDPOINT);
 request.searchParams.set('key',key);
 request.searchParams.set('url',DEMO_URL);
 request.searchParams.set('asp','false');
 request.searchParams.set('render_js','false');
 // Ne jamais journaliser request, la réponse JSON ni une erreur pouvant contenir la clé.
 let response;
 try{
  response=await fetcher(request.toString(),{
   method:'GET',headers:{Accept:'application/json'},redirect:'error',
   signal:AbortSignal.timeout(20000)
  });
 }catch{
  logger.warn('Scrapfly diagnostic : ERREUR_RESEAU');
  return {ok:false,reason:'network'};
 }
 const code=Number(response?.status||0);
 if(!response.ok){
  logger.warn('Scrapfly diagnostic : HTTP_'+code);
  return {ok:false,reason:'http_error',httpStatus:code};
 }
 let result;
 try{result=await response.json();}catch{
  logger.warn('Scrapfly diagnostic : REPONSE_NON_JSON');
  return {ok:false,reason:'invalid_json'};
 }
 const sourceCode=Number(result?.result?.status_code||0);
 if(sourceCode===200&&typeof result?.result?.content==='string'&&result.result.content.length>30){
  logger.info('Scrapfly diagnostic : AUTHENTIFICATION_OK / PAGE_DEMO_OK');
  return {ok:true,sourceStatus:200};
 }
 logger.warn('Scrapfly diagnostic : REPONSE_INCOMPLETE / SOURCE_HTTP_'+sourceCode);
 return {ok:false,reason:'unexpected_result',sourceStatus:sourceCode};
}
module.exports={ENDPOINT,DEMO_URL,checkScrapflyAuthentication};
