import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id);
let db;
const publisherFormHtml="<h2>Votre demande</h2><form id=\"missionForm\" class=\"form\"><label>Titre de la mission<input name=\"title\" minlength=\"8\" maxlength=\"140\" required placeholder=\"Ex. Nettoyage de bureaux, 200 m²\"></label><label>Secteur<select name=\"category\" required><option>Nettoyage</option><option>Espaces verts</option><option>Bâtiment</option><option>Informatique</option><option>Transport</option><option>Autre</option></select></label><label>Département<input name=\"department\" required maxlength=\"3\" placeholder=\"13\"></label><label>Ville<input name=\"city\" minlength=\"2\" maxlength=\"90\" required placeholder=\"Marseille\"></label><label>Budget indicatif (€), facultatif<input name=\"budget\" type=\"number\" min=\"1\" max=\"1000000\" placeholder=\"1500\"></label><label class=\"wide\">Description détaillée<textarea name=\"description\" minlength=\"30\" maxlength=\"5000\" rows=\"6\" required placeholder=\"Décrivez la prestation, le délai et les conditions souhaitées.\"></textarea></label><p class=\"wide muted\">La publication est gratuite et réservée aux comptes dont l’adresse e-mail est confirmée. Vos missions restent consultables depuis Mon espace. N’ajoutez pas de coordonnées personnelles dans l’annonce.</p><button type=\"submit\" class=\"btn primary\" id=\"publishButton\">Publier gratuitement</button><p id=\"missionStatus\" role=\"status\" aria-live=\"polite\" class=\"wide\" hidden></p></form>";
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
 const area=$('publishArea'),gate=$('accountGate');
 // Ne créer le formulaire dans le DOM qu'après validation de l'utilisateur
 // par Supabase Auth. La RLS reste l'autorité pour l'INSERT des missions.
 if(!user){
  area.replaceChildren();
  area.hidden=true;
  gate.hidden=false;
  $('gateStatus').textContent='Un compte avec adresse e-mail confirmée est nécessaire avant la publication.';
  return;
 }
 if(!area.querySelector('#missionForm')){
  area.innerHTML=publisherFormHtml; // HTML constant, jamais de contenu externe.
  area.querySelector('#missionForm').addEventListener('submit',submitMission);
 }
 area.hidden=false;
 gate.hidden=true;
}
async function init(){
 const response=await fetch('/api/config');
 if(!response.ok)throw Error('Service de connexion indisponible');
 const cfg=await response.json();
 if(!cfg.supabaseUrl||!cfg.supabaseKey)throw Error('Connexion Supabase indisponible');
 db=createClient(cfg.supabaseUrl,cfg.supabaseKey);
 await showPublicationAccess();
}
async function submitMission(event){
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
}
init().catch(error=>notice('gateStatus',error.message||'Connexion indisponible',true));
