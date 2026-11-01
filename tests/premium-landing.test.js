'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),premium=read('public/professionnels.html'),css=read('public/public.css');
test('Devenir Premium : le bouton de la vitrine mène vers une page publique Premium',()=>{
 assert.match(home,/<a class="btn outline" href="\/professionnels">Je suis professionnel<\/a>/);
 assert.match(premium,/<h1 id="premium-title">Devenir Premium sur OFFRYA<\/h1>/);
 assert.equal((premium.match(/<h1\b/g)||[]).length,1);
 assert.match(premium,/<title>Devenir Premium sur OFFRYA \| 34,99 € TTC\/mois<\/title>/);
 assert.match(premium,/rel="canonical" href="https:\/\/offrya-app\.onrender\.com\/professionnels"/);
 assert.doesNotMatch(premium,/>Devenir professionnel<\/a>/);
 assert.equal((premium.match(/href="\/espace\/professionnel">Devenir Premium<\/a>/g)||[]).length,2);
 assert.match(premium,/class="account-link" href="\/espace"/);
});
test('Le paiement reste conditionné à la vérification du dirigeant',()=>{
 for(const value of ['SIRET','Stripe Identity','dirigeant inscrit au registre officiel','Après vérification et approbation','34,99 €','TTC / mois','Sans engagement, résiliable à tout moment.']){
  assert.ok(premium.includes(value),value);
 }
 assert.match(premium,/Un salarié ou un mandataire non inscrit comme dirigeant ne peut pas souscrire/);
 assert.match(premium,/Aucun accès aux missions privées et aucun paiement avant l'approbation de votre dossier/);
 assert.match(premium,/href="\/espace\/reglages"/);
 assert.match(premium,/href="\/cgv.html"/);
 for(const link of ['/cgv.html','/confidentialite.html','/remboursements.html','/contact.html','/mentions-legales.html'])assert.ok(premium.includes('href="'+link+'"'));
});
test('FAQ Premium en HTML et JSON-LD concordants',()=>{
 const questions=[...premium.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)];
 assert.equal(questions.length,3);
 const script=[...premium.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(x=>JSON.parse(x[1])).find(x=>x['@type']==='FAQPage');
 assert.ok(script);
 assert.equal(script.mainEntity.length,questions.length);
 for(let i=0;i<questions.length;i++){
  assert.equal(script.mainEntity[i].name,questions[i][1]);
  assert.equal(script.mainEntity[i].acceptedAnswer.text,questions[i][2]);
 }
});
test('Page Premium compacte et responsive, sans image distante',()=>{
 assert.match(css,/\.premium-hero\{display:grid/);
 assert.match(css,/@media\(max-width:600px\)\{\.premium-hero/);
 assert.match(css,/\.premium-price-assurance\{[^}]*font-size:14px/);
 assert.doesNotMatch(premium,/<img\b|<script type="module"/);
 assert.match(premium,/<main id="contenu">/);
});
