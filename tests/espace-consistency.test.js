'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8'),css=fs.readFileSync('public/styles.css','utf8'),app=fs.readFileSync('public/app.js','utf8'),server=fs.readFileSync('server.js','utf8');
test('Le sélecteur métier du parcours professionnel reste présent, sans doublon dans les préférences e-mail',()=>{assert.equal((html.match(/<option>Restauration &amp; Hôtellerie<\/option>/g)||[]).length,1);assert.equal((html.match(/<option>Bien-être &amp; Beauté<\/option>/g)||[]).length,1);assert.doesNotMatch(html.slice(html.indexOf('<form id="preferencesForm"'),html.indexOf('</form>',html.indexOf('<form id="preferencesForm"'))),/name="category"|name="department"/);});
test('Marchés publics masqués dans la navigation sans accès autorisé',()=>{assert.match(app,/nav-link\[data-tab="boamp"\]/);assert.match(app,/classList\.toggle\('hidden',!allowed\)/);});
test('Navigation mobile selon la visibilité et police autorisée par CSP',()=>{assert.match(css,/\.sidebar nav:has\(/);assert.match(server,/https:\/\/fonts\.gstatic\.com/);assert.match(server,/https:\/\/fonts\.googleapis\.com/);});
