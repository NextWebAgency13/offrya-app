'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const consoleJs=fs.readFileSync('public/opportunity-console.js','utf8');
const css=fs.readFileSync('public/pro.css','utf8');
const active=html.slice(html.indexOf('id="proDashboard"'),html.indexOf('id="boamp"',html.indexOf('id="proDashboard"')));

test('Espace pro starts with real metrics and two opportunity sources',()=>{
 assert.match(active,/Vos opportunités|Mes opportunités/);
 assert.match(active,/id="opMissionCount"/);
 assert.match(active,/id="opTenderCount"/);
 assert.match(active,/id="opViewMissions"[^>]*data-op-view="missions"/);
 assert.match(active,/id="opViewTenders"[^>]*data-op-view="tenders"/);
 assert.match(active,/id="opMissionPane"[^>]*role="tabpanel"/);
 assert.match(active,/id="opTenderPane"[^>]*role="tabpanel"/);
 assert.match(active,/id="opMissionList"/);
 assert.match(active,/id="opTenderList"/);
});
test('Active members do not see onboarding steps or signup banners',()=>{
 assert.match(app,/\$\('proWorkspace'\)\.classList\.toggle\('op-dashboard-active',allowed\)/);
 assert.match(css,/#proWorkspace\.op-dashboard-active > \.pro-head/);
 assert.match(css,/#proWorkspace\.op-dashboard-active \.pro-rail\{display:none!important\}/);
 assert.match(css,/#proWorkspace\.op-dashboard-active \.pro-layout\{display:block\}/);
 assert.match(app,/\$\('premiumGate'\)\.classList\.toggle\('hidden',allowed\)/);
 assert.match(app,/\$\('proDashboard'\)\.classList\.toggle\('hidden',!allowed\)/);
});
test('Watch and follow-up stay collapsible, with no forced open sections',()=>{
 for(const id of ['opWatchDetails','opFollowupDetails','opWatchForm','opAlertsList','opTrackedList','opGoSettings','opGoMessages','opOpenWatch'])assert.match(active,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(active,/<details[^>]* open/);
 assert.match(consoleJs,/details\.open=true/);
 assert.match(consoleJs,/selectView\(activeView\)/);
 assert.match(consoleJs,/button\.setAttribute\('aria-selected',String\(selected\)\)/);
 assert.match(consoleJs,/panel\.hidden=key!==view/);
 assert.match(consoleJs,/tab\('inbox'\)/);
});
test('Account billing is in Mon compte and no fake subscription is created',()=>{
 const settings=html.slice(html.indexOf('id="settings"'));
 assert.match(settings,/id="proSubscriptionState"/);
 assert.match(settings,/id="accountBillingPortal"/);
 assert.doesNotMatch(active,/Gérer \/ résilier mon abonnement/);
 assert.match(consoleJs,/canUsePremium\(\)/);
 assert.match(app,/function canUsePremium\(\)/);
});
