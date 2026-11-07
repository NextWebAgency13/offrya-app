'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'../public');
const style=fs.readFileSync(path.join(root,'brand-kit.css'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const pages=['index.html','connexion.html','deposer-une-mission.html','professionnels.html','espace.html'];
const block=style.slice(style.indexOf('/* OFFRYA — identité 3D Soft'));
test('Le thème 3D Soft est partagé et conservé sur mobile et ordinateur',()=>{
 assert.ok(block.length>10000,'styles complets');
 for(const page of pages){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  assert.match(html,/<link rel="stylesheet" href="\/brand-kit\.css"><\/head>/,page);
 }
 for(const selector of ['.role-premium-stats','.role-company','#missions.active','#inbox.active','#settings.active','#professional.active','.auth-page','.mock-home','.premium-hero','.simple-hero']){
  assert.ok(block.includes(selector),selector);
 }
 assert.match(block,/@media\(max-width:780px\)/);
 assert.match(block,/@media\(min-width:1000px\)/);
 assert.match(block,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(block,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.equal((style.match(/\{/g)||[]).length,(style.match(/\}/g)||[]).length);
});
test('Le rendu tactile reste accessible, proportionné et sans fausses commandes',()=>{
 for(const term of ['--offrya-3d-ink','--offrya-3d-violet','--offrya-3d-corail','--offrya-3d-shadow']){
  assert.ok(style.includes(term),term);
 }
 assert.match(block,/:focus-visible/);
 assert.match(block,/prefers-reduced-motion:reduce/);
 assert.match(block,/pointer-events:none/);
 assert.doesNotMatch(block,/https?:\/\//);
 assert.match(block,/\.role-premium-stats >button:nth-child\(4\)/);
 assert.doesNotMatch(block,/display:none!important\s*;\s*\/\*.*#boamp/);
});
test('La cloche compte ses entrées et un retour de conversation revient à la liste',()=>{
 assert.match(app,/const \{total,byThread\}=messageUnread\(\)/);
 assert.match(app,/all=byThread\.size\+missionCount/);
 assert.match(app,/threadId:id,fromInboxList:true/);
 assert.match(app,/history\.state\?\.fromInboxList===true/);
 assert.match(app,/if\(location\.pathname===paths\.inbox&&history\.state\?\.fromInboxList===true/);
 assert.match(app,/event\.key!==messageReadKey\(uid\)/);
 assert.match(app,/acknowledgeConversation\(id,state\.messages\)/);
 assert.match(app,/proExperience\.openNotification\(id\)/);
 const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});