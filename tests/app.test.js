'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {buildBoampUrl,normalizeRecord,queryBoamp,safeUrl,escapeOds}=require('../lib/boamp');
const {handle,csvValue}=require('../server');
const fs=require('node:fs');const path=require('node:path');

test('Le moteur interroge uniquement la source BOAMP officielle et les avis non expirés',()=>{
 const url=buildBoampUrl({q:'nettoyage',dept:'31',limit:20});
 assert.equal(url.hostname,'boamp-datadila.opendatasoft.com');
 assert.match(url.pathname,/\/api\/explore\/v2\.0\/catalog\/datasets\/boamp\/records$/);
 assert.match(url.searchParams.get('where'),/datelimitereponse >= now\(\)/);
 assert.match(url.searchParams.get('where'),/search\(objet, descripteur_libelle, "nettoyage"\)/);
 assert.equal(url.searchParams.get('refine'),'code_departement:31');
});
test('Paramètres adverses échappés et plafonds de résultats',()=>{
 const url=buildBoampUrl({q:'" OR 1 = 1 --',dept:'javascript:alert(1)',limit:300,offset:100000});
 assert.match(url.searchParams.get('where'), /\\" OR 1 = 1 --/);
 assert.equal(url.searchParams.get('refine'),null);
 assert.equal(url.searchParams.get('limit'),'50');
 assert.equal(url.searchParams.get('offset'),'1000');
 assert.equal(escapeOds('a\\b"c'),'a\\\\b\\"c');
});
test('Les liens officiels uniquement et formats BOAMP réels',()=>{
 const record=normalizeRecord({idweb:'26-105028',objet:'Nettoyage des bâtiments',nomacheteur:'Ville de Toulouse',url_avis:'https://www.boamp.fr/pages/avis/?q=idweb:26-105028',dateparution:'2026-10-30',datelimitereponse:'2026-11-30T11:00:00Z',code_departement:'31'});
 assert.equal(record.id,'26-105028');assert.equal(record.departments,'31');assert.match(record.url,/boamp.fr/);assert.equal(record.source,'BOAMP · DILA');
 assert.equal(safeUrl('https://evil.example/steal','oops'),null);
 assert.equal(safeUrl('', '26-105028'),'https://www.boamp.fr/pages/avis/?q=idweb:26-105028');
});
test('Normalisation BOAMP : erreur ou données invalides sans annonces inventées',async()=>{
 const bad=normalizeRecord({nomacheteur:'Anonyme'});assert.equal(bad,null);
 const data=await queryBoamp({},async()=>({ok:true,json:async()=>({total_count:2,results:[{idweb:'26-105028',objet:'Nettoyage',url_avis:'https://www.boamp.fr/pages/avis/?q=idweb:26-105028'}, {name:'invalide'}]})}));
 assert.equal(data.items.length,1);assert.equal(data.total,2);assert.equal(data.isLive,true);
 await assert.rejects(queryBoamp({},async()=>({ok:false,status:503})),/HTTP 503/);
});
test('CSV : neutralisation des formules et guillemets',()=>{
 assert.equal(csvValue('=2+2'),'"\'=2+2"');assert.equal(csvValue('bonjour "Paris"'),'"bonjour ""Paris"""');
});
