'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createServer}=require('node:http');
const {execFileSync}=require('node:child_process');
const {handle}=require('../server');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('public/public.css');
const urls=['index.html','professionnels.html','deposer-une-mission.html','connexion.html',
 ...['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'].map(s=>'secteurs/'+s+'.html')];
const hash=require('node:crypto').createHash('sha1').update(Buffer.from('blob '+Buffer.byteLength(css,'utf8')+'\0')).update(css).digest('hex').slice(0,12);
const versioned='/public.'+hash+'.css';

test('CSS : empreinte dérivée de son contenu, référence unique des pages publiques',()=>{
 for(const file of urls){
  const html=read('public/'+file);
  assert.match(html,new RegExp('href="'+versioned.replaceAll('.','\\.')+'"'));
  assert.doesNotMatch(html,/href="\/public\.css"/);
 }
 const server=read('server.js');
 assert.ok(server.includes("const FINGERPRINTED_PUBLIC_CSS='"+versioned+"'"));
 assert.match(server,/FINGERPRINTED_PUBLIC_CSS\?'public\.css':p\.slice\(1\)/);
});
test('Serveur : CSS versionné cache immutable, ancienne URL courte et pages privées protégées',async()=>{
 const server=createServer(handle);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const host='http://127.0.0.1:'+server.address().port;
  for(const [url,cache] of [
   [versioned,/max-age=31536000.*immutable/],
   ['/public.css',/max-age=60/]
  ]){
   const r=await fetch(host+url);
   assert.equal(r.status,200,url);
   assert.match(r.headers.get('content-type'),/text\/css/,url);
   assert.match(r.headers.get('cache-control'),cache,url);
   assert.equal(await r.text(),css,url);
  }
  assert.equal((await fetch(host+'/public.deadbeefcafe.css')).status,404);
  const secure=await fetch(host+'/espace');
  assert.match(secure.headers.get('cache-control'),/no-store/);
  const auth=await fetch(host+'/connexion');
  assert.match(auth.headers.get('cache-control'),/no-store/);
  const logo=await fetch(host+'/logo-offrya.svg');
  assert.equal(logo.status,200);
  assert.match(logo.headers.get('content-type'),/image\/svg\+xml/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Sitemap : 14 URL canoniques avec lastmod validable, sans pages privées ni connexion',()=>{
 const xml=read('public/sitemap.xml');
 const urlsInXml=[...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d\d-\d\d)<\/lastmod><\/url>/g)];
 assert.equal(urlsInXml.length,14);
 for(const [,loc,date] of urlsInXml){
  assert.ok(loc.startsWith('https://offrya-app.onrender.com/'));
  assert.ok(!loc.includes('/espace')&&!loc.includes('/connexion'));
  assert.equal(new Date(date+'T00:00:00Z').toISOString().slice(0,10),date);
  assert.ok(date<='2026-11-02');
 }
 assert.doesNotMatch(xml,/<changefreq>|<priority>/);
});
test('Meta SEO : cinq descriptions légales utiles, uniques et concordantes avec Open Graph',()=>{
 const docs=['cgv','confidentialite','remboursements','contact','mentions-legales'];
 const descriptions=new Set();
 for(const doc of docs){
  const s=read('public/'+doc+'.html');
  const title=s.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc=s.match(/<meta name="description" content="([^"]+)"/)?.[1];
  const og=s.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
  assert.ok(title&&desc&&og,doc);
  assert.notEqual(title,desc,doc);
  assert.ok(desc.length>75&&desc.length<200,doc);
  assert.equal(desc,og);
  assert.ok(!descriptions.has(desc));
  descriptions.add(desc);
 }
});
test('JSON-LD : graphe factuel de la plateforme avec logo distinct du favicon',()=>{
 const s=read('public/index.html');
 const found=[...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
 assert.equal(found.length,1);
 const json=JSON.parse(found[0][1]);
 assert.equal(json['@context'],'https://schema.org');
 assert.deepEqual(json['@graph'].map(x=>x['@type']),['Organization','WebSite','WebPage','Service']);
 const org=json['@graph'][0],service=json['@graph'][3];
 assert.equal(org.logo,'https://offrya-app.onrender.com/logo-offrya.svg');
 assert.ok(!org.logo.endsWith('favicon.svg'));
 assert.equal(service.provider['@id'],org['@id']);
 assert.equal(service.areaServed.name,'France');
 assert.doesNotMatch(found[0][1],/AggregateRating|Review|ratingValue|foundingDate|numberOfEmployees/);
 const logo=read('public/logo-offrya.svg');
 assert.match(logo,/width="640" height="180"/);
 assert.match(logo,/OFFRYA/);
});
test('Intégration locale de Pexels : exécution volontaire uniquement et mode dry-run',()=>{
 const source=read('scripts/vendor-pexels-images.cjs');
 assert.match(source,/process\.argv\.includes\('--apply'\)/);
 assert.match(source,/fetch\(url,/);
 assert.match(source,/JPEG invalide ou volumineux/);
 assert.match(source,/FINGERPRINTED_PUBLIC_CSS/);
 const output=execFileSync(process.execPath,[path.join(root,'scripts/vendor-pexels-images.cjs')],{encoding:'utf8'});
 assert.match(output,/DRY-RUN/);
 assert.match(output,/aucune modification/);
});
