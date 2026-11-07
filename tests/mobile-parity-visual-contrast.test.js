'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const pub=path.join(__dirname,'../public');
const css=fs.readFileSync(path.join(pub,'brand-kit.css'),'utf8');
const js=fs.readFileSync(path.join(pub,'app.js'),'utf8');
const html=fs.readFileSync(path.join(pub,'espace.html'),'utf8');
const last=css.slice(css.indexOf('/* OFFRYA mobile visual-parity corrections'));
test('Navigation mobile identique et contrastée sur comptes gratuit et Premium',()=>{
 assert.ok(last.length>1800);
 assert.match(last,/@media \(max-width:780px\)/);
 assert.match(last,/\.sidebar\s*,/);
 assert.match(last,/data-offrya-role="premium"/);
 assert.match(last,/background:linear-gradient\(120deg,#FFFCFF 0%,#F0E5FB 100%\)!important/);
 assert.match(last,/\.nav-link:not\(\.active\)/);
 assert.match(last,/color:#35255F!important/);
 assert.match(last,/\.nav-link\.active/);
 assert.match(last,/color:#FFFFFF!important/);
 assert.match(last,/\.message-unread-badge/);
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
test('Les noms légaux sont conservés et les identifiants techniques ne sont pas affichés',()=>{
 assert.match(js,/const rawBusinessName=String\(state\.premium\?\.legal_name\|\|state\.profile\?\.display_name\|\|''\)\.trim\(\)/);
 assert.match(js,/\/\^user_\[a-z0-9_-\]\{12,\}\$\/i\.test\(rawBusinessName\)/);
 assert.match(js,/rawBusinessName\|\|'Mon espace professionnel'/);
 assert.match(html,/id="roleBusinessName"/);
 const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:js,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
test('Bandeau demandeur indépendant des états client/pro et sans doublon de logo',()=>{
 assert.match(css,/#roleClientView\.role-reference-client:not\(\.hidden\) \.client-dashboard-publish\.role-client-hero::after/);
 assert.match(css,/content:none!important/);
 assert.match(css,/color:#292053!important/);
 assert.match(css,/linear-gradient\(118deg,#FFFFFF 0%,#F7F0FF 55%,#EEDFFD 100%\)/);
});
test('Le logo reste visible dans les navigateurs Android simulant une fenêtre ordinateur',()=>{
 assert.match(last,/@media screen and \(pointer:coarse\) and \(orientation:portrait\) and \(min-width:781px\) and \(max-width:1100px\)/);
 assert.match(last,/\.header \.mobile-brand\{\s*display:flex!important/);
 assert.match(html,/class="mobile-brand" href="\/espace"/);
});
