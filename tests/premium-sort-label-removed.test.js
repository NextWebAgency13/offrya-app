'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('public/pro-experience.js','utf8');

test('Premium toolbar keeps the functional sorting selector without the visible Trier par label',()=>{
 assert.doesNotMatch(source,/<label for="proAiSort">Trier par :<\/label>/);
 assert.match(source,/<select id="proAiSort" aria-label="Trier les opportunités">/);
 for(const [value,text] of [['score','Pertinence'],['recent','Plus récentes'],['deadline','Échéance proche']]){
  assert.ok(source.includes('<option value="'+value+'">'+text+'</option>'));
 }
 assert.match(source,/\$\('proAiSort'\)\.addEventListener\('change'/);
 assert.match(source,/radarSort=e\.target\.value;recommendations\(\)/);
 assert.match(source,/data-refresh-radar="true"/);
 assert.match(source,/proV3Recommendations/);
 assert.match(source,/serverRadar\.items\.filter/);
});
test('Premium source remains valid',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
