import {authFeedback} from './auth-feedback.mjs';
import {createAuthCaptcha} from './auth-captcha.mjs';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const value=query.get('next')||'/espace';
const uuidPart='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const pushConversationPath=new RegExp('^/espace/messagerie\\?conversation='+uuidPart+'(?:&message='+uuidPart+')?$','i');
const next=(value==='/deposer-une-mission'||/^\/espace(?:\/(?:missions|marches-publics|messagerie|reglages|professionnel))?$/.test(value)||pushConversationPath.test(value))?value:'/espace';
// Les liens de confirmation finissent sur /connexion pour permettre à Supabase
// de lire les jetons d'authentification. L'utilisateur rejoint ensuite son dashboard.
// Prend aussi en charge les anciens liens implicites contenant #type=signup.
const linkHash=new URLSearchParams((location.hash||'').replace(/^#/,''));
const confirmationReturn=query.get('confirmation')==='1'||query.get('type')==='signup'||linkHash.get('type')==='signup';
let db,mode='login',redirected=false,verificationQueue=Promise.resolve();
const authCaptcha=createAuthCaptcha(document.getElementById('authCaptcha'));

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
function say(s,error=false){
 const status=$('loginStatus');
 if(!status)return;
 status.textContent=s;
 status.className='auth-status'+(s?(error?' auth-status--error':' auth-status--info'):'');
 status.setAttribute?.('role',s&&error?'alert':'status');
}
function validateAuthInput(email,password){
 if(mode!=='recover'){
  if(!email)return {field:'email',message:'Saisissez votre adresse e-mail.'};
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return {field:'email',message:'Cette adresse e-mail est invalide. Vérifiez sa saisie.'};
 }
 if(mode!=='reset'){
  if(!password)return {field:'password',message:'Saisissez votre mot de passe.'};
  if((mode==='signup'||mode==='recover')&&password.length<8)return {field:'password',message:'Le mot de passe doit contenir au moins 8 caractères.'};
 }
 return null;
}
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
 if($('authTabs'))$('authTabs').hidden=true; // Connexion et inscription restent deux parcours séparés.
 if($('authBack'))$('authBack').hidden=v==='login'||v==='signup';
 if($('authExistingAccount'))$('authExistingAccount').hidden=v!=='signup';
 if($('resetLinkWrap'))$('resetLinkWrap').hidden=v!=='login';
 if($('authModeFootnote'))$('authModeFootnote').textContent=
  v==='signup'?((query.get('role')==='pro'||next==='/espace/professionnel')?'Création du compte sans paiement. Offre professionnelle : 34,99 € TTC/mois après vérification et activation.':(query.get('role')==='client'||query.has('next')&&next==='/deposer-une-mission')?'Compte demandeur gratuit : aucun abonnement nécessaire pour déposer une mission.':'Choisissez le type de compte adapté à votre besoin. Aucun paiement à cette étape.'):
  v==='reset'?'Si un compte est associé à cette adresse, consultez votre boîte e-mail.':
  v==='recover'?'Après modification, vous pourrez revenir à votre espace.':
  'Connexion sécurisée. Aucun paiement n’est déclenché ici.';
 const choice=$('accountTypeChoice');
 if(choice){
  // Un choix explicite depuis l'accueil ouvre directement son formulaire.
  // L'écran générique conserve le sélecteur lorsqu'aucun parcours n'a été choisi.
  const selectedSignup=(query.get('role')==='client'||query.get('role')==='pro')||query.has('next')&&(next==='/deposer-une-mission'||next==='/espace/professionnel');
  choice.hidden=v!=='signup'||selectedSignup;
  // En inscription générique : choisir d'abord le rôle, ne pas présenter
  // un formulaire qui risquerait de créer un compte du mauvais type.
  $('loginForm').hidden=v==='signup'&&!selectedSignup;
  // Une entrée ciblée ne doit jamais reproposer le choix du compte.
  if(v==='signup'&&!selectedSignup){
   $('authHeading').textContent='Choisissez votre compte OFFRYA';
   $('authLead').textContent='Deux parcours : demandeur gratuit ou professionnel. Choisissez celui qui correspond à votre activité.';
   $('authCardEyebrow').textContent='CHOIX DU COMPTE';
   $('authCardHeading').textContent='Quel compte souhaitez-vous créer ?';
   $('authCardLead').textContent='Sélectionnez votre parcours pour accéder directement au formulaire adapté.';
  }
  if(v==='signup'&&choice.hidden){
   const professional=query.get('role')==='pro'||next==='/espace/professionnel';
   $('authHeading').textContent=professional?'Créez votre compte professionnel':'Créez votre compte demandeur gratuit';
   $('authCardEyebrow').textContent=professional?'COMPTE PROFESSIONNEL':'COMPTE DEMANDEUR · GRATUIT';
   $('authLead').textContent=professional?'Créez votre compte, confirmez votre e-mail puis vérifiez votre entreprise et votre identité avant de souscrire.':'Créez gratuitement votre compte et confirmez votre e-mail pour publier et suivre vos missions.';
   $('authCardHeading').textContent=professional?'Inscription professionnelle':'Inscription demandeur';
   $('authCardLead').textContent=professional?'Vérifiez votre e-mail, puis complétez les étapes SIRET, identité du dirigeant et abonnement. Aucun paiement à cette étape.':'Créez votre compte gratuit pour publier une mission après confirmation de votre e-mail.';
  }
  for(const option of choice.querySelectorAll('[data-signup-type]')){
   const selected=option.dataset.signupType===((query.get('role')==='pro'||next==='/espace/professionnel')?'pro':'client');
   option.classList.toggle('chosen',selected);
   if(selected)option.setAttribute('aria-current','true');else option.removeAttribute('aria-current');
  }
 }
 const userRow=$('usernameRow');
 if(userRow){
  userRow.hidden=v!=='signup';
  userRow.querySelector('input').required=v==='signup'&&!$('loginForm').hidden;
 }
 const ps=$('passwordRow'),em=$('emailRow');
 ps.hidden=v==='reset';
 ps.querySelector('input').required=!ps.hidden;
 ps.querySelector('input').minLength=v==='signup'||v==='recover'?8:0;
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
   // Toute confirmation de compte débouche sur le tableau de bord privé.
   // Les liens profonds restent disponibles après une connexion ordinaire.
   location.replace(confirmationReturn?'/espace':next);
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
 await authCaptcha.init(c.guestCaptchaSiteKey);
 // Le chargement différé évite qu'un CDN indisponible rende le formulaire inerte.
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm');
 db=createClient(c.supabaseUrl,c.supabaseKey,{auth:{detectSessionInUrl:true}});
 db.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){change('recover');return;}
  if(event==='SIGNED_IN'&&session&&mode!=='recover'){
   // Supabase recommande de différer les autres appels Auth hors du callback.
   setTimeout(()=>resume(session).catch(error=>say(error.message,true)),0);
  }
 });
 // Accepte les liens de confirmation Supabase avec token_hash, en plus du flux implicite.
 const tokenHash=query.get('token_hash');
 if(confirmationReturn&&tokenHash){
  const type=query.get('type')==='email_change'?'email_change':'email';
  const verification=await db.auth.verifyOtp({token_hash:tokenHash,type});
  if(verification.error){say('Ce lien de confirmation est invalide ou expiré. Connectez-vous si votre adresse est déjà confirmée, sinon demandez un nouveau lien.',true);return;}
 }
 const {data,error}=await db.auth.getSession();
 if(error&&invalidSessionError(error)){
  await db.auth.signOut({scope:'local'});
  say('Votre ancienne session n’est plus valide. Vous pouvez créer un nouveau compte.');
  return;
 }
 if(error){say('Vérification du compte temporairement indisponible. Réessayez.',true);return;}
 if(confirmationReturn&&!data?.session){
  say('Confirmation non terminée : aucun accès valide n’a été reçu. Vous pouvez vous connecter si votre adresse a été confirmée, sinon demander un nouveau lien.',true);
  if($('authCardLead'))$('authCardLead').textContent='Le lien ne contient pas de session utilisable. Vérifiez votre e-mail ou connectez-vous.';
  return;
 }
 await resume(data?.session);
}
let usernameCheckSerial=0;
$('usernameRow')?.querySelector('input')?.addEventListener('blur',async event=>{
 const value=event.target.value.trim(),status=$('usernameStatus'),serial=++usernameCheckSerial;
 if(!value||!db){status.textContent='';return;}
 if(!/^[A-Za-z0-9_]{3,30}$/.test(value)){status.textContent='Utilisez 3 à 30 lettres, chiffres ou _. ';return;}
 const result=await db.rpc('offrya_username_available',{p_username:value}).catch(()=>({error:true}));
 if(serial!==usernameCheckSerial)return;
 status.textContent=result.error?'Disponibilité indisponible.':result.data===true?'Pseudonyme disponible.':'Pseudonyme déjà utilisé.';
});
$('loginForm').addEventListener('input',e=>{
 e.target?.removeAttribute?.('aria-invalid');
 if($('loginStatus')?.className?.includes('auth-status--error'))say('');
});
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const f=e.currentTarget,email=f.elements.email.value.trim(),password=f.elements.password.value,b=$('loginSubmit');
 if(b.disabled)return;
 const invalid=validateAuthInput(email,password);
 if(invalid){
  f.elements[invalid.field]?.setAttribute?.('aria-invalid','true');
  return say(invalid.message,true);
 }
 if(!db)return say('Le service de connexion n’est pas encore disponible. Vérifiez votre connexion Internet et réessayez.',true);
 f.elements.email?.removeAttribute?.('aria-invalid');
 f.elements.password?.removeAttribute?.('aria-invalid');
 say(mode==='login'?'Vérification de vos identifiants…':'Traitement de votre demande…');
 b.disabled=true;
 try{
  const captchaToken=authCaptcha.requiredToken();
  let r;if(mode==='signup'){
   const username=f.elements.username.value.trim();
   if(!/^[A-Za-z0-9_]{3,30}$/.test(username))throw Error('Le pseudonyme doit contenir 3 à 30 lettres, chiffres ou caractères _.');
   const availability=await db.rpc('offrya_username_available',{p_username:username});
   if(availability.error)throw Error('Vérification du pseudonyme indisponible. Réessayez.');
   if(availability.data!==true)throw Error('Ce pseudonyme est déjà utilisé. Choisissez-en un autre.');
   r=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/connexion?confirmation=1&next='+encodeURIComponent(next),data:{offrya_signup_intent:next==='/espace/professionnel'?'pro':'client',offrya_username:username},...(captchaToken?{captchaToken}:{})}});
  }
  else if(mode==='reset')r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/connexion?mode=reset-password&next='+encodeURIComponent(next),...(captchaToken?{captchaToken}:{})});
  else if(mode==='recover')r=await db.auth.updateUser({password});
  else r=await db.auth.signInWithPassword({email,password,...(captchaToken?{options:{captchaToken}}:{})});
  if(r.error)throw r.error;
  if(mode==='signup')say('Consultez votre boîte e-mail si un message de confirmation vous est envoyé. Si vous possédez déjà un compte, utilisez « Connexion ».');
  else if(mode==='reset')say('Consultez votre boîte e-mail et ouvrez le lien sécurisé de réinitialisation. Aucun abonnement ni alerte n’est activé.');
  else if(mode==='recover'){say('Mot de passe modifié');location.replace(next);}
  else await resume(r.data?.session);
 }catch(err){const message=String(err?.message||'');say(mode==='signup'&&/^(Le pseudonyme|Ce pseudonyme|Vérification du pseudonyme)/.test(message)?message:authFeedback(err,mode),true);}finally{authCaptcha.reset();b.disabled=false;}
});
init().catch(e=>say(authFeedback(e,'login'),true));
