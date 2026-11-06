'use strict';
// Ne permet que la navigation HTML de premier niveau vers les pages de recherche
// et annonces autorisées. Refuse images, scripts, CSS, traqueurs et sous-cadres.
const {leboncoinUrl}=require('./leboncoin-demand');
function allowedDocument(request,page){
 try{
  if(request.resourceType()!=='document'||!request.isNavigationRequest())return false;
  if(request.redirectedFrom())return false;
  if(request.frame()!==page.mainFrame())return false;
  const url=request.url();
  return Boolean(leboncoinUrl(url)||leboncoinUrl(url,{advert:false}));
 }catch{return false;}
}
async function installBrowserGuard(page,{allowMock=false}={}){
 if(!page||typeof page.route!=='function'){
  if(allowMock)return false;
  throw Error('Interceptation des requêtes réseau obligatoire pour consulter la source.');
 }
 await page.route('**/*',route=>allowedDocument(route.request(),page)?
  route.continue():route.abort());
 return true;
}
module.exports={allowedDocument,installBrowserGuard};
