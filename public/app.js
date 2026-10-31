import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=n=>(Number(n||0)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const date=s=>s?new Date(s).toLocaleDateString('fr-FR'):'—';
const state={db:null,session:null,profile:null,missions:[],conversations:[],messages:[],prefs:null,wait:false,profiles:[],favorites:[],thread:null,boamp:[],boampOffset:0,boampTotal:0,premium:null,authMode:'login'};
function toast(s){const t=$('toast');t.textContent=s;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4300);}
function showError(e){const msg=e?.message||String(e);toast(msg);console.error(e);}
function info(s,error=false){$('alert').textContent=s;$('alert').classList.toggle('error',error);$('alert').classList.remove('hidden');}
function tab(name){if(!$(name))return;document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.id===name));document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.tab===name));const titles={dashboard:'Vue d’ensemble',missions:'Missions privées',boamp:'Marchés publics',inbox:'Messagerie',settings:'Mon compte'};$('pageTitle').textContent=titles[name];$('breadcrumb').textContent='OFFRYA / '+titles[name].toUpperCase();location.hash=name;if(name==='boamp'&&canUsePremium()&&!state.boamp.length)loadBoamp();window.scrollTo({top:0,behavior:'smooth'});}
for(const n of document.querySelectorAll('[data-tab]'))n.addEventListener('click',()=>{tab(n.dataset.tab);if(n.dataset.action==='publish')$('missionForm').scrollIntoView({behavior:'smooth'});});
function requireAuth(){if(!state.db){toast('Connectez d’abord votre projet Supabase OFFRYA.');return false;}if(!state.session){$('authModal').classList.remove('hidden');toast('Inscription ou connexion nécessaire.');return false;}return true;}
function requireRole(role){if(!requireAuth())return false;if(!state.profile){tab('settings');toast('Complétez votre profil avant de commencer.');return false;}if(state.profile.role!==role){toast(role==='client'?'Un compte Client est nécessaire pour publier.':'Un compte Professionnel est nécessaire pour répondre.');return false;}return true;}
function titleForMission(id){return state.missions.find(m=>m.id===id)?.title||'Mission';}
function profileName(id){return state.profiles.find(p=>p.id===id)?.display_name||'Utilisateur OFFRYA';}
async function refresh(){
 if(!state.db){render();return;}
 const missionResult=await state.db.from('offrya_missions').select('*').order('created_at',{ascending:false}).limit(200);
 if(missionResult.error)throw missionResult.error;
 state.missions=missionResult.data||[];
 if(!state.session){state.profile=null;state.conversations=[];state.messages=[];state.prefs=null;state.wait=false;state.profiles=[];state.favorites=[];state.premium=null;state.boamp=[];render();return;}
 const uid=state.session.user.id;
 const [prof,conv,prefs,wait,profiles,favorites,premium]=await Promise.all([
  state.db.from('offrya_profiles').select('*').eq('id',uid).maybeSingle(),
  state.db.from('offrya_conversations').select('*').order('created_at',{ascending:false}).limit(100),
  state.db.from('offrya_alert_preferences').select('*').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_waitlist').select('user_id').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_profiles').select('id,display_name,role,city,specialty').limit(300),
  state.db.from('offrya_favorites').select('mission_id'),
  state.db.from('offrya_premium_requests').select('user_id,siret,legal_name,status,premium_until').eq('user_id',uid).maybeSingle()
 ]);
 for(const res of [prof,conv,prefs,wait,profiles,favorites,premium])if(res.error)throw res.error;
 state.profile=prof.data;state.premium=premium.data;state.conversations=conv.data||[];state.prefs=prefs.data;state.wait=Boolean(wait.data);state.profiles=profiles.data||[];state.favorites=(favorites.data||[]).map(x=>x.mission_id);
 if(state.thread&&!state.conversations.find(x=>x.id===state.thread))state.thread=null;
 if(state.thread)await loadMessages(state.thread,false);
 render();
}
function row(m,actions=''){return `<article class="data-item"><div class="item-top"><span class="tag">${esc(m.category)}</span><span class="muted tiny">${date(m.created_at)}</span></div><div class="item-title">${esc(m.title)}</div><div class="item-desc">${esc(m.description).slice(0,270)}</div><div class="meta-row"><span>⌖ ${esc(m.city)} (${esc(m.department)})</span><span>Budget : ${m.budget_cents?euro(m.budget_cents):'À définir'}</span><span>${m.status==='open'?'Ouverte':m.status==='awarded'?'Attribuée':'Fermée'}</span></div>${actions?`<div class="item-actions">${actions}</div>`:''}</article>`;}
function renderMissions(){
 let q=$('missionQuery').value.trim().toLowerCase(),c=$('missionCategory').value,d=$('missionDept').value.trim().toUpperCase();
 const matches=state.missions.filter(m=>m.status==='open'&&(!q||(m.title+' '+m.description+' '+m.city).toLowerCase().includes(q))&&(!c||m.category===c)&&(!d||m.department===d));
 $('missionsCount').textContent=matches.length+' mission(s)';
 $('missionList').innerHTML=matches.length?matches.map(m=>row(m,`<button class="button secondary micro-button" data-favorite="${esc(m.id)}" aria-pressed="${state.favorites.includes(m.id)}">${state.favorites.includes(m.id)?'★ Enregistrée':'☆ Favori'}</button> `+(state.profile?.role==='pro'&&m.owner_id!==state.session?.user.id?`<button class="button primary micro-button" data-contact="${esc(m.id)}">Contacter le client</button>`:m.owner_id===state.session?.user.id?`<span class="tag">Votre annonce</span> <button class="button secondary micro-button" data-close-mission="${esc(m.id)}">Clôturer</button>`:'<span class="tiny muted">Connectez-vous comme professionnel pour répondre</span>'))).join(''):'<div class="empty">Aucune mission ne correspond à ces critères. Élargissez votre recherche ou publiez une demande.</div>';
 $('dashMissions').innerHTML=state.missions.filter(m=>m.status==='open').slice(0,3).map(m=>row(m)).join('')||'<div class="empty">Aucune mission publiée pour le moment.</div>';
}
function renderInbox(){
 const items=state.conversations;
 $('conversationList').innerHTML=items.length?items.map(c=>`<button class="conv-item ${state.thread===c.id?'selected':''}" data-thread="${esc(c.id)}">${esc(titleForMission(c.mission_id))}<small>${esc(profileName(c.client_id===state.session?.user.id?c.professional_id:c.client_id))} · ${date(c.created_at)}</small></button>`).join(''):'<div class="empty">Aucune discussion. Un professionnel peut commencer un échange depuis une mission ouverte.</div>';
 $('messageForm').querySelector('button').disabled=!state.thread;
 $('threadTitle').textContent=state.thread?titleForMission(items.find(x=>x.id===state.thread)?.mission_id):'Sélectionnez une discussion';
 if(state.thread)renderMessages();else $('messageList').innerHTML='<div class="empty">Choisissez une discussion.</div>';
}
function renderMessages(){
 $('messageList').innerHTML=state.messages.length?state.messages.map(m=>`<div class="bubble ${m.sender_id===state.session?.user.id?'mine':''}">${esc(m.body)}<time>${date(m.created_at)} · ${new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):'<div class="empty">Commencez la conversation.</div>';
 $('messageList').scrollTop=$('messageList').scrollHeight;
}
function renderSettings(){
 const yes=Boolean(state.session),has=Boolean(state.profile);
 $('accountState').textContent=yes?`Compte : ${state.session.user.email}`:'Connectez-vous pour sauvegarder vos informations.';
 const f=$('profileForm');f.elements.display_name.value=state.profile?.display_name||'';f.elements.role.value=state.profile?.role||'client';f.elements.role.disabled=has;f.elements.city.value=state.profile?.city||'';f.elements.specialty.value=state.profile?.specialty||'';
 const p=$('preferencesForm');p.elements.missions_enabled.checked=state.prefs?.missions_enabled||false;p.elements.messages_enabled.checked=state.prefs?.messages_enabled||false;p.elements.department.value=state.prefs?.department||'';p.elements.category.value=state.prefs?.category||'';
 $('waitBtn').textContent=state.wait?'Quitter la liste d’attente':'Rejoindre la liste d’attente';$('waitState').textContent=state.wait?'Inscrit · sans paiement':'';
}

function canUsePremium(){
 return Boolean(state.session&&state.profile?.role==='pro'&&state.premium?.status==='verified'
 &&state.premium.premium_until&&Date.parse(state.premium.premium_until)>Date.now());
}
function renderPremium(){
 const allowed=canUsePremium();
 $('premiumGate').classList.toggle('hidden',allowed);
 $('premiumContent').classList.toggle('hidden',!allowed);
 $('premiumRequestForm').classList.add('hidden');
 $('premiumLogin').classList.add('hidden');
 if(allowed)return;
 state.boamp=[];state.boampOffset=0;state.boampTotal=0;
 const text=$('premiumGateText');
 if(!state.session){text.textContent='Connectez-vous pour découvrir les conditions d’accès.';$('premiumLogin').classList.remove('hidden');}
 else if(!state.profile){text.textContent='Créez d’abord un profil Professionnel depuis Mon compte.';}
 else if(state.profile.role!=='pro'){text.textContent='Votre profil est un compte Client. La rubrique Premium est réservée aux professionnels.';}
 else if(!state.premium){text.textContent='Vérifiez le SIRET officiel de votre entreprise, puis envoyez votre demande Premium.';$('premiumRequestForm').classList.remove('hidden');}
 else if(state.premium.status==='pending'){text.textContent='Demande reçue. Vérification de l’entreprise en attente : aucun paiement requis pendant la bêta.';}
 else if(state.premium.status==='rejected'){text.textContent='L’entreprise n’a pas été validée. Contactez OFFRYA pour une révision.';}
 else{text.textContent='Votre accès Premium est expiré ou suspendu. Contactez OFFRYA.';}
}
$('premiumLogin').onclick=()=>authModal(true);
$('verifySiret').onclick=async()=>{
 if(!requireRole('pro'))return;
 const f=$('premiumRequestForm'),siret=f.elements.siret.value.trim();
 $('companyCheck').textContent='Vérification du SIRET en cours…';
 f.dataset.verifiedSiret='';
 try{
  const {data:{session}}=await state.db.auth.getSession();
  if(!session)throw Error('Veuillez vous reconnecter.');
  const r=await fetch('/api/company/lookup?siret='+encodeURIComponent(siret),{headers:{Authorization:'Bearer '+session.access_token}});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'SIRET non vérifiable');
  f.elements.legal_name.value=data.legal_name;
  f.dataset.verifiedSiret=siret;
  $('companyCheck').textContent='Établissement actif confirmé : '+data.legal_name+' ('+data.establishment_city+'). Vérification du représentant à réaliser après la demande.';
 }catch(err){$('companyCheck').textContent=err.message;showError(err);}
};
$('premiumRequestForm').elements.siret.addEventListener('input',()=>{
 $('premiumRequestForm').dataset.verifiedSiret='';
 $('companyCheck').textContent='Vérifiez le SIRET avec le registre officiel avant de déposer la demande.';
});
$('premiumRequestForm').onsubmit=async e=>{
 e.preventDefault();if(!requireRole('pro'))return;
 const f=e.currentTarget,legal_name=f.elements.legal_name.value.trim(),siret=f.elements.siret.value.trim();
 if(!/^[0-9]{14}$/.test(siret))return toast('Le SIRET doit comporter 14 chiffres.');
 if(f.dataset.verifiedSiret!==siret)return toast('Vérifiez d’abord le SIRET sur le registre officiel.');
 if(legal_name!==f.elements.legal_name.value.trim())return toast('Nom légal invalide.');
 try{
  const result=await state.db.from('offrya_premium_requests').insert({user_id:state.session.user.id,legal_name,siret});
  if(result.error)throw result.error;
  toast('Demande envoyée. Vérification administrative nécessaire.');await refresh();
 }catch(err){showError(err);}
};

function render(){
 const yes=Boolean(state.session);$('authOpen').textContent=yes?state.session.user.email.split('@')[0]:'Se connecter';$('logout').classList.toggle('hidden',!yes);$('avatar').textContent=state.profile?.display_name?.[0]?.toUpperCase()||'V';
 $('statOpen').textContent=state.missions.filter(x=>x.status==='open').length;$('statMissions').textContent=state.missions.filter(x=>x.owner_id===state.session?.user.id).length;$('statConvos').textContent=state.conversations.length;$('statFavorites').textContent=state.favorites.length;
 $('dashActivity').innerHTML=yes?`<div class="data-item"><div class="item-title">${esc(state.profile?.display_name||'Profil à compléter')}</div><div class="item-desc">${state.profile?.role==='client'?'Compte client':'Compte professionnel'} · ${state.conversations.length} discussion(s)</div></div><div class="data-item"><div class="item-title">Contact direct et gratuit</div><div class="item-desc">Échangez dans la messagerie, puis organisez librement votre accord, les tarifs et le règlement avec l'autre partie. OFFRYA n'intervient pas dans la transaction.</div></div>`:'<div class="empty">Connectez-vous pour voir vos contacts et vos missions.</div>';
 renderMissions();renderInbox();renderSettings();renderPremium();
}
async function loadMessages(id,doRender=true){
 const r=await state.db.from('offrya_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true}).limit(200);
 if(r.error)throw r.error;state.messages=r.data||[];if(doRender){renderInbox();tab('inbox');}
}
$('missionSearch').onclick=renderMissions;
$('newMissionBtn').onclick=()=>{if(requireRole('client'))$('missionForm').scrollIntoView({behavior:'smooth'});};
$('missionForm').onsubmit=async e=>{e.preventDefault();if(!requireRole('client'))return;const f=e.currentTarget;const x=Object.fromEntries(new FormData(f));const amount=x.budget?Math.round(Number(x.budget)*100):null;
 try{const r=await state.db.from('offrya_missions').insert({owner_id:state.session.user.id,title:x.title.trim(),description:x.description.trim(),category:x.category,department:x.department.trim().toUpperCase(),city:x.city.trim(),budget_cents:amount});if(r.error)throw r.error;f.reset();toast('Mission publiée.');await refresh();}catch(err){showError(err);}};
$('missionList').onclick=async e=>{
 const btn=e.target.closest('[data-contact],[data-close-mission],[data-favorite]');if(!btn)return;
 if(btn.dataset.favorite){if(!requireAuth())return;const id=btn.dataset.favorite;try{const result=state.favorites.includes(id)?await state.db.from('offrya_favorites').delete().eq('user_id',state.session.user.id).eq('mission_id',id):await state.db.from('offrya_favorites').insert({user_id:state.session.user.id,mission_id:id});if(result.error)throw result.error;await refresh();toast(state.favorites.includes(id)?'Mission ajoutée aux favoris.':'Favori retiré.');}catch(err){showError(err);}return;}
 if(btn.dataset.closeMission){if(!confirm('Clôturer cette mission ? Elle ne sera plus visible dans les recherches, mais vos conversations resteront accessibles.'))return;try{const r=await state.db.rpc('offrya_close_mission',{p_id:btn.dataset.closeMission});if(r.error)throw r.error;await refresh();toast('Mission clôturée');}catch(err){showError(err);}return;}
 if(!requireRole('pro'))return;const mission=state.missions.find(m=>m.id===btn.dataset.contact);if(!mission)return;
 try{let c=state.conversations.find(c=>c.mission_id===mission.id&&c.professional_id===state.session.user.id);if(!c){const r=await state.db.from('offrya_conversations').insert({mission_id:mission.id,client_id:mission.owner_id,professional_id:state.session.user.id}).select().single();if(r.error){if(r.error.code==='23505'){await refresh();c=state.conversations.find(x=>x.mission_id===mission.id&&x.professional_id===state.session.user.id);}else throw r.error;}else c=r.data;}if(!c)throw Error('Discussion introuvable');state.thread=c.id;await loadMessages(c.id);await refresh();tab('inbox');}catch(err){showError(err);}
};
$('conversationList').onclick=async e=>{const btn=e.target.closest('[data-thread]');if(!btn)return;state.thread=btn.dataset.thread;try{await loadMessages(state.thread);}catch(err){showError(err);}};
$('messageForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth()||!state.thread)return;const f=e.currentTarget,body=f.elements.body.value.trim();if(!body)return;try{const r=await state.db.from('offrya_messages').insert({conversation_id:state.thread,sender_id:state.session.user.id,body});if(r.error)throw r.error;f.reset();await loadMessages(state.thread);}catch(err){showError(err);}};
$('profileForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;const f=e.currentTarget,x=Object.fromEntries(new FormData(f)),id=state.session.user.id;try{const r=state.profile?await state.db.from('offrya_profiles').update({display_name:x.display_name.trim(),city:x.city.trim(),specialty:x.specialty.trim()}).eq('id',id):await state.db.from('offrya_profiles').insert({id,role:x.role,display_name:x.display_name.trim(),city:x.city.trim(),specialty:x.specialty.trim()});if(r.error)throw r.error;toast('Profil enregistré');await refresh();}catch(err){showError(err);}};
$('preferencesForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;const f=e.currentTarget;const payload={user_id:state.session.user.id,missions_enabled:f.elements.missions_enabled.checked,messages_enabled:f.elements.messages_enabled.checked,department:f.elements.department.value.trim().toUpperCase(),category:f.elements.category.value};try{let r;if(state.prefs){delete payload.user_id;r=await state.db.from('offrya_alert_preferences').update(payload).eq('user_id',state.session.user.id);}else r=await state.db.from('offrya_alert_preferences').insert(payload);if(r.error)throw r.error;toast('Préférences enregistrées.');await refresh();}catch(err){showError(err);}};
$('waitBtn').onclick=async()=>{if(!requireAuth())return;try{const r=state.wait?await state.db.from('offrya_waitlist').delete().eq('user_id',state.session.user.id):await state.db.from('offrya_waitlist').insert({user_id:state.session.user.id});if(r.error)throw r.error;toast(state.wait?'Liste d’attente quittée.':'Inscription gratuite enregistrée.');await refresh();}catch(err){showError(err);}};
async function loadBoamp(append=false){if(!canUsePremium()){renderPremium();return;}if(!append){state.boampOffset=0;state.boamp=[];}$('boampCount').textContent='Chargement…';try{const qs=new URLSearchParams({q:$('boampKeyword').value.trim(),dept:$('boampDept').value.trim(),offset:String(state.boampOffset)});const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Session expirée.');
const r=await fetch('/api/annonces?'+qs,{headers:{Authorization:'Bearer '+session.access_token}});const data=await r.json();if(!r.ok)throw Error(data.error||'Source indisponible');state.boamp.push(...data.items);state.boampOffset+=data.items.length;state.boampTotal=data.total;$('boampCount').textContent=`${data.total} avis officiels`;$('boampList').innerHTML=state.boamp.map(m=>`<article class="data-item"><span class="tag">BOAMP OFFICIEL</span><div class="item-title">${esc(m.title)}</div><div class="item-desc">${esc(m.buyer)}</div><div class="meta-row"><span>Dépt. : ${esc(m.departments)}</span><span>Publié : ${date(m.published)}</span><span>Échéance : ${date(m.deadline)}</span></div><a class="button secondary micro-button" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Consulter l'avis officiel ↗</a></article>`).join('')||'<div class="empty">Aucune annonce correspondante.</div>';$('boampMore').classList.toggle('hidden',state.boampOffset>=data.total||!data.items.length);}catch(err){$('boampCount').textContent='Indisponible';$('boampList').innerHTML='<div class="empty">Le service officiel ne répond pas. Aucune donnée fictive n’est affichée.</div>';console.error(err);}}
$('boampSearch').onclick=()=>loadBoamp();$('boampMore').onclick=()=>loadBoamp(true);$('exportBoamp').onclick=async()=>{
 if(!canUsePremium())return renderPremium();
 try{
  const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Connexion requise.');
  const q=new URLSearchParams({q:$('boampKeyword').value,dept:$('boampDept').value});
  const r=await fetch('/api/export?'+q,{headers:{Authorization:'Bearer '+session.access_token}});
  if(!r.ok){const data=await r.json();throw Error(data.error||'Export impossible');}
  const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');
  a.href=url;a.download='offrya-boamp.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(err){showError(err);}
};
function authModal(show){$('authModal').classList.toggle('hidden',!show);}
$('authOpen').onclick=()=>{if(state.session){tab('settings');return;}authModal(true);};$('authClose').onclick=()=>authModal(false);$('authModal').onclick=e=>{if(e.target===$('authModal'))authModal(false);};
for(const b of document.querySelectorAll('[data-auth]'))b.onclick=()=>{state.authMode=b.dataset.auth;document.querySelectorAll('[data-auth]').forEach(x=>x.classList.toggle('active',x===b));$('authTitle').textContent=state.authMode==='signup'?'Créer un compte gratuit':state.authMode==='reset'?'Réinitialiser le mot de passe':'Se connecter';$('authSubmit').textContent=state.authMode==='signup'?'Créer le compte':state.authMode==='reset'?'Envoyer le lien':'Se connecter';$('authPasswordRow').classList.toggle('hidden',state.authMode==='reset');};
$('authForm').onsubmit=async e=>{e.preventDefault();if(!state.db)return showError(new Error('Supabase non configuré.'));const f=e.currentTarget,email=f.elements.email.value.trim(),password=f.elements.password.value;try{let r;if(state.authMode==='recover')r=await state.db.auth.updateUser({password});else if(state.authMode==='signup')r=await state.db.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});else if(state.authMode==='reset')r=await state.db.auth.resetPasswordForEmail(email,{redirectTo:location.origin});else r=await state.db.auth.signInWithPassword({email,password});if(r.error)throw r.error;authModal(false);toast(state.authMode==='signup'?'Vérifiez votre adresse e-mail pour activer le compte.':state.authMode==='reset'?'Consultez votre messagerie.':state.authMode==='recover'?'Mot de passe modifié.':'Connexion réussie.');await refresh();if(state.authMode==='signup')tab('settings');}catch(err){showError(err);}};
$('logout').onclick=async()=>{if(state.db)await state.db.auth.signOut();state.session=null;await refresh();toast('Déconnecté.');};
async function init(){
 const cfg=await fetch('/api/config').then(r=>r.json());
 if(cfg.supabaseUrl&&cfg.supabaseKey&&!cfg.supabaseUrl.includes('VOTRE')){
  state.db=createClient(cfg.supabaseUrl,cfg.supabaseKey);const {data}=await state.db.auth.getSession();state.session=data?.session||null;
  state.db.auth.onAuthStateChange((event,session)=>{state.session=session;if(event==='PASSWORD_RECOVERY'){state.authMode='recover';$('authTitle').textContent='Choisissez un nouveau mot de passe';$('authSubmit').textContent='Enregistrer le mot de passe';$('authPasswordRow').classList.remove('hidden');authModal(true);}setTimeout(()=>refresh().catch(showError),0);});
  try{await refresh();}catch(err){info('Supabase nécessite une configuration complète et les tables SQL. '+err.message,true);render();}
 }else{info('Mode installation : connectez un projet Supabase OFFRYA pour activer les comptes, les missions et les échanges. Le BOAMP est réservé aux professionnels Premium vérifiés.',true);render();}
 if(canUsePremium())await loadBoamp();
 const hash=location.hash.slice(1);if(['missions','boamp','inbox','settings'].includes(hash))tab(hash);
}
init().catch(showError);
