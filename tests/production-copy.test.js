'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'../sql/schema.sql'),'utf8');
test('OFFRYA ne présente plus de bêta ni de commission promotionnelle',()=>{
 for(const [name,content] of [['HTML',html],['interface JS',js]]){
  assert.doesNotMatch(content,/bêta|\bbeta\b|0\s*%\s*de commission/i,name);
 }
 assert.match(html,/Publication gratuite/);
 assert.match(html,/Échanges directs/);
 assert.match(html,/accessible partout en France/);
 assert.match(html,/OFFRYA Professionnel/);
 assert.match(html,/34,99 €/);\n assert.match(html,/TTC \\/ mois/);
 assert.match(html,/id="premiumSubscribe"/);
});
test('La liste d’attente a disparu de l’interface, les données historiques sont conservées',()=>{
 for(const s of [html,js]){
  assert.doesNotMatch(s,/waitBtn|waitState|state\.wait|Programme fondateurs|offrya_waitlist/i);
 }
 assert.match(schema,/offrya_waitlist/);
 assert.match(html,/href="\/cgv\.html"/);
});
test('Tous les messages du parcours Professionnel restent professionnels et les accès inchangés',()=>{
 assert.doesNotMatch(js,/Paiement de test|dans Render|Mode installation|Supabase nécessite/i);
 assert.match(js,/premium_until/);
 assert.match(js,/stripe_customer_id/);
 assert.match(js,/openStripePortal/);
 assert.match(js,/premiumRequestForm/);
 assert.match(js,/premiumSubscribe/);
 assert.match(js,/loadBoamp/);
 assert.match(js,/loadPriorityAlerts/);
 assert.match(html,/id="missionForm"/);
 assert.match(html,/id="premiumTermsAck"/);
 assert.match(html,/id="proSubmitRequest"[^>]*>Déposer mon dossier/);
});

test('Le montant TTC est cohérent dans les CGV, les messages Professionnel et le formulaire',()=>{
 const cgv=fs.readFileSync(path.join(__dirname,'../public/cgv.html'),'utf8');
 assert.match(cgv,/34,99 € TTC par mois/);
 assert.match(cgv,/Aucun supplément de TVA/);
 assert.match(js,/34,99 € TTC par mois/);
 assert.doesNotMatch(html,/19 € \/ mois|19 € par mois/);
});
