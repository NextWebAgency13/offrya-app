'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/home.css'),'utf8');

test('Accueil: parcours public séparés et prix professionnel exact',()=>{
 const home=html.split('<section class="tab active" id="dashboard">')[1].split('<section class="tab" id="missions">')[0];
 assert.match(home,/Déposer une mission gratuitement/);
 assert.match(home,/data-tab="missions" data-action="publish"/);
 assert.match(home,/data-tab="professional"/);
 assert.match(home,/34,99 €/);
 assert.match(home,/vérification obligatoire/i);
 assert.match(home,/professionnels validés par OFFRYA/);
 assert.doesNotMatch(home,/témoignages|avis clients|\d+\s+professionnels inscrits/i);
});

test('Accueil: données privées masquées par défaut puis selon la connexion',()=>{
 assert.match(html,/class="home-private hidden" id="homePrivateDashboard"/);
 assert.match(app,/\$\('homePrivateDashboard'\)\.classList\.toggle\('hidden',!yes\)/);
 assert.match(app,/\$\('statOpenLabel'\)\.textContent=canUsePremium\(\)/);
 for(const id of ['dashMissions','dashActivity','priorityAlertsPanel','priorityAlertsList'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/const visible=state\.missions\.filter\(m=>m\.owner_id===uid\|\|canBrowse\)/);
});

test('Accueil: styles dédiés servis par le serveur et responsive',()=>{
 assert.match(html,/href="\/home\.css"/);
 assert.match(server,/\['\/home\.css','text\/css; charset=utf-8'\]/);
 assert.match(css,/@media\(max-width:620px\)/);
});
