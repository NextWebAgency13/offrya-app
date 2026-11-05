'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {assessTender,sectorsFor,locality}=require('../lib/tender-semantics');
const {qualifyTender}=require('../lib/tender-assistant');
const {rankCandidates}=require('../lib/ai-matching');
const {spawnSync}=require('node:child_process');
const now=Date.parse('2026-11-05T12:00:00Z');
const deadline=new Date(now+22*86400000).toISOString();
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function notice(title,extra={}){
 return {id:'26-123456',tender_id:'26-123456',title,source:'BOAMP',
  url:'https://www.boamp.fr/pages/avis/?q=idweb:26-123456',
  buyer:'Commune Test',departments:'13',deadline,
  detected_at:new Date(now-86400000).toISOString(),match_score:85,
  match_reason:'secteur : Restauration & Hôtellerie · département : 13',
  ...extra};
}
test('Restoring a church or farm is building work, never food and hospitality',()=>{
 const titles=['Travaux de restauration de l’église Saint-Pierre',
  'Travaux de restauration de la ferme des Aurèdes',
  'Restauration du patrimoine bâti communal'];
 for(const title of titles){
  const sectors=sectorsFor(title);
  assert.ok(sectors.some(x=>x.sector==='Bâtiment'),title);
  assert.ok(!sectors.some(x=>x.sector==='Restauration & Hôtellerie'),title);
  assert.equal(assessTender(notice(title),{sectors:['Restauration & Hôtellerie'],department:'13'},now),null,title);
  const building=assessTender(notice(title),{sectors:['Bâtiment'],department:'13'},now);
  assert.equal(building?.sector,'Bâtiment');
  assert.match(building.reasons.join(' '),/bâti|bâtiment/i);
 }
});
test('Catering, delivered meals and food supply are food work, not transport by incidental delivery',()=>{
 for(const title of ['Fabrication et livraison de repas pour les écoles',
  'Fourniture de denrées alimentaires pour la restauration collective']){
  const s=assessTender(notice(title),{sectors:['Restauration & Hôtellerie']},now);
  assert.equal(s?.sector,'Restauration & Hôtellerie');
  assert.equal(assessTender(notice(title),{sectors:['Transport']},now),null);
 }
});
test('Generic homonyms do not qualify: spaces, maintenance or hygiene with no trade evidence',()=>{
 for(const title of ['Aménagement et qualification des espaces publics et zones d’accueil',
  'Prestation d’entretien des installations', 'Fourniture de produits génériques']){
  assert.equal(assessTender(notice(title),{},now),null,title);
 }
 const trees=sectorsFor('Entretien des espaces verts et élagage des arbres');
 assert.equal(trees[0].sector,'Espaces verts');
 assert.ok(!trees.some(x=>x.sector==='Nettoyage'));
 const cleaned=sectorsFor('Nettoyage des bâtiments et de la vitrerie');
 assert.equal(cleaned[0].sector,'Nettoyage');
});
test('Exact department, multiple departments, unknown territory and outside zone are different',()=>{
 assert.equal(locality('13','13').kind,'local');
 assert.equal(locality('4, 6, 13, 30','13').kind,'regional');
 assert.equal(locality('','13').kind,'unknown');
 assert.equal(locality('83','13').kind,'outside');
 assert.equal(locality('4','04').kind,'local');
 const base='Entretien et élagage des espaces verts';
 const pref={sectors:['Espaces verts'],department:'13'};
 const local=assessTender(notice(base),pref,now);
 const multi=assessTender(notice(base,{departments:'83, 13'}),pref,now);
 const unknown=assessTender(notice(base,{departments:''}),pref,now);
 assert.ok(local.score>multi.score);
 assert.ok(multi.score>unknown.score);
 assert.ok(unknown.score<=64);
 assert.equal(assessTender(notice(base,{departments:'83'}),pref,now),null);
 assert.equal(unknown.territoryKnown,false);
});
test('Old uniform stored scores are recomputed from verified titles, not trusted blindly',()=>{
 const prefs={sectors:['Bâtiment','Restauration & Hôtellerie','Espaces verts'],department:'13'};
 const alerts=[
  notice('Travaux de restauration de l’église Saint-Pierre',{tender_id:'26-123456'}),
  notice('Fabrication et livraison de repas dans les écoles',{tender_id:'26-123457'}),
  notice('Entretien et élagage des espaces verts',{tender_id:'26-123458',deadline:new Date(now+6*86400000).toISOString()}),
 ];
 const ranked=rankCandidates({alerts,preferences:prefs,userId:user,now});
 assert.equal(ranked.total,3);
 assert.ok(ranked.items.every(x=>x.reasons[0].startsWith('Métier : ')));
 assert.ok(ranked.items.every(x=>x.score>=55&&x.score<=97));
 assert.ok(ranked.items.some(x=>x.score!==85),'No hardcoded 85/100 scores');
 const food=rankCandidates({alerts:[alerts[0]],preferences:{sectors:['Restauration & Hôtellerie']},now});
 assert.equal(food.total,0,'Historic incorrect food tag cannot reopen a building tender');
});
test('Worker and Premium radar share trade filtering and only official unexpired notices qualify',()=>{
 const restaurant=notice('Travaux de restauration de la ferme');
 assert.equal(qualifyTender(restaurant,{sectors:['Restauration & Hôtellerie'],user_id:user},new Date(now)),null);
 assert.ok(qualifyTender(restaurant,{sectors:['Bâtiment'],user_id:user},new Date(now)));
 assert.equal(qualifyTender(notice('Travaux de restauration de la ferme',{deadline:new Date(now-1).toISOString()}),{sectors:['Bâtiment']},new Date(now)),null);
});
test('Mobile UI hides inflated scores until server verdict and stores stages under existing RLS',()=>{
 const pro=fs.readFileSync('public/pro-experience.js','utf8');
 const client=fs.readFileSync('public/opportunity-console.js','utf8');
 const css=fs.readFileSync('public/pro-experience.css','utf8');
 const responsive=fs.readFileSync('public/role-reference.css','utf8');
 const schema=fs.readFileSync('sql/unified_opportunity_watch.sql','utf8');
 assert.match(pro,/proAiPriorityAlert/);
 assert.match(pro,/priorityOnly/);
 assert.match(pro,/score>=75|score\)>=75/);
 assert.match(pro,/updateTenderTracking/);
 for(const verb of ["insert","update","delete"])
  assert.match(pro,new RegExp("from\\('offrya_tender_tracking'\\)\\."+verb));
 assert.match(pro,/data-pro-save-tender/);
 assert.match(pro,/data-pro-stage-tender/);
 assert.match(pro,/data-pro-remove-tender/);
 assert.match(pro,/Pertinence en cours de calcul/);
 assert.match(pro,/Classement métier en cours de vérification/);
 assert.match(pro,/scoreLabel/);
 assert.match(pro,/consulter/i);
 assert.match(client,/verified=new Map/);
 assert.match(client,/x\.kind==='tender'&&Number\(x\.score\)>=75/);
 assert.match(schema,/offrya_tender_own_insert/);
 assert.match(schema,/offrya_private\.has_active_professional_access/);
 assert.match(css,/\.pro-ai-track-action/);
 assert.match(css,/-webkit-line-clamp:3/);
 assert.match(responsive,/#professional\.active\) \.app-shell \.main-content/);
 for(const content of [pro,client]){
  const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:content,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
