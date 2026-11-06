'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const css=fs.readFileSync('public/role-reference.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const mark='/* OFFRYA — Premium dashboard metrics: consistent cards from approved mockup.';
const start=css.indexOf(mark);
assert.ok(start>=0,'Approved KPI-card style block must exist');
const rules=css.slice(start);
const gridSelector='body.offrya-reference-ui #dashboard .role-reference-premium .role-premium-stats';
const buttonSelector=gridSelector+' > button';

test('Four live metric cards preserve their labels, values and navigation',()=>{
 const begin=html.indexOf('<div class="role-premium-stats"');
 const end=html.indexOf('</div>',begin);
 assert.ok(begin>=0&&end>begin,'The four-card dashboard is present');
 const row=html.slice(begin,end);
 const ids=['roleAvailableCount','roleOwnCount','roleConversationCount','roleAlertCount'];
 const labels=['Missions disponibles','Mes réponses','Nouveaux messages','Alertes secteur'];
 for(const id of ids)assert.match(row,new RegExp('id="'+id+'"'));
 for(const label of labels)assert.ok(row.includes(label),'Missing label '+label);
 assert.equal((row.match(/<button type="button"/g)||[]).length,4);
 assert.match(row,/data-tab="missions"/);
 assert.match(row,/data-role-pro-screen="tracking"/);
 assert.match(row,/data-tab="inbox"/);
 assert.match(row,/data-tab="boamp" aria-label="Alertes secteur : ouvrir l'Espace Premium"/);
});
test('Every KPI keeps the same card grid slots and aligned typography',()=>{
 assert.ok(rules.includes(gridSelector+'{'));
 assert.ok(rules.includes(buttonSelector+'{'));
 const main=rules.slice(rules.indexOf(buttonSelector+'{'),rules.indexOf('}',rules.indexOf(buttonSelector+'{'))+1);
 for(const property of ['display:grid!important','grid-template-rows:64px 62px minmax(44px,auto)',
  'justify-items:center!important','align-items:center!important',
  'height:100%','min-height:228px!important','text-align:center!important']){
  assert.ok(main.includes(property),'KPI card alignment is missing '+property);
 }
 assert.ok(rules.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'));
 assert.ok(rules.includes('font-variant-numeric:tabular-nums'));
 assert.ok(rules.includes('text-wrap:balance'));
});
test('Fourth card has the same icon slot, violet icon and only a subtle lavender tile',()=>{
 const iconRule=rules.indexOf('> button .role-ref-stat-icon{');
 const alertRule=rules.indexOf('> button .role-ref-stat-icon.alert{');
 assert.ok(iconRule>=0&&alertRule>iconRule);
 const icon=rules.slice(iconRule,rules.indexOf('}',iconRule));
 const alert=rules.slice(alertRule,rules.indexOf('}',alertRule));
 for(const v of ['width:64px!important','height:64px!important','place-items:center!important']){
  assert.ok(icon.includes(v),'Generic icon must have '+v);
 }
 assert.match(alert,/background:#f2eafb!important/);
 assert.match(alert,/color:#7A3CFF!important/);
});
test('Android keeps all four cards in two even rows with no horizontal clipping',()=>{
 assert.ok(rules.includes('@media(max-width:780px)'));
 const mobile=rules.slice(rules.indexOf('@media(max-width:780px)'));
 assert.ok(mobile.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'));
 assert.ok(mobile.includes('grid-template-rows:45px 44px minmax(34px,auto)'));
 assert.ok(mobile.includes('min-height:169px!important'));
 assert.ok(rules.includes('min-width:0'));
 assert.ok(rules.includes('@media(max-width:360px)'));
});
test('Design changes no backend counts or dummy values',()=>{
 assert.match(app,/\$\('roleAvailableCount'\)\.textContent=String\(eligiblePro/);
 assert.match(app,/\$\('roleOwnCount'\)\.textContent=String\(eligiblePro\?submitted\.size:0\)/);
 assert.match(app,/\$\('roleAlertCount'\)\.textContent=String\(eligiblePro/);
 assert.doesNotMatch(rules,/visibility:hidden|display:none/);
});
