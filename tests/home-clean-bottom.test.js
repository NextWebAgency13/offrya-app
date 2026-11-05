'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const h=fs.readFileSync('public/index.html','utf8'),c=fs.readFileSync('public/public.css','utf8');
test('Bas de page sans bandeau de conversion redondant',()=>{
 assert.doesNotMatch(h,/Rejoignez OFFRYA dès aujourd’hui|class="mock-end"|mock-end-actions|mock-choice-grid/);
 assert.match(h,/La confiance au cœur d’OFFRYA/);
 assert.match(h,/Comment fonctionne OFFRYA/);
});
test('Les trois portes d entrée sont les seuls appels à action principaux de la vitrine',()=>{
 for(const part of ['client','professional','manage'])assert.equal((h.match(new RegExp('data-journey="'+part+'"','g'))||[]).length,1);
 assert.match(c,/\.mock-home \.offrya-entry-paths\{/);
});
