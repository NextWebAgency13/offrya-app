'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');

test('Premium opportunity heading contains only its icon and title',()=>{
 const line=source.split('\n').find(x=>x.includes('Opportunités recommandées par l’IA'));
 assert.ok(line);
 assert.match(line,/class="pro-ai-heading"><h3>/);
 assert.doesNotMatch(line,/pro-ai-toolbar|proAiSort|data-refresh-radar|ic-bolt|Trier par/);
 assert.doesNotMatch(source,/proAiSort|radarSort|pro-ai-toolbar|Trier par :/);
 assert.doesNotMatch(css,/\.pro-ai-toolbar/);
});

test('Results remain ordered automatically by relevance with manual retry only on errors',()=>{
 assert.match(source,/sort\(\(a,b\)=>Number\(b.score\|\|0\)-Number\(a.score\|\|0\)\)/);
 assert.match(source,/serverRadar\.items\.filter/);
 assert.match(source,/id="proV3Recommendations"/);
 assert.match(source,/data-pro-filter="mission"/);
 assert.match(source,/data-pro-filter="tender"/);
 assert.match(source,/radarError\?'<button type="button" data-refresh-radar>Réessayer l’actualisation/);
 assert.match(source,/const radarButton=e.target.closest\('\[data-refresh-radar\]'\)/);
 assert.match(source,/radarButton&&canUsePremium\(\)\)\{refreshTenderRadar\(\)/);
 assert.match(source,/Date.now\(\)-radarAt>5\*60\*1000/);
});
test('Premium source remains valid',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
