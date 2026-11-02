// OFFRYA — champs de mission et API Géo, sans dépendance de framework.
const geoState=new WeakMap();
const ALLOWED_CATEGORIES=['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Autre'];
const ALLOWED_URGENCY=['normal','soon','urgent'];
const ALLOWED_PLACES=['maison','appartement','bureau','commerce','terrain','autre'];
const geoPattern=/^(?:0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/;

export function normaliseCommune(item){
 if(!item||typeof item.nom!=='string'||typeof item.code!=='string'||!geoPattern.test(item.codeDepartement||''))return null;
 const nom=item.nom.trim();
 if(nom.length<2||nom.length>90||!/^\d{5}$/.test(item.code))return null;
 return {nom,code:item.code,department:item.codeDepartement};
}
export async function searchCommunes(term,{fetcher=fetch,signal}={}){
 const word=String(term||'').trim();
 if(word.length<2||word.length>90)return [];
 const url='https://geo.api.gouv.fr/communes?nom='+encodeURIComponent(word)+'&fields=nom,code,codeDepartement&boost=population&limit=8';
 const response=await fetcher(url,{signal,headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('Recherche de communes momentanément indisponible.');
 const data=await response.json();
 if(!Array.isArray(data))throw Error('Réponse de l’API Géo invalide.');
 return data.map(normaliseCommune).filter(Boolean);
}
export function initCommunePicker(form){
 const city=form.elements.namedItem('city'),department=form.elements.namedItem('department');
 const list=form.querySelector('[data-commune-results]');
 if(!city||!department||!list)return;
 department.readOnly=true;
 department.placeholder='Déduit de votre commune';
 department.setAttribute('aria-readonly','true');
 let timer,controller,version=0;
 geoState.set(form,null);
 const showMessage=text=>{list.replaceChildren();const p=document.createElement('p');p.textContent=text;list.append(p);list.hidden=false;};
 city.addEventListener('input',()=>{
  geoState.set(form,null);
  department.value='';
  const text=city.value.trim();
  clearTimeout(timer);
  if(controller)controller.abort();
  const seq=++version;
  list.replaceChildren();
  list.hidden=true;
  if(text.length<2)return;
  timer=setTimeout(async()=>{
   controller=new AbortController();
   try{
    const matches=await searchCommunes(text,{signal:controller.signal});
    if(seq!==version)return;
    if(!matches.length)return showMessage('Aucune commune trouvée. Vérifiez votre saisie.');
    list.replaceChildren();
    matches.forEach(item=>{
     const b=document.createElement('button');
     b.type='button';b.className='commune-option';
     b.textContent=item.nom+' ('+item.department+')';
     b.addEventListener('click',()=>{
      city.value=item.nom;department.value=item.department;
      geoState.set(form,item);list.replaceChildren();list.hidden=true;city.focus();
     });
     list.append(b);
    });
    list.hidden=false;
   }catch(e){if(e.name!=='AbortError'&&seq===version)showMessage('Service géographique indisponible. Réessayez.');}
  },260);
 });
}
export function missionData(form,ownerId){
 const x=Object.fromEntries(new FormData(form));
 const selected=geoState.get(form);
 if(!selected||x.city.trim()!==selected.nom||x.department!==selected.department)
  throw Error('Choisissez une commune dans les propositions pour compléter le département.');
 const category=x.category;
 if(!ALLOWED_CATEGORIES.includes(category))throw Error('Secteur invalide.');
 const urgency=x.urgency||'normal';
 if(!ALLOWED_URGENCY.includes(urgency))throw Error('Urgence invalide.');
 const place=x.place_type||'';
 if(place&&!ALLOWED_PLACES.includes(place))throw Error('Type de lieu invalide.');
 const area=x.area_sqm?Number(x.area_sqm):null;
 if(area!==null&&(!Number.isFinite(area)||area<1||area>1000000))throw Error('Surface ou quantité invalide.');
 const budget=x.budget?Math.round(Number(x.budget)*100):null;
 if(budget!==null&&(!Number.isSafeInteger(budget)||budget<100||budget>100000000))throw Error('Budget invalide.');
 const desired=x.desired_date||null;
 const today=new Date();const day=today.toISOString().slice(0,10);
 if(desired&&(!/^\d{4}-\d\d-\d\d$/.test(desired)||desired<day))throw Error('La date souhaitée ne peut pas être passée.');
 return {
  owner_id:ownerId,title:x.title.trim(),description:x.description.trim(),
  category,department:selected.department,city:selected.nom,
  budget_cents:budget,area_sqm:area,urgency,desired_date:desired,
  place_type:place||null
 };
}
export function inspectMissionPhotos(input){
 const files=[...(input?.files||[])];
 if(files.length>3)throw Error('Maximum trois photos par mission.');
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))
   throw Error('Format de photo non autorisé (JPG, PNG ou WebP uniquement).');
  if(file.size>3*1024*1024||file.size<1)throw Error('Chaque photo doit peser au maximum 3 Mo.');
 }
 return files;
}
export async function uploadMissionPhotos(db,uid,missionId,files){
 if(!files.length)return;
 const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const paths=[];
 try{
  for(const file of files){
   const path=uid+'/'+missionId+'/'+crypto.randomUUID()+'.'+extension[file.type];
   const r=await db.storage.from('offrya-mission-photos').upload(path,file,{contentType:file.type,upsert:false});
   if(r.error)throw r.error;
   paths.push(path);
  }
  const r=await db.from('offrya_mission_photos').insert(paths.map(object_path=>({mission_id:missionId,object_path})));
  if(r.error)throw r.error;
 }catch(error){
  if(paths.length)await db.storage.from('offrya-mission-photos').remove(paths).catch(()=>{});
  throw error;
 }
}
export function resetCommunePicker(form){
 geoState.set(form,null);
 const list=form.querySelector('[data-commune-results]');
 if(list){list.replaceChildren();list.hidden=true;}
}
