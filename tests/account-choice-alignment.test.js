'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/public.css','utf8'),html=fs.readFileSync('public/index.html','utf8');
test('Trois parcours de même niveau et une seule action par parcours',()=>{
 const links=[...html.matchAll(/<a class="offrya-entry-path[^"]*" href="([^"]+)" data-journey="([^"]+)"/g)];
 assert.deepEqual(links.map(x=>x[2]),['client','professional','manage']);
 assert.deepEqual(links.map(x=>x[1]),['/deposer-une-mission','/professionnels','/connexion?next=%2Fespace']);
 assert.equal((html.match(/class="offrya-entry-path(?: offrya-entry-path-primary)?"/g)||[]).length,3);
});
test('Les parcours tiennent sur une colonne mobile et ne répètent pas les anciennes cartes de comptes',()=>{
 assert.match(css,/\.offrya-entry-paths\{grid-template-columns:1fr/);
 assert.doesNotMatch(html,/mock-choice-card|mock-choice-grid/);
});
