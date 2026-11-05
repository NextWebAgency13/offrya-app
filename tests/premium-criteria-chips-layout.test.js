'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('public/pro-experience.js','utf8');
const styles=fs.readFileSync('public/pro-experience.css','utf8');
const from=source.indexOf('export function summarizeWatchCriteria(');
const to=source.indexOf('// OFFRYA Pro UI v3',from);
assert.ok(from>=0&&to>from,'Pure preference summary should be available for tests');
const ctx=vm.createContext({});
vm.runInContext(source.slice(from,to).replace('export function','function')+
 '\nthis.summarize=summarizeWatchCriteria;',ctx);
const summarize=p=>JSON.parse(JSON.stringify(ctx.summarize(p)));
const labels=p=>summarize(p).map(x=>x.label);

test('Two trades and department are all visible separately in the correct order',()=>{
 assert.deepEqual(labels({sectors:['Nettoyage','Espaces verts'],department:'13'}),
  ['Nettoyage','Espaces verts','Bouches-du-Rhône (13)']);
 const chips=summarize({sectors:['Nettoyage','Espaces verts'],department:'13'});
 assert.deepEqual(chips.map(x=>x.kind),['sector','sector','area']);
 assert.ok(chips.every(x=>!x.label.includes('+')));
});
test('Zero to three trades render explicitly without hiding them in +1',()=>{
 assert.deepEqual(labels({}),['Tous les secteurs','Toute la France']);
 assert.deepEqual(labels({sectors:['Bâtiment']}),['Bâtiment','Toute la France']);
 assert.deepEqual(labels({sectors:['Bâtiment','Nettoyage','Espaces verts'],department:'30'}),
  ['Bâtiment','Nettoyage','Espaces verts','Gard (30)']);
});
test('Four or more trades show two names then one grammatically correct count',()=>{
 const sectors=['Nettoyage','Espaces verts','Bâtiment','Informatique'];
 assert.deepEqual(labels({sectors,department:'13'}),
  ['Nettoyage','Espaces verts','+2 autres secteurs','Bouches-du-Rhône (13)']);
 const list=summarize({sectors});
 assert.equal(list[2].kind,'overflow');
 assert.match(list[2].tooltip,/Bâtiment, Informatique/);
 assert.deepEqual(labels({sectors:[...sectors,'Transport','Autre','Bien-être & Beauté']}),
  ['Nettoyage','Espaces verts','+5 autres secteurs','Toute la France']);
});
test('Sector labels are deduplicated and department has a stable separate chip',()=>{
 assert.deepEqual(labels({sectors:['Nettoyage','Nettoyage','  Espaces verts  '],department:'83'}),
  ['Nettoyage','Espaces verts','Var (83)']);
 const chips=summarize({sectors:['Nettoyage'],department:'2B',keywords:'tonte'});
 assert.deepEqual(chips.map(x=>x.kind),['sector','area','detail']);
 assert.equal(chips[1].label,'Département 2B');
});
test('Render creates exactly one icon per sector or area, never a double plus',()=>{
 assert.match(source,/const criteria=summarizeWatchCriteria\(p\)/);
 assert.match(source,/const symbols=\{sector:'▦',area:'⌖',detail:'⋯'\}/);
 assert.match(source,/symbols\[item.kind\]\?/);
 assert.match(source,/const prefix=symbols\[item.kind\]\?/);
 assert.match(source,/esc\(item.label\)/);
 assert.doesNotMatch(source,/\['▦','⌖','\+','⋯'\]/);
 assert.doesNotMatch(source,/criteria\.push\('\+'\+/);
});
test('Responsive chips align and wrap cleanly with identical height and pill shape',()=>{
 const css=styles.slice(styles.indexOf('/* OFFRYA Premium — readable, evenly aligned current watch criteria. */'));
 assert.ok(css.length>80);
 for(const part of ['flex-wrap:wrap','align-items:stretch','justify-content:flex-start',
  'gap:8px','min-height:36px','border-radius:999px','max-width:100%',
  'overflow-wrap:anywhere','@media(max-width:620px)','min-height:34px']){
  assert.ok(css.includes(part),'Missing chip layout '+part);
 }
 const lint=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(lint.status,0,lint.stderr);
});
