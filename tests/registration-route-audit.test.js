'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const home=read('public/index.html'),pro=read('public/professionnels.html'),deposit=read('public/deposer-une-mission.html'),auth=read('public/connexion.js'),login=read('public/connexion.html'),privateDoc=read('public/espace.html'),app=read('public/app.js');
const client='/connexion?mode=signup&amp;next=%2Fdeposer-une-mission',professional='/connexion?mode=signup&amp;next=%2Fespace%2Fprofessionnel';
test('audit : appels d’inscription des pages publiques vers le bon formulaire',()=>{
 assert.match(home,/href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/);
 assert.match(home,/href="\/connexion\?mode=signup&amp;next=%2Fespace%2Fprofessionnel"/);
 assert.ok(pro.includes('href="'+professional+'"'));
 assert.ok(deposit.includes('href="'+client+'"'));
 assert.ok(login.includes('href="'+client+'"')&&login.includes('href="'+professional+'"'));
});
test('audit : choix de rôle unique et formulaires directs',()=>{
 assert.match(auth,/choice.hidden=v!=='signup'\|\|selectedSignup/);
 assert.match(auth,/\$\('loginForm'\)\.hidden=v==='signup'&&!selectedSignup/);
 assert.match(auth,/COMPTE DEMANDEUR · GRATUIT/);
 assert.match(auth,/COMPTE PROFESSIONNEL/);
 assert.match(login,/data-signup-type="client"/);
 assert.match(login,/data-signup-type="pro"/);
});
test('audit : confirmation email et destinations autorisées',()=>{
 assert.match(auth,/emailRedirectTo:location.origin\+'\/connexion\?confirmation=1&next='/);
 assert.match(auth,/email_confirmed_at/);
 assert.match(auth,/offrya_signup_intent/);
 assert.match(auth,/value==='\/deposer-une-mission'/);
 assert.match(auth,/profile.data\?\.role==='pro'/);
 assert.doesNotMatch(auth,/location.replace\(value\)/);
});
test('audit : séparation des deux comptes et accès professionnel validé',()=>{
 assert.match(app,/const eligiblePro=canUsePremium\(\)/);
 assert.match(app,/state.profile\?\.role==='pro'/);
 assert.match(app,/roleOnboarding/);
 assert.match(privateDoc,/id="roleClientView"/);
 assert.match(privateDoc,/id="rolePremiumView"/);
 assert.doesNotMatch(privateDoc,/id="rolePendingView"/);
});
test('audit : interface mobile avec champs lisibles',()=>{
 const c=read('public/auth.css');
 assert.match(c,/@media\(max-width:700px\)/);
 assert.match(c,/\.auth-workspace\{order:1/);
 assert.match(c,/font-size:16px;min-height:52px/);
});
