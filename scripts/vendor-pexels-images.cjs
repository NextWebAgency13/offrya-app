#!/usr/bin/env node
'use strict';
// Préparation HORS PRODUCTION des photos de la vitrine.
// Exemple : node scripts/vendor-pexels-images.cjs --apply
// Sans --apply, aucun fichier n'est écrit.
// Cette commande ne doit jamais faire partie du démarrage Render.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const cssPath=path.join(root,'public','public.css');
const host='https://images.pexels.com';
const pattern=/https:\/\/images\.pexels\.com\/photos\/(\d+)\/pexels-photo-\1\.jpeg\?auto=compress&cs=tinysrgb&w=(\d+)/g;

function fingerprint(css){
 const bytes=Buffer.from(css,'utf8');
 return crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex').slice(0,12);
}
async function main(){
 const css=await fs.readFile(cssPath,'utf8');
 const sources=[...new Map([...css.matchAll(pattern)].map(match=>{
  const id=match[1],width=Number(match[2]);
  if(!Number.isInteger(width)||width<100||width>1800)throw Error('Largeur non autorisée');
  const file='pexels-'+id+'-'+width+'.jpg';
  return [match[0],{url:match[0],file,path:'/images/'+file,id,width}];
 })).values()];
 if(!sources.length)throw Error('Aucune image Pexels à intégrer ; rien à faire');
 if(!process.argv.includes('--apply')){
  console.log('DRY-RUN : '+sources.length+' images à rapatrier, aucune modification.');
  for(const item of sources)console.log(item.path+' <- '+item.url);
  return;
 }
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'offrya-pexels-'));
 const serverPath=path.join(root,'server.js');
 const oldServer=await fs.readFile(serverPath,'utf8');
 const head=oldServer.match(/const FINGERPRINTED_PUBLIC_CSS='(\/public\.[0-9a-f]{12}\.css)';/);
 if(!head)throw Error('Route CSS fingerprintée introuvable, arrêter sans modification');
 const htmlFiles=['index.html','professionnels.html','deposer-une-mission.html','connexion.html',
  ...['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'].map(s=>'secteurs/'+s+'.html')];
 const html=new Map();
 for(const file of htmlFiles){
  const text=await fs.readFile(path.join(root,'public',file),'utf8');
  if(!text.includes(head[1]))throw Error('Lien CSS non versionné '+file);
  html.set(file,text);
 }
 try{
  // Échec fermé si le CDN n'est pas accessible. Ne jamais substituer
  // une image vide, une autre photo, ni casser l'expérience en ligne.
  let total=0;
  for(const item of sources){
   const url=new URL(item.url);
   if(url.origin!==host)throw Error('Domaine inattendu');
   const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{accept:'image/jpeg'}});
   if(!response.ok)throw Error('Téléchargement '+item.id+' HTTP '+response.status);
   const mime=response.headers.get('content-type')||'';
   if(!mime.startsWith('image/jpeg'))throw Error('Type JPEG attendu '+item.id+' : '+mime);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length<1000||bytes.length>3000000||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)
    throw Error('JPEG invalide ou volumineux '+item.id);
   total+=bytes.length;
   if(total>15000000)throw Error('Assets trop volumineux (15 Mo maximum)');
   await fs.writeFile(path.join(tmp,item.file),bytes);
  }
  let newCss=css;
  for(const item of sources)newCss=newCss.replaceAll(item.url,item.path);
  if(newCss.includes(host))throw Error('Référence CDN restante');
  const newCssUrl='/public.'+fingerprint(newCss)+'.css';
  let newServer=oldServer.replace(head[0],"const FINGERPRINTED_PUBLIC_CSS='"+newCssUrl+"';");
  const mapAnchor="['/logo-offrya.svg','image/svg+xml'],";
  if(!newServer.includes(mapAnchor))throw Error('Insertion de la liste blanche impossible');
  const imageRoutes=sources.map(x=>"['"+x.path+"','image/jpeg'],").join('');
  newServer=newServer.replace(mapAnchor,mapAnchor+imageRoutes);
  const cspOld="img-src 'self' data: https://images.pexels.com;";
  if(!newServer.includes(cspOld))throw Error('CSP originale introuvable');
  newServer=newServer.replace(cspOld,"img-src 'self' data:;");
  const preload='<link rel="preload" href="/images/pexels-34670926-1250.jpg" as="image" type="image/jpeg" fetchpriority="high">';
  if(!sources.some(x=>x.path==='/images/pexels-34670926-1250.jpg'))throw Error('Image principale non présente');
  const home=html.get('index.html');
  if(!home.includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml">'))throw Error('Insertion preload impossible');
  html.set('index.html',home.replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">','<link rel="icon" href="/favicon.svg" type="image/svg+xml">'+preload));
  // La vérification des images a réussi. Seulement maintenant écrire les
  // fichiers dans l'arborescence de travail (jamais sur GitHub ni Render).
  await fs.mkdir(path.join(root,'public','images'),{recursive:true});
  for(const item of sources)await fs.copyFile(path.join(tmp,item.file),path.join(root,'public','images',item.file));
  await fs.writeFile(cssPath,newCss);
  await fs.writeFile(serverPath,newServer);
  for(const [file,text] of html)await fs.writeFile(path.join(root,'public',file),text.replaceAll(head[1],newCssUrl));
  console.log('Assets intégrés localement : '+sources.length+' images, '+total+' octets.');
  console.log('Nouveau CSS : '+newCssUrl);
  console.log('Contrôler git diff, npm test et l’aperçu avant tout merge.');
 }finally{
  await fs.rm(tmp,{force:true,recursive:true});
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
