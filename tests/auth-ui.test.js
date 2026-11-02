'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createServer}=require('node:http'),{handle}=require('../server');
const read=x=>fs.readFileSync(path.join(__dirname,'../public',x),'utf8');
const html=read('connexion.html'),js=read('connexion.js'),css=read('auth.css');
test('Un seul objectif par formulaire : deux modes principaux et récupération indépendante',()=>{
 const tabs=html.split('id="authTabs"')[1].split('</div>')[0];
 assert.match(tabs,/data-mode="login"/);
 assert.match(tabs,/data-mode="signup"/);
 assert.doesNotMatch(tabs,/data-mode="reset"/);
 assert.match(html,/id="resetLinkWrap"/);
 assert.match(html,/data-mode="reset">Mot de passe oublié \?/);
 assert.match(html,/id="authBack"[^>]*data-mode="login" hidden/);
 assert.match(html,/id="authLead"/);
 assert.match(html,/id="authCardHeading"/);
 assert.match(html,/id="authCardLead"/);
 assert.match(js,/reset:'Indiquez votre adresse e-mail/);
 assert.match(js,/recover:'Définissez votre nouveau mot de passe/);
});
test('CSS : masquage réel du mot de passe pour le reset et de l’e-mail pour recovery',()=>{
 assert.match(css,/\.auth-page \[hidden\]\{display:none!important\}/);
 assert.match(js,/ps\.hidden=v==='reset'/);
 assert.match(js,/em\.hidden=v==='recover'/);
 assert.match(js,/ps\.querySelector\('input'\)\.required=!ps\.hidden/);
 assert.match(js,/em\.querySelector\('input'\)\.required=!em\.hidden/);
 assert.match(css,/\.auth-page \.auth-form\{display:flex;flex-direction:column/);
 assert.doesNotMatch(html,/id="accountTypeChoice"[^>]*style=/);
});
test('Accès dépôt de mission et professionnel : destinations autorisées et confirmations conservées',()=>{
 assert.match(html,/href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/);
 assert.match(html,/href="\/connexion\?mode=signup&amp;next=%2Fespace%2Fprofessionnel"/);
 assert.match(js,/emailRedirectTo:location\.origin\+'\/connexion\?confirmation=1&next='/);
 assert.match(js,/offrya_signup_intent/);
 assert.match(js,/invalidatedSessionIds/);
 assert.match(js,/auth\.getUser\(\)/);
 assert.match(js,/email_confirmed_at/);
 assert.match(js,/resetPasswordForEmail/);
 assert.doesNotMatch(html,/Payer maintenant|Souscrire maintenant/);
});
test('Responsive et isolation : style de connexion séparé des autres pages',()=>{
 assert.match(html,/href="\/auth\.css"/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/\.auth-page \.auth-card\{/);
 assert.match(css,/\.auth-page \.auth-top nav\{/);
 assert.doesNotMatch(css,/\.mock-home|\.home-landing|\.pro-dashboard/);
});
test('Le serveur expose le CSS auth de manière explicite',async()=>{
 const app=createServer(handle);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+app.address().port;
  const [sheet,page]=await Promise.all([fetch(origin+'/auth.css'),fetch(origin+'/connexion?next=%2Fdeposer-une-mission')]);
  assert.equal(sheet.status,200);
  assert.match(sheet.headers.get('content-type')||'',/text\/css/);
  assert.equal(page.status,200);
  assert.match(await page.text(),/class="auth-page"/);
 }finally{await new Promise(resolve=>app.close(resolve));}
});
