import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id);
let db;
function notice(id,text,failed=false){
 const el=$(id);el.hidden=false;el.textContent=text;el.style.color=failed?'#aa324c':'#51319d';
}
function verifiedAccount(user){
 return Boolean(user&&!user.is_anonymous&&typeof user.email==='string'&&user.email.includes('@')&&user.email_confirmed_at);
}
async function currentPublisher(){
 if(!db)return null;
 const {data,error}=await db.auth.getUser();
 if(error||!verifiedAccount(data?.user))return null;
 return data.user;
}
async function showPublicationAccess(){
 const user=await currentPublisher();
 $('accountGate').hidden=Boolean(user);
 $('publishArea').hidden=!user;
 if(!user)$('gateStatus').textContent='Un compte avec adresse e-mail confirmée est nécessaire avant la publication.';
}
async function init(){
 const response=await fetch('/api/config');
 if(!response.ok)throw Error('Service de connexion indisponible');
 const cfg=await response.json();
 if(!cfg.supabaseUrl||!cfg.supabaseKey)throw Error('Connexion Supabase indisponible');
 db=createClient(cfg.supabaseUrl,cfg.supabaseKey);
 await showPublicationAccess();
}
$('missionForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;
 if(form.dataset.sending==='true')return;
 const button=$('publishButton');button.disabled=true;form.dataset.sending='true';
 try{
  if(!db)throw Error('Publication momentanément indisponible.');
  // Vérifie une nouvelle fois le compte via Supabase Auth, et jamais seulement
  // depuis les données locales. La RLS confirme indépendamment cette condition.
  const user=await currentPublisher();
  if(!user){await showPublicationAccess();throw Error('Créez un compte et confirmez votre e-mail avant de publier.');}
  const uid=user.id;
  const profile=await db.from('offrya_profiles').select('id').eq('id',uid).maybeSingle();
  if(profile.error)throw profile.error;
  if(!profile.data){
   const created=await db.from('offrya_profiles').insert({
    id:uid,role:'client',display_name:'Auteur de mission',city:'',specialty:''
   });
   if(created.error&&created.error.code!=='23505')throw created.error;
  }
  const values=Object.fromEntries(new FormData(form));
  const amount=values.budget?Math.round(Number(values.budget)*100):null;
  const result=await db.from('offrya_missions').insert({
   owner_id:uid,title:values.title.trim(),description:values.description.trim(),
   category:values.category,department:values.department.trim().toUpperCase(),
   city:values.city.trim(),budget_cents:amount
  });
  if(result.error)throw result.error;
  form.reset();
  notice('missionStatus','Mission publiée gratuitement. Retrouvez-la dans Mon espace → Missions.');
 }catch(error){
  if(!$('publishArea').hidden)notice('missionStatus',error.message||'Publication indisponible.',true);
  else notice('gateStatus',error.message||'Connexion nécessaire.',true);
 }finally{delete form.dataset.sending;button.disabled=false;}
});
init().catch(error=>notice('gateStatus',error.message||'Connexion indisponible',true));
