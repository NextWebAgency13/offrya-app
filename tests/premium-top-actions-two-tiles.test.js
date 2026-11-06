'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');

test('No duplicate upper action cards remain on Premium',()=>{
 assert.doesNotMatch(pro,/'<nav class="pro-v3-primary-tabs"/);
 assert.match(pro,/data-pro-panel="home"/);
 assert.match(pro,/Ma veille intelligente OFFRYA/);
 assert.doesNotMatch(pro,/proV3Search|proV3SearchInput|\.before\(search\)/);
 assert.match(pro,/pro-ai-welcome/);
 assert.match(pro,/pro-ai-filter-tabs/);
 assert.match(pro,/proV3Recommendations/);
 assert.doesNotMatch(pro,/querySelector\('\.pro-v3-primary-tabs'\)\.after\(search\)/);
});
test('Proposer mes services and Gérer mon activité are retained in the desktop sidebar',()=>{
 assert.match(pro,/const primaryMenu=\[/);
 for(const value of ['Trouver des missions','Proposer mes services','Gérer mon activité'])assert.ok(pro.includes(value));
 assert.match(pro,/nav\.innerHTML=primaryMenu\.map\(navButton\)\.join\(''\)/);
 assert.match(pro,/tools\.innerHTML=[^\n]*accountToolsMenu\.map\(navButton\)/);
 assert.match(pro,/accountPanel\.prepend\(tools\)/);
 assert.match(html,/data-tab="boamp" aria-label="Espace Premium"/);
 assert.match(pro,/data-pro-screen/);
});
test('No top three-card strip can appear on small Android or desktop-site portrait viewports',()=>{
 assert.match(css,/body\.offrya-pro-v3 #proExperienceV3 \.pro-v3-primary-tabs\{display:none!important\}/);
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});

test('Top-right account menu no longer repeats Proposer mes services, Gérer mon activité or Paramètres',()=>{
 const vm=require('node:vm');
 const start=pro.indexOf('const menu=['),end=pro.indexOf('let initialized=false');
 assert.ok(start>0&&end>start);
 const ctx={};
 vm.runInNewContext(pro.slice(start,end)+'\nthis.keys=accountToolsMenu.map(item=>item[0]);this.labels=accountToolsMenu.map(item=>item[1]);',ctx);
 assert.equal(JSON.stringify(ctx.keys),JSON.stringify(['boamp','watch','inbox','preferences']));
 assert.equal(JSON.stringify(ctx.labels),JSON.stringify(['Marchés publics','Veille automatisée','Messagerie','Préférences de veille']));
});
