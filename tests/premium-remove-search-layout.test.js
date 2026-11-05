'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');

const experience=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const start=experience.indexOf('\'<section class="pro-v3-view" data-pro-panel="home">\'');
const end=experience.indexOf('\'<section class="pro-v3-view" data-pro-panel="commercial"',start);
assert.ok(start>=0&&end>start,'Premium home markup is present');
const home=experience.slice(start,end);

test('Approved Premium layout starts directly with the welcome card, without a search bar',()=>{
 const blocks=['pro-ai-welcome','pro-ai-hero','pro-ai-criteria','pro-ai-filter-tabs','pro-ai-heading','proV3Recommendations'];
 const offsets=blocks.map(name=>home.indexOf(name));
 assert.ok(offsets.every(x=>x>0),'A validated Premium block is missing');
 assert.ok(offsets.every((x,i)=>i===0||x>offsets[i-1]),'Premium screen blocks are not in the approved order');
 assert.doesNotMatch(experience,/proV3Search|proV3SearchInput|pro-v3-search|createElement\('form'\)/);
 assert.doesNotMatch(css,/#proV3Search|\.pro-v3-search/);
 assert.match(experience,/data-pro-panel="home"/);
 assert.match(experience,/id="proV3Hello"/);
 assert.match(experience,/id="proV3Status"/);
});

test('AI matching results and sorting remain functional, never replaced by mock data or an empty space',()=>{
 for(const id of ['proAiCriteria','proAiTabAll','proAiTabMissions','proAiTabTenders',
  'proAiInlineSummary','proAiSort','proV3Recommendations','proV3MatchingStatus']){
  assert.match(home,new RegExp(id));
 }
 assert.match(experience,/serverRadar\.items\.filter/);
 assert.match(experience,/\$\('proAiSort'\)\.addEventListener\('change'/);
 assert.match(experience,/radarSort=e\.target\.value;recommendations\(\)/);
 assert.match(experience,/data-refresh-radar/);
 assert.match(experience,/data-pro-filter="tender"/);
 assert.match(experience,/data-pro-screen="preferences"/);
 assert.match(experience,/state\.radarMatches=data/);
});

test('Missions and official public tender search remain available only in their own screens',()=>{
 assert.match(html,/id="missionQuery"/);
 assert.match(html,/id="boampKeyword"/);
 assert.match(html,/id="boampSearch"/);
 assert.match(html,/id="exportBoamp"/);
 assert.match(experience,/placeMarketSearch\(\)/);
 assert.match(experience,/if\(next==='boamp'&&state\.boampStatus/);
 assert.match(experience,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
});

test('Android welcome, AI header, summary, sorting and result cards stay compact and readable',()=>{
 const marker=css.indexOf('/* OFFRYA Premium — approved mobile layout without the redundant top search.');
 assert.ok(marker>0);
 const rules=css.slice(marker);
 assert.match(rules,/#proExperienceV3 > \[data-pro-panel="home"\]/);
 assert.match(rules,/\.pro-ai-welcome\{\s*margin-top:0;/);
 assert.match(rules,/@media\(max-width:620px\)/);
 assert.match(rules,/\.pro-ai-heading\{\s*display:grid;/);
 assert.match(rules,/\.pro-ai-toolbar\{\s*justify-self:end;/);
 assert.match(rules,/\.pro-ai-results\{\s*min-width:0;/);
 assert.doesNotMatch(rules,/display:none!important/);
});

test('All changed Premium source files remain parsable JavaScript',()=>{
 const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:experience,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
