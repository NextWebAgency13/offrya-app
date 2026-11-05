'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const smoke=fs.readFileSync('scripts/smoke-production.js','utf8');
test('Production smoke verifies the three live entry journeys, not removed account cards',()=>{
 for(const term of ['client','professional','manage'])assert.ok(smoke.includes(term),'Missing entry '+term);
 assert.match(smoke,/offrya-entry-paths/);
 assert.match(smoke,/offrya-entry-hero/);
 assert.ok(smoke.includes("!landing.text.includes('id=\"choisir-compte\"')"));
 assert.ok(!smoke.includes("&&landing.text.includes('id=\"choisir-compte\"')"));
 assert.doesNotMatch(smoke,/landing\.text\.includes\('class="mock-choice-grid"'\)/);
 assert.doesNotMatch(smoke,/const proCard=/);
});
test('Production smoke checks the real protected proposal delivery code',()=>{
 for(const marker of ['pro-commercial.js','pro-experience.js','pro-experience.css','buildProposalMessage','canUsePremium','openProposal&&openProposal(id)','offrya_messages']){
  assert.ok(smoke.includes(marker),marker);
 }
 const parsed=spawnSync(process.execPath,['--check','scripts/smoke-production.js'],{encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});
