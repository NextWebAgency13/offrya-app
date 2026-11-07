'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../public');
const css=fs.readFileSync(path.join(root,'brand-kit.css'),'utf8');
const html=fs.readFileSync(path.join(root,'espace.html'),'utf8');
const start=css.indexOf('/* OFFRYA / accueil demandeur (07-11-2026)');
const updated=css.slice(start);

test('Le bandeau gratuit supprime le logo répété et évite un texte sombre sur fond sombre',()=>{
 assert.ok(start>0,'Le correctif visuel existe');
 assert.match(updated,/\.client-dashboard-publish\.role-client-hero::after\s*\{\s*content:none!important;\s*display:none!important/);
 assert.match(updated,/background-image:radial-gradient/);
 assert.match(updated,/linear-gradient\(118deg,#FFFFFF 0%,#F7F0FF 55%,#EEDFFD 100%\)/);
 assert.match(updated,/\.role-client-hero h2\{/);
 assert.match(updated,/color:#292053!important/);
 assert.match(updated,/\.role-client-hero p\{/);
 assert.match(updated,/color:#56486F!important/);
 assert.match(html,/id="clientProjectHeading">Vos projets, en toute simplicité<\/h2>/);
 assert.doesNotMatch(html,/id="clientProjectHeading">Bienvenue sur OFFRYA/);
});
test('Accueil demandeur compact, quatre cartes uniformes, parcours réels conservés',()=>{
 assert.match(updated,/role-reference-client:not\(\.hidden\)/);
 assert.match(updated,/#roleClientView\.role-reference-client:not\(\.hidden\)/);
 assert.match(updated,/min-height:0!important/);
 assert.match(updated,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(updated,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(updated,/@media\(max-width:780px\)/);
 assert.match(updated,/min-height:145px!important/);
 for(const title of ['Mes missions','Mes échanges','Espace pro','Mon profil']){
  assert.ok(html.includes('<strong>'+title+'</strong>'),title);
 }
 for(const action of ['data-tab="missions"','data-tab="inbox"','data-tab="settings"','data-pro-entry','href="/deposer-une-mission"']){
  assert.ok(html.includes(action),action);
 }
 const first=html.slice(html.indexOf('id="roleClientView"'),html.indexOf('id="rolePremiumView"'));
 assert.doesNotMatch(first,/role-premium-pill|roleBusinessName/);
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});
