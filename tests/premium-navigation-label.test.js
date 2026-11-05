'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const professional=fs.readFileSync('public/pro-experience.js','utf8');

test('Bottom Premium destination retains the existing five-tab navigation and official tender category',()=>{
 const nav=html.slice(html.indexOf('<nav id="nav"'),html.indexOf('</nav>',html.indexOf('<nav id="nav"')));
 assert.match(nav,/data-tab="boamp" aria-label="Espace Premium"[\s\S]*?<span>Espace Premium<\/span>/);
 assert.match(nav,/data-tab="missions"[\s\S]*?<span>Mes missions<\/span>/);
 assert.match(html,/data-tab="boamp"[\s\S]*?<strong>Espace Premium<\/strong>/);
 assert.match(professional,/\['boamp','Marchés publics','ic-boamp'\]/);
 assert.match(professional,/data-pro-panel="boamp"/);
 assert.match(professional,/Ma veille intelligente OFFRYA/);
});
test('Selecting the Premium tab opens AI recommendations and does not leak into a non-Premium account',()=>{
 const a=app.indexOf('function tab(name,');
 const b=app.indexOf("window.addEventListener('popstate'",a);
 assert.ok(a>=0&&b>a,'Tab handler is present');
 const code=app.slice(a,b);
 const calls=[];
 const context={
  canUsePremium:()=>true,
  proExperience:{show:(screen,history)=>calls.push([screen,history])}
 };
 vm.runInNewContext(code,context);
 context.tab('boamp',false);
 context.tab('boamp',true);
 assert.deepEqual(calls,[['home',false],['home',true]]);
 assert.match(code,/name='professional'/,'An unverified account remains in normal Professional onboarding');
 assert.match(code,/name==='professional'&&canUsePremium\(\)&&el\.dataset\.tab==='boamp'/,
  'Premium remains visually selected after routing to the professional shell');
});
test('Old direct market URL opens Premium radar while public-market tool is still separately available',()=>{
 assert.match(app,/boamp:'\/espace\/marches-publics'/);
 assert.match(professional,/route==='\/espace\/marches-publics'\)show\('home',true\)/);
 assert.match(professional,/if\(next==='boamp'&&state\.boampStatus/);
 for(const source of [app,professional]){
  const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
