'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const homeCss=fs.readFileSync('public/home.css','utf8');
function syntax(source){
 const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
}
test('Mobile redesign uses valid JavaScript and preserves existing private modules',()=>{
 syntax(pro);syntax(app);
 assert.match(app,/createProExperience/);
 assert.match(app,/createOpportunityConsole/);
 assert.match(app,/renderPremium/);
 assert.match(app,/canUsePremium\(\)/);
});
test('Android has one five-item bottom navigation and secondary menu in header',()=>{
 assert.match(html,/id="nav"/);
 for(const tab of ['dashboard','missions','professional','inbox','settings'])assert.match(html,new RegExp('data-tab="'+tab+'"'));
 assert.match(pro,/proV3AccountTools/);
 assert.match(pro,/tools\.setAttribute\('aria-label','Outils professionnels'\)/);
 assert.match(pro,/accountPanel\.prepend\(tools\)/);
 assert.match(css,/\.pro-v3-mobile-menu\{display:none!important\}/);
 assert.match(css,/\.sidebar #nav\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/background:#351348/);
 assert.match(css,/#proV3AccountTools/);
 assert.match(pro,/removeAttribute\('open'\);show\(b\.dataset\.proScreen\)/);
});
test('Android profile and notification elements are present and robust',()=>{
 assert.match(pro,/const technical=\/\^\(\?:user/);
 assert.match(pro,/proV3Hello'\)\.textContent=label\.length>32/);
 assert.match(pro,/alertButton\.id='proV3MobileAlert'/);
 assert.match(pro,/proV3AlertBubble/);
 assert.match(css,/#proV3AlertBubble:not\(\[hidden\]\)/);
 assert.match(css,/overflow-wrap:anywhere/);
});
test('The interface progressively loads verified account state before optional sections',()=>{
 assert.match(app,/const criticalKeys=new Set\(\['profile','premium','subscription'\]\)/);
 assert.doesNotMatch(app,/state\.db\.rpc\('offrya_test_premium_expires_at'\)/);
 assert.match(app,/applyResponses\(critical,requiredResults\);\s*state\.loaded=true;render\(\)/);
 assert.match(app,/applyResponses\(optional,optionalResults\)/);
 assert.doesNotMatch(app,/if\(canUsePremium\(\)\)await loadBoamp\(\)/);
 assert.match(app,/state\.boampStatus='loading'/);
 assert.match(app,/state\.boampStatus='ready'/);
 assert.match(app,/state\.boampStatus='error'/);
 assert.match(html,/id="dashboardLoadingRetry"/);
 assert.match(homeCss,/dashboard-loading-caption/);
 assert.match(app,/dashboardLoadingRetry/);
});
test('No opt-in requirement is reintroduced into the automatic Premium watch',()=>{
 assert.match(pro,/Date\.parse\(state\.testPremiumUntil\|\|''\)>Date\.now\(\)\?'Accès test':'Automatique'/);
 assert.match(pro,/BOAMP et TED automatiquement/);
 assert.doesNotMatch(pro,/Activation volontaire/);
 assert.doesNotMatch(pro,/Les alertes restent désactivées tant que/);
 assert.match(app,/offrya_tender_alerts/);
});
