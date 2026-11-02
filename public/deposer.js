import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import {missionData,initCommunePicker,inspectMissionPhotos,uploadMissionPhotos,resetCommunePicker} from './mission-fields.mjs';
const $=id=>document.getElementById(id);
let db;
const publicationFormHtml="<h2>Votre demande</h2><form id=\"missionForm\" class=\"form\"><label>Titre de la mission<input name=\"title\" minlength=\"8\" maxlength=\"140\" required placeholder=\"Ex. Nettoyage de bureaux, 200 m²\"></label><label>Secteur<select name=\"category\" required><option>Nettoyage</option><option>Espaces verts</option><option>Bâtiment</option><option>Informatique</option><option>Transport</option><option>Autre</option></select></label><label>Ville (recherche officielle)<input name=\"city\" minlength=\"2\" maxlength=\"90\" autocomplete=\"off\" required placeholder=\"Saisissez au moins 2 lettres\" aria-label=\"Commune\" aria-describedby=\"communeHelp\"><small id=\"communeHelp\">Choisissez une commune dans la liste proposée.</small><span data-commune-results class=\"commune-results\" role=\"group\" aria-label=\"Communes proposées\" hidden></span></label><label>Département<input name=\"department\" required maxlength=\"3\" readonly placeholder=\"Automatique\"></label><label>Budget indicatif (€), facultatif<input name=\"budget\" type=\"number\" min=\"1\" max=\"1000000\" placeholder=\"1500\"></label><label>Urgence<select name=\"urgency\"><option value=\"normal\">Sans urgence</option><option value=\"soon\">Sous quelques semaines</option><option value=\"urgent\">Urgent</option></select></label><label>Date souhaitée<input type=\"date\" name=\"desired_date\"></label><label>Surface (m²) ou quantité (unités)<input type=\"number\" min=\"1\" max=\"1000000\" step=\"0.1\" name=\"area_sqm\" placeholder=\"Ex. 120\"></label><label>Type de lieu<select name=\"place_type\"><option value=\"\">Non précisé</option><option value=\"maison\">Maison</option><option value=\"appartement\">Appartement</option><option value=\"bureau\">Bureau</option><option value=\"commerce\">Commerce</option><option value=\"terrain\">Terrain / extérieur</option><option value=\"autre\">Autre</option></select></label><label class=\"wide\">Photos de la mission (3 maximum, JPG/PNG/WebP)<input type=\"file\" name=\"photos\" accept=\"image/jpeg,image/png,image/webp\" multiple><small>3 Mo par photo maximum. Les photos seront privées, uniquement accessibles aux personnes autorisées.</small></label><label class=\"wide\">Description détaillée<textarea name=\"description\" minlength=\"30\" maxlength=\"5000\" rows=\"6\" required placeholder=\"Décrivez la prestation, le délai et les conditions souhaitées.\"></textarea></label><p class=\"wide muted\">La publication est gratuite et réservée aux comptes dont l’adresse e-mail est confirmée. Vos missions restent consultables depuis Mon espace. N’ajoutez pas de coordonnées personnelles dans l’annonce.</p><button type=\"submit\" class=\"btn primary\" id=\"publishButton\">Publier gratuitement</button><p id=\"missionStatus\" role=\"status\" aria-live=\"polite\" class=\"wide\" hidden></p></form>";
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
 const gate=$('accountGate'),area=$('publishArea');
 if(!user){
  area.replaceChildren();area.hidden=true;gate.hidden=false;
  $('gateStatus').textContent='Un compte avec adresse e-mail confirmée est nécessaire avant la publication.';
  return;
 }
 if(!area.querySelector('#missionForm')){
  area.innerHTML=publicationFormHtml;
  const form=area.querySelector('#missionForm');
  initCommunePicker(form);
  form.addEventListener('submit',submitMission);
 }
 area.hidden=false;gate.hidden=true;
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
  const payload=missionData(form,uid);
  const photoFiles=inspectMissionPhotos(form.elements.namedItem('photos'));
  const result=await db.from('offrya_missions').insert(payload).select('id').single();
  if(result.error)throw result.error;
  let photoWarning='';
  if(photoFiles.length){
   try{await uploadMissionPhotos(db,uid,result.data.id,photoFiles);}
   catch(err){console.warn('Photos mission:',err.message);photoWarning=' Mission publiée, mais les photos n’ont pas pu être enregistrées. Contactez le support pour les joindre.';}
  }
  form.reset();resetCommunePicker(form);
  notice('missionStatus','Mission publiée gratuitement. Retrouvez-la dans Mon espace → Missions.'+photoWarning,Boolean(photoWarning));
 }catch(error){
  if(!$('publishArea').hidden)notice('missionStatus',error.message||'Publication indisponible.',true);
  else notice('gateStatus',error.message||'Connexion nécessaire.',true);
 }finally{delete form.dataset.sending;button.disabled=false;}
}
init().catch(error=>notice('gateStatus',error.message||'Connexion indisponible',true));
