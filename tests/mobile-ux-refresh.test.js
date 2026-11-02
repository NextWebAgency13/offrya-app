'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../public/public.css'),'utf8');
test('Les secteurs passent en une colonne sur smartphone sans réduire les cartes',()=>{
 assert.match(css,/body:not\(\.mock-home\) \.section \.grid\.three\{grid-template-columns:1fr;gap:12px\}/);
 assert.match(css,/body:not\(\.mock-home\) \.simple-hero h1\{font-size:clamp\(29px,8vw,39px\)/);
});
test('L’accueil mobile garde des cartes et boutons lisibles',()=>{
 assert.match(css,/\.mock-home \.mock-choice-card li\{font-size:14px/);
 assert.match(css,/\.mock-home \.mock-sector strong\{min-height:60px;font-size:14px/);
 assert.match(css,/\.mock-home \.mock-actions\{flex-direction:column;align-items:stretch\}/);
});
test('La mise en page reste isolée des droits d’accès métier',()=>{
 assert.doesNotMatch(css,/supabase_secret|STRIPE_SECRET_KEY/);
 const index=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(index,/Publiez votre mission après confirmation de l’e-mail/);
 assert.match(index,/Entreprise et dirigeant vérifiés/);
});