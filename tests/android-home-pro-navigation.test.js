'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
test('Accueil and Espace pro are different routes and tabs for Premium users',()=>{
 assert.match(html,/data-tab="dashboard"/);
 assert.match(html,/data-tab="professional"/);
 assert.match(app,/dashboard:'\/espace'/);
 assert.match(app,/professional:'\/espace\/professionnel'/);
 assert.match(app,/const initialScreen=pathsReverse\[location\.pathname\]\|\|'dashboard';/);
 assert.match(app,/tab\(initialScreen,true\)/);
 assert.doesNotMatch(app,/canUsePremium\(\)&&location\.pathname===paths\.dashboard\?'professional'/);
 assert.doesNotMatch(pro,/\.sidebar \[data-tab="dashboard"\],#priorityAlertShortcut/);
});
test('Normal Accueil button is not captured by professional interception',()=>{
 assert.match(pro,/closest\('#priorityAlertShortcut'\)/);
 assert.match(pro,/if\(b&&canUsePremium\(\)\)/);
 assert.match(pro,/else if\(\['dashboard','missions','inbox','settings','boamp'\]/);
 assert.match(app,/document\.querySelectorAll\('\.nav-link'\)\.forEach\(el=>el\.classList\.toggle\('active',el\.dataset\.tab===name\|\|\(name==='professional'&&canUsePremium\(\)&&el\.dataset\.tab==='boamp'\)\)\)/);
});
test('Android back and forward restore Pro screen without duplicating browser history',()=>{
 assert.match(pro,/window\.addEventListener\('popstate'/);
 assert.match(pro,/route==='\/espace\/professionnel'\)show\(new URLSearchParams\(window\.location\.search\)\.get\('view'\)==='preferences'\?'preferences':'home',true\)/);
 assert.match(pro,/function show\(next,fromHistory=false\)/);
 assert.match(pro,/tab\('professional',fromHistory\)/);
 assert.match(pro,/const professionalVisible=\$\('professional'\)\?\.classList\.contains\('active'\)===true/);
 assert.match(pro,/if\(name==='professional'\|\|name==='boamp'\)activeButtons\(\)/);
});
test('Accueil displays personal activity; Premium-only access remains protected',()=>{
 assert.match(app,/const personalHeading=document\.querySelector\('#roleClientView \.client-dashboard-heading h2'\)/);
 assert.match(app,/Vos missions publiées et vos échanges\. Retrouvez les opportunités dans Espace pro/);
 assert.match(app,/hasVerifiedProfessionalIdentity\(\)&&paid/);
 assert.match(app,/function canUsePremium\(/);
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
});
