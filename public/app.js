import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import {validateMissionPhotos,uploadMissionPhotos} from './mission-photos.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=n=>(Number(n||0)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const date=s=>s?new Date(s).toLocaleDateString('fr-FR'):'—';
const missionEffectiveStatus=m=>m.status==='open'&&m.expires_at&&new Date(m.expires_at)<=new Date()?'expired':m.status;
const missionStatusLabel=m=>({open:'Ouverte',awarded:'Pourvue',closed:'Clôturée',expired:'Expirée'})[missionEffectiveStatus(m)]||'Indéterminée';
const urgencyLabel=u=>({normal:'Flexible',soon:'Prochainement',urgent:'Urgente'})[u]||'Flexible';
const state={db:null,session:null,profile:null,missions:[],conversations:[],messages:[],prefs:null,profiles:[],favorites:[],thread:null,boamp:[],boampOffset:0,boampTotal:0,premium:null,subscription:null,manualIdentity:null,billingEnabled:false,identityEnabled:false,draft:null,proStep:1,proStepUserId:null,signupForPro:false,publicPro:null,proProofs:[],loaded:false,priorityAlerts:[],lastPriorityIds:null,authMode:'login'};
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
 if(!state.session){state.draft=null;state.proStep=1;state.proStepUserId=null;state.missions=[];state.profile=null;state.conversations=[];state.messages=[];state.prefs=null;state.profiles=[];state.favorites=[];state.premium=null;state.subscription=null;state.manualIdentity=null;state.publicPro=null;state.proProofs=[];state.boamp=[];state.priorityAlerts=[];state.lastPriorityIds=null;render();return;}
 const uid=state.session.user.id;
 // Par défaut : ne charger que les annonces dont ce compte est propriétaire.
 // Les annonces des tiers ne sont interrogées qu'après contrôle professionnel.
 state.missions=[];
 const owned=await state.db.from('offrya_missions').select('*').eq('owner_id',uid).order('created_at',{ascending:false}).limit(200);
 if(owned.error)throw owned.error;
 state.missions=owned.data||[];
 const [prof,conv,prefs,profiles,favorites,premium,subscription,draft,manualReview,publicPro,proProofs]=await Promise.all([
  state.db.from('offrya_profiles').select('*').eq('id',uid).maybeSingle(),
  state.db.from('offrya_conversations').select('*').order('created_at',{ascending:false}).limit(100),
  state.db.from('offrya_alert_preferences').select('*').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_profiles').select('id,display_name,role,city,specialty').limit(300),
  state.db.from('offrya_favorites').select('mission_id'),
  state.db.from('offrya_premium_requests').select('user_id,siret,legal_name,status,premium_until,identity_status,authority_status,representative_kind,registry_name_matched').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_premium_subscriptions').select('status,paid_through,stripe_customer_id').eq('user_id',uid).maybeSingle(),
   state.db.from('offrya_professional_drafts').select('step,siret,legal_name,representative_name,representative_capacity,representative_kind').eq('user_id',uid).maybeSingle(),
   state.db.from('offrya_manual_identity_requests').select('status,requested_at,updated_at').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_public_pro_profiles').select('user_id,sectors,service_area,presentation,published').eq('user_id',uid).maybeSingle(),
  state.db.from('offrya_pro_proof_requests').select('kind,status,created_at').eq('professional_id',uid).order('created_at',{ascending:false}).limit(12)
 ]);
 for(const res of [prof,conv,prefs,profiles,favorites,premium,subscription,draft,manualReview,publicPro,proProofs])if(res.error)throw res.error;
 state.publicPro=publicPro.data;state.proProofs=proProofs.data||[];
 state.profile=prof.data;state.premium=premium.data;state.subscription=subscription.data;state.draft=draft.data;state.manualIdentity=manualReview.data;state.conversations=conv.data||[];state.prefs=prefs.data;state.profiles=profiles.data||[];state.favorites=(favorites.data||[]).map(x=>x.mission_id);
 if(canUsePremium()){
  // La base RLS reste l'autorité : vérification officielle + abonnement en cours.
  const opportunities=await state.db.from('offrya_missions').select('*').eq('status','open').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(200);
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
function row(m,actions=''){
 const extra=[m.area_sqm?'Surface : '+esc(m.area_sqm)+' m²':'',
  m.urgency?'Urgence : '+esc(urgencyLabel(m.urgency)):'',
  m.desired_date?'Date souhaitée : '+esc(date(m.desired_date)):'',
  m.place_type?'Lieu : '+esc(m.place_type):''].filter(Boolean).join(' · ');
 return `<article class="data-item"><div class="item-top"><span class="tag">${esc(m.category)}</span><span class="tag">${missionStatusLabel(m)}</span><span class="muted tiny">${date(m.created_at)}</span></div><div class="item-title">${esc(m.title)}</div><div class="item-desc">${esc(m.description).slice(0,270)}</div><div class="meta-row"><span>⌖ ${esc(m.city)} (${esc(m.department)})</span><span>Budget : ${m.budget_cents?euro(m.budget_cents):'À définir'}</span><span>${extra}</span></div><div class="item-actions"><button class="button secondary micro-button" data-show-photos="${esc(m.id)}">Voir photos</button><button class="button secondary micro-button" data-report-mission="${esc(m.id)}">Signaler</button>${actions}</div></article>`;
}
function renderMissions(){
 const uid=state.session?.user.id,canBrowse=canUsePremium();
 const visible=state.missions.filter(m=>m.owner_id===uid||canBrowse);
 let q=$('missionQuery').value.trim().toLowerCase(),c=$('missionCategory').value,d=$('missionDept').value.trim().toUpperCase();
 const matches=visible.filter(m=>(m.owner_id===uid||missionEffectiveStatus(m)==='open')&&(!q||(m.title+' '+m.description+' '+m.city).toLowerCase().includes(q))&&(!c||m.category===c)&&(!d||m.department===d));
 $('missionsCount').textContent=matches.length+(canBrowse?' mission(s) accessible(s)':' annonce(s) personnelle(s)');
 $('missionsListHeading').textContent=canBrowse?'Missions accessibles à mon compte Pro':'Mes annonces publiées';
 $('missionSearchFilters').classList.toggle('hidden',!canBrowse);
 $('missionAccessNotice').classList.toggle('hidden',canBrowse);
 const publisherReady=Boolean(state.session&&!isGuest()&&state.session.user.email_confirmed_at);
 $('missionForm').classList.toggle('hidden',!publisherReady);
 $('missionAccountNotice').classList.toggle('hidden',publisherReady);
 $('missionList').innerHTML=matches.length?matches.map(m=>{
  const own=m.owner_id===uid;
  const available=missionEffectiveStatus(m)==='open';
  const interested=state.conversations.filter(c=>c.mission_id===m.id&&c.client_id===uid);
  const eligibleProOptions=interested.map(c=>`<option value="${esc(c.professional_id)}">${esc(profileName(c.professional_id))}</option>`).join('');
  const award=available&&interested.length
    ?`<label class="mission-select-pro">Choisir un professionnel <select class="field" data-award-select="${esc(m.id)}"><option value="">Choisir dans mes échanges</option>${eligibleProOptions}</select></label><button class="button primary micro-button" data-award-mission="${esc(m.id)}">Attribuer</button>`:'';
  const actions=own
    ?`<span class="tag">Votre annonce</span> ${award}
       ${m.status!=='closed'? `<button class="button secondary micro-button" data-close-mission="${esc(m.id)}">Clôturer</button>`:''}
       ${m.status==='closed'&&m.selected_pro_id?`<button class="button secondary micro-button" data-review-mission="${esc(m.id)}">Donner un avis</button>`:''}`
    :available&&canBrowse?`<button class="button secondary micro-button" data-favorite="${esc(m.id)}" aria-pressed="${state.favorites.includes(m.id)}">${state.favorites.includes(m.id)?'★ Enregistrée':'☆ Favori'}</button><button class="button primary micro-button" data-contact="${esc(m.id)}">Contacter le client</button>`:'';
  return row(m,actions);
 }).join(''):'<div class="empty">Vous n’avez pas encore publié de mission, ou aucun résultat ne correspond à vos critères. <a href="/deposer-une-mission">Publier ma première mission</a>.</div>';
 const preview=canBrowse?visible:visible.filter(m=>m.owner_id===uid);
 $('dashMissions').innerHTML=preview.filter(m=>missionEffectiveStatus(m)==='open').slice(0,3).map(m=>row(m)).join('')||'<div class="empty">Vous n’avez pas encore publié de mission. <a href="/deposer-une-mission">Publier ma première mission</a>.</div>';
}
function renderInbox(){
 const items=state.conversations;
 $('conversationList').innerHTML=items.length?items.map(c=>`<button class="conv-item ${state.thread===c.id?'selected':''}" data-thread="${esc(c.id)}">${esc(titleForMission(c.mission_id))}<small>${esc(profileName(c.client_id===state.session?.user.id?c.professional_id:c.client_id))} · ${date(c.created_at)}</small></button>`).join(''):'<div class="empty">Aucune conversation. <a href="/espace/missions">Consulter mes missions</a>.</div>';
 $('messageForm').querySelector('button').disabled=!state.thread;
 $('threadTitle').textContent=state.thread?titleForMission(items.find(x=>x.id===state.thread)?.mission_id):'Sélectionnez une discussion';
 if(state.thread)renderMessages();else $('messageList').innerHTML='<div class="empty">Choisissez une discussion.</div>';
}
function renderMessages(){
 $('messageList').innerHTML=state.messages.length?state.messages.map(m=>`<div class="bubble ${m.sender_id===state.session?.user.id?'mine':''}">${esc(m.body)}<time>${date(m.created_at)} · ${new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time><button type="button" class="button secondary micro-button" data-report-message="${esc(m.id)}">Signaler</button></div>`).join(''):'<div class="empty">Commencez la conversation.</div>';
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
 $('premiumContent').classList.toggle('hidden',!allowed);
 $('professionalPublicCard').classList.toggle('hidden',!pro);
 if(pro){
  const form=$('publicProForm'),card=state.publicPro;
  form.elements.sectors.value=(card?.sectors||[]).join(', ');
  form.elements.service_area.value=card?.service_area||'';
  form.elements.presentation.value=card?.presentation||'';
  form.elements.published.checked=Boolean(card?.published);
  $('proProofList').innerHTML=state.proProofs.map(p=>`<div class="data-item"><strong>${esc(({decennale:'Assurance décennale',rge:'RGE',qualibat:'Qualibat'})[p.kind]||p.kind)}</strong><small> · ${esc(({pending:'En cours de vérification',verified:'Vérifié',rejected:'Refusé'})[p.status]||'À examiner')}</small></div>`).join('')||'<p class="muted">Aucun justificatif transmis.</p>';
 }
 $('proLanding').classList.toggle('hidden',pro);
 $('proWorkspace').classList.toggle('hidden',!pro);
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
   toast('Nouvelle mission prioritaire OFFRYA Premium disponible.');
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
 document.querySelector('#dashboard .stats').classList.toggle('hidden',!state.loaded||!yes);
 const banner=$('proVerificationBanner');const pro=state.profile?.role==='pro';
 banner.classList.toggle('hidden',!pro);
 if(pro){const p=state.premium;banner.textContent='Entreprise : '+(p?.legal_name||'à vérifier')+' · Identité : '+(p?.identity_status==='verified'?'vérifiée':'en cours')+' · Dirigeant : '+(p?.authority_status==='verified'?'confirmé':'en attente')+' · Abonnement : '+(canUsePremium()?'actif':'inactif');}
$('homePrivateDashboard').classList.toggle('hidden',!yes);$('statOpenLabel').textContent=canUsePremium()?'Missions accessibles':'Mes annonces actives';$('homeMissionHeading').textContent=canUsePremium()?'Missions accessibles':'Mes annonces publiées';$('authOpen').textContent=!yes?'Se connecter':isGuest()?'Suivi invité':(state.session.user.email?.split('@')[0]||'Mon compte');$('logout').classList.toggle('hidden',!yes||isGuest());$('avatar').textContent=state.profile?.display_name?.[0]?.toUpperCase()||'V';
 $('statOpen').textContent=state.missions.filter(x=>missionEffectiveStatus(x)==='open'&&(canUsePremium()||x.owner_id===state.session?.user.id)).length;$('statMissions').textContent=state.missions.filter(x=>x.owner_id===state.session?.user.id).length;$('statConvos').textContent=state.conversations.length;$('statFavorites').textContent=state.favorites.length;
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
 const files=Array.from(f.elements.photos?.files||[]);
 const amount=x.budget?Math.round(Number(x.budget)*100):null;
 const button=f.querySelector('button[type="submit"]');
 f.dataset.sending='true';button.disabled=true;
 try{
  const uid=await ensureMissionPublisher();
  validateMissionPhotos(files);
  if(x.desired_date&&x.desired_date<new Date().toISOString().slice(0,10))throw Error('Date souhaitée passée.');
  const r=await state.db.from('offrya_missions').insert({
   owner_id:uid,title:x.title.trim(),description:x.description.trim(),
   category:x.category,department:x.department.trim().toUpperCase(),
   city:x.city.trim(),budget_cents:amount,
   area_sqm:x.area_sqm?Number(x.area_sqm):null,urgency:x.urgency||'normal',
   desired_date:x.desired_date||null,place_type:x.place_type||null
  }).select('id').single();
  if(r.error)throw r.error;
  let warning='';
  if(files.length)try{await uploadMissionPhotos(state.db,files,uid,r.data.id);}
  catch(error){warning=' Mission enregistrée, mais certaines photos ont échoué : '+error.message;}
  f.reset();await refresh();
  toast('Mission publiée gratuitement.'+warning);
  $('missionStatus').textContent='Mission publiée. Retrouvez-la dans Mes missions.';
  $('missionStatus').classList.remove('hidden');
 }catch(err){showError(err);}
 finally{delete f.dataset.sending;button.disabled=false;}
};
async function showMissionPhotos(id){
 if(!requireAuth())return;
 const dialog=$('missionPhotoDialog'),gallery=$('missionPhotoGallery');
 gallery.replaceChildren();
 const loading=document.createElement('p');loading.textContent='Chargement des photos privées…';gallery.append(loading);
 dialog.showModal();
 try{
  const r=await state.db.from('offrya_mission_photos').select('object_path').eq('mission_id',id).limit(6);
  if(r.error)throw r.error;
  gallery.replaceChildren();
  if(!r.data?.length){gallery.textContent='Aucune photo jointe à cette mission.';return;}
  for(const photo of r.data){
   const result=await state.db.storage.from('offrya-mission-images').createSignedUrl(photo.object_path,90);
   if(result.error)throw result.error;
   const img=document.createElement('img');img.src=result.data.signedUrl;img.alt='Photo associée à la mission (accès privé)';
   img.loading='lazy';gallery.append(img);
  }
 }catch(error){gallery.textContent='Impossible de consulter ces photos. Vérifiez votre accès professionnel.';console.error(error);}
}
function openReport(type,id){
 if(!requireAuth())return;
 const form=$('reportForm');form.elements.target_type.value=type;form.elements.target_id.value=id;
 form.elements.reason.value='spam';form.elements.details.value='';
 $('reportStatus').textContent='';$('reportDialog').showModal();
}
function openReview(id){
 if(!requireAuth())return;
 const form=$('reviewForm');form.elements.mission_id.value=id;
 form.elements.rating.value='5';form.elements.comment.value='';
 $('reviewStatus').textContent='';$('reviewDialog').showModal();
}
$('reportCancel').onclick=()=>$('reportDialog').close();
$('reviewCancel').onclick=()=>$('reviewDialog').close();
$('reportForm').onsubmit=async event=>{
 event.preventDefault();if(!requireAuth())return;
 const form=event.currentTarget,submit=form.querySelector('[type="submit"]');
 submit.disabled=true;
 try{
  const r=await state.db.from('offrya_reports').insert({
   reporter_id:state.session.user.id,target_type:form.elements.target_type.value,
   target_id:form.elements.target_id.value,reason:form.elements.reason.value,
   details:form.elements.details.value.trim()
  });
  if(r.error)throw r.error;
  $('reportDialog').close();toast('Signalement transmis à la modération OFFRYA.');
 }catch(error){$('reportStatus').textContent=error.code==='23505'?'Vous avez déjà signalé ce contenu.':'Signalement impossible : '+(error.message||'erreur');}
 finally{submit.disabled=false;}
};
$('reviewForm').onsubmit=async event=>{
 event.preventDefault();if(!requireAuth())return;
 const form=event.currentTarget,submit=form.querySelector('[type="submit"]'),id=form.elements.mission_id.value;
 const mission=state.missions.find(m=>m.id===id&&m.owner_id===state.session.user.id);
 if(!mission||mission.status!=='closed'||!mission.selected_pro_id){$('reviewStatus').textContent='Terminez d’abord une mission attribuée.';return;}
 submit.disabled=true;
 try{
  const r=await state.db.from('offrya_reviews').insert({
   mission_id:id,client_id:state.session.user.id,professional_id:mission.selected_pro_id,
   rating:Number(form.elements.rating.value),comment:form.elements.comment.value.trim()
  });
  if(r.error)throw r.error;
  $('reviewDialog').close();toast('Votre avis a été publié.');
 }catch(error){$('reviewStatus').textContent='Avis impossible : mission attribuée, terminée et échange réel des deux parties requis.';console.error(error);}
 finally{submit.disabled=false;}
};
$('missionList').onclick=async e=>{
 const btn=e.target.closest('[data-contact],[data-close-mission],[data-favorite],[data-award-mission],[data-show-photos],[data-report-mission],[data-review-mission]');if(!btn)return;
 if(btn.dataset.showPhotos){await showMissionPhotos(btn.dataset.showPhotos);return;}
 if(btn.dataset.reportMission){openReport('mission',btn.dataset.reportMission);return;}
 if(btn.dataset.reviewMission){openReview(btn.dataset.reviewMission);return;}
 if(btn.dataset.awardMission){const id=btn.dataset.awardMission,select=document.querySelector('[data-award-select="'+id+'"]');const pro=select?.value;if(!pro)return toast('Choisissez un professionnel avec lequel vous avez échangé.');if(!confirm('Attribuer cette mission au professionnel sélectionné ?'))return;try{const r=await state.db.rpc('offrya_award_mission',{p_mission:id,p_professional:pro});if(r.error)throw r.error;if(!r.data)throw Error('Attribution impossible : échange réciproque ou mission ouverte requis.');await refresh();toast('Mission pourvue.');}catch(err){showError(err);}return;}
 if(btn.dataset.favorite){if(!requireAuth())return;const id=btn.dataset.favorite;try{const result=state.favorites.includes(id)?await state.db.from('offrya_favorites').delete().eq('user_id',state.session.user.id).eq('mission_id',id):await state.db.from('offrya_favorites').insert({user_id:state.session.user.id,mission_id:id});if(result.error)throw result.error;await refresh();toast(state.favorites.includes(id)?'Mission ajoutée aux favoris.':'Favori retiré.');}catch(err){showError(err);}return;}
 if(btn.dataset.closeMission){if(!confirm('Clôturer cette mission ? Elle ne sera plus visible dans les recherches, mais vos conversations resteront accessibles.'))return;try{const r=await state.db.rpc('offrya_finish_mission',{p_mission:btn.dataset.closeMission});if(r.error)throw r.error;if(!r.data)throw Error('Clôture non autorisée.');await refresh();toast('Mission clôturée');}catch(err){showError(err);}return;}
 if(!requireRole('pro'))return;const mission=state.missions.find(m=>m.id===btn.dataset.contact);if(!mission)return;
 try{let c=state.conversations.find(c=>c.mission_id===mission.id&&c.professional_id===state.session.user.id);if(!c){const r=await state.db.from('offrya_conversations').insert({mission_id:mission.id,client_id:mission.owner_id,professional_id:state.session.user.id}).select().single();if(r.error){if(r.error.code==='23505'){await refresh();c=state.conversations.find(x=>x.mission_id===mission.id&&x.professional_id===state.session.user.id);}else throw r.error;}else c=r.data;}if(!c)throw Error('Discussion introuvable');state.thread=c.id;await loadMessages(c.id);await refresh();tab('inbox');}catch(err){showError(err);}
};
$('conversationList').onclick=async e=>{const btn=e.target.closest('[data-thread]');if(!btn)return;state.thread=btn.dataset.thread;try{await loadMessages(state.thread);}catch(err){showError(err);}};
$('messageList').onclick=event=>{const button=event.target.closest('[data-report-message]');if(button)openReport('message',button.dataset.reportMessage);};
$('messageForm').onsubmit=async e=>{e.preventDefault();if(!requireAuth()||!state.thread)return;const f=e.currentTarget,body=f.elements.body.value.trim();if(!body)return;try{const r=await state.db.from('offrya_messages').insert({conversation_id:state.thread,sender_id:state.session.user.id,body});if(r.error)throw r.error;f.reset();await loadMessages(state.thread);}catch(err){showError(err);}};
$('publicProForm').onsubmit=async e=>{
 e.preventDefault();if(!requireAuth()||state.profile?.role!=='pro')return;
 const form=e.currentTarget;
 const sectors=[...new Set(form.elements.sectors.value.split(',').map(s=>s.trim()).filter(Boolean))];
 const permitted=['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Autre'];
 if(sectors.some(s=>!permitted.includes(s))){$('publicProStatus').textContent='Secteurs autorisés : '+permitted.join(', ');return;}
 try{
  const row={user_id:state.session.user.id,sectors,
   service_area:form.elements.service_area.value.trim(),
   presentation:form.elements.presentation.value.trim(),
   published:form.elements.published.checked,updated_at:new Date().toISOString()};
  const r=await state.db.from('offrya_public_pro_profiles').upsert(row,{onConflict:'user_id'});
  if(r.error)throw r.error;
  await refresh();
  $('publicProStatus').textContent='Fiche enregistrée. Publication seulement après vérification professionnelle.';
 }catch(error){$('publicProStatus').textContent='Enregistrement impossible : '+(error.message||'erreur');}
};
$('proProofForm').onsubmit=async event=>{
 event.preventDefault();if(!requireAuth()||state.profile?.role!=='pro')return;
 const form=event.currentTarget,file=form.elements.proof.files?.[0],kind=form.elements.kind.value,button=form.querySelector('[type="submit"]');
 if(!file||!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>10485760||file.size<1){
  $('proProofStatus').textContent='PDF, JPEG ou PNG de 10 Mo maximum requis.';return;
 }
 button.disabled=true;
 try{
  const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[file.type];
  const object_path=state.session.user.id+'/'+crypto.randomUUID()+'.'+ext;
  const upload=await state.db.storage.from('offrya-pro-proofs').upload(object_path,file,{contentType:file.type,upsert:false});
  if(upload.error)throw upload.error;
  const r=await state.db.from('offrya_pro_proof_requests').insert({professional_id:state.session.user.id,kind,object_path});
  if(r.error)throw r.error;
  await refresh();form.reset();$('proProofStatus').textContent='Justificatif transmis. Badge en attente de validation OFFRYA.';
 }catch(error){$('proProofStatus').textContent='Transmission impossible : '+(error.message||'erreur');}
 finally{button.disabled=false;}
};
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
