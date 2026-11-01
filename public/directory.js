import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id),root=$('directoryList'),status=$('directoryStatus');
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
let db=null;
async function client(){
 if(db)return db;
 const r=await fetch('/api/config'),cfg=await r.json();
 if(!r.ok||!cfg.supabaseUrl||!cfg.supabaseKey)throw Error('Connexion indisponible');
 db=createClient(cfg.supabaseUrl,cfg.supabaseKey);return db;
}
async function load(){
 try{
  const r=await fetch('/api/professionnels-verifies'),data=await r.json();
  if(!r.ok)throw Error('Annuaire indisponible');
  root.replaceChildren();
  if(!data.professionals.length){status.textContent='Aucun professionnel vérifié n’a encore choisi de publier sa fiche.';return;}
  status.textContent=data.professionals.length+' fiche(s) de professionnels vérifiés';
  for(const pro of data.professionals){
   const card=el('article');card.className='directory-card';
   const h=el('h3',pro.name);card.append(h);
   const check=el('span','Entreprise et dirigeant vérifiés');check.className='directory-badge directory-proof';card.append(check);
   const area=el('p','Zone : '+(pro.area||'Non renseignée'));card.append(area);
   const sectors=el('p','Secteurs : '+(pro.sectors?.join(', ')||'Non renseignés'));card.append(sectors);
   if(pro.presentation)card.append(el('p',pro.presentation));
   for(const label of pro.badges||[]){
    const b=el('span',label+' · qualification contrôlée');b.className='directory-badge';card.append(b);
   }
   const button=el('button','Signaler ce profil');button.className='directory-btn';button.type='button';
   button.addEventListener('click',async()=>{
    try{
     const auth=await client(),{data:{user}}=await auth.auth.getUser();
     if(!user){status.textContent='Connectez-vous pour signaler un profil : utilisez « Mon espace ».';return;}
     const form=$('directoryReportForm');form.elements.target_id.value=pro.id;
     $('directoryReportStatus').textContent='';$('directoryReportDialog').showModal();
    }catch{status.textContent='Connexion nécessaire pour signaler un profil.';}
   });card.append(el('p')).append(button);
   root.append(card);
  }
 }catch{status.textContent='Annuaire temporairement indisponible. Aucun profil fictif n’est affiché.';}
}
$('directoryReportClose').addEventListener('click',()=>$('directoryReportDialog').close());
$('directoryReportForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const f=e.currentTarget;
 try{
  const auth=await client(),{data:{user}}=await auth.auth.getUser();
  if(!user)throw Error('Connexion requise');
  const r=await auth.from('offrya_reports').insert({reporter_id:user.id,target_type:'profile',
   target_id:f.elements.target_id.value,reason:f.elements.reason.value,details:f.elements.details.value.trim()});
  if(r.error)throw r.error;
  $('directoryReportDialog').close();status.textContent='Signalement transmis à OFFRYA.';
 }catch{$('directoryReportStatus').textContent='Impossible de transmettre le signalement ou signalement déjà reçu.';}
});
load();