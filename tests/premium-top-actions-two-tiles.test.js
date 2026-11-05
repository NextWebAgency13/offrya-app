'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');

test('Top Premium action row contains only Proposer mes services and Gérer mon activité',()=>{
 assert.match(pro,/const primaryMenu=\[[\s\S]*?\['home','Trouver des missions','ic-dashboard'\]/);
 assert.match(pro,/\['requests','Proposer mes services','ic-missions'\]/);
 assert.match(pro,/\['tracking','Gérer mon activité','ic-check'\]/);
 assert.match(pro,/pro-v3-primary-tabs[^\n]*primaryMenu\.filter\(item=>item\[0\]!=='home'\)\.map\(navButton\)/);
 assert.doesNotMatch(pro,/pro-v3-primary-tabs[^\n]*primaryMenu\.map\(navButton\)/);
});
test('AI radar remains the Espace Premium bottom destination and its desktop sidebar remains accessible',()=>{
 assert.match(html,/data-tab="boamp" aria-label="Espace Premium"/);
 assert.match(pro,/nav\.innerHTML=primaryMenu\.map\(navButton\)\.join\(''\)/);
 assert.match(pro,/data-pro-panel="home"/);
 assert.match(pro,/Ma veille intelligente OFFRYA/);
});
test('Android and portrait virtual viewport show two balanced tiles',()=>{
 assert.match(css,/@media\(max-width:820px\)\{[\s\S]*?\.pro-v3-primary-tabs\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.pro-v3-primary-tabs\{\s*display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});
