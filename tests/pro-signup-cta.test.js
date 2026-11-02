'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public','public.css'),'utf8');
const auth=fs.readFileSync(path.join(root,'public','connexion.js'),'utf8');
const pro=html.match(/<article class="mock-choice-card mock-pro">([\s\S]*?)<\/article>/)?.[1];

test('Accueil : le bloc professionnel propose un bouton explicite de création de compte',()=>{
 assert.ok(pro,'Encart OFFRYA Professionnel présent');
 assert.match(pro,/Vous êtes professionnel \?/);
 assert.match(pro,/34,99 € TTC \/ mois/);
 assert.match(pro,/href="\/connexion\?mode=signup&amp;next=%2Fespace%2Fprofessionnel">Créer un compte professionnel/);
 assert.match(pro,/class="mock-pro-details" href="\/professionnels">Découvrir l’offre OFFRYA Professionnel/);
 assert.equal((pro.match(/mock-pro-signup/g)||[]).length,1);
});
test('Redirection : inscription Pro pré-sélectionnée sans supprimer la vérification',()=>{
 assert.match(auth,/query\.get\('mode'\)==='signup'\)change\('signup'\)/);
 assert.match(auth,/next==='\/espace\/professionnel'\?'pro':'client'/);
 assert.match(auth,/email_confirmed_at/);
 assert.match(html,/href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/);
});
test('Carte Pro : le bouton reste visible sur smartphone même lorsque la liste grandit',()=>{
 assert.match(css,/\.mock-home \.mock-pro\{height:auto;min-height:310px\}/);
 assert.match(css,/\.mock-home \.mock-pro \.mock-choice-content\{height:auto;min-height:0\}/);
 assert.match(css,/\.mock-home \.mock-pro \.mock-card-cta\{margin-top:16px;/);
 assert.match(css,/@media\(max-width:560px\)\{\s*\.mock-home \.mock-pro\{height:auto;min-height:0;overflow:hidden;/);
 assert.match(css,/\.mock-home \.mock-pro \.mock-card-cta\{min-height:54px;/);
 assert.match(css,/\.mock-home \.mock-pro \.mock-card-cta:focus-visible/);
 assert.doesNotMatch(pro,/href="#"/);
});
