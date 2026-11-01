import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id);let db,captchaKey=null,captchaToken=null,widget=null;
function notice(id,text,failed=false){const x=$(id);x.hidden=false;x.textContent=text;x.style.color=failed?'#aa324c':'#51319d';}
async function init(){
 const r=await fetch('/api/config');if(!r.ok)throw Error('Publication indisponible');const cfg=await r.json();
 if(!cfg.supabaseUrl||!cfg.supabaseKey)throw Error('Connexion Supabase indisponible');
 db=createClient(cfg.supabaseUrl,cfg.supabaseKey);captchaKey=cfg.guestCaptchaSiteKey||null;
 const {data}=await db.auth.getSession();
 if(!data.session&&captchaKey){
  $('guestCaptcha').hidden=false;const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>{widget=window.turnstile.render($('guestCaptchaWidget'),{sitekey:captchaKey,callback:t=>captchaToken=t,'expired-callback':()=>captchaToken=null});};document.head.append(script);
 }
}
$('missionForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.currentTarget;if(f.dataset.sending)return;
 const b=$('publishButton');b.disabled=true;f.dataset.sending='true';
 try{
  if(!db)throw Error('Publication momentanément indisponible');
  let {data:{session}}=await db.auth.getSession();
  if(!session){
   if(captchaKey&&!captchaToken)throw Error('Complétez la vérification anti-robot');
   const g=await db.auth.signInAnonymously(captchaKey?{options:{captchaToken}}:undefined);
   captchaToken=null;if(window.turnstile&&widget!==null)window.turnstile.reset(widget);
   if(g.error)throw g.error;session=g.data?.session;
  }
  if(!session?.user?.id)throw Error('Session de publication indisponible');
  const uid=session.user.id;
  const profile=await db.from('offrya_profiles').select('id').eq('id',uid).maybeSingle();
  if(profile.error)throw profile.error;
  if(!profile.data){
   const x=await db.from('offrya_profiles').insert({id:uid,role:'client',display_name:'Auteur de mission',city:'',specialty:''});
   if(x.error&&x.error.code!=='23505')throw x.error;
  }
  const v=Object.fromEntries(new FormData(f)),amount=v.budget?Math.round(Number(v.budget)*100):null;
  const x=await db.from('offrya_missions').insert({owner_id:uid,title:v.title.trim(),description:v.description.trim(),category:v.category,department:v.department.trim().toUpperCase(),city:v.city.trim(),budget_cents:amount});
  if(x.error)throw x.error;
  f.reset();notice('missionStatus','Mission publiée. Retrouvez-la dans votre espace de suivi : /espace/missions.');
  if(session.user.is_anonymous)$('followupOptIn').hidden=false;
  $('guestCaptcha').hidden=true;
 }catch(err){notice('missionStatus',err.message||'Publication indisponible',true);}
 finally{b.disabled=false;delete f.dataset.sending;}
});
$('followupForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.currentTarget;const {data:{session}}=await db.auth.getSession();
 if(!session?.user?.is_anonymous)return notice('followupStatus','Ce suivi possède déjà un compte identifié.',true);
 const b=f.querySelector('button');b.disabled=true;
 try{
  const {error}=await db.auth.updateUser({email:f.elements.email.value.trim()},{emailRedirectTo:location.origin+'/connexion?next=%2Fespace%2Fmissions'});
  if(error)throw error;
  notice('followupStatus','Un e-mail de confirmation a été demandé. Confirmez votre adresse avant de quitter cet appareil. Vous pourrez ensuite demander un lien de connexion ; aucun e-mail commercial ne sera envoyé.');
 }catch(err){notice('followupStatus',err.message||'Liaison e-mail indisponible. Conservez ce navigateur pour le suivi.',true);}
 finally{b.disabled=false;}
});
init().catch(err=>notice('missionStatus',err.message,true));