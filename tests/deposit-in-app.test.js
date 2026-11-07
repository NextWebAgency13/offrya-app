'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8'),app=fs.readFileSync('public/app.js','utf8'),server=fs.readFileSync('server.js','utf8');
test('Déposer s’ouvre dans Mon espace : barre d’onglets et en-tête conservés',()=>{
 assert.match(html,/<section class="tab" id="deposit" aria-labelledby="depositTitle">/);
 assert.match(html,/<form id="depositForm" class="panel deposit-form">/);
 assert.match(app,/const paths=\{dashboard:'\/espace',missions:'\/espace\/missions',deposit:'\/espace\/deposer',/);
 assert.match(server,/'\/espace\/deposer'/);
 assert.match(app,/document\.querySelectorAll\('\[data-role-deposit\]'\)\.forEach\(el=>el\.classList\.toggle\('active',name==='deposit'\)\);/);
 assert.match(app,/const link=event\.target\.closest\('a\[href="\/deposer-une-mission"\]'\);/);
 assert.match(app,/deposit:'Déposer une mission'\};/);
});
test('Publication depuis Mon espace : e-mail confirmé, champs vérifiés, photos, puis fiche de la mission',()=>{
 assert.match(app,/if\(!user\|\|user\.is_anonymous\|\|!user\.email_confirmed_at\)\{depositNotice\(/);
 assert.match(app,/return \/\^\(0\[1-9\]\|\[1-8\]\\d\|9\[0-5\]\|2A\|2B\|97\[1-6\]\)\$\/\.test\(v\)\?v:'';/);
 assert.match(app,/\.insert\(\{\n   owner_id:user\.id,title,description,category:values\.category,department,city,budget_cents:budget\n  \}\)\.select\('id'\)\.single\(\)/);
 assert.match(app,/uploadMissionPhotos\(state\.db,user\.id,id,depositPhotos\.map\(p=>p\.blob\)\)/);
 assert.match(app,/missionView='published';state\.selectedMissionId=id;tab\('missions',false,true\);renderMissions\(\);rememberMissionRoute\(id\);/);
});
