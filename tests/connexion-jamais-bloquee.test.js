'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('public/connexion.js','utf8'),html=fs.readFileSync('public/connexion.html','utf8');
test('Connexion : un champ masqué ne peut plus bloquer l’envoi en silence',()=>{
 assert.match(html,/<form id="loginForm" class="form auth-form" novalidate>/);
 assert.match(html,/<input name="username" type="text" autocomplete="nickname"/);
 assert.match(js,/input\.disabled=userRow\.hidden;/);
 assert.match(js,/ps\.querySelector\('input'\)\.disabled=ps\.hidden;/);
 assert.match(js,/em\.querySelector\('input'\)\.disabled=em\.hidden;/);
});
test('Connexion : contrôles visibles en français, 8 caractères seulement pour un nouveau mot de passe',()=>{
 assert.match(js,/say\('Indiquez une adresse e-mail valide\.',true\)/);
 assert.match(js,/say\('Indiquez votre mot de passe\.',true\)/);
 assert.match(js,/if\(newPassword&&password\.length<8\)\{say\('Le mot de passe doit contenir au moins 8 caractères\.',true\)/);
 assert.match(js,/if\(v==='signup'\|\|v==='recover'\)ps\.querySelector\('input'\)\.minLength=8;else ps\.querySelector\('input'\)\.removeAttribute\?\.\('minlength'\);/);
});
