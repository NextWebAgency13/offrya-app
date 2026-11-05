'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');

test('Desktop personal page keeps account sidebar; Pro workspace keeps its own menu',()=>{
 assert.match(app,/document\.body\.classList\.toggle\('offrya-pro-workspace',name==='professional'\)/);
 assert.match(css,/body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) #proV3Sidebar/);
 assert.match(css,/body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) #proV3SidePlan/);
 assert.match(css,/body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) \.sidebar #nav\{display:flex!important/);
 assert.match(css,/body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) \.sidebar #nav \.nav-link\.active/);
 assert.match(css,/body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) \.sidebar #nav \.nav-link\[data-tab="boamp"\]\{display:none!important\}/);
 assert.match(html,/data-tab="dashboard"/);
 assert.match(html,/data-tab="professional"/);
});
test('Android has five tabs in personal and Pro contexts',()=>{
 assert.match(css,/@media\(max-width:620px\)\{\s*body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) \.sidebar #nav\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/body\.offrya-pro-v3:not\(\.offrya-pro-workspace\) \.sidebar \.sidebar-bottom\{display:none!important\}/);
 assert.match(app,/dashboard:'\/espace'/);
 assert.match(app,/professional:'\/espace\/professionnel'/);
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
});
test('Pro dashboard and client dashboard continue to be separate routes, not automatic redirects',()=>{
 assert.match(app,/const initialScreen=pathsReverse\[location\.pathname\]\|\|'dashboard';/);
 assert.match(app,/restoreContextualRoute\(initialScreen\)/);
 assert.match(pro,/tab\('professional',fromHistory\)/);
 assert.match(app,/Vos missions publiées et vos échanges\. Retrouvez les opportunités dans Espace pro/);
 assert.doesNotMatch(app,/canUsePremium\(\)&&location\.pathname===paths\.dashboard\?'professional'/);
});
