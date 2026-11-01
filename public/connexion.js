import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const value=query.get('next')||'/espace',next=(value==='/deposer-une-mission'||/^\/espace(?:\/(?:missions|marches-publics|messagerie|reglages|professionnel))?$/.test(value))?value:'/espace';
let db,mode='login';const labels={login:'Se connecter',signup:'Créer un compte',magic:'Envoyer un lien',reset:'Envoyer la réinitialisation',recover:'Enregistrer le mot de passe'};
function say(s,error=false){$('loginStatus').textContent=s;$('loginStatus').style.color=error?'#ab294d':'#4e318a';}
function change(v){
 mode=v;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===v));
 $('loginSubmit').textContent=labels[v];const ps=$('passwordRow'),em=$('emailRow');
 ps.hidden=['magic','reset'].includes(v);ps.querySelector('input').required=!ps.hidden;ps.querySelector('input').autocomplete=v==='login'?'current-password':'new-password';
 em.hidden=v==='recover';em.querySelector('input').required=!em.hidden;
}
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>change(b.dataset.mode));
function resume(session){if(session&&!session.user?.is_anonymous&&session.user?.email_confirmed_at)location.replace(next);}
async function init(){
 const r=await fetch('/api/config');if(!r.ok)throw Error('Connexion indisponible');const c=await r.json();
 db=createClient(c.supabaseUrl,c.supabaseKey,{auth:{detectSessionInUrl:true}});
 db.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){change('recover');return;}if(event==='SIGNED_IN'&&session&&!session.user?.is_anonymous&&mode!=='recover')setTimeout(()=>resume(session),0);});
 const {data:{session}}=await db.auth.getSession();
 if(query.get('mode')==='reset-password')change('recover');else{if(query.get('mode')==='signup')change('signup');resume(session);}
}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!db)return say('Connexion indisponible',true);
 const f=e.currentTarget,email=f.elements.email.value.trim(),password=f.elements.password.value,b=$('loginSubmit');b.disabled=true;
 try{
  let r;if(mode==='signup')r=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/connexion?next='+encodeURIComponent(next)}});
  else if(mode==='magic')r=await db.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/connexion?next='+encodeURIComponent(next)}});
  else if(mode==='reset')r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/connexion?mode=reset-password&next='+encodeURIComponent(next)});
  else if(mode==='recover')r=await db.auth.updateUser({password});
  else r=await db.auth.signInWithPassword({email,password});
  if(r.error)throw r.error;
  if(['signup','magic','reset'].includes(mode))say('Consultez votre boîte e-mail et ouvrez le lien sécurisé. Aucun abonnement ni alerte n’est activé.');
  else if(mode==='recover'){say('Mot de passe modifié');location.replace(next);}
  else resume(r.data?.session);
 }catch(err){say(err.message||'Erreur de connexion',true);}finally{b.disabled=false;}
});
init().catch(e=>say(e.message,true));