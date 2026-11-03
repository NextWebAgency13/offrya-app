'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
test('Pro : render ne référence plus les étapes supprimées de l’ancien panneau',()=>{
 for(const id of ['roleCompanyStep','roleIdentityStep','roleBillingStep']){
  assert.doesNotMatch(app,new RegExp("\\\\$\\\\('"+id+"'\\\\)"));
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 }
});
test('Parcours pro réel et son bouton restent en place',()=>{
 for(const id of ['proBegin','proWorkspace','proStageCompany','proStageRepresentative','proStageReview','proStageBilling'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(app,/\$\('proBegin'\)\.onclick=async/);
});
