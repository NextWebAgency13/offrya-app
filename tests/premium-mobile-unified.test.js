'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const js=fs.readFileSync('public/app.js','utf8');

test('Un seul en-tête privé avec avatar et menu de compte accessible',()=>{
 assert.match(html,/<details class="account-menu" id="accountMenu">/);
 assert.match(html,/<summary aria-label="Ouvrir le menu de mon compte"/);
 for(const id of ['avatar','authOpen','logout'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/class="account-menu-action" data-tab="settings"/);
 assert.match(html,/class="account-menu-action" data-tab="professional"/);
 assert.match(js,/getElementById\('accountMenu'\)\?\.removeAttribute\('open'\)/);
});
test('Missions : un accès professionnel violet et explicite',()=>{
 assert.match(html,/class="button primary mission-upgrade-cta" data-tab="professional"/);
 assert.match(html,/Activer mon accès professionnel/);
 assert.match(css,/\.mission-upgrade-cta,\.pro-verify-cta/);
});
test('Vérification professionnelle intégrée sans supprimer les étapes',()=>{
 for(let i=1;i<=4;i++)assert.match(html,new RegExp('data-step="'+i+'"'));
 assert.match(html,/id="proProgressTitle"/);
 assert.match(html,/id="proProgressStep"/);
 assert.match(html,/id="verifySiret"/);
 assert.match(js,/\$\('proProgressTitle'\)\.textContent=/);
 assert.match(js,/\$\('proProgressStep'\)\.textContent=/);
 assert.match(css,/\.pro-rail ol\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test('Présentation seule : autorisations et souscription conservées',()=>{
 assert.match(js,/function canUsePremium\(/);
 assert.match(js,/verifySiret/);
 assert.match(js,/state\.billingEnabled/);
 assert.doesNotMatch(css,/STRIPE_SECRET_KEY|SUPABASE_SECRET_KEY/);
});
