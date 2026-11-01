'use strict';
// Lecture publique de données strictement agrégées (aucune mission individuelle).
// Isolée de Supabase Auth et du tableau de bord : un échec ne bloque pas l'accueil.
(async()=>{
 const mount=document.getElementById('publicActivity');
 if(!mount)return;
 const details=document.getElementById('activityDetailsButton');
 const section=document.getElementById('activite');
 if(details&&section)details.addEventListener('click',()=>{
   const expanded=details.getAttribute('aria-expanded')!=='true';
   details.setAttribute('aria-expanded',String(expanded));
   section.classList.toggle('is-expanded',expanded);
 });
 const element=(tag,content)=>{
  const node=document.createElement(tag);
  if(content!==undefined)node.textContent=String(content);
  return node;
 };
 const showError=()=>{
  const paragraph=element('p','Les chiffres des missions sont momentanément indisponibles. Le dépôt gratuit et les inscriptions restent accessibles.');
  paragraph.className='activity-unavailable';
  mount.replaceChildren(paragraph);
 };
 try{
  const configResponse=await fetch('/api/config',{cache:'no-store'});
  if(!configResponse.ok)throw Error('Configuration indisponible');
  const config=await configResponse.json();
  const origin=new URL(config.supabaseUrl);
  if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')
    ||typeof config.supabaseKey!=='string'||config.supabaseKey.length<10)
   throw Error('Configuration invalide');
  const response=await fetch(origin.origin+'/rest/v1/rpc/offrya_public_mission_counts',{
   method:'POST',
   headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},
   body:'{}',
   cache:'no-store'
  });
  if(!response.ok)throw Error('Statistiques indisponibles');
  const data=await response.json();
  if(!Array.isArray(data)||data.length>700)throw Error('Réponse invalide');
  const allowed=new Set(['Bâtiment','Nettoyage','Espaces verts','Informatique','Transport','Autre']);
  const sectors=new Map(),departments=new Map();
  for(const row of data){
   const category=row?.category,department=row?.department,n=Number(row?.count);
   if(!allowed.has(category)
    ||typeof department!=='string'
    ||!/^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(department)
    ||!Number.isSafeInteger(n)||n<0)throw Error('Ligne de données invalide');
   sectors.set(category,(sectors.get(category)||0)+n);
   departments.set(department,(departments.get(department)||0)+n);
  }
  const total=[...sectors.values()].reduce((sum,n)=>sum+n,0);
  if(!Number.isSafeInteger(total))throw Error('Décompte invalide');
  const summary=element('p');summary.className='activity-total';
  const amount=element('strong',total.toLocaleString('fr-FR'));
  summary.append(amount,element('span',total===1?'mission ouverte actuellement':'missions ouvertes actuellement'));
  mount.replaceChildren(summary);
  if(total===0){
   mount.append(element('p','Aucune mission ouverte à afficher pour le moment.'));
   return;
  }
  const grid=element('div');grid.className='activity-groups';
  for(const [heading,source] of [['Par secteur',sectors],['Par département',departments]]){
   const block=element('div');block.className='activity-group';
   block.append(element('h3',heading));
   const list=element('ul');list.className='activity-list';
   const sorted=[...source.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'));
   for(const [name,count] of sorted){
    const li=element('li');
    li.append(element('span',name),element('strong',count.toLocaleString('fr-FR')));
    list.append(li);
   }
   block.append(list);grid.append(block);
  }
  mount.append(grid);
 }catch(error){
  console.warn('OFFRYA : statistiques publiques indisponibles',error?.message);
  showError();
 }
})();
