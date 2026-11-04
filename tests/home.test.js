'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),privatePage=read('public/espace.html'),app=read('public/app.js'),server=read('server.js');
test('Vitrine publique autonome : accroche unique, contenu SEO et aucun tableau de bord',()=>{
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
 assert.match(home,/<h1 id="heroHeading">Votre projet mérite<br>le bon <span>professionnel\.<\/span><\/h1>/);
 assert.match(home,/Déposez gratuitement votre mission et recevez des réponses de professionnels vérifiés/);
 assert.match(home,/href="\/deposer-une-mission"/);
 assert.match(home,/href="\/professionnels"/);
 assert.match(home,/34,99 €/);
 assert.doesNotMatch(home,/Les opportunités prennent forme|id="dashMissions"|id="statOpen"|id="priorityAlertsList"|Chargement…|<script type="module"/i);
 assert.match(home,/<link rel="canonical" href="https:\/\/offrya.fr\/"/);
 assert.match(home,/application\/ld\+json/);
 for(const tag of ['og:type','og:title','og:url','og:description'])assert.ok(home.includes(tag));
});
test('Tableau privé indépendant : aucun marketing dans le document ni donnée sensible HTML',()=>{
 assert.match(privatePage,/name="robots" content="noindex,nofollow"/);
 for(const x of ['homePrivateDashboard','dashMissions','priorityAlertsList','statOpen','newMissionBtn','premiumRequestForm','boampList'])assert.ok(privatePage.includes('id="'+x+'"'),x);
 assert.doesNotMatch(privatePage,/Votre projet mérite le bon professionnel|LES OPPORTUNITÉS PRENNENT FORME/);
 assert.match(app,/location\.replace\('\/connexion\?next='/);
 assert.match(app,/state\.loaded=true;render\(\)/);
 assert.match(app,/dashboardLoading/);
});
test('Routage explicite, chargement et responsive',()=>{
 assert.match(server,/privatePage\?'espace.html'/);
 assert.match(server,/X-Robots-Tag/);
 assert.match(server,/res\.writeHead\(404/);
 assert.match(home,/href="\/public.css"/);
 assert.match(read('public/public.css'),/@media\(max-width:600px\)/);
 assert.match(read('public/home.css'),/dashboard-skeleton/);
});
