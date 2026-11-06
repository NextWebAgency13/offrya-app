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


test('Tender detail pictograms are appropriate and title height is bounded',()=>{
 assert.match(card,/const buyerIcon=tenderIcon/);
 assert.match(card,/const placeIcon=tenderIcon/);
 assert.match(card,/const tradeIcon=tenderIcon/);
 assert.match(card,/detail\(buyerIcon,'Acheteur'/);
 assert.match(card,/detail\(placeIcon,'Localisation',displayTenderLocation/);
 assert.match(card,/detail\(tradeIcon,'Métier'/);
 assert.match(css,/\.pro-tender-information h4\{\s*display:-webkit-box!important/);
 assert.match(css,/-webkit-line-clamp:3/);
});
test('Tender actions remain vertically stacked on narrow and portrait Android viewports',()=>{
 const marker=css.indexOf('/* Some Android browsers report a wide CSS viewport in portrait');
 assert.ok(marker>=0);
 const mobile=css.slice(marker);
 assert.match(mobile,/@media\(max-width:760px\), screen and \(pointer:coarse\) and \(orientation:portrait\) and \(max-width:1100px\)/);
 assert.match(mobile,/\.pro-tender-actions\{\s*display:flex!important;flex-direction:column!important/);
 assert.match(mobile,/\.pro-tender-actions \.pro-v3-reco-btn/);
 assert.match(js,/data-pro-save-tender/);
 assert.match(js,/data-pro-stage-tender/);
});
test('Location labels expand genuine French department codes without guessing missing fields',async()=>{
 const {displayTenderLocation}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 assert.equal(displayTenderLocation('13','13'),'Bouches-du-Rhône (13)');
 assert.equal(displayTenderLocation('Marseille (13)','13'),'Marseille · Bouches-du-Rhône (13)');
 assert.equal(displayTenderLocation('Bordeaux','33'),'Bordeaux · Gironde (33)');
 assert.equal(displayTenderLocation('','2A, 2B'),'Corse-du-Sud (2A) · Haute-Corse (2B)');
 assert.equal(displayTenderLocation('','971'),'Guadeloupe (971)');
 assert.equal(displayTenderLocation('Département 6','06'),'Alpes-Maritimes (06)');
 assert.equal(displayTenderLocation('',''),'Zone non précisée');
 assert.equal(displayTenderLocation('France',''),'France');
 assert.equal(displayTenderLocation('Marseille (13)',''),'Marseille · Bouches-du-Rhône (13)');
});


test('Desktop tender card headings, details, badges and actions follow common alignment tracks',()=>{
 const rules=css.slice(css.indexOf('/* OFFRYA tender desktop-Android alignment, 06/11/2026'));
 assert.ok(rules.length>1200);
 assert.match(rules,/\.pro-tender-card\{\s*container-type:inline-size/);
 assert.match(rules,/\.pro-tender-top\{\s*display:grid;\s*grid-template-columns:218px 112px minmax\(0,1fr\)/);
 assert.match(rules,/\.pro-tender-information h4\{\s*min-height:3\.81em/);
 assert.match(rules,/\.pro-tender-details\{\s*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(rules,/\.pro-tender-actions\{\s*align-self:end/);
 assert.match(rules,/\.pro-ai-filter-tabs button\{\s*display:flex;\s*align-items:center;\s*justify-content:center;\s*flex-direction:row;\s*flex-wrap:nowrap/);
 assert.doesNotMatch(rules,/display:none!important|order:\s*\d+|visibility:hidden/);
});
test('Narrow desktop cards adapt by card width, and Android retains approved stacked buttons',()=>{
 const rules=css.slice(css.indexOf('/* OFFRYA tender desktop-Android alignment, 06/11/2026'));
 assert.match(rules,/@container \(max-width:1050px\)/);
 assert.match(rules,/@container \(max-width:760px\)/);
 assert.match(rules,/\.pro-tender-details\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(rules,/\.pro-tender-grid\{\s*grid-template-columns:minmax\(0,1fr\);\s*row-gap:16px/);
 assert.match(rules,/\.pro-tender-actions\{\s*display:flex!important;\s*flex-direction:column!important/);
 assert.match(js,/serverRadar\.items\.filter/);
 assert.match(js,/data-pro-save-tender/);
 assert.match(js,/data-pro-remove-tender/);
});
