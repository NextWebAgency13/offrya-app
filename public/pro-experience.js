import {buildRadar} from './radar.js';
// OFFRYA Pro UI v3 — visual redesign on top of existing secured modules.
// Only authenticated, server/RLS-authorized data is displayed. No demo rows.
export function createProExperience({state,element,canUsePremium,tab,renderMissions,loadMarkets,notify,openProposal}){
 const $=element;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const menu=[
  ['home','Tableau de bord','ic-dashboard'],
  ['requests','Demandes de missions','ic-missions'],
  ['boamp','Marchés publics','ic-boamp'],
  ['watch','Veille automatisée','ic-bolt'],
  ['tracking','Suivi & performances','ic-check'],
  ['assistant','Assistant IA','ic-sparkles'],
  ['inbox','Messagerie','ic-inbox'],
  ['preferences','Préférences de veille','ic-settings'],
  ['settings','Paramètres','ic-user']
 ];
 const primaryMenu=[
  ['home','Trouver des missions','ic-dashboard'],
  ['requests','Proposer mes services','ic-missions'],
  ['tracking','Gérer mon activité','ic-check']
 ];
 const secondaryMenu=menu.filter(item=>!['home','requests','tracking','assistant'].includes(item[0]));
 let initialized=false,view='home',uid=null;
 let serverRadar=null,radarKey='',radarAt=0,radarLoading=false;
 async function loadMatchedRadar(key,user){
  if(radarLoading||!canUsePremium()||!user)return;
  radarLoading=true;
  try{
   const session=(await state.db.auth.getSession()).data?.session;
   if(!session||session.user?.id!==user)return;
   const response=await fetch('/api/pro/matches',{
    headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
   if(!response.ok)throw Error('Correspondance HTTP '+response.status);
   const data=await response.json();
   if(!Array.isArray(data.items)||!['ai','rules'].includes(data.mode))throw Error('Format incorrect');
   if(state.session?.user?.id!==user||key!==radarKey||!canUsePremium())return;
   serverRadar=data;
   recommendations();
  }catch(error){
   console.warn('OFFRYA: classement distant indisponible, secours local',error);
  }finally{if(key===radarKey)radarAt=Date.now();radarLoading=false;}
 }

 function icon(name){return '<svg class="nav-icon" aria-hidden="true"><use href="#'+name+'"/></svg>';}
 function alertIcon(screen){
  const shapes={
   requests:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a21 21 0 0 0 18 0"/><rect x="10.5" y="12" width="3" height="3" rx="0.5"/>',
   watch:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
   tracking:'<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M13 3l5 5v3M13 3v5h5M8 12h6M8 16h3"/><circle cx="17" cy="17" r="4"/><path d="m15.5 17 1 1 2-2"/>'
  };
  return '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(shapes[screen]||shapes.requests)+'</svg>';
 }
 function caption(v){return '<span>'+esc(v)+'</span>';}
 function navButton(item){return '<button type="button" class="pro-v3-nav-btn" data-pro-screen="'+item[0]+'">'+icon(item[2])+'<span>'+esc(item[1])+'</span><span class="pro-v3-nav-count" data-pro-count="'+item[0]+'" hidden></span></button>';}
 function makeMarkup(){
  const nav=document.createElement('nav');nav.id='proV3Sidebar';nav.className='pro-v3-sidebar-nav';nav.setAttribute('aria-label','Navigation professionnelle');nav.innerHTML=primaryMenu.map(navButton).join('');
  $('nav').after(nav);
  const badge=document.createElement('div');badge.id='proV3SidePlan';badge.className='pro-v3-side-plan';
  badge.innerHTML='<strong>♛ Offre professionnelle</strong><span id="proV3PlanState">Accès en cours</span><small>34,99 € TTC / mois</small><button type="button" data-pro-screen="settings">Gérer mon abonnement →</button>';
  nav.after(badge);
  // Secondary Pro screens appear in the existing mobile account menu.
  const accountPanel=document.querySelector('#accountMenu .account-menu-panel');
  if(accountPanel&&!accountPanel.querySelector('#proV3AccountTools')){
   const tools=document.createElement('nav');tools.id='proV3AccountTools';tools.className='pro-v3-account-tools';
   tools.setAttribute('aria-label','Outils professionnels');
   tools.innerHTML='<strong class="pro-v3-account-title">Outils professionnels</strong>'+secondaryMenu.map(navButton).join('');
   accountPanel.prepend(tools);
  }
  const accountMenu=document.getElementById('accountMenu');
  const alertButton=document.createElement('button');
  alertButton.type='button';alertButton.id='proV3MobileAlert';
  alertButton.className='header-shortcut pro-v3-alert-shortcut';
  alertButton.setAttribute('aria-label','Consulter les nouvelles missions');
  alertButton.innerHTML='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg><span id="proV3AlertBubble" hidden></span>';
  if(accountMenu)accountMenu.before(alertButton);
  alertButton.addEventListener('click',()=>{if(!canUsePremium())return;acknowledgeMatchedNotifications();show('requests');});
  const root=document.createElement('div');root.id='proExperienceV3';root.className='pro-v3-experience';
  root.innerHTML=[
   '<div class="pro-v3-mobile-menu" aria-hidden="true" hidden></div>',
   '<nav class="pro-v3-primary-tabs" aria-label="Parcours professionnel">'+primaryMenu.map(navButton).join('')+'</nav>',
   '<section class="pro-v3-view" data-pro-panel="home">',
    '<div class="pro-v3-intro"><div><span class="pro-v3-eyebrow">ESPACE PROFESSIONNEL OFFRYA</span><h2>Bonjour, <span id="proV3Hello">professionnel</span></h2><p>Les opportunités adaptées à votre activité, au même endroit.</p></div><span class="pro-v3-status" id="proV3Status">Accès professionnel</span></div>',
    '<section class="pro-v3-panel pro-v3-opportunities" aria-labelledby="proV3OpTitle">',
     '<div class="pro-v3-panel-head"><div><h3 id="proV3OpTitle">'+icon('ic-sparkles')+' Radar des opportunités</h3><p>Missions OFFRYA et marchés publics BOAMP / TED, classés par pertinence.</p></div><button type="button" data-refresh-radar="true">Actualiser</button></div>',
     '<p class="pro-v3-radar-summary" id="proV3RadarSummary" role="status" aria-live="polite">Recherche des opportunités pertinentes…</p>',
     '<div id="proV3Recommendations" class="pro-v3-reco-list"><p class="pro-v3-empty">Analyse des opportunités autorisées…</p></div>',
     '<p class="pro-v3-radar-disclaimer">Les scores sont indicatifs. Aucune mission fictive ni prise de contact automatique. <span id="proV3MatchingStatus"></span></p>',
    '</section>',
   '</section>',
   '<section class="pro-v3-view" data-pro-panel="commercial" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">VOTRE ACTIVITÉ · OFFRYA</span><h2 id="proV3CommercialHeading">Proposer mes services</h2><p id="proV3CommercialDescription">Choisissez une mission et envoyez votre proposition.</p></div><div id="proV3CommercialSlot"></div><div class="pro-v3-work-actions" id="proV3WorkActions" hidden><button type="button" data-pro-screen="inbox">Voir mes échanges →</button><button type="button" data-pro-screen="home">Trouver d’autres missions →</button></div><div id="proV3FollowupSlot" class="pro-v3-followup" hidden></div><section id="proV3TrackingActivity" class="pro-v3-panel pro-v3-tracking-activity" hidden><div class="pro-v3-panel-head"><h3>Mon activité</h3></div><div class="pro-v3-activity"><div id="proV3ActivityStats"></div><div id="proV3Chart" class="pro-v3-chart" aria-label="Missions visibles des 7 derniers jours"></div></div></section></section>',
   '<section class="pro-v3-view" data-pro-panel="boamp" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">MARCHÉS PUBLICS · DILA</span><h2>Marchés publics</h2><p>Recherchez les appels d’offres officiels, consultez leurs échéances et exportez les résultats.</p></div><div id="proV3BoampSlot"></div></section>',
   '<section class="pro-v3-view" data-pro-panel="watch" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">VEILLE · OFFRYA</span><h2>Veille automatisée</h2><p>OFFRYA surveille les annonces publiques BOAMP et TED automatiquement. Vos filtres restent facultatifs.</p></div><div class="pro-v3-metrics pro-v3-small-metrics"><div class="pro-v3-metric purple">'+icon('ic-bolt')+'<span><small>État de ma veille</small><strong id="proV3WatchState">—</strong><em>Incluse dans l’abonnement professionnel</em></span></div><div class="pro-v3-metric blue">'+icon('ic-boamp')+'<span><small>Alertes reçues</small><strong id="proV3AlertCount">0</strong><em>Publications BOAMP et TED</em></span></div></div><section class="pro-v3-panel"><div class="pro-v3-panel-head"><h3>Dernières alertes</h3><button data-pro-screen="preferences">Modifier mes critères →</button></div><div id="proV3WatchAlertList" class="pro-v3-alerts"></div><p class="pro-v3-helper">Les e-mails ne sont envoyés que si vous avez activé les préférences correspondantes et que le service d’envoi est configuré.</p></section></section>',
   '<section class="pro-v3-view" data-pro-panel="preferences" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">PERSONNALISATION · OFFRYA</span><h2>Préférences de veille</h2><p>Affinez les secteurs, la zone ou les mots-clés si nécessaire. La veille reste automatique.</p></div><div class="pro-v3-panel" id="proV3PreferenceSlot"></div><p class="pro-v3-helper">Les opportunités publiques s’affichent automatiquement pour les professionnels vérifiés et abonnés. Les e-mails nécessitent une autorisation distincte.</p></section>',
  ].join('');
  $('proDashboard').prepend(root);
  $('proV3CommercialSlot').appendChild(document.querySelector('#proDashboard .sales-workspace'));
  // Reuse the single, already protected BOAMP search/CSV component inside Espace pro.
  // The legacy /espace/marches-publics route remains a compatible entry point.
  $('proV3BoampSlot').appendChild($('premiumContent'));
  $('proV3PreferenceSlot').appendChild($('opWatchDetails'));
  $('opWatchDetails').open=true;
  $('proV3FollowupSlot').appendChild($('opFollowupDetails'));
  $('opFollowupDetails').open=true;
  initialized=true;
 }
 function available(){
  const current=state.session?.user?.id;
  if(!canUsePremium()||!current)return [];
  return (state.missions||[]).filter(m=>m.owner_id!==current&&m.status==='open'&&(!m.expires_at||Date.parse(m.expires_at)>Date.now()));
 }
 function matched(){
  const p=state.opportunityPrefs||{};
  return available().filter(m=>(!p.sectors?.length||p.sectors.includes(m.category))
   &&(!p.department||m.department===p.department)
   &&(!p.keywords||String([m.title,m.description,m.city].join(' ')).toLocaleLowerCase('fr').includes(p.keywords.toLocaleLowerCase('fr')))
   &&(p.min_budget_cents==null||m.budget_cents==null||m.budget_cents>=p.min_budget_cents)
   &&(p.max_budget_cents==null||m.budget_cents==null||m.budget_cents<=p.max_budget_cents))
   .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
 }
 // A match is not an unread alert. Store acknowledgements per account.
 const acknowledgedMissionIds=new Map();
 function alertReadKey(user){return 'offrya:pro:mission-notifications-read:v1:'+user;}
 function readMissionNotifications(user){
  if(!user)return new Set();
  if(acknowledgedMissionIds.has(user))return acknowledgedMissionIds.get(user);
  let stored=[];
  try{stored=JSON.parse(window.localStorage.getItem(alertReadKey(user))||'[]');}catch(_){}
  const seen=new Set(Array.isArray(stored)?stored.filter(id=>typeof id==='string'&&id.length<=128):[]);
  acknowledgedMissionIds.set(user,seen);
  return seen;
 }
 function unreadMatchedNotifications(){
  const user=state.session?.user?.id;
  if(!user||!canUsePremium())return [];
  const seen=readMissionNotifications(user);
  return matched().filter(m=>m.id&&!seen.has(String(m.id)));
 }
 function acknowledgeMatchedNotifications(missionId=null){
  const user=state.session?.user?.id;
  if(!user||!canUsePremium())return;
  const seen=readMissionNotifications(user);
  const toMark=missionId==null?matched():matched().filter(m=>String(m.id)===String(missionId));
  for(const m of toMark)if(m.id){
   const id=String(m.id);seen.delete(id);seen.add(id);
  }
  // The feed is capped at 200; retain enough prior IDs across refreshes.
  const recent=[...seen].slice(-1000);
  acknowledgedMissionIds.set(user,new Set(recent));
  try{window.localStorage.setItem(alertReadKey(user),JSON.stringify(recent));}catch(_){}
  metrics();
 }
 function categoryIcon(category){
  if(/vert|jardin|élag|agric/i.test(category))return '♧';
  if(/bât|rénov|construction|plomb/i.test(category))return '▦';
  if(/nettoy/i.test(category))return '✧';
  if(/inform/i.test(category))return '⌘';
  if(/transport/i.test(category))return '↗';
  return '▣';
 }
 function recommendations(){
  const panel=$('proV3Recommendations');if(!panel||!canUsePremium())return;
  const user=state.session?.user?.id;
  const fingerprint=JSON.stringify([user,state.opportunityPrefs,
   (state.missions||[]).map(m=>[m.id,m.status,m.created_at]).slice(0,220),
   (state.opportunityAlerts||[]).map(a=>[a.tender_id,a.match_score,a.deadline]).slice(0,100)]);
  if(fingerprint!==radarKey){radarKey=fingerprint;serverRadar=null;radarAt=0;}
  if(!radarLoading&&Date.now()-radarAt>5*60*1000)
   queueMicrotask(()=>loadMatchedRadar(fingerprint,user));
  const fallback=buildRadar({missions:available(),alerts:state.opportunityAlerts||[],
   preferences:state.opportunityPrefs||{},userId:user});
  const matches=serverRadar?.items||fallback.items;
  const seen=new Set();
  const rows=matches.filter(item=>{
   if(!item||!['mission','tender'].includes(item.kind))return false;
   const id=item.kind+':'+item.id;if(seen.has(id))return false;
   seen.add(id);return true;
  }).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const mode=$('proV3MatchingStatus');
  if(mode)mode.textContent=serverRadar?.mode==='ai'?'Classement affiné par IA.'
   :serverRadar?'Classement automatique explicable.':'Classement local provisoire.';
  $('proV3RadarSummary').textContent=rows.length
   ?rows.length+' opportunité'+(rows.length>1?'s':'')+' classée'+(rows.length>1?'s':'')+' par pertinence.'
   :'Aucune opportunité correspondante pour le moment.';
  panel.innerHTML=rows.length?rows.slice(0,12).map(item=>{
   const isTender=item.kind==='tender';
   const official=isTender&&(
    /^https:\/\/(www\.)?boamp\.fr\//i.test(item.url||'')||
    /^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(item.url||''));
   const mission=isTender?null:available().find(m=>m.id===item.id);
   if((isTender&&!official)||(!isTender&&!mission))return '';
   const source=isTender?'MARCHÉ PUBLIC · '+esc(item.source):'MISSION OFFRYA';
   const location=String(item.location||'').trim()||'Lieu à préciser';
   const budget=mission?.budget_cents!=null
    ?(mission.budget_cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
    :'Budget non communiqué';
   const deadline=isTender&&item.deadline&&Number.isFinite(Date.parse(item.deadline))
    ?'<span>Clôture : '+esc(new Date(item.deadline).toLocaleDateString('fr-FR'))+'</span>':'';
   const sector=mission?.category?'Secteur : '+mission.category:null;
   const reasons=Array.isArray(item.reasons)?item.reasons.slice(0,4).filter(Boolean):[];
   const rationale=[...(sector?[sector]:[]),...reasons].slice(0,4).join(' · ');
   const action=isTender
    ?'<a class="pro-v3-reco-btn" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">Voir l’avis officiel</a>'
    :'<button type="button" class="pro-v3-reco-btn" data-pro-mission="'+esc(item.id)+'">Préparer une proposition</button>';
   return '<article class="pro-v3-radar-row"><div class="pro-v3-radar-body"><small class="pro-v3-radar-source">'+source+'</small>'+
    '<strong>'+esc(item.title)+'</strong><div class="pro-v3-radar-details"><span>Zone : '+esc(location)+'</span>'+
    (isTender?'':'<span>'+esc(budget)+'</span>')+deadline+'</div>'+
    '<p class="pro-v3-radar-explain"><b>Pourquoi :</b> '+esc(rationale||'Correspondance à examiner')+'</p></div>'+
    '<div class="pro-v3-radar-side"><strong aria-label="Correspondance estimée '+esc(item.score)+' sur 100">'+esc(item.score)+'/100</strong>'+action+'</div></article>';
  }).join(''):'<div class="pro-v3-empty"><strong>Pas d’opportunité correspondant à votre activité.</strong><p>Vous pouvez ajuster vos critères depuis le menu professionnel.</p></div>';
 }

 function metrics(){
  const missions=available(),count=unreadMatchedNotifications().length;
  $('proV3WatchState').textContent=Date.parse(state.testPremiumUntil||'')>Date.now()?'Accès test':'Automatique';
  $('proV3AlertCount').textContent=String((state.opportunityAlerts||[]).length);
  const bubble=$('proV3AlertBubble');
  if(bubble){bubble.hidden=!count;bubble.textContent=String(Math.min(count,99));}
  const trigger=$('proV3MobileAlert');
  if(trigger)trigger.setAttribute('aria-label',count?'Ouvrir '+count+' mission(s) correspondant à mes filtres':'Consulter les missions disponibles');
  for(const el of document.querySelectorAll('[data-pro-count="requests"]')){el.textContent=String(missions.length);el.hidden=!missions.length;}
  for(const el of document.querySelectorAll('[data-pro-count="inbox"]')){el.textContent=String((state.conversations||[]).length);el.hidden=!(state.conversations||[]).length;}
 }

 function activity(){
  const today=new Date();today.setHours(0,0,0,0);
  const ms=available(),counts=[];
  for(let d=6;d>=0;d--){
   const start=new Date(today);start.setDate(start.getDate()-d);
   const end=new Date(start);end.setDate(start.getDate()+1);
   counts.push(ms.filter(m=>{const n=Date.parse(m.created_at||'');return n>=start.getTime()&&n<end.getTime();}).length);
  }
  const max=Math.max(1,...counts),total=counts.reduce((a,b)=>a+b,0);
  $('proV3ActivityStats').innerHTML='<strong>'+ms.length+'</strong><small>Missions accessibles</small><strong>'+total+'</strong><small>Nouvelles sur 7 jours</small>';
  const width=260,height=115;
  const points=counts.map((v,i)=>[10+(width-20)*i/6,height-12-(height-26)*v/max]);
  const pts=points.map(v=>v.join(',')).join(' ');
  $('proV3Chart').innerHTML='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(counts.join(', '))+' missions quotidiennes dans les 7 derniers jours"><path d="M10 '+(height-12)+' H'+(width-10)+'" fill="none" stroke="#e5d8f1" stroke-width="1"/><polyline points="'+pts+'" stroke="#7b32dc" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none"/>'+points.map(v=>'<circle cx="'+v[0]+'" cy="'+v[1]+'" r="3.5" fill="#813dd9"/>').join('')+'</svg><small>7 derniers jours · missions publiées</small>';
 }
 function alerts(){
  // Full official watch is retained in its protected subtab.
  const alerts=state.opportunityAlerts||[];
  $('proV3WatchAlertList').innerHTML=alerts.length?[...alerts]
   .filter(a=>!a.deadline||Date.parse(a.deadline)>Date.now())
   .sort((a,b)=>(b.match_score||0)-(a.match_score||0))
   .slice(0,15).map(a=>{
    const official=/^https:\/\/(www\.)?boamp\.fr\//i.test(a.url||'')||/^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(a.url||'');
    const href=official?esc(a.url):null;
    const name=a.source==='TED'?'TED · Union européenne':'BOAMP · DILA';
    const score=Number.isInteger(a.match_score)?'<small>Correspondance : '+a.match_score+'/100 · '+esc(a.match_reason||'')+'</small>':'';
    return '<div class="pro-v3-watch-item"><small>'+esc(name)+' · '+esc(a.seen_at?'Déjà consultée':'Nouvelle opportunité')+'</small><strong>'+esc(a.title||'Marché public')+'</strong>'+score+
     '<small>Échéance : '+esc(a.deadline?new Date(a.deadline).toLocaleDateString('fr-FR'):'À vérifier')+'</small>'+
     (href?'<a href="'+href+'" target="_blank" rel="noopener noreferrer">Consulter la publication officielle</a>':'')+'</div>';
   }).join(''):'<div class="pro-v3-empty">Aucune nouvelle opportunité pour le moment. La veille BOAMP et TED s’exécute automatiquement pour les professionnels vérifiés et abonnés.</div>';
 }
 function syncTab(name){
  if(!initialized||!canUsePremium())return;
  if(name==='professional'||name==='boamp')activeButtons();
  else document.querySelectorAll('.pro-v3-nav-btn').forEach(b=>{
   b.classList.remove('active');b.removeAttribute('aria-current');
  });
 }
 function activeButtons(){
  const professionalVisible=$('professional')?.classList.contains('active')===true;
  document.querySelectorAll('.pro-v3-nav-btn').forEach(b=>{
   const active=professionalVisible&&(b.dataset.proScreen===view||(view==='assistant'&&b.dataset.proScreen==='requests'));
   b.classList.toggle('active',active);
   if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
 }
 function placeMarketSearch(){
  const node=$('premiumContent'),target=$('proV3BoampSlot');
  if(node&&target&&node.parentElement!==target)target.appendChild(node);
 }
 function show(next,fromHistory=false){
  if(!initialized||!canUsePremium())return;
  if(['inbox','settings'].includes(next)){tab(next);syncTab(next);return;}
  if(!['home','requests','assistant','tracking','boamp','watch','preferences'].includes(next))return;
  view=next;
  placeMarketSearch();
  tab('professional',fromHistory);
  if(next==='boamp'&&state.boampStatus!=='loading'&&state.boampStatus!=='ready')
   loadMarkets().catch(error=>console.warn('OFFRYA: marchés publics indisponibles',error));
  const commercial=['requests','assistant','tracking'].includes(next);
  for(const section of $('proExperienceV3').querySelectorAll('[data-pro-panel]')){
   const on=section.dataset.proPanel===(commercial?'commercial':next);
   section.hidden=!on;section.classList.toggle('active',on);
  }
  $('proV3FollowupSlot').hidden=next!=='tracking';
  if($('proV3WorkActions'))$('proV3WorkActions').hidden=next!=='tracking';
  if($('proV3TrackingActivity'))$('proV3TrackingActivity').hidden=next!=='tracking';
  const headings={
   requests:['Proposer mes services','Choisissez une mission accessible pour rédiger votre proposition.'],
   assistant:['Ma proposition','Décrivez votre intervention, précisez éventuellement un montant et un délai, puis validez l’envoi.'],
   tracking:['Gérer mon activité','Retrouvez vos propositions, vos dossiers suivis et vos échanges avec les clients.']
  };
  if(commercial){
   $('proV3CommercialHeading').textContent=headings[next][0];
   $('proV3CommercialDescription').textContent=headings[next][1];
   $(next==='requests'?'salesTabRequests':next==='assistant'?'salesTabAssistant':'salesTabTracking').click();
  }
  $('proV3PreferenceSlot').querySelector('details').open=true;
  activeButtons();
  window.scrollTo({top:0,behavior:'auto'});
 }
 function openMission(id){
  const m=available().find(x=>x.id===id);if(!m)return;
  acknowledgeMatchedNotifications(id);
  if(openProposal&&openProposal(id)){show('assistant');return;}
  notify('Impossible d’ouvrir cette mission. Actualisez vos opportunités et réessayez.');
 }
 function init(){
  if(initialized)return;
  makeMarkup();
  // Delegation also handles preference shortcuts added when real data refreshes.
  document.addEventListener('click',e=>{
   const b=e.target.closest('[data-pro-screen]');
   if(!b||!canUsePremium()||!b.closest('#proExperienceV3,#proV3Sidebar,#proV3SidePlan,#proV3AccountTools'))return;
   e.preventDefault();document.getElementById('accountMenu')?.removeAttribute('open');show(b.dataset.proScreen);
  });
  $('proExperienceV3').addEventListener('click',e=>{
   const radarButton=e.target.closest('[data-refresh-radar]');
   if(radarButton&&canUsePremium()){radarAt=0;serverRadar=null;recommendations();return;}
   const refreshButton=e.target.closest('[data-refresh-missions]');
   if(refreshButton&&canUsePremium()){
    $('missionRefresh').click();
    return;
   }
   const filter=e.target.closest('[data-market-query]');
   if(filter&&canUsePremium()){
    $('boampKeyword').value=filter.dataset.marketQuery||'';
    document.querySelectorAll('[data-market-query]').forEach(button=>{
     const pressed=button===filter;button.classList.toggle('active',pressed);button.setAttribute('aria-pressed',String(pressed));
    });
    $('boampSearch').click();return;
   }
   const b=e.target.closest('[data-pro-mission]');if(b)openMission(b.dataset.proMission);
    
  });
  window.addEventListener('storage',event=>{
   const user=state.session?.user?.id;
   if(!user||event.key!==alertReadKey(user))return;
   acknowledgedMissionIds.delete(user);
   if(canUsePremium())metrics();
  });
  // Accueil remains the personal dashboard; only the explicit Pro shortcut
  // opens the professional screen. Do not intercept the bottom Accueil tab.
  document.addEventListener('click',e=>{
   const b=e.target.closest('#priorityAlertShortcut');
   if(b&&canUsePremium()){
    e.preventDefault();e.stopImmediatePropagation();show('home');
   }
  },true);
  document.addEventListener('click',e=>{
   const target=e.target.closest('[data-tab]');
   if(!target||!canUsePremium())return;
   const dest=target.dataset.tab;
   if(dest==='professional'){setTimeout(()=>{if(canUsePremium())show('home');},0);}
   else if(['dashboard','missions','inbox','settings','boamp'].includes(dest)){setTimeout(()=>syncTab(dest),0);}
  });
  // Browser/Android back and forward restore the correct tab without pushing
  // a second history entry or hijacking the personal Accueil screen.
  window.addEventListener('popstate',()=>{
   if(!canUsePremium())return;
   const route=window.location.pathname;
   if(route==='/espace/professionnel')show('home',true);
   else if(route==='/espace/marches-publics')show('boamp',true);
   else syncTab(route==='/espace'?'dashboard':route.includes('/missions')?'missions':route.includes('/messagerie')?'inbox':route.includes('/reglages')?'settings':'boamp');
  });
  const header=document.querySelector('.app-shell .header');
  const search=document.createElement('form');search.id='proV3Search';search.className='pro-v3-search';
  search.setAttribute('role','search');search.innerHTML='<label class="sr-only" for="proV3SearchInput">Rechercher des missions</label><input id="proV3SearchInput" placeholder="Rechercher une mission, une ville, un mot-clé…" autocomplete="off" maxlength="100"><button type="submit" aria-label="Rechercher">'+icon('ic-search')+'</button>';
  header.querySelector('.header-left').after(search);
  search.addEventListener('submit',e=>{e.preventDefault();if(!canUsePremium())return;$('missionQuery').value=$('proV3SearchInput').value;renderMissions();tab('missions');syncTab('missions');});
 }
 function render(){
  if(!initialized)return;
  const premium=Boolean(canUsePremium());
  document.body.classList.toggle('offrya-pro-v3',premium);
  if(!premium){uid=null;serverRadar=null;radarKey='';radarAt=0;return;}
  const user=state.session?.user?.id;
  if(user!==uid){uid=user;view='home';
  }
  const rawLabel=String(state.premium?.legal_name||state.profile?.display_name||'').trim();
  const technical=/^(?:user[_-][a-z0-9_-]{6,}|[a-f0-9-]{24,}|[0-9]{10,})$/i.test(rawLabel);
  const label=rawLabel&&!technical?rawLabel:'professionnel';
  $('proV3Hello').textContent=label.length>32?label.slice(0,29).trimEnd()+'…':label;
  $('proV3Hello').title=label;
  const temporary=Date.parse(state.testPremiumUntil||'')>Date.now();
  const status=temporary?'Accès temporaire':state.premium?.status==='verified'?'Compte vérifié · abonnement actif':'Compte professionnel actif';
  $('proV3Status').textContent=status;
  $('proV3PlanState').textContent=temporary?'Accès de test en cours':'Abonnement actif';
  placeMarketSearch();
  metrics();recommendations();activity();alerts();
  const commercial=['requests','assistant','tracking'].includes(view);
  if($('proV3TrackingActivity'))$('proV3TrackingActivity').hidden=view!=='tracking';
  if($('proV3WorkActions'))$('proV3WorkActions').hidden=view!=='tracking';
  for(const section of $('proExperienceV3').querySelectorAll('[data-pro-panel]')){
   const on=section.dataset.proPanel===(commercial?'commercial':view);
   section.hidden=!on;
  }
  activeButtons();
 }
 return {init,render,show,syncTab};
}
