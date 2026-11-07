import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import {MAX_PHOTOS,preparePhoto,uploadMissionPhotos} from './mission-photos.js';
const $=id=>document.getElementById(id);
let db;
// Starter stores only sector and city (24h) on this browser; never private details.
const DRAFT_KEY='offrya:mission-starter:v1';
const allowedCategories=new Set(['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre']);
function readStarter(){
 let saved=null;
 try{
  const raw=sessionStorage.getItem(DRAFT_KEY);
  if(raw){const value=JSON.parse(raw);if(Number(value.time)<=Date.now()&&Date.now()-Number(value.time)<86400000)saved=value;}
 }catch(_){}
 const params=new URLSearchParams(location.search);
 const category=params.has('category')?params.get('category'):saved?.category;
 const city=params.has('city')?params.get('city'):saved?.city;
 const validCategory=allowedCategories.has(category)?category:null;
 const validCity=String(city||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,90);
 const safeCity=validCity.length>=2?validCity:'';
 const value={category:validCategory,city:safeCity};
 if(validCategory||safeCity){
  try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify({...value,time:Date.now()}));}catch(_){}
 }
 return value;
}
const starter=readStarter();
function populateStarter(){
 const form=$('missionForm');if(!form)return;
 if(starter.category)form.elements.category.value=starter.category;
 if(starter.city)form.elements.city.value=starter.city;
 const hint=$('missionPrefillNote');if(hint)hint.hidden=!(starter.category||starter.city);
}
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
 populateStarter();
 await showPublicationAccess();
}
// ---- Photos choisies avant publication (préparées dans le navigateur) ----
const photos=[];
function photoNotice(text,failed=false){
 const el=$('photoStatus');if(!el)return;
 el.hidden=!text;el.textContent=text||'';el.classList.toggle('is-error',failed);
}
function renderPhotos(){
 const grid=$('photoPreview');if(!grid)return;
 grid.innerHTML='';
 photos.forEach((photo,index)=>{
  const item=document.createElement('figure');item.className='photo-thumb';
  const img=document.createElement('img');img.src=photo.url;img.alt='Photo '+(index+1)+' de la mission';
  const remove=document.createElement('button');remove.type='button';remove.className='photo-remove';
  remove.setAttribute('aria-label','Retirer la photo '+(index+1));remove.textContent='×';
  remove.addEventListener('click',()=>{URL.revokeObjectURL(photo.url);photos.splice(index,1);renderPhotos();photoNotice('');});
  item.append(img,remove);grid.append(item);
 });
 const add=$('photoAdd');
 if(add){add.hidden=photos.length>=MAX_PHOTOS;add.querySelector('span').textContent=photos.length?'Ajouter d’autres photos':'Ajouter des photos';}
 const label=$('photoFieldLabel');if(label)label.textContent='Photos (facultatif)'+(photos.length?' · '+photos.length+'/'+MAX_PHOTOS:'');
}
$('missionPhotos')?.addEventListener('change',async event=>{
 const input=event.currentTarget,files=[...(input.files||[])];input.value='';
 if(!files.length)return;
 const room=MAX_PHOTOS-photos.length;
 const selected=files.slice(0,Math.max(0,room));
 const errors=[];
 photoNotice('Préparation des photos…');
 for(const file of selected){
  try{const blob=await preparePhoto(file);photos.push({blob,url:URL.createObjectURL(blob)});}
  catch(error){errors.push(error.message);}
 }
 renderPhotos();
 if(files.length>room)errors.push('Maximum '+MAX_PHOTOS+' photos par mission.');
 photoNotice(errors.join(' '),Boolean(errors.length));
});
function clearPhotos(){for(const photo of photos)URL.revokeObjectURL(photo.url);photos.length=0;renderPhotos();}

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
  }).select('id').single();
  if(result.error)throw result.error;
  let sent={added:0,failed:0};
  if(photos.length&&result.data?.id){
   notice('missionStatus','Mission publiée. Envoi des photos…');
   try{sent=await uploadMissionPhotos(db,uid,result.data.id,photos.map(p=>p.blob));}
   catch(error){console.warn('OFFRYA: envoi des photos impossible',error);sent={added:0,failed:photos.length};}
  }
  form.reset();clearPhotos();photoNotice('');
   try{sessionStorage.removeItem(DRAFT_KEY);}catch(_){}
  const photoText=sent.added?(' '+sent.added+' photo'+(sent.added>1?'s ajoutées':' ajoutée')+'.'):'';
  const failText=sent.failed?(' '+sent.failed+' photo'+(sent.failed>1?'s n’ont':' n’a')+' pas pu être envoyée'+(sent.failed>1?'s':'')+' : vous pourrez '+(sent.failed>1?'les':'l’')+'ajouter depuis Mon espace → Missions.'):'';
  notice('missionStatus','Mission publiée gratuitement.'+photoText+failText+' Retrouvez-la dans Mon espace → Missions.',Boolean(sent.failed));
 }catch(error){
  if(!$('publishArea').hidden)notice('missionStatus',error.message||'Publication indisponible.',true);
  else notice('gateStatus',error.message||'Connexion nécessaire.',true);
 }finally{delete form.dataset.sending;button.disabled=false;}
});
init().catch(error=>notice('gateStatus',error.message||'Connexion indisponible',true));
