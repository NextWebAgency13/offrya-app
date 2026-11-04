import {buildRadar} from './radar.js';
// OFFRYA Pro UI v3 — visual redesign on top of existing secured modules.
// Only authenticated, server/RLS-authorized data is displayed. No demo rows.
export function createProExperience({state,element,canUsePremium,tab,renderMissions,loadMarkets,notify}){
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
 let initialized=false,view='home',uid=null;
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
  const nav=document.createElement('nav');nav.id='proV3Sidebar';nav.className='pro-v3-sidebar-nav';nav.setAttribute('aria-label','Navigation professionnelle');nav.innerHTML=menu.map(navButton).join('');
  $('nav').after(nav);
  const badge=document.createElement('div');badge.id='proV3SidePlan';badge.className='pro-v3-side-plan';
  badge.innerHTML='<strong>♛ Offre professionnelle</strong><span id="proV3PlanState">Accès en cours</span><small>34,99 € TTC / mois</small><button type="button" data-pro-screen="settings">Gérer mon abonnement →</button>';
  nav.after(badge);
  // Secondary Pro screens appear in the existing mobile account menu.
  const accountPanel=document.querySelector('#accountMenu .account-menu-panel');
  if(accountPanel&&!accountPanel.querySelector('#proV3AccountTools')){
   const tools=document.createElement('nav');tools.id='proV3AccountTools';tools.className='pro-v3-account-tools';
   tools.setAttribute('aria-label','Outils professionnels');
   tools.innerHTML='<strong class="pro-v3-account-title">Outils professionnels</strong>'+menu.map(item=>navButton(item[0]==='home'?['home','Tableau professionnel',item[2]]:item)).join('');
   accountPanel.prepend(tools);
  }
  const accountMenu=document.getElementById('accountMenu');
  const alertButton=document.createElement('button');
  alertButton.type='button';alertButton.id='proV3MobileAlert';
  alertButton.className='header-shortcut pro-v3-alert-shortcut';
  alertButton.setAttribute('aria-label','Consulter les nouvelles missions');
  alertButton.innerHTML='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg><span id="proV3AlertBubble" hidden></span>';
  if(accountMenu)accountMenu.before(alertButton);
  alertButton.addEventListener('click',()=>{if(canUsePremium())show('requests');});
  const root=document.createElement('div');root.id='proExperienceV3';root.className='pro-v3-experience';
  root.innerHTML=[
   '<div class="pro-v3-mobile-menu" aria-hidden="true" hidden></div>',
   '<section class="pro-v3-view" data-pro-panel="home">',
    '<div class="pro-v3-intro"><div><span class="pro-v3-eyebrow">ESPACE PROFESSIONNEL OFFRYA</span><h2>Bonjour, <span id="proV3Hello">professionnel</span></h2><p>Consultez les missions publiées par d’autres utilisateurs et développez votre activité.</p></div><span class="pro-v3-status" id="proV3Status">Accès professionnel</span></div>',
    '<div class="pro-v3-metrics" aria-label="Indicateurs réels">',
     '<div class="pro-v3-metric purple">'+icon('ic-missions')+'<span><small>Missions disponibles</small><strong id="proV3MissionCount">—</strong><em>Demandes accessibles</em></span></div>',
     '<div class="pro-v3-metric blue">'+icon('ic-missions')+'<span><small>Nouvelles missions</small><strong id="proV3RecentMissionCount">—</strong><em>Publiées depuis 7 jours</em></span></div>',
     '<div class="pro-v3-metric green">'+icon('ic-inbox')+'<span><small>Conversations</small><strong id="proV3ConversationCount">—</strong><em>Discussions accessibles</em></span></div>',
     '<div class="pro-v3-metric coral">'+icon('ic-check')+'<span><small>Missions suivies</small><strong id="proV3TrackingCount">—</strong><em>Suivi de vos contacts</em></span></div>',
    '</div>',
    '<div class="pro-v3-home-grid">',
     '<div class="pro-v3-main-column">',
      '<section class="pro-v3-panel pro-v3-missions-panel" aria-labelledby="proV3MissionsTitle">',
       '<div class="pro-v3-panel-head"><div><h3 id="proV3MissionsTitle">'+icon('ic-missions')+' Missions publiées par les autres</h3><p>Les missions ouvertes et accessibles, classées de la plus récente à la plus ancienne.</p></div><button type="button" data-refresh-missions="true">↻ Actualiser</button></div>',
       '<div id="proV3MissionPreview" class="pro-v3-mission-preview" aria-live="polite"></div>',
       '<button type="button" class="pro-v3-missions-all" data-pro-screen="requests">Voir toutes les demandes de missions →</button>',
      '</section>',
      '<section class="pro-v3-panel pro-v3-opportunities" aria-labelledby="proV3OpTitle">',
       '<div class="pro-v3-panel-head"><div><h3 id="proV3OpTitle">'+icon('ic-sparkles')+' Radar des missions</h3><p>Les demandes d’autres utilisateurs classées selon votre métier et votre zone.</p></div><button type="button" data-pro-screen="watch">Toutes les alertes →</button></div>',
       '<div class="pro-v3-radar-kpis" aria-label="Résultats du radar"><span><strong id="proV3RadarTotal">0</strong><small>Détectées</small></span><span><strong id="proV3RadarRelevant">0</strong><small>Pertinentes</small></span><span><strong id="proV3RadarUrgent">0</strong><small>À examiner</small></span></div>',
       '<div id="proV3Recommendations" class="pro-v3-reco-list"><p class="pro-v3-empty">Analyse des opportunités disponibles…</p></div>',
       '<p class="pro-v3-radar-disclaimer">Score indicatif de correspondance entre les missions publiées et vos critères. Aucun contact automatique.</p>',
      '</section>',
     '</div>',
     '<aside class="pro-v3-home-side" aria-label="Informations professionnelles">',
      '<section class="pro-v3-panel"><div class="pro-v3-panel-head"><h3>'+icon('ic-bolt')+' Alertes & nouveautés</h3></div><div id="proV3Alerts" class="pro-v3-alerts"><p class="pro-v3-empty">Aucune alerte.</p></div></section>',
      '<section class="pro-v3-panel"><div class="pro-v3-panel-head"><h3>'+icon('ic-dashboard')+' Mon activité</h3><button type="button" data-pro-screen="tracking">Suivi détaillé →</button></div><div class="pro-v3-activity"><div id="proV3ActivityStats"></div><div id="proV3Chart" class="pro-v3-chart" aria-label="Missions visibles publiées sur les 7 derniers jours"></div></div></section>',
      '<section class="pro-v3-panel pro-v3-actions"><div class="pro-v3-panel-head"><h3>'+icon('ic-bolt')+' Accès rapides</h3></div><div class="pro-v3-action-grid"><button type="button" data-pro-screen="requests">'+icon('ic-missions')+'<span>Voir toutes les missions</span></button><button type="button" data-refresh-missions="true">'+icon('ic-bolt')+'<span>Actualiser les missions</span></button><button type="button" data-pro-screen="tracking">'+icon('ic-check')+'<span>Mes missions suivies</span></button><button type="button" data-pro-screen="inbox">'+icon('ic-inbox')+'<span>Ouvrir mes messages</span></button></div></section>',
     '</aside>',
    '</div>',
    '<section class="pro-v3-overview"><h3>Un espace pour chaque besoin</h3><div class="pro-v3-overview-grid">'+
     menu.slice(1).map(x=>'<button data-pro-screen="'+x[0]+'">'+icon(x[2])+'<strong>'+esc(x[1])+'</strong><span>Accéder à cet outil →</span></button>').join('')+'</div></section>',
   '</section>',
   '<section class="pro-v3-view" data-pro-panel="commercial" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">GESTION DES DEMANDES · OFFRYA</span><h2 id="proV3CommercialHeading">Demandes de missions</h2><p id="proV3CommercialDescription">Qualifiez les demandes, préparez vos réponses et suivez vos échanges.</p></div><div id="proV3CommercialSlot"></div><div id="proV3FollowupSlot" class="pro-v3-followup" hidden></div></section>',
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
  const data=buildRadar({missions:available(),alerts:[],
   preferences:state.opportunityPrefs||{},userId:state.session?.user?.id});
  $('proV3RadarTotal').textContent=String(data.total);
  $('proV3RadarRelevant').textContent=String(data.relevant);
  $('proV3RadarUrgent').textContent=String(data.urgent);
  panel.innerHTML=data.items.length?data.items.slice(0,5).map(item=>{
   const place=item.location||'Localisation à vérifier';
   const rationale=item.reasons.slice(0,3).join(' · ');
   const action='<button type="button" class="pro-v3-reco-btn" data-pro-mission="'+esc(item.id)+'">Voir la mission</button>';
   return '<article class="pro-v3-radar-row"><div class="pro-v3-radar-body"><small class="pro-v3-radar-source">MISSION OFFRYA</small>'+
    '<strong>'+esc(item.title)+'</strong><small>'+esc(place)+'</small><p>'+esc(rationale)+'</p></div>'+
    '<div class="pro-v3-radar-side"><strong aria-label="Correspondance estimée '+item.score+' sur 100">'+item.score+'/100</strong>'+action+'</div></article>';
  }).join(''):'<div class="pro-v3-empty"><strong>Pas encore d’opportunités correspondant au radar.</strong>'+
   (available().length?
    '<p>'+available().length+' mission(s) accessible(s) actuellement, mais non retenue(s) par vos filtres de correspondance. Consultez la liste complète.</p>'+
    '<p>Le radar ne classe que les missions publiées par les autres utilisateurs.</p>':
    '<p>Aucune mission accessible actuellement. La liste restera vide tant que votre compte ne reçoit aucune mission autorisée.</p>')+
   '<button type="button" data-pro-screen="requests">Voir toutes les missions →</button></div>';
 }

 function metrics(){
  const missions=available(), conversations=state.conversations||[];
  $('proV3MissionCount').textContent=String(missions.length);
  const weekAgo=Date.now()-7*86400000;
  $('proV3RecentMissionCount').textContent=String(missions.filter(m=>Date.parse(m.created_at||'')>=weekAgo).length);
  $('proV3ConversationCount').textContent=String(conversations.length);
  $('proV3TrackingCount').textContent=String((state.salesTracking||[]).filter(t=>missions.some(m=>m.id===t.mission_id)).length);
  $('proV3WatchState').textContent=Date.parse(state.testPremiumUntil||'')>Date.now()?'Accès test':'Automatique';
  $('proV3AlertCount').textContent=String((state.opportunityAlerts||[]).length);
  const count=matched().length;
  const bubble=$('proV3AlertBubble');
  if(bubble){bubble.hidden=!count;bubble.textContent=String(Math.min(count,99));}
  const trigger=$('proV3MobileAlert');
  if(trigger)trigger.setAttribute('aria-label',count?'Consulter '+count+' mission(s) correspondant à vos filtres':'Consulter les missions disponibles');
  for(const el of document.querySelectorAll('[data-pro-count="requests"]')){el.textContent=String(missions.length);el.hidden=!missions.length;}
  for(const el of document.querySelectorAll('[data-pro-count="inbox"]')){el.textContent=String(conversations.length);el.hidden=!conversations.length;}
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
  const ms=matched(), alerts=state.opportunityAlerts||[];
  const unseen=alerts.filter(x=>!x.seen_at);
  const rows=[
   [String(ms.length)+' mission(s) correspondant à vos filtres','requests'],
   [String(unseen.length)+' nouvelle(s) opportunité(s) publique(s)','watch'],
   [String((state.tenderTracking||[]).length)+' marché(s) suivi(s)','tracking']
  ];
  $('proV3Alerts').innerHTML=rows.map(x=>'<button data-pro-screen="'+x[1]+'"><span class="pro-v3-alert-icon">'+alertIcon(x[1])+'</span>'+esc(x[0])+'<b>›</b></button>').join('');
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
   const active=professionalVisible&&b.dataset.proScreen===view;
   b.classList.toggle('active',active);
   if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
 }
 function placeMarketSearch(){
  const node=$('premiumContent'),target=$('proV3BoampSlot');
  if(node&&target&&node.parentElement!==target)target.appendChild(node);
 }
 function missionPreview(){
  const panel=$('proV3MissionPreview');if(!panel)return;
  const entries=[...available()].sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)).slice(0,8);
  panel.innerHTML=entries.length?entries.map(m=>{
   const place=[m.city,m.department].filter(Boolean).join(' · ')||'Lieu à préciser';
   const summary=String(m.description||'').trim().slice(0,115);
   const details=m.desired_date?'Date souhaitée : '+new Date(m.desired_date).toLocaleDateString('fr-FR'):'Publiée le '+(m.created_at?new Date(m.created_at).toLocaleDateString('fr-FR'):'—');
   return '<article class="pro-v3-mission-card"><div class="pro-v3-mission-type">'+icon('ic-missions')+'<span>'+esc(m.category||'Prestation')+'</span></div>'+
    '<h4>'+esc(m.title||'Mission publiée')+'</h4><div class="pro-v3-mission-meta"><small>'+esc(place)+'</small><small>'+esc(details)+'</small></div>'+
    (summary?'<p>'+esc(summary)+(String(m.description||'').length>115?'…':'')+'</p>':'')+
    '<button type="button" data-pro-mission="'+esc(m.id)+'">Voir la mission →</button></article>';
  }).join(''):'<div class="pro-v3-empty"><strong>Aucune mission disponible actuellement.</strong><p>Les nouvelles demandes accessibles apparaîtront ici dès leur publication.</p></div>';
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
  const headings={
   requests:['Demandes de missions','Consultez les demandes réelles accessibles à votre compte professionnel.'],
   assistant:['Assistant IA OFFRYA','Préparez des réponses modifiables et validez chaque envoi avant transmission.'],
   tracking:['Suivi & performances','Retrouvez vos dossiers commerciaux et les marchés publics que vous suivez.']
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
  state.selectedMissionId=id;
  $('missionQuery').value='';$('missionCategory').value='';$('missionDept').value='';
  renderMissions();tab('missions',false,true);
  syncTab('missions');$('missionList').scrollIntoView({block:'start',behavior:'auto'});
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
  if(!premium){uid=null;return;}
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
  metrics();missionPreview();recommendations();activity();alerts();
  const commercial=['requests','assistant','tracking'].includes(view);
  for(const section of $('proExperienceV3').querySelectorAll('[data-pro-panel]')){
   const on=section.dataset.proPanel===(commercial?'commercial':view);
   section.hidden=!on;
  }
  activeButtons();
 }
 return {init,render,show,syncTab};
}
