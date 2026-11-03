'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const filename=path.join(__dirname,'../public/connexion.js');
const source=fs.readFileSync(filename,'utf8').replace(/^import [^\n]+\n/gm,'');
assert.doesNotMatch(source,/^import /);
const validUser={id:'user-confirmed',email:'client@example.test',email_confirmed_at:'2026-11-01T09:00:00Z',is_anonymous:false};
const deletedSession={user:{id:'user-deleted',email:'deleted@example.test',email_confirmed_at:'2026-10-31T08:00:00Z',is_anonymous:false}};

async function loadAuthPage({
 session=null,user=null,authError=null,url='?mode=signup&role=client&next=%2Fespace',
 simulateSignedIn=false,hash=''
}={}){
 const redirects=[],signOutCalls=[],signupCalls=[],loginCalls=[],dom={};
 const fields={
  email:{value:'new@example.test',required:true,autocomplete:'email'},
  password:{value:'strongpassword123',required:true,autocomplete:'current-password'}
 };
 const handlers={};
 const form={
  elements:fields,
  addEventListener(type,listener){handlers[type]=listener;}
 };
 const tabButtons=['login','signup','reset'].map(mode=>({
  dataset:{mode},
  attributes:{},
  setAttribute(name,value){this.attributes[name]=value;},
  addEventListener(){}
 }));
 dom.loginForm=form;
 dom.loginSubmit={textContent:'',disabled:false};
 dom.loginStatus={textContent:'',style:{}};
 dom.authHeading={textContent:'Connexion à votre espace'};
 dom.passwordRow={hidden:false,querySelector(){return fields.password;}};
 dom.emailRow={hidden:false,querySelector(){return fields.email;}};
 dom.resetLinkWrap={hidden:true};
 dom.authTabs={hidden:false};
 dom.authBack={hidden:true};
 dom.authLead={textContent:''};
 dom.authCardHeading={textContent:''};
 dom.authCardLead={textContent:''};
 dom.authCardEyebrow={textContent:''};
 dom.authModeFootnote={textContent:''};
 let authCallback;
 const auth={
  onAuthStateChange(cb){authCallback=cb;return{data:{subscription:{unsubscribe(){}}}};},
  async getSession(){
   if(simulateSignedIn&&session){
    setTimeout(()=>authCallback?.('SIGNED_IN',session),0);
   }
   return{data:{session},error:null};
  },
  async getUser(){
   return{data:{user},error:authError};
  },
  async signOut(options){
   signOutCalls.push(options);
   session=null;
   return{error:null};
  },
  async signUp(args){
   signupCalls.push(args);
   return{data:{session:null},error:null};
  },
  async signInWithPassword(args){
   loginCalls.push(args);
   return{data:{session:{user:validUser}},error:null};
  }
 };
 const sandbox={
  createClient:()=>({auth}),
  createAuthCaptcha:()=>({init:async()=>{},requiredToken:()=>undefined,reset:()=>{}}),
  authFeedback:(error,operation)=>({signup:'Échec de l’inscription',login:'Échec de connexion',reset:'Échec de récupération',recover:'Échec de mise à jour'})[operation],
  URLSearchParams,
  location:{search:url,hash,origin:'https://offrya-app.onrender.com',replace:path=>redirects.push(path)},
  document:{getElementById:id=>dom[id],querySelectorAll:()=>tabButtons},
  fetch:async()=>({ok:true,json:async()=>({supabaseUrl:'https://example.supabase.co',supabaseKey:'publishable-key'})}),
  setTimeout,console
 };
 vm.runInNewContext(source,sandbox,{filename:'connexion.js'});
 await new Promise(resolve=>setTimeout(resolve,45));
 return{
  redirects,signOutCalls,signupCalls,loginCalls,dom,
  submit:()=>handlers.submit({preventDefault(){},currentTarget:form})
 };
}
test('Une session d’un utilisateur supprimé n’ouvre pas le formulaire de publication',async()=>{
 const page=await loadAuthPage({
  session:deletedSession,
  authError:{status:403,code:'user_not_found',message:'User from sub claim in JWT does not exist'},
  simulateSignedIn:true
 });
 assert.deepEqual(page.redirects,[]);
 assert.equal(page.signOutCalls.length,1);
 assert.equal(page.signOutCalls[0].scope,'local');
 assert.equal(page.dom.authHeading.textContent,'Créez votre compte gratuit');
 assert.match(page.dom.loginStatus.textContent,/ancienne session|compte a été supprimé/);
});
test('Après la suppression du compte, un clic Créer mon compte gratuit fonctionne',async()=>{
 const page=await loadAuthPage({
  session:deletedSession,
  authError:{status:403,message:'User from sub claim in JWT does not exist'}
 });
 await page.submit();
 assert.equal(page.signupCalls.length,1);
 assert.equal(page.signupCalls[0].email,'new@example.test');
 assert.equal(page.signupCalls[0].options.emailRedirectTo,
  'https://offrya-app.onrender.com/connexion?confirmation=1&next=%2Fespace');
 assert.equal(page.signupCalls[0].options.data.offrya_signup_intent,'client');
 assert.match(page.dom.loginStatus.textContent,/Consultez votre boîte e-mail/);
 assert.deepEqual(page.redirects,[]);
});
test('Une session authentifiée et confirmée autorise le retour au tableau de bord',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},user:validUser
 });
 assert.deepEqual(page.redirects,['/espace']);
 assert.equal(page.signOutCalls.length,0);
});
test('Un compte sans e-mail confirmé ne peut pas être redirigé vers la publication',async()=>{
 const unconfirmed={...validUser,email_confirmed_at:null};
 const page=await loadAuthPage({
  session:{user:unconfirmed},user:unconfirmed
 });
 assert.deepEqual(page.redirects,[]);
 assert.equal(page.signOutCalls.length,0);
 assert.match(page.dom.loginStatus.textContent,/Confirmez votre adresse e-mail/);
});
test('Une panne de vérification Auth ne détruit pas la session en cache',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},
  authError:{status:503,message:'Service temporarily unavailable'}
 });
 assert.deepEqual(page.redirects,[]);
 assert.equal(page.signOutCalls.length,0);
 assert.match(page.dom.loginStatus.textContent,/temporairement indisponible/);
});
test('Une destination de redirection externe est rejetée même avec un compte validé',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},user:validUser,
  url:'?next=https%3A%2F%2Fexample.evil%2F'
 });
 assert.deepEqual(page.redirects,['/espace']);
});
test('Une session absente affiche l’inscription sans créer un invité',async()=>{
 const page=await loadAuthPage({session:null,user:null});
 assert.deepEqual(page.redirects,[]);
 assert.equal(page.signOutCalls.length,0);
 assert.equal(page.dom.authHeading.textContent,'Créez votre compte gratuit');
});

