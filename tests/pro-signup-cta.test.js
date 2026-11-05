'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/public.css','utf8');
const auth=fs.readFileSync('public/connexion.js','utf8');
const premium=fs.readFileSync('public/professionnels.html','utf8');
test('Accueil : une entrée Pro unique, renvoyant à l’offre et à la vérification',()=>{
 assert.equal((html.match(/data-journey="professional"/g)||[]).length,1);
 assert.match(html,/href="\/professionnels" data-journey="professional"/);
 assert.match(html,/Je suis professionnel/);
 assert.match(html,/34,99 € TTC \/ mois/);
 assert.doesNotMatch(html,/mock-pro-signup|Créer un compte professionnel/);
});
test('L inscription professionnelle est disponible sur la page dédiée et conserve le contrôle du dirigeant',()=>{
 assert.match(premium,/href="\/connexion\?mode=signup&amp;next=%2Fespace%2Fprofessionnel"/);
 assert.match(premium,/Vérifiez votre entreprise/);
 assert.match(premium,/Confirmez votre identité/);
 assert.match(premium,/Activez votre abonnement/);
 assert.match(auth,/query\.get\('mode'\)==='signup'\)change\('signup'\)/);
 assert.match(auth,/next==='\/espace\/professionnel'\?'pro':'client'/);
 assert.match(auth,/email_confirmed_at/);
});
test('Les entrées publique Pro et demandeur restent accessibles sur smartphone et au clavier',()=>{
 assert.match(css,/@media\(max-width:820px\)\{\s*\.mock-home \.offrya-entry-paths\{grid-template-columns:1fr/);
 assert.match(css,/\.offrya-entry-path:focus-visible/);
 assert.match(html,/href="\/deposer-une-mission" data-journey="client"/);
});
