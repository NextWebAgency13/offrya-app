'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let authFeedback;
before(async()=>{
 ({authFeedback}=await import('../public/auth-feedback.mjs'));
});

test('Supabase signale explicitement un e-mail déjà enregistré',()=>{
 for(const code of ['user_already_exists','email_exists','email_already_exists','identity_already_exists']){
  const result=authFeedback({code},'signup');
  assert.match(result,/si vous avez déjà un compte offrya/i);
  assert.match(result,/Connexion/);
  assert.match(result,/Mot de passe oublié/);
 }
});
test('Une réponse ambigüe ne divulgue jamais si un compte existe',()=>{
 for(const operation of ['signup','login','reset','recover']){
  const result=authFeedback({message:'account_uuid_secret_123'},operation);
  assert.doesNotMatch(result,/account_uuid_secret_123|adresse e-mail est déjà associée/i);
 }
 assert.match(authFeedback({message:'confidential account_uuid_secret_123'},'signup'),/Réessayez/);
});
test('Connexion et confirmation : erreurs lisibles en français',()=>{
 assert.match(authFeedback({code:'invalid_credentials',message:'Invalid login credentials'},'login'),/incorrect/);
 assert.match(authFeedback({code:'email_not_confirmed'},'login'),/pas encore confirmée/);
 assert.match(authFeedback({code:'otp_expired'},'login'),/lien a expiré/);
});
test('Trop de tentatives, mot de passe faible et e-mail invalide',()=>{
 assert.match(authFeedback({status:429},'signup'),/Trop de tentatives/);
 assert.match(authFeedback({code:'over_email_send_rate_limit'},'reset'),/Trop de tentatives/);
 assert.match(authFeedback({code:'weak_password'},'signup'),/mot de passe plus robuste/);
 assert.match(authFeedback({code:'email_address_invalid'},'signup'),/adresse e-mail est invalide/);
});
test('Aucun texte interne Supabase ni secret n’est renvoyé aux visiteurs',()=>{
 const text='SQL ERROR relation auth.users secret=example_do_not_disclose';
 assert.doesNotMatch(authFeedback({message:text},'signup'),/relation auth\.users|do_not_disclose|SQL ERROR/);
 assert.doesNotMatch(authFeedback({message:text},'recover'),/relation auth\.users|do_not_disclose|SQL ERROR/);
 assert.match(authFeedback({code:'signup_disabled'},'signup'),/temporairement indisponible/);
});
