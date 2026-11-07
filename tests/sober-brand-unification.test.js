'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pub=path.join(__dirname,'../public');
const theme=fs.readFileSync(path.join(pub,'brand-kit.css'),'utf8');
const markup=fs.readFileSync(path.join(pub,'espace.html'),'utf8');
const start=theme.indexOf('/* OFFRYA — interface sobre et professionnelle');
const update=theme.slice(start).replace(/\/\*[\s\S]*?\*\//g,'');

test('La version néon saturée est remplacée sans modifier les pages publiques',()=>{
 assert.ok(start>0,'Un kit graphique commun doit rester présent');
 assert.doesNotMatch(theme,/Identité NEON 2026/);
 assert.match(markup,/<link rel="stylesheet" href="\/brand-kit\.css"><\/head>/);
 assert.match(update,/body\.offrya-reference-ui/);
 assert.match(update,/@media\(max-width:780px\)/);
 assert.match(update,/@media\(min-width:781px\)/);
 assert.doesNotMatch(update,/\bbody\s*\{|#proStageCompany\.hidden\s*\{/);
 assert.equal((theme.match(/{/g)||[]).length,(theme.match(/}/g)||[]).length);
});

test('Surfaces claires, quatre cartes harmonisées et accents mesurés',()=>{
 assert.match(update,/--offrya-page:#F8F6FB/);
 assert.match(update,/--offrya-surface:#FFF/);
 assert.match(update,/background:#fff!important/);
 for(const n of [2,3,4]){
  assert.ok(update.includes('role-premium-stats>button:nth-child('+n+')'),'carte '+n);
 }
 assert.match(update,/role-premium-stats>button::before/);
 assert.match(update,/height:4px/);
 assert.match(update,/content:none!important/);
 assert.doesNotMatch(update,/repeating-radial-gradient|repeating-linear-gradient/);
});

test('Les vues et parcours restent fonctionnels, sans valeurs simulées ni JS ajouté',()=>{
 for(const id of ['dashboard','missions','professional','boamp','inbox','settings']){
  assert.ok(markup.includes('id="'+id+'"'),id);
 }
 for(const action of ['data-tab="dashboard"','data-tab="missions"','data-tab="boamp"','data-tab="inbox"','data-tab="settings"']){
  assert.ok(markup.includes(action),action);
 }
 assert.match(update,/data-offrya-role="premium"/);
 assert.match(update,/not\(\[data-offrya-role="premium"\]\)/);
 assert.match(update,/focus-visible/);
 assert.match(update,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(update,/\b(fetch|localStorage|sessionStorage|innerHTML)\b/);
});
