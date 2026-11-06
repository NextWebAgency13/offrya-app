'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {analyzeDce,numericEuros}=require('../lib/dce-evidence');
function sample(text,company={}){
 return {documents:[{name:'RC-consultation.pdf',pages:[{page:3,text}]}],company};
}
const rc=[
 'Date limite de remise des offres : 27 novembre 2026 à 12 h',
 'Critères d’attribution : valeur technique 60 % et prix 40 %.',
 'Le candidat fournit le DC1, le DC2 et un mémoire technique.',
 'Chiffre d’affaires annuel minimum de 500 000 €.',
 'Une visite obligatoire des lieux doit être effectuée.',
 'Lot n° 1 : nettoyage de bureaux.',
 'Durée du marché : 12 mois.',
 'Le mémoire technique ne peut excéder 25 pages.',
 'Un rectificatif du DCE est publié le 9 novembre 2026.'
].join('\n');
test('DCE extracts structured signals and a document+page source for every fact',()=>{
 const result=analyzeDce(sample(rc));
 assert.equal(result.version,'dce-evidence-v1');
 for(const kind of ['deadline','criteria','capacity','visit','lots','duration','pages','amendment']){
  const fact=result.facts.find(f=>f.type===kind);
  assert.ok(fact,'missing '+kind);
  assert.equal(fact.source.document,'RC-consultation.pdf');
  assert.equal(fact.source.page,3);
  assert.ok(fact.source.excerpt.length>10);
 }
 assert.ok(result.checklist.some(x=>x.id==='DC1'&&x.source.page===3));
 assert.ok(result.checklist.some(x=>x.id==='DC2'));
 assert.ok(result.checklist.some(x=>x.id==='Mémoire technique'));
 assert.ok(result.memoire_draft.every(x=>x.text.includes('À compléter')));
 assert.equal(result.human_validation_required,true);
});
test('Minimum financial threshold only influences a verdict after explicit company confirmation',()=>{
 assert.equal(numericEuros('Chiffre d’affaires annuel minimum de 500 000 €.'),500000);
 assert.equal(analyzeDce(sample(rc,{turnover_eur:100000})).go_no_go.verdict,'A_VERIFIER');
 const r=analyzeDce(sample(rc,{turnover_eur:100000,turnover_confirmed:true}));
 assert.equal(r.go_no_go.verdict,'NO_GO_POTENTIEL');
 assert.equal(r.go_no_go.turnover_requirement.minimum_eur,500000);
 assert.equal(r.go_no_go.risks[0].source.page,3);
 assert.equal(analyzeDce(sample(rc,{turnover_eur:700000,turnover_confirmed:true,visit_confirmed:true})).go_no_go.verdict,'A_VERIFIER');
});
test('Missing evidence is not fabricated, no document has an automated YES/GO decision',()=>{
 const out=analyzeDce(sample('Le règlement de consultation et ses annexes sont à télécharger.'));
 assert.equal(out.facts.length,0);
 assert.equal(out.go_no_go.verdict,'A_VERIFIER');
 assert.equal(out.go_no_go.score,null);
 assert.equal(out.checklist.length,0);
 assert.ok(out.uncertainties.length>=3);
});
test('Client document availability remains an unverified declaration, not a verified legal claim',()=>{
 const out=analyzeDce(sample(rc,{documents_confirmed:['DC1']}));
 assert.equal(out.checklist.find(x=>x.id==='DC1').status,'déclaré disponible, non vérifié');
 assert.equal(out.checklist.find(x=>x.id==='DC2').status,'non_confirmé');
});
test('Malformed page references, path traversal, unsafe types and excess data are rejected',()=>{
 for(const bad of [
  {documents:[]},
  {documents:[{name:'../rc.pdf',pages:[{page:1,text:'valid'}]}]},
  {documents:[{name:'rc.pdf',pages:[{page:1,text:'x'},{page:1,text:'duplicate'}]}]},
  {documents:[{name:'rc.pdf',pages:[{page:'1',text:'string page'}]}]},
  {documents:[{name:'rc.pdf',pages:[{page:1,text:'x'.repeat(12001)}]}]},
  {documents:Array.from({length:13},(_,i)=>({name:'D'+i+'.pdf',pages:[{page:1,text:'x'}]}))}
 ])assert.throws(()=>analyzeDce(bad),TypeError);
});
test('Public marketplace unchanged; new DCE endpoint runs after server authorization and before method gate',()=>{
 const server=fs.readFileSync('server.js','utf8');
 const segment=server.slice(server.indexOf("if(p==='/api/pro/dce/analyze')"),server.indexOf("if(p==='/api/pro/matches')"));
 assert.match(segment,/req\.method!=='POST'/);
 assert.match(segment,/verifyPremiumAccess\(req\.headers\.authorization/);
 assert.match(segment,/if\(!premium\.allowed\)return json\(res,premium\.status/);
 assert.match(segment,/analyzeDce\(input\)/);
 assert.doesNotMatch(segment,/SUPABASE_SECRET_KEY|OPENAI_API_KEY|https:\/\/|writeFile|service_role/);
 assert.ok(server.indexOf("if(p==='/api/pro/dce/analyze')")<server.indexOf("if(!['GET','HEAD'].includes(req.method))"));
});
