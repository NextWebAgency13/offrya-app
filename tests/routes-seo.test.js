'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createServer}=require('node:http');
const {handle}=require('../server');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const publicPaths=['/','/deposer-une-mission','/professionnels','/connexion','/secteurs/batiment','/secteurs/nettoyage','/secteurs/espaces-verts','/secteurs/transport','/secteurs/informatique','/secteurs/autres-prestations','/cgv.html','/confidentialite.html','/remboursements.html','/contact.html','/mentions-legales.html'];
const privatePaths=['/espace','/espace/missions','/espace/marches-publics','/espace/messagerie','/espace/reglages','/espace/professionnel'];
let server,base;
test.before(async()=>{server=createServer(handle);await new Promise(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+server.address().port;});
test.after(async()=>{await new Promise(done=>server.close(done));});
test('Accès direct à chaque document public, SEO et H1 unique',async()=>{
 for(const p of publicPaths){
  const r=await fetch(base+p);assert.equal(r.status,200,p);
  assert.match(r.headers.get('content-type'),/text\/html/,p);
  const html=await r.text();assert.equal((html.match(/<h1\b/gi)||[]).length,1,p);
  assert.match(html,/<title>[^<]+<\/title>/,p);
  assert.match(html,/<meta name="description" content="/,p);
  assert.match(html,/<link rel="canonical" href="https:\/\/offrya-app.onrender.com\//,p);
  if(p==='/connexion'){assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(html,/name="robots" content="noindex,nofollow"/);}else assert.equal(r.headers.get('x-robots-tag'),null,p);
  for(const legal of ['/cgv.html','/confidentialite.html','/remboursements.html','/contact.html','/mentions-legales.html'])assert.ok(html.includes('href="'+legal+'"'),p+' missing '+legal);
 }
});
test('Chemins privés : HTTP 200, noindex en HTML et en en-tête, aucune donnée utilisateur',async()=>{
 for(const p of privatePaths){
  const r=await fetch(base+p);
  assert.equal(r.status,200,p);assert.match(r.headers.get('x-robots-tag'),/noindex/);
  assert.match(r.headers.get('cache-control'),/private, no-store/);
  const html=await r.text();assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.equal((html.match(/<h1\b/gi)||[]).length,1);
  assert.doesNotMatch(html,/Les opportunités prennent forme|Votre projet mérite le bon professionnel/i);
 }
});
test('Vraie 404 et aucune fuite d’API ou de fichier',async()=>{
 for(const p of ['/espace/sans-route','/secteurs/inconnue','/robots-unknown','/secrets.env','/sql/schema.sql']){
  const r=await fetch(base+p);assert.equal(r.status,404,p);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(await r.text(),/Cette page n'existe pas/);
 }
 assert.equal((await fetch(base+'/app.js')).status,200);
 assert.equal((await fetch(base+'/public.css')).status,200);
 const activity=await fetch(base+'/activity.js');assert.equal(activity.status,200);assert.match(activity.headers.get('content-type'),/javascript/);
 assert.equal((await fetch(base+'/connexion.js')).status,200);
 const feedback=await fetch(base+'/auth-feedback.mjs');assert.equal(feedback.status,200);
 assert.match(feedback.headers.get('content-type'),/text\/javascript/);
 assert.equal((await fetch(base+'/legacy-redirect.js')).status,200);
 assert.equal((await fetch(base+'/deposer.js')).status,200);
});
test('Robots et sitemap : seules les pages publiques sont listées, noindex atteignable',async()=>{
 const robots=await fetch(base+'/robots.txt'),sitemap=await fetch(base+'/sitemap.xml');
 assert.equal(robots.status,200);assert.match(robots.headers.get('content-type'),/text\/plain/);
 assert.equal(sitemap.status,200);assert.match(sitemap.headers.get('content-type'),/xml/);
 const rt=await robots.text(),xml=await sitemap.text();
 assert.match(rt,/Sitemap: https:\/\/offrya-app.onrender.com\/sitemap.xml/);
 assert.doesNotMatch(rt,/Disallow:\s*\/espace/);
 for(const p of publicPaths.filter(p=>p!=='/connexion'))assert.ok(xml.includes('https://offrya-app.onrender.com'+p+'</loc>'),p);
 assert.doesNotMatch(xml,/<loc>[^<]*\/espace(?:\/|<)/);
});
test('Anciens fragments, lien de connexion et retour profond sur page autorisée',()=>{
 const home=read('public/index.html'),legacy=read('public/legacy-redirect.js'),app=read('public/app.js'),login=read('public/connexion.js');
 assert.match(home,/src="\/legacy-redirect\.js"/);
 for(const [hash,to] of [['dashboard','/espace'],['missions','/espace/missions'],['professional','/professionnels'],['professional-space','/espace/professionnel'],['tenders','/espace/marches-publics'],['messages','/espace/messagerie'],['settings','/espace/reglages'],['boamp','/espace/marches-publics'],['inbox','/espace/messagerie']]){
  assert.ok(legacy.includes((hash==='professional-space'?"'"+hash+"'":hash)+':\''+to+'\''),hash);
 }
 assert.match(app,/location\.replace\('\/connexion\?next='/);
 assert.match(app,/pathsReverse\[location.pathname\]/);
 assert.match(login,/const value=query\.get\('next'\)/);
 assert.match(login,/^.*location\.replace\(next\)/m);
 assert.doesNotMatch(login,/signInWithOtp|shouldCreateUser:false/);
 assert.match(login,/resetPasswordForEmail/);
});
test('Stripe : paiement, portail et Identity reviennent sur les routes privées',()=>{
 const billing=read('lib/billing.js'),identity=read('lib/identity.js');
 assert.match(billing,/espace\/professionnel\?checkout=success/);
 assert.match(billing,/espace\/professionnel\?checkout=cancelled/);
 assert.match(billing,/espace\/reglages\?billing=returned/);
 assert.match(identity,/espace\/professionnel\?identity=returned/);
 assert.match(read('public/app.js'),/p\.has\('checkout'\)/);
});
test('Accueil rapide : aucun module Supabase ni consultation de mission privée',()=>{
 const home=read('public/index.html');
 assert.doesNotMatch(home,/src="\/app.js"|src="\/deposer.js"|from\('offrya_missions'\)|<script type="module"/);
 assert.match(home,/Déposez gratuitement votre mission/);
});

test('Tous les modules frontend passent l’analyse syntaxique Node sans exécution',()=>{
 const {spawnSync}=require('node:child_process');
 for(const filename of ['public/app.js','public/deposer.js','public/connexion.js']){
  const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:read(filename),encoding:'utf8'});
  assert.equal(check.status,0,filename+': '+check.stderr);
 }
});
