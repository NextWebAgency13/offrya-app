'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),css=read('public/public.css'),pro=read('public/professionnels.html');
const publicPages=['public/index.html','public/professionnels.html','public/deposer-une-mission.html','public/connexion.html',
 ...['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'].map(x=>'public/secteurs/'+x+'.html')];
test('Accueil : connexion et inscription visibles ; autres pages gardent Mon espace',()=>{
 for(const p of publicPages){
  const html=read(p),nav=html.match(/<header class="top(?: home-top)?">[\s\S]*?<\/header>/)?.[0];
  assert.ok(nav,p+' needs public navigation');
  if(p==='public/index.html'){
   assert.match(nav,/class="header-signin" href="\/connexion\?next=%2Fespace"/);
   assert.match(nav,/class="header-signup" href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/);
  } else assert.match(nav,/class="account-link" href="\/espace"/);
  if(p==='public/index.html')assert.match(nav,/class="home-nav-links"/);
  else assert.doesNotMatch(nav,/class="home-nav-links"/);
 }
 assert.match(home,/class="btn primary" href="\/deposer-une-mission"/);
});
test('Accueil : hiérarchie commerciale claire, double parcours et aucune fausse preuve',()=>{
 assert.match(home,/<h1 id="heroHeading">Votre projet mérite <span>le bon professionnel\.<\/span><\/h1>/);
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
 assert.match(home,/class="home-hero-portrait"/);
 assert.match(home,/Photographie d’illustration/);
 assert.match(home,/class="btn outline" href="\/professionnels">Je suis professionnel/);
 assert.match(home,/class="home-path-card home-path-client"/);
 assert.match(home,/class="home-path-card home-path-business"/);
 assert.match(home,/Compte demandeur gratuit/);
 assert.match(home,/Entreprise et dirigeant vérifiés/);
 assert.match(home,/OFFRYA PROFESSIONNEL/);
 assert.match(home,/34,99 € TTC\/mois/);
 assert.match(home,/Sans engagement, résiliable à tout moment\./);
 assert.match(pro,/Sans engagement, résiliable à tout moment\./);
 assert.match(home,/id="choisir-compte"/);
 assert.match(home,/id="activite"/);
 assert.match(home,/id="publicActivity"/);
 assert.match(home,/src="\/activity\.js" defer/);
 assert.doesNotMatch(home,/\b10 ?000 clients\b|\b4,9\/5\b|Avis clients vérifiés|statistiques simulées/);
 assert.doesNotMatch(home,/<img\b|\.jpe?g|\.png|\.webp/);
});
test('FAQ : chaque réponse est livrée en HTML dans details, JSON-LD identique',()=>{
 const faqs=[...home.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)];
 assert.equal(faqs.length,3);
 const scripts=[...home.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(x=>JSON.parse(x[1]));
 const faq=scripts.find(x=>x['@type']==='FAQPage');
 assert.ok(faq);assert.equal(faq.mainEntity.length,3);
 for(let i=0;i<3;i++){assert.equal(faq.mainEntity[i].name,faqs[i][1]);assert.equal(faq.mainEntity[i].acceptedAnswer.text,faqs[i][2]);}
});
test('Secteurs, accessibilité et CSS limité à la vitrine',()=>{
 const paths=['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'];
 for(const slug of paths)assert.match(home,new RegExp('class="sector" href="/secteurs/'+slug+'"'));
 for(const anchor of ['#fonctionnement','#secteurs','#activite'])assert.ok(home.includes('href="/'+anchor+'"'));
 assert.match(home,/class="home-skip" href="#contenu"/);
 assert.match(home,/class="home-trustbar"/);
 assert.match(home,/class="home-faq-questions"/);
 assert.match(css,/--muted:#51455f/);
 assert.match(css,/\.home-landing \.home-hero-layout\{/);
 assert.match(css,/@media\(max-width:600px\)\{/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.sector span\{font-size:14px/);
});
