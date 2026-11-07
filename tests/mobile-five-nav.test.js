'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8'),css=fs.readFileSync('public/styles.css','utf8'),app=fs.readFileSync('public/app.js','utf8');
test('Les barres mobiles gardent cinq destinations adaptées au type de compte',()=>{
 const nav=html.slice(html.indexOf('<nav id="nav"'),html.indexOf('</nav>',html.indexOf('<nav id="nav"')));
 for(const [tab,label,icon] of [['dashboard','Accueil','ic-dashboard'],['missions','Mes missions','ic-missions'],['professional','Espace pro','ic-shield'],['inbox','Messages','ic-inbox'],['settings','Mon compte','ic-settings']]){
  assert.match(nav,new RegExp('data-tab="'+tab+'"[^>]*><svg[^>]*><use href="#'+icon+'".*?<span>'+label+'</span>'));
 }
 assert.match(css,/\.sidebar nav\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/);
 assert.match(css,/\.sidebar \.nav-link\[data-tab="boamp"\]\{display:none\}/);
 assert.match(css,/\.sidebar \.nav-link\[data-tab="professional"\],\.sidebar \.nav-link\[data-tab="settings"\]\{display:flex\}/);
 assert.doesNotMatch(css,/\.sidebar \.nav-link\.mobile-pro-replaced\{display:none\}/);
 assert.match(html,/data-role-deposit/);
 assert.match(app,/data-role-deposit/);
});
test('Espace pro conserve son bouclier même avant vérification et abonnement',()=>{
 assert.doesNotMatch(app,/mobile-pro-replaced|dataset\.action=!eligiblePro|\?\x27#ic-plus\x27:\x27#ic-shield\x27/);
 assert.doesNotMatch(app,/\?\x27Déposer\x27:\x27Espace pro\x27/);
 assert.match(html,/data-tab="professional"><svg class="nav-icon"><use href="#ic-shield"\/>/);
 assert.match(app,/function canUsePremium\(/);
});
test('Cliquer sur un onglet ouvre toujours sa destination, jamais la publication',()=>{
 assert.match(app,/for\(const n of document\.querySelectorAll\('\[data-tab\]'\)\)n\.addEventListener\('click',\(\)=>tab\(n\.dataset\.tab\)\)/);
 assert.doesNotMatch(app,/if\(n\.dataset\.action===\x27publish\x27\)/);
 assert.match(html,/id="newMissionBtn"/);
 assert.match(app,/\$\('newMissionBtn'\)\.onclick=openDeposit;/);
 assert.match(app,/for\(const n of document\.querySelectorAll\('\[data-role-deposit\]'\)\)n\.addEventListener\('click',openDeposit\);/);
});
