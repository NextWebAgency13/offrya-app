'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('public/index.html');
const css=read('public/public.css');

test('Huit pictogrammes SVG uniformes et compréhensibles sur la vitrine',()=>{
 const expected=['file-text','message-square','circle-check','shield-check','award','lock-keyhole','headset'];
 for(const name of expected){
  assert.equal((html.match(new RegExp('data-icon="'+name+'"','g'))||[]).length,1,name);
 }
 assert.equal((html.match(/data-icon="/g)||[]).length,expected.length);
 assert.equal((html.match(/<div class="mock-how-glyph" aria-hidden="true"><svg/g)||[]).length,3);
 assert.equal((html.match(/<span class="mock-assurance-icon" aria-hidden="true"><svg/g)||[]).length,4);
 assert.doesNotMatch(html,/class="mock-end"/);
 assert.doesNotMatch(html,/<div class="mock-how-glyph"[^>]*>[^<]*[▤◎♧]/);
 assert.doesNotMatch(html,/<span aria-hidden="true">[♢☆♙♧]<\/span>/);
});
test('SVG inline accessibles : décoratifs, non focalisables, indépendants des polices',()=>{
 const icons=[...html.matchAll(/<svg class="mock-(?:icon-svg|france mock-location-icon)"[\s\S]*?<\/svg>/g)].map(m=>m[0]);
 assert.equal(icons.length,7);
 for(const icon of icons){
  assert.match(icon,/viewBox="0 0 24 24"/);
  assert.match(icon,/fill="none"/);
  assert.match(icon,/stroke="currentColor"/);
  assert.match(icon,/stroke-linecap="round"/);
  assert.match(icon,/aria-hidden="true"/);
  assert.match(icon,/focusable="false"/);
 }
});
test('La structure marketing, les intitulés et les appels à action restent intacts',()=>{
 for(const label of [
  'Comment fonctionne OFFRYA ?','Déposez une mission','Recevez des réponses',
  'Échangez et réalisez','Professionnels vérifiés',
  'Publication gratuite','Échanges confidentiels','Assistance OFFRYA',
  'La confiance au cœur d’OFFRYA','Publication gratuite'
 ])assert.ok(html.includes(label),label);
 assert.equal((html.match(/class="mock-how-step"/g)||[]).length,3);
 assert.equal((html.match(/class="mock-how-arrow"/g)||[]).length,2);
 assert.equal((html.match(/class="mock-container mock-assurance"/g)||[]).length,1);
 assert.match(html,/href="\/deposer-une-mission"/);
 assert.match(html,/href="\/professionnels"/);
});
test('Styles strictement limités aux éléments de la vitrine, y compris sur mobile',()=>{
 assert.match(css,/\.mock-home \.mock-how-glyph \.mock-icon-svg\{/);
 assert.match(css,/\.mock-home \.mock-assurance>div>span\.mock-assurance-icon\{/);
 assert.match(css,/\.mock-home \.mock-trust-heading h2\{/);
 assert.match(css,/@media\(max-width:560px\)\{\.mock-home \.mock-assurance\{/);
 assert.doesNotMatch(css,/\.mock-icon-svg\{.*?position:fixed/);
});