test('Confirmation e-mail : la session valide ouvre le tableau de bord privé',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},user:validUser,
  url:'?confirmation=1'
 });
 assert.deepEqual(page.redirects,['/espace']);
 assert.equal(page.signOutCalls.length,0);
 assert.equal(page.dom.authHeading.textContent,'Confirmation de votre inscription');
});
test('Confirmation e-mail : ancien lien revient au dashboard',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},user:validUser,
  url:'?next=%2Fdeposer-une-mission',
  hash:'#access_token=simulated&type=signup'
 });
 assert.deepEqual(page.redirects,['/espace']);
});
test('Un lien de confirmation sans session vérifiée ne simule pas de connexion',async()=>{
 const page=await loadAuthPage({url:'?confirmation=1',session:null,user:null});
 assert.deepEqual(page.redirects,[]);
 assert.equal(page.signOutCalls.length,0);
});
test('Connexion classique : la destination demandée reste la page privée',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},user:validUser,
  url:'?next=%2Fespace%2Fmissions'
 });
 assert.deepEqual(page.redirects,['/espace/missions']);
});

test('Interface de connexion : deux onglets et récupération secondaire, sans lien magique',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/connexion.html'),'utf8');
 const tabs=[...html.matchAll(/<button type="button" data-mode="([^"]+)"[^>]*>([^<]+)<\/button>/g)];
 assert.deepEqual(tabs.map(t=>t[1]),['login','signup']);
 assert.deepEqual(tabs.map(t=>t[2]),['Connexion','Créer un compte']);
 assert.match(html,/class="auth-text-button" data-mode="reset">Mot de passe oublié \?<\/button>/);
 assert.match(html,/id="authBack"[^>]* data-mode="login" hidden/);
 assert.doesNotMatch(html,/Lien e-mail|data-mode="magic"/);
 assert.doesNotMatch(source,/signInWithOtp|mode==='magic'|magic:'Envoyer un lien'/);
 assert.match(source,/signUp\(/);
 assert.match(source,/signInWithPassword\(/);
 assert.match(source,/resetPasswordForEmail\(/);
});

test('Inscription professionnelle : le lien e-mail permet de revenir sur le parcours pro',async()=>{
 const page=await loadAuthPage({url:'?mode=signup&next=%2Fespace%2Fprofessionnel'});
 await page.submit();
 assert.equal(page.signupCalls.length,1);
 assert.equal(page.signupCalls[0].options.emailRedirectTo,'https://offrya-app.onrender.com/connexion?confirmation=1&next=%2Fespace%2Fprofessionnel');
 assert.equal(page.signupCalls[0].options.data.offrya_signup_intent,'pro');
});
test('Confirmation e-mail : inscription pro rejoint d’abord le dashboard',async()=>{
 const page=await loadAuthPage({session:{user:validUser},user:validUser,url:'?confirmation=1&next=%2Fespace%2Fprofessionnel'});
 assert.deepEqual(page.redirects,['/espace']);
});
test('Confirmation e-mail : inscription demandeur revient au tableau de bord',async()=>{
 const page=await loadAuthPage({session:{user:validUser},user:validUser,url:'?confirmation=1&next=%2Fdeposer-une-mission'});
 assert.deepEqual(page.redirects,['/espace']);
});

test('Confirmation e-mail : type pro dans les métadonnées rejoint le dashboard commun',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},
  user:{...validUser,user_metadata:{offrya_signup_intent:'pro'}},
  url:'?confirmation=1'
 });
 assert.deepEqual(page.redirects,['/espace/professionnel']);
});
test('Confirmation e-mail : type demandeur dans les métadonnées ouvre son espace',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},
  user:{...validUser,user_metadata:{offrya_signup_intent:'client'}},
  url:'?confirmation=1'
 });
 assert.deepEqual(page.redirects,['/espace']);
});

