'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const deposit=fs.readFileSync('public/deposer-une-mission.html','utf8');
const css=fs.readFileSync('public/public.css','utf8');
const home=fs.readFileSync('public/index.html','utf8');
const professionals=fs.readFileSync('public/professionnels.html','utf8');

test('Le pied de page de Déposer une mission suit le bas du viewport sur écran court',()=>{
 assert.match(deposit,/<body class="deposit-public-page"><header/);
 assert.match(deposit,/<\/header><main id="contenu">/);
 assert.match(deposit,/<\/main><footer class="footer">/);
 assert.match(css,/body\.deposit-public-page\s*\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*min-height:100vh;[^}]*min-height:100dvh;/s);
 assert.match(css,/body\.deposit-public-page > main\s*\{[^}]*flex:1 0 auto;[^}]*width:100%;/s);
 assert.match(css,/body\.deposit-public-page > footer\.footer\s*\{[^}]*flex-shrink:0;/s);
});

test('Le formulaire long reste déroulant et le pied de page ne devient pas fixe',()=>{
 const scoped=css.split('/* Page publique « Déposer une mission »')[1];
 assert.ok(scoped,'La correction de hauteur doit rester limitée à la page de dépôt');
 assert.doesNotMatch(scoped,/position:\s*(?:fixed|absolute|sticky)/);
 assert.doesNotMatch(scoped,/height:\s*100(?:d)?vh\s*;/);
 assert.match(deposit,/id="accountGate"/);
 assert.match(deposit,/id="publishArea"/);
 assert.match(deposit,/id="missionForm"/);
});

test('Le correctif ne modifie ni les autres pages publiques ni les contrôles d’accès',()=>{
 assert.doesNotMatch(home,/deposit-public-page/);
 assert.doesNotMatch(professionals,/deposit-public-page/);
 assert.match(deposit,/Un compte gratuit est nécessaire/);
 assert.match(deposit,/Créez votre compte, confirmez votre adresse e-mail/);
 assert.match(deposit,/href="\/connexion\?mode=signup&amp;role=client/);
});
