'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const home=read('public/index.html'),css=read('public/public.css'),deposit=read('public/deposer.js'),app=read('public/app.js'),pro=read('public/pro-experience.js');
test('Entrée sans friction : demander, travailler ou suivre son activité',()=>{
 const client=home.indexOf('data-journey="client"');
 const professional=home.indexOf('data-journey="professional"');
 const manage=home.indexOf('data-journey="manage"');
 assert.ok(client>=0&&professional>client&&manage>professional);
 assert.match(home,/href="\/deposer-une-mission" data-journey="client"/);
 assert.match(home,/href="\/professionnels" data-journey="professional"/);
 assert.match(home,/href="\/connexion\?next=%2Fespace" data-journey="manage"/);
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
});
test('La simplification n ouvre aucun accès non autorisé aux missions',()=>{
 assert.match(deposit,/user\.email_confirmed_at/);
 assert.match(deposit,/await currentPublisher\(\)/);
 assert.match(app,/canUsePremium\(\)/);
 assert.match(pro,/if\(!canUsePremium\(\)\|\|!current\)return \[\]/);
 assert.doesNotMatch(home,/id="missionList"|id="boampList"/);
});
test('Pas de nouvelle modalité de paiement ni d automatisation de devis',()=>{
 assert.match(home,/34,99 € TTC \/ mois/);
 assert.doesNotMatch(home,/data-pro-mission|data-priority-open|data-simulated/);
 assert.match(css,/\.offrya-entry-path:focus-visible/);
 assert.match(css,/@media\(max-width:820px\)/);
});
