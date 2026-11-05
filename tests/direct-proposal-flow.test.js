'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const sales=fs.readFileSync('public/pro-commercial.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const personal=fs.readFileSync('public/espace.html','utf8');
async function module(){return import('data:text/javascript;base64,'+Buffer.from(sales).toString('base64'));}
test('Proposal message is editable and indicative, with optional estimates',async()=>{
 const {buildProposalMessage}=await module();
 const alone=buildProposalMessage(' Bonjour, je peux intervenir. ');
 assert.equal(alone,'Bonjour, je peux intervenir.');
 const withPrice=buildProposalMessage('Bonjour',{amount:'250.5',delay:'Sous 2 semaines'});
 assert.match(withPrice,/Montant estimatif : 250,50 €/);
 assert.match(withPrice,/Délai estimé : Sous 2 semaines/);
 assert.match(withPrice,/ne constitue pas un devis ferme/);
 assert.match(withPrice,/taxes et conditions à préciser/);
});
test('Proposal amount and length are validated, no automatic or fabricated quotes',async()=>{
 const {buildProposalMessage}=await module();
 for(const amount of ['0','-3','1000001','1.234','abc','1e6'])
  assert.throws(()=>buildProposalMessage('Bonjour',{amount}),/Montant indicatif invalide/);
 assert.throws(()=>buildProposalMessage('',{}),/Rédigez un message/);
 assert.throws(()=>buildProposalMessage('Bonjour',{delay:'x'.repeat(91)}),/90 caractères/);
 assert.throws(()=>buildProposalMessage('x'.repeat(2499),{amount:'25'}),/2 500 caractères/);
 assert.equal(buildProposalMessage('Bonjour',{delay:'\n5 jours\n'}).includes('Délai estimé : 5 jours'),true);
});
test('Radar opens an authorized mission directly in proposal composer, without duplicate mission page',()=>{
 assert.match(pro,/if\(openProposal&&openProposal\(id\)\)\{show\('assistant'\);return;\}/);
 assert.match(pro,/Préparer une proposition/);
 assert.match(app,/openProposal:id=>salesWorkspace\.openMission\(id\)/);
 assert.match(sales,/function openMission\(missionId\)/);
 assert.match(sales,/if\(!uid\(\)\|\|!canUsePremium\(\)\)return false/);
 assert.match(sales,/if\(!accessible\(\)\.some\(m=>m\.id===missionId\)\)return false/);
 assert.match(sales,/state\.missions\.filter\(m=>m\.owner_id!==uid\(\)&&m\.status==='open'\)/);
 assert.doesNotMatch(pro,/state\.selectedMissionId=id/);
});
test('Only three main professional actions; secondary tools retained',()=>{
 assert.match(pro,/const primaryMenu=\[/);
 for(const label of ['Trouver des missions','Proposer mes services','Gérer mon activité'])assert.ok(pro.includes(label));
 assert.match(pro,/nav\.innerHTML=primaryMenu\.map\(navButton\)/);
 assert.match(pro,/const secondaryMenu=menu\.filter/);
 for(const word of ['Marchés publics','Veille automatisée','Messagerie','Préférences de veille','Paramètres'])assert.ok(pro.includes(word));
 assert.match(pro,/pro-v3-primary-tabs/);
 assert.match(css,/\.pro-v3-primary-tabs\s*\{\s*display:grid;grid-template-columns:repeat\(3/);
});
test('Sending remains explicit, uses existing private conversation and moves to tracking',()=>{
 assert.match(sales,/buildProposalMessage\(\$\('salesDraftText'\)\?\.value/);
 assert.match(sales,/confirm\('Envoyer cette proposition au demandeur/);
 assert.match(sales,/from\('offrya_conversations'\)\.insert/);
 assert.match(sales,/from\('offrya_messages'\)\.insert/);
 assert.match(sales,/saveStage\(mission\.id,'contacted'\)/);
 assert.match(sales,/if\(onNavigate\)onNavigate\('tracking'\)/);
 assert.match(app,/onNavigate:screen=>proExperience\.show\(screen\)/);
 assert.match(pro,/data-pro-screen="inbox"/);
});
test('Personal space remains separate and focuses on projects and exchanges',()=>{
 assert.match(personal,/id="homePrivateTitle">Je gère mon activité/);
 assert.match(personal,/id="clientProjectHeading">Décrivez votre projet/);
 assert.match(app,/Mes projets et mes échanges/);
 assert.match(pro,/canUsePremium\(\)/);
 for(const path of ['public/pro-commercial.js','public/pro-experience.js']){
  const source=fs.readFileSync(path,'utf8');
  const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
