'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8'),css=fs.readFileSync('public/styles.css','utf8'),app=fs.readFileSync('public/app.js','utf8'),server=fs.readFileSync('server.js','utf8');
test('Les trois choix de catégorie incluent restauration et beauté',()=>{assert.equal((html.match(/<option>Restauration &amp; Hôtellerie<\/option>/g)||[]).length,3);assert.equal((html.match(/<option>Bien-être &amp; Beauté<\/option>/g)||[]).length,3);});
test('Marchés publics masqués dans la navigation sans accès autorisé',()=>{assert.match(app,/nav-link\[data-tab="boamp"\]/);assert.match(app,/classList\.toggle\('hidden',!allowed\)/);});
test('Navigation mobile selon la visibilité et police autorisée par CSP',()=>{assert.match(css,/\.sidebar nav:has\(/);assert.match(server,/https:\/\/fonts\.gstatic\.com/);assert.match(server,/https:\/\/fonts\.googleapis\.com/);});
