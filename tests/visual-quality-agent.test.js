'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {
 VIEWPORTS,pathsFromSitemap,slug,score,approvedFix,safeDeclaration,renderCss,reportMarkdown
}=require('../lib/visual-quality');
const {handle}=require('../server');

test('L audit couvre les pages du sitemap et les parcours inscription et récupération',()=>{
 const routes=pathsFromSitemap(fs.readFileSync('public/sitemap.xml','utf8'));
 for(const route of ['/','/deposer-une-mission','/professionnels','/connexion?next=%2Fespace','/connexion?mode=reset'])
  assert.ok(routes.includes(route),route);
 assert.equal(routes.length,new Set(routes).size);
 assert.deepEqual(VIEWPORTS.map(x=>x.width),[360,393,768,1440]);
 assert.notEqual(slug('/connexion?mode=reset'),slug('/connexion?next=%2Fespace'));
});
test('L IA ne peut produire que du CSS limite, pas modifier toute la page',()=>{
 const selectors=['#loginSubmit','.simple-hero','.form-wrap','.form-wrap .btn'];
 const good=approvedFix({selector:'.simple-hero',reason:'Texte plus lisible',declarations:{'font-size':'16px','padding':'20px 16px'}},selectors);
 assert.deepEqual(good.declarations,{'font-size':'16px',padding:'20px 16px'});
 assert.match(renderCss([good]),/\.simple-hero\{/);
 for(const bad of ['*','body',':root','html','body:has(.x)','.simple-hero:hover','.other','.simple-hero,body']){
  assert.equal(approvedFix({selector:bad,declarations:{'font-size':'16px'}},selectors),null,bad);
 }
 assert.equal(approvedFix({selector:'.simple-hero',declarations:{'position':'fixed'}},selectors),null);
 assert.equal(approvedFix({selector:'.simple-hero',declarations:{'font-size':'12px'}},selectors),null);
 assert.equal(approvedFix({selector:'.simple-hero',declarations:{'padding':'1px;display:none'}},selectors),null);
 assert.equal(safeDeclaration('color','#4b0058'),true);
 assert.equal(safeDeclaration('color','url(https://evil.example)'),false);
 assert.equal(safeDeclaration('opacity','0'),false);
});
test('Le rapport classe les risques et reference les captures',()=>{
 const pages=[{route:'/deposer-une-mission',viewport:VIEWPORTS[0],
  screenshot:'screenshots/before/android-360-deposer.png',
  issues:[{type:'footer-gap',severity:'high',message:'Vide sous le footer'}]}];
 const md=reportMarkdown(pages,[],[]);
 assert.match(md,/footer/i);
 assert.match(md,/android-360/);
 assert.match(md,/screenshots\/before/);
 assert.equal(score(pages[0].issues),3);
});
test('Le serveur ajoute le CSS de finition en DERNIER sans changer les acces',async()=>{
 const server=http.createServer(handle);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const routes=['/','/deposer-une-mission','/professionnels','/connexion','/espace/reglages'];
  for(const route of routes){
   const response=await fetch(base+route),html=await response.text();
   assert.equal(response.status,200,route);
   assert.match(html,/<link rel="stylesheet" href="\/visual-agent-fixes\.css"><\/head>/);
   assert.ok(html.indexOf('visual-agent-fixes.css')<html.indexOf('</head>'));
   if(route.startsWith('/espace')||route==='/connexion'){
    assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
   }
  }
  const css=await fetch(base+'/visual-agent-fixes.css');
  assert.equal(css.status,200);
  assert.match(css.headers.get('content-type'),/text\/css/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Le workflow ne deploie pas et limite les PR au fichier CSS de finition',()=>{
 const yaml=fs.readFileSync('.github/workflows/visual-agent.yml','utf8');
 assert.match(yaml,/schedule:/);
 assert.match(yaml,/workflow_dispatch:/);
 assert.match(yaml,/npm run visual:audit/);
 assert.match(yaml,/npm run visual:propose/);
 assert.match(yaml,/add-paths: public\/visual-agent-fixes.css/);
 assert.doesNotMatch(yaml,/merge.pull.request|trigger.deploy|render\.com\/api/);
});
