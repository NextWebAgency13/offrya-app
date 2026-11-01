'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const filename=path.join(__dirname,'../public/connexion.js');
const source=fs.readFileSync(filename,'utf8').replace(/^import \{createClient\}[^\n]+\n/,'');
assert.doesNotMatch(source,/^import /);
const validUser={id:'user-confirmed',email:'client@example.test',email_confirmed_at:'2026-11-01T09:00:00Z',is_anonymous:false};
const deletedSession={user:{id:'user-deleted',email:'deleted@example.test',email_confirmed_at:'2026-10-31T08:00:00Z',is_anonymous:false}};

async function loadAuthPage({
 session=null,user=null,authError=null,url='?mode=signup&next=%2Fdeposer-une-mission',
 simulateSignedIn=false
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
 const tabButtons=['login','signup','magic','reset'].map(mode=>({
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
  URLSearchParams,
  location:{search:url,origin:'https://offrya-app.onrender.com',replace:path=>redirects.push(path)},
  document:{getElementById:id=>dom[id],querySelectorAll:()=>tabButtons},
  fetch:async()=>({ok:true,json:async()=>({supabaseUrl:'https://example.supabase.co',supabaseKey:'publishable-key'})}),
  setTimeout,console
 };
 vm.runInNewContext(source,sandbox,{filename:'connexion.js'});
 await new Promise(resolve=>setTimeout(resolve,45));
 return{
  redirects,signOutCalls,signupCalls,loginCalls,dom,
  submit:()=>handlers.submit({preventDefault(){}})
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
 assert.equal(page.dom.authHeading.textContent,'Créer mon compte gratuit');
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
  'https://offrya-app.onrender.com/connexion?next=%2Fdeposer-une-mission');
 assert.match(page.dom.loginStatus.textContent,/Consultez votre boîte e-mail/);
 assert.deepEqual(page.redirects,[]);
});
test('Une session authentifiée et confirmée autorise le retour au dépôt',async()=>{
 const page=await loadAuthPage({
  session:{user:validUser},user:validUser
 });
 assert.deepEqual(page.redirects,['/deposer-une-mission']);
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
 assert.equal(page.dom.authHeading.textContent,'Créer mon compte gratuit');
});
