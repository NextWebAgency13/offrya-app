'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const app=fs.readFileSync('public/app.js','utf8');
const sales=fs.readFileSync('public/pro-commercial.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
async function factory(){
 return import('data:text/javascript;base64,'+Buffer.from(sales).toString('base64'));
}
test('Une mission du Radar ouvre directement une proposition sans repasser par la liste des missions',()=>{
 assert.match(pro,/if\(openProposal&&openProposal\(id\)\)\{show\('assistant'\);return;\}/);
 assert.match(app,/openProposal:id=>salesWorkspace\.openMission\(id\)/);
 assert.match(app,/onNavigate:screen=>screen==='back'\?proExperience\.back\(\):proExperience\.show\(screen\)/);
 assert.match(sales,/return \{init,render,openMission\}/);
 assert.match(sales,/if\(!uid\(\)\|\|!canUsePremium\(\)\)return false/);
 assert.match(sales,/if\(!accessible\(\)\.some\(m=>m\.id===missionId\)\)return false/);
 assert.doesNotMatch(pro,/renderMissions\(\);tab\('missions',false,true\)/);
});
test('Proposition commerciale : les champs complémentaires sont modifiables et facultatifs',async()=>{
 const {buildProposalMessage}=await factory();
 assert.equal(buildProposalMessage('Bonjour, je peux intervenir.'),'Bonjour, je peux intervenir.');
 const result=buildProposalMessage('Bonjour, je peux intervenir.',{amount:'250.50',delay:'Sous 2 semaines'});
 assert.match(result,/Montant estimatif :/);
 assert.match(result,/250,50/);
 assert.match(result,/Délai estimé : Sous 2 semaines/);
 assert.match(result,/ne constitue pas un devis ferme/);
 assert.throws(()=>buildProposalMessage('',{amount:'100'}),/message/);
 assert.throws(()=>buildProposalMessage('Bonjour',{amount:'-1'}),/Montant/);
 assert.throws(()=>buildProposalMessage('Bonjour',{amount:'999999999'}),/Montant/);
 assert.throws(()=>buildProposalMessage('Bonjour',{delay:'x'.repeat(91)}),/90 caractères/);
 assert.throws(()=>buildProposalMessage('x'.repeat(2490),{amount:'1'}),/2 500 caractères/);
});
test('La proposition ne part pas automatiquement et passe uniquement par la messagerie privée',()=>{
 for(const id of ['salesDraftText','salesQuoteAmount','salesDeliveryText'])assert.ok(sales.includes(id),id);
 assert.match(sales,/confirm\('Envoyer cette proposition au demandeur/);
 assert.match(sales,/from\('offrya_messages'\)\.insert/);
 assert.match(sales,/from\('offrya_pro_lead_tracking'\)\.upsert/);
 assert.match(sales,/if\(onNavigate\)onNavigate\('tracking'\)/);
 assert.match(html,/id="salesAssistantContent"/);
 assert.match(pro,/data-pro-screen="inbox"/);
 assert.match(pro,/data-pro-screen="home"/);
 for(const f of [app,sales,pro]){
  const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:f,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
