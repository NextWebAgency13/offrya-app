import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=n=>(Number(n||0)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const date=s=>s?new Date(s).toLocaleDateString('fr-FR'):'—';
const state={db:null,session:null,profile:null,missions:[],conversations:[],messages:[],prefs:null,profiles:[],favorites:[],thread:null,boamp:[],boampOffset:0,boampTotal:0,premium:null,subscription:null,manualIdentity:null,billingEnabled:false,identityEnabled:false,draft:null,proStep:1,proStepUserId:null,signupForPro:false,loaded:false,priorityAlerts:[],lastPriorityIds:null,authMode:'login'};
function toast(s){const t=$('toast');t.textContent=s;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),4300);}
function showError(e){const msg=e?.message||String(e);toast(msg);console.error(e);}
function info(s,error=false){$('alert').textContent=s;$('alert').classList.toggle('error',error);$('alert').classList.remove('hidden');}
const paths={dashboard:'/espace',missions:'/espace/missions',boamp:'/espace/marches-publics',professional:'/espace/professionnel',inbox:'/espace/messagerie',settings:'/espace/reglages'};
const pathsReverse=Object.fromEntries(Object.entries(paths).map(([name,p])=>[p,name]));
function tab(name,fromHistory=false){
 if(!$(name))return;
 document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.id===name));
 document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.tab===name));
 const titles={dashboard:'Tableau de bord',missions:'Mes missions',boamp:'Marchés publics',professional:'Espace professionnel',inbox:'Messagerie',settings:'Mon compte'};
 $('pageTitle').textContent=titles[name];$('breadcrumb').textContent='OFFRYA / '+titles[name].toUpperCase();
 if(!fromHistory&&location.pathname!==paths[name])history.pushState({tab:name},'',paths[name]);
 if(name==='boamp'&&canUsePremium()&&!state.boamp.length)loadBoamp();
 window.scrollTo({top:0,behavior:'smooth'});
}
window.addEventListener('popstate',()=>tab(pathsReverse[location.pathname]||'dashboard',true));
for(const n of document.querySelectorAll('[data-tab]'))n.addEventListener('click',()=>{tab(n.dataset.tab);if(n.dataset.action==='publish')location.assign('/deposer-une-mission');});
function isGuest(){return Boolean(state.session?.user?.is_anonymous);}
function requireAuth(){if(!state.db){toast('Le service de connexion est momentanément indisponible.');return false;}if(!state.session){location.assign('/connexion?next='+encodeURIComponent(location.pathname));return false;}return true;}
function requireRole(role){if(!requireAuth())return false;if(!state.profile){tab('settings');toast('Complétez votre profil avant de commencer.');return false;}if(role==='pro'&&(state.profile.role!=='pro'||!canUsePremium())){toast('Activez votre compte professionnel pour répondre aux missions.');tab('professional');return false;}return true;}
function titleForMission(id){return state.missions.find(m=>m.id===id)?.title||'Mission';}
function profileName(id){return state.profiles.find(p=>p.id===id)?.display_name||'Utilisateur OFFRYA';}
async function refresh(){
 if(!state.db){render();return;}
 if(!state.session){state.draft=null;state.proStep=1;state.proStepUserId=null;state.missions=[];state.profile=null;state.conversations=[];state.messages=[];state.prefs=null;state.profiles=[];state.favorites=[];state.premium=null;state.subscription=null;state.manualIdentity=null;state.boamp=[];state.priorityAlerts=[];state.lastPriorityIds=null;render();return;}
 const uid=state.session.user.id;
 // Par défaut : ne charger que les annonces dont ce compte est propriétaire.
 // Les annonces des tiers ne sont interrogées qu'après contrôle professionnel.
 state.missions=[];
 const owned=await state.db.from('offrya_missions').select('*').eq('owner_id',uid).order('created_at',{ascending:false}).limit(200);
 if(owned.error)throw owned.error;
 state.missions=owned.data||[];
 const [prof,conv,prefs,profiles,favorites,premium,subscription,draft,manualReview]=await Promise.all([
  state.db.from('offrya_profiles').select('*').eq('id',uid).maybeSingle(),
  state.db.from('offrya_conversations').select('*').order('created_at',{ascending:false}).limit(100),
  state.db.from('offrya_alert_preferences').select('*').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_profiles').select('id,display_name,role,city,specialty').limit(300),
  state.db.from('offrya_favorites').select('mission_id'),
  state.db.from('offrya_premium_requests').select('user_id,siret,legal_name,status,premium_until,identity_status,authority_status,representative_kind,registry_name_matched').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_premium_subscriptions').select('status,paid_through,stripe_customer_id').eq('user_id',uid).maybeSingle(),
   state.db.from('offrya_professional_drafts').select('step,siret,legal_name,representative_name,representative_capacity,representative_kind').eq('user_id',uid).maybeSingle(),
   state.db.from('offrya_manual_identity_requests').select('status,requested_at,updated_at').eq('user_id',uid).maybeSingle()
 ]);
 for(const res of [prof,conv,prefs,profiles,favorites,premium,subscription,draft,manualReview])if(res.error)throw res.error;
 state.profile=prof.data;state.premium=premium.data;state.subscription=subscription.data;state.draft=draft.data;state.manualIdentity=manualReview.data;state.conversations=conv.data||[];state.prefs=prefs.data;state.profiles=profiles.data||[];state.favorites=(favorites.data||[]).map(x=>x.mission_id);
 if(canUsePremium()){
  // La base RLS reste l'autorité : vérification officielle + abonnement en cours.
  const opportunities=await state.db.from('offrya_missions').select('*').eq('status','open').order('created_at',{ascending:false}).limit(200);
  if(opportunities.error)throw opportunities.error;
  const byId=new Map(state.missions.map(m=>[m.id,m]));
  for(const mission of opportunities.data||[])byId.set(mission.id,mission);
  state.missions=Array.from(byId.values()).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 }
 if(state.proStepUserId!==uid){state.proStepUserId=uid;state.proStep=Math.max(1,Math.min(3,Number(state.draft?.step||1)));}
 if(state.thread&&!state.conversations.find(x=>x.id===state.thread))state.thread=null;
 if(state.thread)await loadMessages(state.thread,false);
 await loadPriorityAlerts(false);
 state.loaded=true;render();
}
function row(m,actions=''){const status=m.status==='open'?'Ouverte':m.status==='awarded'?'Attribuée':'Clôturée';const place=[m.city,m.department].filter(Boolean).map(esc).join(' · ')||'Localisation à préciser';const summary=String(m.description||'').trim();return `<article class="data-item mission-listing" aria-label="Annonce : ${esc(m.title)}"><div class="item-top"><span class="tag mission-category">${esc(m.category||'Prestation')}</span><span class="mission-status ${m.status==='open'?'is-open':'is-closed'}">${status}</span></div><h3 class="item-title mission-listing-title">${esc(m.title)}</h3><p class="item-desc mission-listing-desc">${esc(summary.slice(0,260))}${summary.length>260?'…':''}</p><div class="meta-row mission-listing-meta"><span>⌖ ${place}</span><span>Budget : ${m.budget_cents?euro(m.budget_cents):'À définir'}</span><span>Publiée le ${date(m.created_at)}</span></div>${actions?`<div class="item-actions mission-listing-actions">${actions}</div>`:''}</article>`;}
function renderMissionDetail(m){
 const own=m.owner_id===state.session?.user?.id;
 if(!own&&!canUsePremium())return '<div class="empty">Accès réservé aux professionnels vérifiés et abonnés.</div>';
 const status=m.status==='open'?'Ouverte':m.status==='awarded'?'Attribuée':'Clôturée';
 const controls=own?'<span class="tag">Votre annonce</span>':m.status==='open'?`<button type="button" class="button primary" data-contact="${esc(m.id)}">Contacter le demandeur</button>`:'';
 return `<div class="mission-detail"><button type="button" class="mission-detail-back" data-back-missions>← Retour aux annonces</button><div class="mission-detail-head"><span class="tag mission-category">${esc(m.category||'Prestation')}</span><span class="mission-status ${m.status==='open'?'is-open':'is-closed'}">${status}</span></div><h3>${esc(m.title)}</h3><div class="mission-detail-meta"><span>⌖ ${esc([m.city,m.department].filter(Boolean).join(' · ')||'Localisation à préciser')}</span><span>Budget : ${m.budget_cents?euro(m.budget_cents):'À définir'}</span><span>Publiée le ${date(m.created_at)}</span></div><h4>Description de la mission</h4><p class="mission-detail-description">${esc(m.description||'Aucune description renseignée.')}</p><div class="mission-detail-actions">${controls}</div></div>`;
}
function renderMissions(){
 const uid=state.session?.user.id,canBrowse=canUsePremium();
 const visible=state.missions.filter(m=>m.owner_id===uid||canBrowse);
 let q=$('missionQuery').value.trim().toLowerCase(),c=$('missionCategory').value,d=$('missionDept').value.trim().toUpperCase();
 const matches=visible.filter(m=>(m.owner_id===uid||m.status==='open')&&(!q||(m.title+' '+m.description+' '+m.city).toLowerCase().includes(q))&&(!c||m.category===c)&&(!d||m.department===d));
 $('missionsCount').textContent=matches.length+(canBrowse?' mission(s) accessible(s)':' annonce(s) personnelle(s)');
 $('missionsListHeading').textContent=canBrowse?'Missions accessibles à mon compte Pro':'Mes annonces publiées';
 $('missionSearchFilters').classList.toggle('hidden',!canBrowse);
 $('missionAccessNotice').classList.toggle('hidden',canBrowse);
 const publisherReady=Boolean(state.session&&!isGuest()&&state.session.user.email_confirmed_at);
 $('missionForm').classList.toggle('hidden',!publisherReady);
 $('missionAccountNotice').classList.toggle('hidden',publisherReady);
 const detail=state.selectedMissionId?visible.find(m=>m.id===state.selectedMissionId&&(m.owner_id===uid||canBrowse)&& (m.owner_id===uid||m.status==='open')):null;
 if(state.selectedMissionId&&!detail)state.selectedMissionId=null;
 $('missionList').innerHTML=detail?renderMissionDetail(detail):matches.length?matches.map(m=>{
  const own=m.owner_id===uid;
  const actions=own?`<span class="tag">Votre annonce</span> ${m.status==='open'?`<button class="button secondary micro-button" data-close-mission="${esc(m.id)}">Clôturer</button>`:''}`:
   canBrowse?`<button class="button secondary micro-button" data-favorite="${esc(m.id)}" aria-pressed="${state.favorites.includes(m.id)}">${state.favorites.includes(m.id)?'★ Enregistrée':'☆ Favori'}</button> <button class="button primary micro-button" data-contact="${esc(m.id)}">Contacter le client</button>`:'';
  return row(m,`<button type="button" class="button secondary micro-button" data-view-mission="${esc(m.id)}">Voir l’annonce</button> ${actions}`);
 }).join(''):'<div class="empty">Vous n’avez pas encore publié de mission, ou aucun résultat ne correspond à vos critères. <a href="/deposer-une-mission">Publier ma première mission</a>.</div>';
 const preview=canBrowse?visible:visible.filter(m=>m.owner_id===uid);
 $('dashMissions').innerHTML=preview.filter(m=>m.status==='open').slice(0,3).map(m=>row(m)).join('')||'<div class="empty">Vous n’avez pas encore publié de mission. <a href="/deposer-une-mission">Publier ma première mission</a>.</div>';
}
function renderInbox(){
 const items=state.conversations;
 $('conversationList').innerHTML=items.length?items.map(c=>{const mine=c.client_id===state.session?.user.id;const contact=profileName(mine?c.professional_id:c.client_id);const selected=state.thread===c.id;return `<button type="button" class="conv-item offrya-conversation ${selected?'selected':''}" data-thread="${esc(c.id)}" aria-pressed="${selected}"><span class="offrya-conversation-icon" aria-hidden="true">${mine?'P':'D'}</span><span class="offrya-conversation-body"><strong>${esc(titleForMission(c.mission_id))}</strong><small>${mine?'Professionnel':'Demandeur'} : ${esc(contact)}</small><time datetime="${esc(c.created_at)}">Discussion ouverte le ${date(c.created_at)}</time></span><span class="offrya-conversation-chevron" aria-hidden="true">›</span></button>`;}).join(''):'<div class="empty">Aucune conversation pour le moment. Retrouvez vos échanges ici après une prise de contact au sujet d’une mission.</div>';
 $('messageForm').querySelector('button').disabled=!state.thread;
 const activeConversation=items.find(c=>c.id===state.thread);
 $('threadTitle').textContent=activeConversation?titleForMission(activeConversation.mission_id):'Sélectionnez une discussion';
 if($('threadContext'))$('threadContext').textContent=activeConversation?'Mission associée · '+(activeConversation.client_id===state.session?.user.id?'Échange avec un professionnel':'Échange avec un demandeur'):'Choisissez une conversation pour retrouver les messages associés à sa mission.';
 $('inbox').classList.toggle('has-active-thread',Boolean(activeConversation));
 if(state.thread)renderMessages();else $('messageList').innerHTML='<div class="empty">Choisissez une discussion.</div>';
}
function renderMessages(){
 $('messageList').innerHTML=state.messages.length?state.messages.map(m=>`<div class="bubble ${m.sender_id===state.session?.user.id?'mine':''}">${esc(m.body)}<time>${date(m.created_at)} · ${new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):'<div class="empty">Commencez la conversation.</div>';
 $('messageList').scrollTop=$('messageList').scrollHeight;
}
function renderSettings(){
 const yes=Boolean(state.session),has=Boolean(state.profile);
 $('accountState').textContent=!yes?'Un compte gratuit avec adresse e-mail confirmée est requis pour publier.':isGuest()?'Ancien suivi invité : vos missions publiées restent consultables sur cet appareil. Créez un compte gratuit pour publier de nouvelles missions.':`Compte : ${state.session.user.email}${canUsePremium()?' · Professionnel vérifié et abonné':''}`;
 const f=$('profileForm');f.elements.display_name.value=state.profile?.display_name||'';f.elements.role.value=state.profile?.role||'client';f.elements.role.disabled=isGuest()||(has&&state.profile?.role==='pro');f.elements.city.value=state.profile?.city||'';f.elements.specialty.value=state.profile?.specialty||'';
 $('filterStatus').textContent=state.prefs?.department||state.prefs?.category?'Filtres enregistrés.':'Aucun filtre défini. Sélectionnez un secteur ou un département.';
 const p=$('preferencesForm');p.elements.missions_enabled.checked=state.prefs?.missions_enabled||false;p.elements.messages_enabled.checked=state.prefs?.messages_enabled||false;p.elements.department.value=state.prefs?.department||'';p.elements.category.value=state.prefs?.category||'';
 const canManage=Boolean(state.session&&!isGuest()&&state.subscription?.stripe_customer_id);
 $('accountBillingPortal').disabled=!canManage;
 $('accountBillingInfo').textContent=!state.session?'Connectez-vous pour gérer votre abonnement.':canManage?'Votre abonnement est associé à un compte Stripe.':'Aucun abonnement Stripe associé à ce compte. En cas de difficulté, contactez le support.';
}

function canUsePremium(){
 const paid=state.subscription?.status==='active'&&Date.parse(state.subscription?.paid_through||'')>Date.now();
 return Boolean(state.session&&state.profile?.role==='pro'&&state.premium?.status==='verified'&&state.premium?.identity_status==='verified'&&state.premium?.authority_status==='verified'&&state.premium?.representative_kind==='dirigeant'&&state.premium?.registry_name_matched===true&&paid);
}
function renderPremium(){
 const allowed=canUsePremium(),pro=Boolean(state.session&&state.profile?.role==='pro');
 $('boampGate').classList.toggle('hidden',allowed);
 document.querySelectorAll('.nav-link[data-tab="boamp"]').forEach(el=>el.classList.toggle('hidden',!allowed));
 document.querySelectorAll('.nav-link[data-tab="professional"]').forEach(el=>el.classList.toggle('mobile-pro-replaced',allowed));
 $('premiumContent').classList.toggle('hidden',!allowed);
 $('proLanding').classList.toggle('hidden',Boolean(state.session));
 $('proWorkspace').classList.toggle('hidden',!pro);
 $('proEntryHeading').classList.toggle('hidden',Boolean(state.session));
 $('proStartNotice').classList.toggle('hidden',!state.session||pro);
 $('premiumLogin').classList.toggle('hidden',Boolean(state.session));
 $('proBegin').textContent=state.session?'Démarrer mon inscription professionnelle →':'Créer mon compte professionnel →';
 $('premiumGate').classList.toggle('hidden',allowed);
 $('proDashboard').classList.toggle('hidden',!allowed);
 if(!pro)return;
 const stage=allowed||state.premium?.status==='verified'?4:state.premium?3:Math.min(3,Math.max(1,state.proStep||1));
 $('proStatusPill').textContent=allowed?'Compte actif':stage===4?'Dossier approuvé':state.premium?(state.premium.status==='rejected'?'Dossier à régulariser':'Vérification en cours'):'Inscription en cours';
 for(const el of document.querySelectorAll('#proSteps li')){
  const n=Number(el.dataset.step);
  el.classList.toggle('active',n===stage&&!allowed);
  el.classList.toggle('complete',allowed||n<stage);
  if(n===stage&&!allowed)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
 }
 if(allowed){
  $('proSubscriptionState').textContent='Actif jusqu’au '+date(state.subscription.paid_through);
  return;
 }
 $('premiumGateText').textContent=stage<=3&&!state.premium?'Votre progression est sauvegardée dans votre espace privé. Vous pourrez reprendre votre demande plus tard.':'';
 for(const id of ['proStageCompany','proStageRepresentative','proStageReview','proStageBilling'])$(id).classList.add('hidden');
 const stages={1:'proStageCompany',2:'proStageRepresentative',3:'proStageReview',4:'proStageBilling'};
 $(stages[stage]).classList.remove('hidden');
 $('premiumRequestForm').classList.toggle('hidden',stage>2);
 if(stage<=3&&!state.premium){
  const f=$('premiumRequestForm'),d=state.draft;
  if(d){
   for(const name of ['siret','legal_name','representative_name','representative_capacity','representative_kind'])
    if(f.elements[name]&&!f.elements[name].value)f.elements[name].value=d[name]||'';
   if(f.elements.siret.value===d.siret&&d.legal_name){
    f.dataset.verifiedSiret=d.siret;
    $('companyCheck').textContent='Entreprise identifiée : '+d.legal_name+'. Vous pouvez continuer.';
   }
  }
 }
 if(stage===3){
  const submitted=Boolean(state.premium),identity=state.premium?.identity_status,authority=state.premium?.authority_status;
  $('proSubmitPanel').classList.toggle('hidden',submitted);
  $('proReviewPending').classList.toggle('hidden',!submitted);
  $('proReviewTitle').textContent=!submitted?'Confirmez votre dossier':state.premium?.status==='rejected'?'Votre dossier nécessite une régularisation':'Suivi des vérifications';
  $('proReviewDescription').textContent=submitted?'OFFRYA confirme votre identité et votre droit de représenter l’entreprise.':'Vérifiez les informations avant de transmettre votre demande. Aucun abonnement ne sera demandé avant approbation.';
  if(!submitted){
   const f=$('premiumRequestForm');
   $('proReviewCompany').textContent=f.elements.legal_name.value||state.draft?.legal_name||'Entreprise à vérifier';
   $('proReviewRepresentative').textContent=f.elements.representative_name.value||state.draft?.representative_name||'Représentant à renseigner';
  }else{
   $('proIdentityStatus').textContent=identity==='verified'?'Identité validée':state.manualIdentity?.status==='requested'?'Contrôle manuel demandé':state.manualIdentity?.status==='scheduled'?'Contrôle manuel planifié':state.manualIdentity?.status==='contacting'?'Prise de contact en cours':identity==='processing'?'Contrôle en ligne en cours':identity==='requires_input'?'Informations supplémentaires nécessaires':identity==='redacted'?'Vérification à renouveler':'À réaliser';
   $('proAuthorityStatus').textContent=authority==='verified'?'Dirigeant confirmé':authority==='rejected'?'Nom non concordant avec le registre':'Comparaison avec les dirigeants en attente';
   const legacyIneligible=state.premium.representative_kind!=='dirigeant';
   if(legacyIneligible){$('proReviewTitle').textContent='Compte professionnel réservé aux dirigeants';$('proReviewDescription').textContent='Seuls les dirigeants ou représentants légaux inscrits au registre peuvent souscrire. Un dossier salarié ou mandataire n’est pas éligible.';}
   const canStart=state.premium.status==='pending'&&identity!=='verified'&&!legacyIneligible;
   $('identityPanel').classList.toggle('hidden',!canStart);
   $('identityAutomatic').classList.toggle('hidden',!state.identityEnabled);
   $('identityStart').disabled=!state.identityEnabled;
   $('identityPanelText').textContent=identity==='processing'?'Votre contrôle en ligne est en cours ; vous pouvez rouvrir ou reprendre la session Stripe.':'Vous serez dirigé vers Stripe Identity pour vérifier votre document officiel.';
   const reviewStatus=state.manualIdentity?.status||null;
   const manualLabels={
    requested:'Demande reçue. OFFRYA doit vous contacter pour organiser le contrôle.',
    contacting:'Prise de contact en cours par OFFRYA.',
    scheduled:'Contrôle manuel planifié avec OFFRYA.',
    needs_information:'Des précisions sont nécessaires. Contactez le support OFFRYA.',
    completed:'Contrôle manuel réalisé. Votre dossier doit encore être validé selon les résultats.',
    rejected:'Demande non retenue. Contactez le support pour connaître les suites possibles.'
   };
   $('manualIdentityRequest').classList.toggle('hidden',Boolean(reviewStatus));
   $('manualIdentityRequest').disabled=!canStart;
   $('manualIdentityStatus').classList.toggle('hidden',!reviewStatus);
   $('manualIdentityStatus').textContent=manualLabels[reviewStatus]||'';
   $('manualIdentityDescription').textContent=state.identityEnabled?'Vous pouvez demander de l’assistance si le service document + selfie pose problème. L’approbation exige toujours le rapprochement avec un dirigeant officiel.':'La vérification du document et du selfie n’est pas encore configurée. Demandez de l’assistance ; aucune approbation n’est possible tant que ces contrôles et la correspondance au registre ne sont pas établis.';
   $('proReviewNotice').textContent=legacyIneligible?'Ce dossier ne peut pas accéder à OFFRYA Pro. Si votre qualité a été déclarée par erreur, contactez le support pour corriger le dossier.':state.premium.status==='rejected'?'Votre dossier a été refusé. Contactez le support pour connaître les informations à rectifier et demander un nouvel examen.':identity==='verified'&&authority!=='verified'?'Votre identité et votre selfie ont été contrôlés. OFFRYA vérifie maintenant la concordance avec le registre des dirigeants. Aucun paiement n’est demandé.':'Aucun paiement ni accès aux missions avant la validation complète de votre dossier.';
  }
 }
 if(stage===4){
  $('premiumSubscribe').disabled=!state.billingEnabled;
  $('premiumBillingStatus').textContent=state.billingEnabled?'Paiement sécurisé sur Stripe. L’accès s’active après confirmation du règlement.':'La souscription est momentanément indisponible. Le support peut vous renseigner.';
 }
}
$('proStartFromAccount').onclick=()=>{$('proBegin').click();};
$('premiumLogin').onclick=()=>authModal(true);
async function openStripePortal(){
 try{
  const {data:{session}}=await state.db.auth.getSession();
  if(!session)throw Error('Reconnexion nécessaire.');
  const r=await fetch('/api/billing/portal',{method:'POST',headers:{Authorization:'Bearer '+session.access_token}});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Portail Stripe indisponible');
  if(!/^https:\/\/billing\.stripe\.com\//.test(data.url))throw Error('Lien Stripe invalide');
  location.assign(data.url);
 }catch(err){showError(err);}
}
$('premiumPortal').onclick=openStripePortal;
$('accountBillingPortal').onclick=()=>{if(!state.session){authModal(true);return;}return openStripePortal();};
$('premiumSubscribe').onclick=async()=>{
 if(!state.billingEnabled||state.premium?.status!=='verified')return;
 if(!$('premiumTermsAck').checked){toast('Veuillez prendre connaissance des conditions d’abonnement avant de continuer.');return;}
 if(!confirm('Souscrire OFFRYA Professionnel à 34,99 € TTC par mois, avec renouvellement automatique et résiliation possible à tout moment ?'))return;
 try{
  const {data:{session}}=await state.db.auth.getSession();
  if(!session)throw Error('Veuillez vous connecter.');
  const r=await fetch('/api/billing/checkout',{method:'POST',headers:{Authorization:'Bearer '+session.access_token}});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Paiement indisponible');
  if(!/^https:\/\/checkout\.stripe\.com\//.test(data.url))throw Error('Lien Stripe invalide');
  location.assign(data.url);
 }catch(err){showError(err);}
};
// Private onboarding draft; never use it as authorization data.
async function saveProfessionalDraft(step){
 const f=$('premiumRequestForm');
 if(!state.session||state.profile?.role!=='pro')throw Error('Profil professionnel requis.');
 const record={user_id:state.session.user.id,step,siret:f.elements.siret.value.trim()||null,
 legal_name:f.elements.legal_name.value.trim()||null,
 representative_name:f.elements.representative_name.value.trim()||null,
 representative_kind:f.elements.representative_kind.value||null,
 representative_capacity:f.elements.representative_capacity.value.trim()||null,
 updated_at:new Date().toISOString()};
 const {error}=await state.db.from('offrya_professional_drafts').upsert(record,{onConflict:'user_id'});
 if(error)throw error;
 state.draft=record;state.proStep=step;renderPremium();
}
$('proBegin').onclick=async()=>{
 if(!state.db)return toast('Inscription momentanément indisponible.');
 if(!state.session||isGuest()){location.assign('/connexion?next=%2Fespace%2Fprofessionnel');return;}
 try{
  if(!state.profile){
   const display=state.session.user.email?.split('@')[0]?.slice(0,100)||'Professionnel';
   const {error}=await state.db.from('offrya_profiles').insert({id:state.session.user.id,role:'pro',display_name:display,city:'',specialty:''});
   if(error)throw error;
  }else if(state.profile.role==='client'){
   const {error}=await state.db.from('offrya_profiles').update({role:'pro'}).eq('id',state.session.user.id);
   if(error)throw error;
  }
  state.proStep=1;state.proStepUserId=state.session.user.id;
  await refresh();tab('professional');
 }catch(err){showError(err);}
};
$('proNextCompany').onclick=async()=>{
 const f=$('premiumRequestForm'),siret=f.elements.siret.value.trim();
 if(!/^[0-9]{14}$/.test(siret)||f.dataset.verifiedSiret!==siret||!f.elements.legal_name.value.trim())
  return toast('Vérifiez votre SIRET dans le registre officiel avant de continuer.');
 try{await saveProfessionalDraft(2);}catch(err){showError(err);}
};
$('proBackRepresentative').onclick=()=>{state.proStep=1;renderPremium();};
$('proNextRepresentative').onclick=async()=>{
 const f=$('premiumRequestForm'),name=f.elements.representative_name.value.trim(),capacity=f.elements.representative_capacity.value.trim(),kind=f.elements.representative_kind.value;
 if(f.dataset.verifiedSiret!==f.elements.siret.value.trim())return toast('Reprenez la vérification du SIRET.');
 if(name.length<4||name.length>120||capacity.length<3||capacity.length>100||kind!=='dirigeant')
  return toast('Complétez votre nom, votre fonction et votre situation.');
 try{await saveProfessionalDraft(3);}catch(err){showError(err);}
};
$('proBackReview').onclick=()=>{state.proStep=2;renderPremium();};
$('proSubmitRequest').onclick=()=>{
 const f=$('premiumRequestForm');
 if(f.dataset.verifiedSiret!==f.elements.siret.value.trim())return toast('Vérifiez le SIRET pour déposer votre demande.');
 if(!f.elements.representative_name.value.trim()||f.elements.representative_kind.value!=='dirigeant'||!f.elements.representative_capacity.value.trim())
  return toast('Complétez votre nom, votre situation et votre fonction.');
 f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
};
$('proRefreshStatus').onclick=async()=>{try{await refresh();toast('Statut actualisé.');}catch(err){showError(err);}};

$('verifySiret').onclick=async()=>{
 if(!requireAuth())return;
 if(!state.profile||state.profile.role!=='pro'){tab('settings');return toast('Activez votre profil professionnel avant de vérifier le SIRET.');}
 const f=$('premiumRequestForm'),siret=f.elements.siret.value.trim();
 $('companyCheck').textContent='Recherche dans le registre officiel…';
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
$('manualIdentityRequest').onclick=async()=>{
 if(!requireAuth())return;
 if(!state.session||isGuest()||state.profile?.role!=='pro'||state.premium?.status!=='pending')
  return toast('Un dossier professionnel en cours est nécessaire.');
 const button=$('manualIdentityRequest');
 button.disabled=true;
 try{
  const {error}=await state.db.from('offrya_manual_identity_requests').insert({user_id:state.session.user.id});
  if(error&&error.code!=='23505')throw error;
  toast('Demande d’assistance enregistrée.');
  await refresh();
 }catch(err){showError(err);button.disabled=false;}
};
$('identityStart').onclick=async()=>{
 if(!requireAuth())return;
 try{
  const {data:{session}}=await state.db.auth.getSession();
  if(!session)throw Error('Session expirée.');
  const result=await fetch('/api/identity/start',{method:'POST',headers:{Authorization:'Bearer '+session.access_token}});
  const body=await result.json();
  if(!result.ok)throw Error(body.error||'Vérification indisponible.');
  const link=new URL(body.url);
  if(link.protocol!=='https:'||link.hostname!=='verify.stripe.com')throw Error('Lien de vérification invalide.');
  location.assign(body.url);
 }catch(err){showError(err);}
};
$('premiumRequestForm').onsubmit=async e=>{
 e.preventDefault();if(!requireAuth())return;
 if(!state.profile||state.profile.role!=='pro'){tab('settings');return toast('Créez votre profil professionnel avant de demander la vérification.');}
 const f=e.currentTarget,siret=f.elements.siret.value.trim(),representative_name=f.elements.representative_name.value.trim(),representative_capacity=f.elements.representative_capacity.value.trim(),representative_kind=f.elements.representative_kind.value;
 if(!/^[0-9]{14}$/.test(siret))return toast('Le SIRET doit comporter 14 chiffres.');
 if(f.dataset.verifiedSiret!==siret)return toast('Vérifiez d’abord le SIRET sur le registre officiel.');
 if(representative_name.length<4||representative_capacity.length<3||representative_kind!=='dirigeant')return toast('Indiquez votre identité, situation et fonction.');
 try{
  const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Session expirée.');
  const r=await fetch('/api/company/verification-request',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({siret,representative_name,representative_capacity,representative_kind})});
  const response=await r.json();if(!r.ok)throw Error(response.error||'Vérification indisponible.');
  const {error:draftError}=await state.db.from('offrya_professional_drafts').delete().eq('user_id',state.session.user.id);
  if(draftError)console.warn('Draft cleanup:',draftError.message);
  state.draft=null;state.proStep=3;
  toast('Votre dossier est enregistré. Suivez les vérifications dans cet espace.');await refresh();
 }catch(err){showError(err);}
};

async function loadPriorityAlerts(shouldRender=true){
 if(!state.db||!state.session||!canUsePremium()){
  state.priorityAlerts=[];if(shouldRender)renderPriorityAlerts();return;
 }
 const r=await state.db.from('offrya_priority_alerts')
  .select('id,mission_id,created_at,seen_at,mission:offrya_missions(id,title,city,department,category,status)')
  .order('created_at',{ascending:false}).limit(30);
 if(r.error)throw r.error;
 state.priorityAlerts=(r.data||[]).filter(a=>a.mission?.status==='open');
 const currentIds=new Set(state.priorityAlerts.map(a=>a.id));
 if(state.lastPriorityIds&&state.priorityAlerts.some(a=>!a.seen_at&&!state.lastPriorityIds.has(a.id)))
   toast('Nouvelle mission prioritaire OFFRYA Professionnel disponible.');
 state.lastPriorityIds=currentIds;
 if(shouldRender)renderPriorityAlerts();
}
function renderPriorityAlerts(){
 const visible=canUsePremium();
 $('priorityAlertsPanel').classList.toggle('hidden',!visible);
 $('priorityAlertShortcut').classList.toggle('hidden',!visible);
 if(!visible)return;
 const alerts=state.priorityAlerts||[];
 const unread=alerts.filter(a=>!a.seen_at).length;
 $('priorityAlertCount').textContent=unread+' nouvelle(s)';
 $('priorityAlertBubble').textContent=String(unread);
 $('priorityAlertShortcut').setAttribute('aria-label',unread+' opportunité(s) prioritaires non consultée(s)');
 $('priorityAlertsList').innerHTML=alerts.length?alerts.map(a=>
  `<article class="data-item">
    <div class="item-top"><span class="tag">${a.seen_at?'Consultée':'NOUVELLE · PRIORITÉ PREMIUM'}</span><span class="muted tiny">${date(a.created_at)}</span></div>
    <div class="item-title">${esc(a.mission.title)}</div>
    <div class="meta-row"><span>${esc(a.mission.category)}</span><span>${esc(a.mission.city)} (${esc(a.mission.department)})</span></div>
    <div class="item-actions"><button class="button secondary micro-button" data-priority-open="${esc(a.id)}">Consulter cette mission</button></div>
  </article>`).join(''):'<div class="empty">Aucune mission correspondant à vos critères. <a href="/espace/reglages">Définir mes filtres</a>.</div>';
}
$('priorityAlertsList').onclick=async event=>{
 const button=event.target.closest('[data-priority-open]');if(!button||!canUsePremium())return;
 const alert=state.priorityAlerts.find(x=>x.id===button.dataset.priorityOpen);if(!alert)return;
 try{
  if(!alert.seen_at){
   const r=await state.db.from('offrya_priority_alerts').update({seen_at:new Date().toISOString()}).eq('id',alert.id);
   if(r.error)throw r.error;alert.seen_at=new Date().toISOString();
  }
  $('missionQuery').value=alert.mission.title;
  $('missionCategory').value='';
  $('missionDept').value='';
  renderMissions();renderPriorityAlerts();tab('missions');
 }catch(err){showError(err);}
};

function render(){
 const yes=Boolean(state.session);
 $('dashboardLoading').classList.toggle('hidden',state.loaded);
 $('homePrivateDashboard').classList.toggle('hidden',!state.loaded||!yes);
 document.querySelector('#dashboard .stats').classList.add('hidden');
 const eligiblePro=canUsePremium(),hasProProfile=state.profile?.role==='pro',proPending=hasProProfile&&!eligiblePro;
 $('roleClientView').classList.remove('hidden');
 $('rolePremiumView').classList.add('hidden');
 document.querySelector('#rolePremiumView .role-premium-stats').classList.toggle('hidden',!eligiblePro);
 document.querySelector('#rolePremiumView .role-pro-links').classList.toggle('hidden',!eligiblePro);
 document.body.dataset.offryaRole=hasProProfile?'professional':'client';
 const navMission=document.querySelector('.sidebar .nav-link[data-tab="missions"]');
 const navPro=document.querySelector('.sidebar .nav-link[data-tab="professional"]');
 const navBoamp=document.querySelector('.sidebar .nav-link[data-tab="boamp"]');
 if(navMission){const l=navMission.querySelector('span');if(l)l.textContent=eligiblePro?'Missions':'Mes missions';}
 if(navPro){navPro.dataset.action=!eligiblePro&&!proPending?'publish':'';const l=navPro.querySelector('span');if(l)l.textContent=!eligiblePro&&!proPending?'Déposer':'Espace pro';const u=navPro.querySelector('use');if(u)u.setAttribute('href',!eligiblePro&&!proPending?'#ic-plus':'#ic-shield');}
 if(navBoamp)navBoamp.classList.toggle('hidden',!eligiblePro);

 document.getElementById('roleLegacyDetails')?.classList.add('hidden');
 const own=state.missions.filter(m=>m.owner_id===state.session?.user?.id);
 $('clientStatPublished').textContent=String(own.length);
 $('clientStatOpen').textContent=String(own.filter(m=>m.status==='open').length);
 $('clientStatConversations').textContent=String(state.conversations.filter(c=>own.some(m=>m.id===c.mission_id)).length);
 $('clientStatClosed').textContent=String(own.filter(m=>m.status==='closed'||m.status==='awarded').length);
 $('roleRecentMissions').innerHTML=own.length?own.slice(0,3).map(m=>'<button type="button" class="role-mission-row" data-tab="missions"><span class="role-mission-icon">▣</span><span><strong>'+esc(m.title)+'</strong><small>'+esc(m.city||'France')+' · '+esc(m.status==='open'?'En cours':'Clôturée')+'</small></span><b aria-hidden="true">›</b></button>').join(''):'<p class="role-empty">Retrouvez vos annonces ici. Publiez votre première mission pour suivre son statut et les échanges avec les professionnels.</p>';
 $('roleBusinessName').textContent=state.premium?.legal_name||'Entreprise à vérifier';
 $('rolePremiumUntil').textContent=eligiblePro?(state.subscription?.paid_through?'Actif jusqu’au '+date(state.subscription.paid_through):'Abonnement actif'):'Accès en cours';
 $('roleCompanyVerifiedText').textContent=eligiblePro?'✓ Compte vérifié':'Vérification en cours';
 $('roleAvailableCount').textContent=state.missions.filter(m=>m.status==='open').length;
 $('roleOwnCount').textContent=state.conversations.filter(x=>x.professional_id===state.session?.user?.id).length;
 $('roleConversationCount').textContent=state.conversations.length;
 $('roleAlertCount').textContent=state.priorityAlerts?.length||0;

 const bottomPro=document.querySelector('.sidebar .nav-link[data-tab="professional"]');
 if(bottomPro){bottomPro.classList.toggle('mobile-pro-replaced',eligiblePro);bottomPro.dataset.action=!eligiblePro&&!proPending?'publish':'';const label=bottomPro.querySelector('span');if(label)label.textContent=!eligiblePro&&!proPending?'Déposer':'Espace pro';const icon=bottomPro.querySelector('use');if(icon)icon.setAttribute('href',!eligiblePro&&!proPending?'#ic-plus':'#ic-shield');}

 const banner=$('proVerificationBanner');const pro=state.profile?.role==='pro';
 banner.classList.add('hidden');
 if(pro){const p=state.premium;banner.textContent='Entreprise : '+(p?.legal_name||'à vérifier')+' · Identité : '+(p?.identity_status==='verified'?'vérifiée':'en cours')+' · Dirigeant : '+(p?.authority_status==='verified'?'confirmé':'en attente')+' · Abonnement : '+(canUsePremium()?'actif':'inactif');}
$('homePrivateDashboard').classList.toggle('hidden',!yes);$('statOpenLabel').textContent=canUsePremium()?'Missions accessibles':'Mes annonces actives';$('homeMissionHeading').textContent=canUsePremium()?'Missions accessibles':'Mes annonces publiées';$('authOpen').textContent=!yes?'Se connecter':isGuest()?'Suivi invité':(state.session.user.email?.split('@')[0]||'Mon compte');$('logout').classList.toggle('hidden',!yes||isGuest());$('avatar').textContent=state.profile?.display_name?.[0]?.toUpperCase()||'V';
 $('statOpen').textContent=state.missions.filter(x=>x.status==='open'&&(canUsePremium()||x.owner_id===state.session?.user.id)).length;$('statMissions').textContent=state.missions.filter(x=>x.owner_id===state.session?.user.id).length;$('statConvos').textContent=state.conversations.length;$('statFavorites').textContent=state.favorites.length;
 $('dashActivity').innerHTML=yes?`<div class="data-item"><div class="item-title">${esc(state.profile?.display_name||'Profil à compléter')}</div><div class="item-desc">${state.profile?.role==='client'?'Compte client':'Compte professionnel'} · ${state.conversations.length} discussion(s)</div></div><div class="data-item"><div class="item-title">Échanges directs entre utilisateurs</div><div class="item-desc">Échangez dans la messagerie, puis organisez librement votre accord, les tarifs et le règlement avec l'autre partie. OFFRYA n'intervient pas dans la transaction.</div></div>`:'<div class="empty">Connectez-vous pour voir vos contacts et vos missions.</div>';
 renderMissions();renderInbox();renderSettings();renderPremium();renderPriorityAlerts();
}
async function loadMessages(id,doRender=true){
 const r=await state.db.from('offrya_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true}).limit(200);
 if(r.error)throw r.error;state.messages=r.data||[];if(doRender){renderInbox();tab('inbox');}
}
$('missionSearch').onclick=renderMissions;
$('newMissionBtn').onclick=()=>location.assign('/deposer-une-mission');
async function ensureMissionPublisher(){
 if(!state.db)throw Error('Publication momentanément indisponible.');
 const {data,error}=await state.db.auth.getUser();
 const user=data?.user;
 if(error||!user||user.is_anonymous||!user.email||!user.email_confirmed_at)
  throw Error('Créez un compte gratuit et confirmez votre adresse e-mail avant de publier une mission.');
 const uid=user.id;
 const profile=await state.db.from('offrya_profiles').select('id').eq('id',uid).maybeSingle();
 if(profile.error)throw profile.error;
 if(!profile.data){
  const inserted=await state.db.from('offrya_profiles').insert({
   id:uid,role:'client',display_name:'Auteur de mission',city:'',specialty:''
  });
  if(inserted.error&&inserted.error.code!=='23505')throw inserted.error;
 }
 return uid;
}
$('missionForm').onsubmit=async e=>{
 e.preventDefault();
 const f=e.currentTarget;
 if(f.dataset.sending==='true')return;
 const x=Object.fromEntries(new FormData(f));
 const amount=x.budget?Math.round(Number(x.budget)*100):null;
 const button=f.querySelector('button[type="submit"]');
 f.dataset.sending='true';button.disabled=true;
 try{
  const uid=await ensureMissionPublisher();
  const r=await state.db.from('offrya_missions').insert({
   owner_id:uid,title:x.title.trim(),description:x.description.trim(),
   category:x.category,department:x.department.trim().toUpperCase(),
   city:x.city.trim(),budget_cents:amount
  });
  if(r.error)throw r.error;
  f.reset();await refresh();
  toast('Mission publiée gratuitement.');
  $('missionStatus').textContent='Mission publiée. Retrouvez-la dans Mes missions.';
  $('missionStatus').classList.remove('hidden');
 }catch(err){showError(err);}
 finally{delete f.dataset.sending;button.disabled=false;}
};
$('missionList').onclick=async e=>{
 const btn=e.target.closest('[data-back-missions],[data-view-mission],[data-contact],[data-close-mission],[data-favorite]');if(!btn)return;
 if(btn.hasAttribute('data-back-missions')){state.selectedMissionId=null;renderMissions();return;}
 if(btn.hasAttribute('data-view-mission')){const id=btn.dataset.viewMission;const mission=state.missions.find(m=>m.id===id);if(!mission||!(mission.owner_id===state.session?.user?.id||canUsePremium()&&mission.status==='open'))return;state.selectedMissionId=id;renderMissions();$('missionList').scrollIntoView({block:'start',behavior:'smooth'});return;}
 if(btn.dataset.favorite){if(!requireAuth())return;const id=btn.dataset.favorite;try{const result=state.favorites.includes(id)?await state.db.from('offrya_favorites').delete().eq('user_id',state.session.user.id).eq('mission_id',id):await state.db.from('offrya_favorites').insert({user_id:state.session.user.id,mission_id:id});if(result.error)throw result.error;await refresh();toast(state.favorites.includes(id)?'Mission ajoutée aux favoris.':'Favori retiré.');}catch(err){showError(err);}return;}
 if(btn.dataset.closeMission){if(!confirm('Clôturer cette mission ? Elle ne sera plus visible dans les recherches, mais vos conversations resteront accessibles.'))return;try{const r=await state.db.rpc('offrya_close_mission',{p_id:btn.dataset.closeMission});if(r.error)throw r.error;await refresh();toast('Mission clôturée');}catch(err){showError(err);}return;}
 if(!requireRole('pro'))return;const mission=state.missions.find(m=>m.id===btn.dataset.contact);if(!mission)return;
 try{let c=state.conversations.find(c=>c.mission_id===mission.id&&c.professional_id===state.session.user.id);if(!c){const r=await state.db.from('offrya_conversations').insert({mission_id:mission.id,client_id:mission.owner_id,professional_id:state.session.user.id}).select().single();if(r.error){if(r.error.code==='23505'){await refresh();c=state.conversations.find(x=>x.mission_id===mission.id&&x.professional_id===state.session.user.id);}else throw r.error;}else c=r.data;}if(!c)throw Error('Discussion introuvable');state.thread=c.id;await loadMessages(c.id);await refresh();tab('inbox');}catch(err){showError(err);}
};
$('inboxBackToList').onclick=()=>{$('inbox').classList.remove('has-active-thread');};
$('conversationList').onclick=async e=>{const btn=e.target.closest('[data-thread]');if(!btn)return;state.thread=btn.dataset.thread;renderInbox();try{await loadMessages(state.thread);}catch(err){showError(err);}};
$('messageForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth()||!state.thread)return;const f=e.currentTarget,body=f.elements.body.value.trim();if(!body)return;try{const r=await state.db.from('offrya_messages').insert({conversation_id:state.thread,sender_id:state.session.user.id,body});if(r.error)throw r.error;f.reset();await loadMessages(state.thread);}catch(err){showError(err);}};
$('profileForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;const f=e.currentTarget,x=Object.fromEntries(new FormData(f)),id=state.session.user.id;try{const r=state.profile?await state.db.from('offrya_profiles').update({display_name:x.display_name.trim(),city:x.city.trim(),specialty:x.specialty.trim(),...(state.profile.role==='client'&&x.role==='pro'?{role:'pro'}:{})}).eq('id',id):await state.db.from('offrya_profiles').insert({id,role:x.role,display_name:x.display_name.trim(),city:x.city.trim(),specialty:x.specialty.trim()});if(r.error)throw r.error;toast('Profil enregistré');await refresh();}catch(err){showError(err);}};
$('preferencesForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;const f=e.currentTarget;const payload={user_id:state.session.user.id,missions_enabled:f.elements.missions_enabled.checked,messages_enabled:f.elements.messages_enabled.checked,department:f.elements.department.value.trim().toUpperCase(),category:f.elements.category.value};try{let r;if(state.prefs){delete payload.user_id;r=await state.db.from('offrya_alert_preferences').update(payload).eq('user_id',state.session.user.id);}else r=await state.db.from('offrya_alert_preferences').insert(payload);if(r.error)throw r.error;toast('Préférences enregistrées.');await refresh();}catch(err){showError(err);}};
async function loadBoamp(append=false){if(!canUsePremium()){renderPremium();return;}if(!append){state.boampOffset=0;state.boamp=[];}$('boampCount').textContent='Recherche en cours';$('boampList').innerHTML='<div class="boamp-skeleton" aria-hidden="true"><div></div><div></div></div>';try{const qs=new URLSearchParams({q:$('boampKeyword').value.trim(),dept:$('boampDept').value.trim(),offset:String(state.boampOffset)});const {data:{session}}=await state.db.auth.getSession();if(!session)throw Error('Session expirée.');
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
$('authOpen').onclick=()=>{if(isGuest()){tab('missions');toast('Vos missions sont conservées dans cette session invitée sur cet appareil.');return;}if(state.session){tab('settings');return;}location.assign('/connexion?next='+encodeURIComponent(location.pathname));};$('authClose').onclick=()=>authModal(false);$('authModal').onclick=e=>{if(e.target===$('authModal'))authModal(false);};
for(const b of document.querySelectorAll('[data-auth]'))b.onclick=()=>{state.authMode=b.dataset.auth;document.querySelectorAll('[data-auth]').forEach(x=>x.classList.toggle('active',x===b));$('authTitle').textContent=state.authMode==='signup'?'Créer un compte':state.authMode==='reset'?'Réinitialiser le mot de passe':'Se connecter';$('authSubmit').textContent=state.authMode==='signup'?'Créer le compte':state.authMode==='reset'?'Envoyer le lien':'Se connecter';$('authPasswordRow').classList.toggle('hidden',state.authMode==='reset');};
$('authForm').onsubmit=async e=>{e.preventDefault();if(!state.db)return showError(new Error('Le service de connexion est momentanément indisponible.'));const f=e.currentTarget,email=f.elements.email.value.trim(),password=f.elements.password.value;try{let r;if(state.authMode==='recover')r=await state.db.auth.updateUser({password});else if(state.authMode==='signup')r=await state.db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/connexion?next='+encodeURIComponent(location.pathname)}});else if(state.authMode==='reset')r=await state.db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/connexion?mode=reset-password&next='+encodeURIComponent(location.pathname)});else r=await state.db.auth.signInWithPassword({email,password});if(r.error)throw r.error;authModal(false);toast(state.authMode==='signup'?'Vérifiez votre adresse e-mail pour activer le compte.':state.authMode==='reset'?'Consultez votre messagerie.':state.authMode==='recover'?'Mot de passe modifié.':'Connexion réussie.');await refresh();if(state.authMode==='signup'||state.signupForPro){tab(state.signupForPro?'professional':'settings');state.signupForPro=false;}}catch(err){showError(err);}};
$('logout').onclick=async()=>{if(state.db)await state.db.auth.signOut();state.session=null;location.replace('/connexion?next=%2Fespace');};
async function init(){
 const cfg=await fetch('/api/config').then(r=>r.json());state.billingEnabled=Boolean(cfg.billingEnabled);state.identityEnabled=Boolean(cfg.identityEnabled);
 if(cfg.supabaseUrl&&cfg.supabaseKey&&!cfg.supabaseUrl.includes('VOTRE')){
  state.db=createClient(cfg.supabaseUrl,cfg.supabaseKey);const {data}=await state.db.auth.getSession();state.session=data?.session||null;
   if(!state.session){location.replace('/connexion?next='+encodeURIComponent(location.pathname));return;}
  state.db.auth.onAuthStateChange((event,session)=>{state.session=session;if(event==='SIGNED_OUT'){location.replace('/connexion?next='+encodeURIComponent(location.pathname));return;}if(event==='PASSWORD_RECOVERY'){state.authMode='recover';$('authTitle').textContent='Choisissez un nouveau mot de passe';$('authSubmit').textContent='Enregistrer le mot de passe';$('authPasswordRow').classList.remove('hidden');authModal(true);}setTimeout(()=>refresh().catch(showError),0);});
  try{await refresh();}catch(err){state.loaded=true;info('Certaines fonctionnalités sont momentanément indisponibles. Veuillez réessayer ultérieurement.',true);render();}
 }else{info('La connexion au service est momentanément indisponible. Veuillez réessayer ultérieurement.',true);render();}
 if(canUsePremium())await loadBoamp();
 // La file est créée dans Supabase dès la publication; le navigateur vérifie les nouvelles alertes.
 setInterval(()=>{if(state.session&&canUsePremium()&&!document.hidden)loadPriorityAlerts().catch(console.error);},60000);
 tab(pathsReverse[location.pathname]||'dashboard',true);
  const p=new URLSearchParams(location.search);
  if(p.has('checkout'))toast(p.get('checkout')==='success'?'Retour de Stripe : confirmation du paiement en cours.':'Paiement non finalisé.');
  if(p.has('identity'))toast('Retour de Stripe Identity : consultez le statut de votre dossier.');
}
init().catch(showError);
