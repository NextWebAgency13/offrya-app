'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8'),css=fs.readFileSync('public/styles.css','utf8'),app=fs.readFileSync('public/app.js','utf8');
test('Barre mobile à cinq destinations permanentes',()=>{assert.match(css,/\.sidebar nav,\.sidebar nav:has\(/);assert.match(css,/repeat\(5,minmax\(0,1fr\)\)/);assert.match(css,/\.sidebar \.nav-link\[data-tab="settings"\]\{display:flex\}/);});
test('Espace pro est remplacé par Marchés publics uniquement avec accès premium actif',()=>{assert.match(app,/mobile-pro-replaced',allowed/);assert.match(css,/\.sidebar \.nav-link\.mobile-pro-replaced\{display:none\}/);assert.match(app,/nav-link\[data-tab="boamp"\]/);});
test('Libellés des onglets',()=>{assert.match(html,/<span>Mon compte<\/span>/);assert.match(html,/<span>Messages<\/span>/);});
