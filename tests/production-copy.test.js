'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=get('public/index.html'),pro=get('public/professionnels.html'),privateDoc=get('public/espace.html'),app=get('public/app.js'),schema=get('sql/schema.sql');
test('L’accueil n’invente pas de statistiques ni de témoignages',()=>{
 for(const h of [home,pro])assert.doesNotMatch(h,/\bbêta\b|0\s*%\s*de commission|dix mille clients|témoignages clients/i);
 assert.match(home,/Créez votre compte gratuitement/);
 assert.match(home,/34,99 €/);
 assert.match(home,/TTC \/ mois|TTC\/mois/);
 assert.match(pro,/dirigeants vérifiés/);
 assert.doesNotMatch(home,/id="premiumSubscribe"|id="missionForm"|id="statOpen"/);
});
test('Aucune liste d’attente affichée ; les tables historiques restent en base',()=>{
 for(const v of [home,pro,privateDoc,app])assert.doesNotMatch(v,/waitBtn|waitState|state\.wait|Programme fondateurs|offrya_waitlist/i);
 assert.match(schema,/offrya_waitlist/);
 assert.match(home,/href="\/cgv\.html"/);
});
test('Les fonctions professionnelles existent encore dans l’espace privé',()=>{
 for(const id of ['newMissionBtn','premiumRequestForm','premiumSubscribe','premiumTermsAck','accountBillingPortal','proSubmitRequest','boampList'])assert.ok(privateDoc.includes('id="'+id+'"'),id);
 for(const fn of ['loadBoamp','loadPriorityAlerts','openStripePortal','premiumRequestForm','premiumSubscribe'])assert.ok(app.includes(fn),fn);
 assert.doesNotMatch(privateDoc,/id="missionForm"/);
 assert.match(app,/34,99 € TTC par mois/);
 assert.match(get('public/cgv.html'),/34,99 € TTC par mois/);
});
