'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const js=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const server=fs.readFileSync('server.js','utf8');
test('The Premium discovery mockup compiles and contains the five visual sections',()=>{
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:js,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
 for(const label of ['Ma veille intelligente OFFRYA','Mes critères actuels','Missions (',
  'Marchés publics (','opportunités trouvées','Opportunités recommandées par l’IA']){
  assert.ok(js.includes(label),'Missing visual section: '+label);
 }
 for(const id of ['proAiHeroTitle','proAiCriteria','proAiTabAll','proAiTabMissions','proAiTabTenders',
  'proAiStatAll','proAiStatMissions','proAiStatTenders','proAiSort','proV3Recommendations']){
  assert.match(js,new RegExp('id="'+id+'"'));
 }
 assert.match(css,/\.pro-ai-hero/);
 assert.match(css,/\.pro-ai-card/);
 assert.match(css,/max-width:620px/);
 assert.match(css,/max-aspect-ratio:3\/5/);
});
test('Recommendations and controls use live authorized data instead of mock values',()=>{
 assert.match(js,/canUsePremium\(\)/);
 assert.match(js,/buildRadar\(\{missions:available\(\),alerts:state\.opportunityAlerts/);
 assert.match(js,/const notices=new Map\(\(state\.opportunityAlerts\|\|\[\]\)/);
 assert.match(js,/const missions=new Map\(available\(\)/);
 assert.match(js,/data-pro-filter="mission"/);
 assert.match(js,/data-pro-filter="tender"/);
 assert.match(js,/data-pro-view-mission/);
 assert.match(js,/data-pro-screen="preferences"/);
 assert.match(js,/radarQuery=/);
 assert.match(js,/radarSort=/);
 assert.match(js,/proAiInlineSummary/);
 assert.match(js,/pro-ai-welcome/);
 assert.match(js,/pro-ai-buyer/);
 assert.match(js,/pro-ai-match-reason/);
 assert.match(js,/Aucun appel d.offres officiel/);
 assert.match(js,/Aucun budget inventé/);
 assert.doesNotMatch(js,/250 ?000 € HT|96 % de pertinence|Rénovation énergétique d.un groupe scolaire/);
});
test('Mission links use private detail and official tender links stay allowlisted',()=>{
 assert.match(js,/function openMissionDetail\(id\)/);
 assert.match(js,/button\.click\(\)/);
 assert.match(js,/target="_blank" rel="noopener noreferrer"/);
 assert.match(js,/boamp\\\.fr/);
 assert.match(server,/\/api\/pro\/matches/);
});
