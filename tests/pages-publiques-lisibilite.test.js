'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/brand-kit.css','utf8');
test('Accueil et Professionnels : textes foncés sur les fonds clairs',()=>{
 assert.match(css,/html body\.mock-home \.offrya-entry-path-primary \.offrya-entry-copy strong\{color:#2B1840!important\}/);
 assert.match(css,/html body \.premium-hero \.premium-intro p\{color:#4E4260!important\}/);
 assert.match(css,/html body \.premium-hero \.premium-intro \.btn\.outline\{background:#fff!important;border-color:#CDB6EA!important;color:#5E3692!important\}/);
});
test('En-tête des pages publiques : « Se connecter » pour un visiteur, « Mon espace » si une session existe',()=>{
 const js=fs.readFileSync('public/account-link.js','utf8'),server=fs.readFileSync('server.js','utf8');
 assert.match(js,/\/\^sb-\[a-z0-9\]\+-auth-token\$\/i/);
 assert.match(js,/label\.textContent=' Se connecter'/);
 assert.match(js,/label\.textContent=' Mon espace'/);
 for(const page of ['public/professionnels.html','public/deposer-une-mission.html'])
  assert.match(fs.readFileSync(page,'utf8'),/<script src="\/account-link\.js" defer><\/script><\/body>/);
 assert.match(server,/\['\/account-link\.js','text\/javascript; charset=utf-8'\]/);
});