test('Inscription : le lien « Mot de passe oublié » est masqué et le mot de passe reste obligatoire',async()=>{
 const page=await loadAuthPage({url:'?mode=signup&role=client&next=%2Fespace'});
 assert.equal(page.dom.resetLinkWrap.hidden,true);
 assert.equal(page.dom.authTabs.hidden,true);
 assert.equal(page.dom.authBack.hidden,true);
 assert.equal(page.dom.passwordRow.hidden,false);
 assert.equal(page.dom.emailRow.hidden,false);
 assert.equal(page.dom.loginSubmit.textContent,'Créer mon compte');
 assert.equal(page.dom.authCardEyebrow.textContent,'INSCRIPTION GRATUITE');
 assert.equal(page.dom.authCardLead.textContent,'Sélectionnez votre type de compte, puis renseignez vos identifiants.');
 assert.deepEqual(page.redirects,[]);
});
test('Connexion : récupération accessible uniquement depuis ce parcours',async()=>{
 const page=await loadAuthPage({url:'?next=%2Fdeposer-une-mission'});
 assert.equal(page.dom.resetLinkWrap.hidden,false);
 assert.equal(page.dom.authTabs.hidden,true);
 assert.equal(page.dom.authCardEyebrow.textContent,'CONNEXION');
 assert.equal(page.dom.loginSubmit.textContent,'Se connecter');
});
test('Demande de réinitialisation : e-mail seul et retour vers la connexion',async()=>{
 const page=await loadAuthPage({url:'?mode=reset&next=%2Fdeposer-une-mission'});
 assert.equal(page.dom.resetLinkWrap.hidden,true);
 assert.equal(page.dom.authTabs.hidden,true);
 assert.equal(page.dom.authBack.hidden,false);
 assert.equal(page.dom.emailRow.hidden,false);
 assert.equal(page.dom.passwordRow.hidden,true);
 assert.equal(page.dom.loginSubmit.textContent,'Recevoir le lien de réinitialisation');
 assert.equal(page.dom.authCardEyebrow.textContent,'RÉCUPÉRATION DU COMPTE');
});
test('Après un lien de récupération : pas de demande d’adresse e-mail, mot de passe seul',async()=>{
 const page=await loadAuthPage({url:'?mode=reset-password&next=%2Fespace'});
 assert.equal(page.dom.resetLinkWrap.hidden,true);
 assert.equal(page.dom.authTabs.hidden,true);
 assert.equal(page.dom.authBack.hidden,false);
 assert.equal(page.dom.emailRow.hidden,true);
 assert.equal(page.dom.passwordRow.hidden,false);
 assert.equal(page.dom.loginSubmit.textContent,'Enregistrer le mot de passe');
});
