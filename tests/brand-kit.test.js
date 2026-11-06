'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pub=path.join(__dirname,'../public');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const pages=fs.readdirSync(pub).filter(f=>f.endsWith('.html')).concat(fs.readdirSync(path.join(pub,'secteurs')).map(f=>'secteurs/'+f));
test('Chaque page charge le kit, ses icônes et le logo officiel (plus l’ancien symbole)',()=>{
 for(const f of pages){
  const h=fs.readFileSync(path.join(pub,f),'utf8');
  assert.match(h,/<link rel="stylesheet" href="\/brand-kit\.css"><\/head>/,f);
  assert.match(h,/href="\/assets\/offrya\/favicon-32\.png"/,f);
  assert.match(h,/<meta name="theme-color" content="#3F0258">/,f);
  assert.match(h,/<span class="brand-medal"><img src="\/assets\/offrya\/logo-offrya\.png"/,f);
  assert.match(h,/<span class="brand-name">OFFRYA<\/span>/,f);
  assert.doesNotMatch(h,/M43\.6 21\.6A18\.5/,f);
 }
});
test('Les fichiers du kit sont servis et présents',()=>{
 for(const f of fs.readdirSync(path.join(pub,'assets/offrya')))assert.ok(server.includes("'/assets/offrya/"+f+"'"),f);
 assert.ok(server.includes("['/brand-kit.css','text/css; charset=utf-8']"));
 const m=JSON.parse(fs.readFileSync(path.join(pub,'manifest.webmanifest'),'utf8'));
 for(const i of m.icons)assert.ok(fs.existsSync(path.join(pub,i.src)),i.src);
 assert.equal(m.theme_color,'#3F0258');
});
test('La palette du kit remplace l’ancien violet',()=>{
 const css=fs.readFileSync(path.join(pub,'brand-kit.css'),'utf8');
 for(const c of ['#3F0258','#6A0295','#B603D6','#FB690B','#FDAC49','#ECE0FC'])assert.ok(css.includes(c),c);
 for(const f of ['public.css','styles.css','role-reference.css','pro-experience.css'])
  assert.doesNotMatch(fs.readFileSync(path.join(pub,f),'utf8'),/#6941d7|#7A3CFF/i,f);
});
