import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id);
let token;
const status=text=>$('modStatus').textContent=text;
async function api(path,options={}){
 const res=await fetch('/api/moderation'+path,{...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
 const payload=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(payload.error||'Accès refusé ou service indisponible.');
 return payload;
}
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
function action(name,data,kind,verb){
 const b=el('button',name);b.type='button';
 b.addEventListener('click',async()=>{
  if(!confirm('Confirmer cette action de modération ? Elle sera enregistrée dans le journal interne.'))return;
  b.disabled=true;
  try{await api('',{method:'POST',body:JSON.stringify({kind,id:data,action:verb})});await refresh();}
  catch(error){status(error.message);}
  finally{b.disabled=false;}
 });
 return b;
}
function renderRows(id,rows,kind){
 const root=$(id);root.replaceChildren();
 if(!rows?.length){root.append(el('p','Aucun élément à afficher.'));return;}
 for(const item of rows){
  const div=el('article');div.className='mod-entry';
  if(kind==='report'){
   div.append(el('strong',item.target_type+' · '+item.reason+' · '+item.status));
   div.append(el('p',item.details||'Sans détails'),el('small',item.created_at));
   if(item.status!=='closed')div.append(action('Marquer à examiner',item.id,'report','reviewing'),action('Clore ce signalement',item.id,'report','closed'));
  }else if(kind==='mission'){
   div.append(el('strong',item.title+' · '+item.status),el('small',item.category+' · '+item.city+' ('+item.department+')'));
   if(item.status==='open')div.append(action('Clore la mission',item.id,'mission','close'));
  }else{
   div.append(el('strong',item.legal_name+' · '+item.status),
     el('small','SIRET : '+item.siret+' · Identité : '+item.identity_status+' · Autorité : '+item.authority_status));
   div.append(el('p','Vérification documentaire manuelle requise : aucune approbation automatique.'));
  }
  root.append(div);
 }
}
async function refresh(){
 const data=await api('');
 $('modContent').hidden=false;
 renderRows('reports',data.reports,'report');
 renderRows('missions',data.missions,'mission');
 renderRows('dossiers',data.dossiers,'dossier');
 status('Accès administrateur validé.');
}
async function init(){
 const c=await fetch('/api/config').then(r=>r.json());
 if(!c.supabaseUrl||!c.supabaseKey)throw Error('Connexion indisponible.');
 const db=createClient(c.supabaseUrl,c.supabaseKey);
 const s=await db.auth.getSession();
 token=s.data?.session?.access_token;
 if(!token)throw Error('Connectez-vous à votre compte OFFRYA pour consulter la modération.');
 await refresh();
}
init().catch(e=>status(e.message));
