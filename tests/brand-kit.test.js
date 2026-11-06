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
  assert.match(h,/<meta name="theme-color" content="#4B0058">/,f);
  assert.match(h,/<img class="brand-logo" src="\/assets\/offrya\/logo-offrya-prune\.png" alt="OFFRYA"/,f);
  assert.doesNotMatch(h,/M43\.6 21\.6A18\.5/,f);
 }
});
test('Les fichiers du kit sont servis et présents',()=>{
 for(const f of fs.readdirSync(path.join(pub,'assets/offrya')))assert.ok(server.includes("'/assets/offrya/"+f+"'"),f);
 assert.ok(server.includes("['/brand-kit.css','text/css; charset=utf-8']"));
 const m=JSON.parse(fs.readFileSync(path.join(pub,'manifest.webmanifest'),'utf8'));
 for(const i of m.icons)assert.ok(fs.existsSync(path.join(pub,i.src)),i.src);
 assert.equal(m.theme_color,'#4B0058');
});
test('La palette du kit remplace l’ancien violet',()=>{
 const css=fs.readFileSync(path.join(pub,'brand-kit.css'),'utf8');
 for(const c of ['#7A3CFF','#4B0058','#FF6B6B','#C02FC6','#F7F2FC','#190F2C','#FF901B'])assert.ok(css.includes(c),c);
 for(const f of ['public.css','styles.css','role-reference.css','pro-experience.css'])
  assert.doesNotMatch(fs.readFileSync(path.join(pub,f),'utf8'),/#6941d7|#6A0295|#3F0258/i,f);
});
test('Finitions : colonne Premium lisible, menus Pro réservés au Premium, cloche mobile pour tous',()=>{
 const css=fs.readFileSync(path.join(pub,'brand-kit.css'),'utf8');
 assert.match(css,/body\.offrya-pro-v3 \.app-shell \.sidebar \.nav-link:not\(\.active\)/);
 assert.match(css,/html body:not\(\.offrya-pro-v3\) \.app-shell \.sidebar :is\(nav#proV3Sidebar,nav#proV3SidebarExtras,div#proV3SidePlan\)\{display:none!important\}/);
 assert.match(css,/body:not\(\.offrya-pro-v3\) \.app-shell \.header \.header-actions>#messageShortcut\.message-header-shortcut\{/);
 assert.match(css,/#homePrivateDashboard\.home-private\{margin-top:0!important/);
 assert.match(css,/body #inbox \.inbox-grid\{grid-template-columns:minmax\(340px,400px\) minmax\(0,1fr\)!important\}/);
 assert.match(css,/#missions #missionSearchFilters #missionCategory\{grid-column:1\/-1\}/);
 const app=fs.readFileSync(path.join(pub,'app.js'),'utf8');
 assert.match(app,/const titles=\{dashboard:'Accueil',missions:canUsePremium\(\)\?'Missions':'Mes missions'/);
});
