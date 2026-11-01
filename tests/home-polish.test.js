'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),css=read('public/public.css'),pro=read('public/professionnels.html');
const publicPages=['public/index.html','public/professionnels.html','public/deposer-une-mission.html','public/connexion.html',
 ...['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'].map(x=>'public/secteurs/'+x+'.html')];
test('Navigation publique : seulement Mon espace, dépôt accessible depuis le contenu',()=>{
 for(const p of publicPages){
  const html=read(p),nav=html.match(/<header class="top">[\s\S]*?<\/header>/)?.[0];
  assert.ok(nav,p+' needs public navigation');
  assert.match(nav,/class="account-link" href="\/espace"/);
  assert.doesNotMatch(nav,/href="\/professionnels"|href="\/deposer-une-mission"|href="\/#fonctionnement"/);
 }
 assert.match(home,/class="btn primary" href="\/deposer-une-mission"/);
});
test('Accueil : texte revu, offre claire, aucun portrait chargé et CTAs uniformes',()=>{
 assert.match(home,/<h1>Votre projet mérite le bon professionnel\.<\/h1>/);
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
 assert.match(home,/Vous êtes professionnel \?/);
 assert.doesNotMatch(home,/Nouvel professionnel \?|Les opportunités prennent forme|Des entreprises contrôlées et abonnées/);
 assert.match(home,/Entreprise et dirigeant vérifiés/);
 assert.doesNotMatch(home,/Je suis professionnel|Vous êtes un professionnel \?/);
 assert.match(home,/<a class="btn outline" href="\/professionnels">Devenir Premium<\/a>/);
 assert.equal((home.match(/href="\/professionnels">Devenir professionnel<\/a>/g)||[]).length,2);
 assert.match(home,/Accédez aux missions privées et aux outils de veille des marchés publics \(BOAMP\)/);
 assert.match(home,/Sans engagement, résiliable à tout moment\./);
 assert.match(pro,/Sans engagement, résiliable à tout moment\./);
 assert.match(home,/class="hero-illustration"/);
 assert.match(home,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 460 380"/);
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
test('Liens de secteur, texte minimum 14px et contrastes explicites',()=>{
 const paths=['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'];
 for(const slug of paths)assert.match(home,new RegExp('class="sector" href="/secteurs/'+slug+'"'));
 assert.match(css,/\.sector span\{font-size:14px/);
 assert.match(css,/\.home-benefits li\{font-size:14px/);
 assert.match(css,/\.cancel-note\{font-size:14px/);
 assert.match(css, /--muted:#51455f/);
 assert.match(css, /\.hero-illustration svg\{display:block;width:100%;height:auto/);
});
