import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import {authFeedback} from './auth-feedback.mjs';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const value=query.get('next')||'/espace',next=(value==='/deposer-une-mission'||/^\/espace(?:\/(?:missions|marches-publics|messagerie|reglages|professionnel))?$/.test(value))?value:'/espace';
// Les liens de confirmation finissent sur /connexion pour permettre à Supabase
// de lire les jetons d'authentification. L'utilisateur revient ensuite sur /.
// Prend aussi en charge les anciens liens implicites contenant #type=signup.
const linkHash=new URLSearchParams((location.hash||'').replace(/^#/,''));
const confirmationReturn=query.get('confirmation')==='1'||query.get('type')==='signup'||linkHash.get('type')==='signup';
let db,mode='login',redirected=false,verificationQueue=Promise.resolve();
const invalidatedSessionIds=new Set();
const labels={login:'Se connecter',signup:'Créer mon compte',reset:'Recevoir le lien de réinitialisation',recover:'Enregistrer le mot de passe'};
const titles={login:'Connectez-vous à votre espace',signup:'Créez votre compte gratuit',reset:'Mot de passe oublié ?',recover:'Choisissez un nouveau mot de passe'};
const descriptions={
 login:'Connectez-vous avec votre adresse e-mail pour continuer vers votre espace.',
 signup:'Créez votre compte gratuitement et confirmez votre e-mail avant de publier une mission.',
 reset:'Indiquez votre adresse e-mail pour recevoir un lien sécurisé de réinitialisation.',
 recover:'Définissez votre nouveau mot de passe pour retrouver votre espace.'
};
const cardTitles={login:'Bienvenue sur OFFRYA',signup:'Créons votre compte',reset:'Recevoir un lien sécurisé',recover:'Votre nouveau mot de passe'};
const cardEyebrows={login:'CONNEXION',signup:'INSCRIPTION GRATUITE',reset:'RÉCUPÉRATION DU COMPTE',recover:'SÉCURISER VOTRE COMPTE'};
const cardDescriptions={
 login:'Saisissez vos identifiants pour poursuivre.',
 signup:'Sélectionnez votre type de compte, puis renseignez vos identifiants.',
 reset:'Seule votre adresse e-mail est nécessaire. Aucun mot de passe ne vous sera demandé.',
 recover:'Choisissez un mot de passe d’au moins huit caractères.'
};
function say(s,error=false){$('loginStatus').textContent=s;$('loginStatus').style.color=error?'#ab294d':'#4e318a';}
function change(v){
 if(!Object.prototype.hasOwnProperty.call(labels,v))return;
 mode=v;
 for(const button of document.querySelectorAll('[data-mode]')){
  if(button.hasAttribute?.('aria-pressed'))button.setAttribute('aria-pressed',String(button.dataset.mode===v));
 }
 $('loginSubmit').textContent=labels[v];
 $('authHeading').textContent=titles[v];
 if($('authLead'))$('authLead').textContent=descriptions[v];
 if($('authCardHeading'))$('authCardHeading').textContent=cardTitles[v];
 if($('authCardLead'))$('authCardLead').textContent=cardDescriptions[v];
 if($('authCardEyebrow'))$('authCardEyebrow').textContent=cardEyebrows[v];
 if($('authTabs'))$('authTabs').hidden=v==='reset'||v==='recover';
 if($('authBack'))$('authBack').hidden=v==='login'||v==='signup';
 if($('resetLinkWrap'))$('resetLinkWrap').hidden=v!=='login';
 if($('authModeFootnote'))$('authModeFootnote').textContent=
  v==='signup'?'Inscription gratuite. L’abonnement professionnel est proposé uniquement après vérification.':
  v==='reset'?'Si un compte est associé à cette adresse, consultez votre boîte e-mail.':
  v==='recover'?'Après modification, vous pourrez revenir à votre espace.':
  'Connexion sécurisée. Aucun paiement n’est déclenché ici.';
 const choice=$('accountTypeChoice');
 if(choice){
  choice.hidden=v!=='signup';
  for(const option of choice.querySelectorAll('[data-signup-type]')){
   const selected=option.dataset.signupType===(next==='/espace/professionnel'?'pro':'client');
   option.classList.toggle('chosen',selected);
   if(selected)option.setAttribute('aria-current','true');else option.removeAttribute('aria-current');
  }
 }
 const ps=$('passwordRow'),em=$('emailRow');
 ps.hidden=v==='reset';
 ps.querySelector('input').required=!ps.hidden;
 ps.querySelector('input').autocomplete=v==='login'?'current-password':'new-password';
 em.hidden=v==='recover';
 em.querySelector('input').required=!em.hidden;
 // Le masque CSS [hidden] est prioritaire à la grille des formulaires.
 if($('loginStatus'))say('');
}
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>change(button.dataset.mode));
function invalidSessionError(error){
 const code=String(error?.code||'').toLowerCase();
 const message=String(error?.message||'').toLowerCase();
 return [401,403,404].includes(Number(error?.status))
  || /user_not_found|session_not_found|refresh_token_not_found|invalid_refresh_token|bad_jwt|invalid_jwt/.test(code)
  || /user from sub claim|user not found|does not exist|invalid refresh token|session not found|session missing|jwt expired|invalid jwt/.test(message);
}
// Une session locale peut encore exister après suppression d'un compte Auth.
// Seul getUser() interroge Supabase Auth et confirme l'existence du compte.
function resume(session){
 if(!session?.user?.id||redirected||invalidatedSessionIds.has(session.user.id)||mode==='recover'||query.get('mode')==='reset-password')return verificationQueue;
 const work=verificationQueue.then(async()=>{
  if(redirected||invalidatedSessionIds.has(session.user.id))return;
  let result;
  try{result=await db.auth.getUser();}catch(error){result={error};}
  const user=result?.data?.user,error=result?.error;
  if(!error&&user?.id===session.user.id){
   if(user.is_anonymous||!user.email_confirmed_at){
    say('Confirmez votre adresse e-mail pour accéder à votre compte et publier une mission.');
    return;
   }
   redirected=true;
   // Une confirmation moderne conserve la destination sélectionnée.
   // Les anciens liens sans destination gardent le retour historique.
   if(confirmationReturn&&!query.has('next')){
    // Simple indication de parcours, jamais un droit d'accès.
    const intent=user.user_metadata?.offrya_signup_intent;
    location.replace(intent==='pro'?'/espace/professionnel':intent==='client'?'/deposer-une-mission':'/');
   }else if(confirmationReturn&&linkHash.get('type')==='signup')location.replace('/');
   else location.replace(next);
   return;
  }
  // L'authentification a changé pendant la vérification : ne pas
  // déconnecter une session plus récente.
  if(!error&&user?.id&&user.id!==session.user.id)return;
  if(!user&&(!error||invalidSessionError(error))){
   try{
    const out=await db.auth.signOut({scope:'local'});
    if(out?.error)throw out.error;
    invalidatedSessionIds.add(session.user.id);
    say('Votre ancienne session a expiré ou le compte a été supprimé. Créez un compte gratuit ou connectez-vous.');
   }catch(signOutError){
    say('Session invalide : impossible de la réinitialiser automatiquement. Réessayez en navigation privée.',true);
   }
   return;
  }
  // Ne pas supprimer une session sur une simple panne réseau.
  if(error)say('Vérification du compte temporairement indisponible. Réessayez.',true);
 });
 verificationQueue=work.catch(()=>{});
 return work;
}
async function init(){
 // Initialiser l’interface AVANT tout appel réseau : aucun affichage furtif
 // du lien de récupération en inscription ou des champs d’un autre mode.
 change('login');
 if(query.get('mode')==='reset-password')change('recover');
 else if(query.get('mode')==='reset')change('reset');
 else if(confirmationReturn){
  $('authHeading').textContent='Confirmation de votre inscription';
  if($('authLead'))$('authLead').textContent='Nous vérifions votre lien avant de poursuivre vers votre espace.';
  if($('authCardLead'))$('authCardLead').textContent='Votre confirmation est en cours de vérification.';
  say('Vérification du lien de confirmation…');
 }
 else if(query.get('mode')==='signup')change('signup');
 const r=await fetch('/api/config');if(!r.ok)throw Error('Connexion indisponible');const c=await r.json();
 if(!c.supabaseUrl||!c.supabaseKey)throw Error('Configuration de connexion indisponible');
 db=createClient(c.supabaseUrl,c.supabaseKey,{auth:{detectSessionInUrl:true}});
 db.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){change('recover');return;}
  if(event==='SIGNED_IN'&&session&&mode!=='recover'){
   // Supabase recommande de différer les autres appels Auth hors du callback.
   setTimeout(()=>resume(session).catch(error=>say(error.message,true)),0);
  }
 });
 const {data,error}=await db.auth.getSession();
 if(error&&invalidSessionError(error)){
  await db.auth.signOut({scope:'local'});
  say('Votre ancienne session n’est plus valide. Vous pouvez créer un nouveau compte.');
  return;
 }
 if(error){say('Vérification du compte temporairement indisponible. Réessayez.',true);return;}
 await resume(data?.session);
}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!db)return say('Connexion indisponible',true);
 const f=e.currentTarget,email=f.elements.email.value.trim(),password=f.elements.password.value,b=$('loginSubmit');b.disabled=true;
 try{
  let r;if(mode==='signup')r=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/connexion?confirmation=1',data:{offrya_signup_intent:next==='/espace/professionnel'?'pro':'client'}}});
  else if(mode==='reset')r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/connexion?mode=reset-password&next='+encodeURIComponent(next)});
  else if(mode==='recover')r=await db.auth.updateUser({password});
  else r=await db.auth.signInWithPassword({email,password});
  if(r.error)throw r.error;
  if(mode==='signup')say('Consultez votre boîte e-mail et confirmez votre inscription. Vous pourrez ensuite poursuivre le parcours choisi.');
  else if(mode==='reset')say('Consultez votre boîte e-mail et ouvrez le lien sécurisé de réinitialisation. Aucun abonnement ni alerte n’est activé.');
  else if(mode==='recover'){say('Mot de passe modifié');location.replace(next);}
  else await resume(r.data?.session);
 }catch(err){say(authFeedback(err,mode),true);}finally{b.disabled=false;}
});
init().catch(e=>say(authFeedback(e,'login'),true));
