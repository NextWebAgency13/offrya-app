'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');

const js=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const start=js.indexOf('   // The approved tender-only layout');
const end=js.indexOf('   return \'<article class="pro-v3-radar-row pro-ai-card \'+(tender?',start);
const card=js.slice(start,end);

test('Approved public-tender design is isolated from mission cards and has no extra Premium logo',()=>{
 assert.ok(start>=0&&end>start,'Tender card renderer must exist');
 assert.match(card,/if\(tender\)\{/);
 assert.match(card,/pro-tender-card/);
 assert.doesNotMatch(card,/<img|premium-logo|logo\.svg|OFFRYA Premium<\//i);
 assert.match(js,/pro-ai-card-mission/,'Existing private mission layout is untouched');
});

test('The approved card shows real score, source, reference and four details',()=>{
 for(const field of ["Pertinence IA : ","'Acheteur'","'Localisation'","'Métier'","'Date limite'"])
  assert.ok(card.includes(field),'Missing visible tender information: '+field);
 assert.match(card,/a\?\.tender_id\|\|item\.id/,'Reference must come from real notice');
 assert.match(card,/score\+' %/,'Never hardcode the relevance score');
 assert.match(card,/a\?\.buyer\|\|'Non précisé'/,'No invented buyer');
 assert.match(card,/item\.category\|\|'Non précisé'/,'No invented trade');
 assert.match(card,/date\?dateRadar\(date\):'Non précisée'/,'No invented deadline');
 assert.doesNotMatch(card,/25-001234|Montpellier|Bordeaux|Toulouse/,'No screenshot placeholder notice');
});

test('Actions retain official source access and secure existing tracking handlers',()=>{
 assert.match(js,/target="_blank" rel="noopener noreferrer"/);
 assert.match(js,/data-pro-save-tender/);
 assert.match(js,/data-pro-stage-tender/);
 assert.match(js,/data-pro-remove-tender/);
 assert.match(js,/canUsePremium\(\)/);
 assert.match(js,/updateTenderTracking/);
});

test('Desktop, Android and narrow screens receive approved styles',()=>{
 assert.match(css,/\/\* Approved tenders 2026-11-06:/);
 assert.match(css,/\.pro-tender-card:before/,'Vertical violet accent');
 assert.match(css,/\.pro-tender-details/);
 assert.match(css,/\.pro-tender-actions/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:js,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
