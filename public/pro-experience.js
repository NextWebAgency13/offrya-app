// OFFRYA Pro UI v3 — visual redesign on top of existing secured modules.
// Only authenticated, server/RLS-authorized data is displayed. No demo rows.
export function createProExperience({state,element,canUsePremium,tab,renderMissions,notify}){
 const $=element;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const menu=[
  ['home','Tableau de bord','ic-dashboard'],
  ['requests','Demandes de missions','ic-missions'],
  ['assistant','Assistant IA','ic-sparkles'],
  ['boamp','Marchés publics','ic-boamp'],
  ['watch','Veille automatisée','ic-bolt'],
  ['tracking','Suivi & performances','ic-check'],
  ['inbox','Messagerie','ic-inbox'],
  ['preferences','Préférences de veille','ic-settings'],
  ['settings','Paramètres','ic-user']
 ];
 let initialized=false,view='home',uid=null;
 function icon(name){return '<svg class="nav-icon" aria-hidden="true"><use href="#'+name+'"/></svg>';}
 function caption(v){return '<span>'+esc(v)+'</span>';}
 function navButton(item){return '<button type="button" class="pro-v3-nav-btn" data-pro-screen="'+item[0]+'">'+icon(item[2])+'<span>'+esc(item[1])+'</span><span class="pro-v3-nav-count" data-pro-count="'+item[0]+'" hidden></span></button>';}
 function makeMarkup(){
  const nav=document.createElement('nav');nav.id='proV3Sidebar';nav.className='pro-v3-sidebar-nav';nav.setAttribute('aria-label','Navigation professionnelle');nav.innerHTML=menu.map(navButton).join('');
  $('nav').after(nav);
  const badge=document.createElement('div');badge.id='proV3SidePlan';badge.className='pro-v3-side-plan';
  badge.innerHTML='<strong>♛ Offre professionnelle</strong><span id="proV3PlanState">Accès en cours</span><small>34,99 € TTC / mois</small><button type="button" data-pro-screen="settings">Gérer mon abonnement →</button>';
  nav.after(badge);
  const root=document.createElement('div');root.id='proExperienceV3';root.className='pro-v3-experience';
  root.innerHTML=[
   '<div class="pro-v3-mobile-menu" role="navigation" aria-label="Outils de votre espace Pro">'+menu.map(navButton).join('')+'</div>',
   '<section class="pro-v3-view" data-pro-panel="home">',
    '<div class="pro-v3-intro"><div><span class="pro-v3-eyebrow">ESPACE PROFESSIONNEL OFFRYA</span><h2>Bonjour, <span id="proV3Hello">professionnel</span></h2><p>Gérez vos opportunités, suivez vos missions et développez votre activité.</p></div><span class="pro-v3-status" id="proV3Status">Accès professionnel</span></div>',
    '<div class="pro-v3-metrics" aria-label="Indicateurs réels">',
     '<div class="pro-v3-metric purple">'+icon('ic-missions')+'<span><small>Missions disponibles</small><strong id="proV3MissionCount">—</strong><em>Demandes accessibles</em></span></div>',
     '<div class="pro-v3-metric blue">'+icon('ic-boamp')+'<span><small>Marchés publics</small><strong id="proV3MarketCount">—</strong><em>Résultats BOAMP chargés</em></span></div>',
     '<div class="pro-v3-metric green">'+icon('ic-inbox')+'<span><small>Conversations</small><strong id="proV3ConversationCount">—</strong><em>Discussions accessibles</em></span></div>',
     '<div class="pro-v3-metric coral">'+icon('ic-check')+'<span><small>Dossiers suivis</small><strong id="proV3TrackingCount">—</strong><em>Missions et marchés</em></span></div>',
    '</div>',
    '<div class="pro-v3-home-grid">',
      '<section class="pro-v3-panel pro-v3-opportunities" aria-labelledby="proV3OpTitle">',
       '<div class="pro-v3-panel-head"><div><h3 id="proV3OpTitle">'+icon('ic-sparkles')+' Opportunités prioritaires</h3><p>Des missions correspondant à votre secteur et à votre zone.</p></div><button type="button" data-pro-screen="requests">Voir toutes les missions →</button></div>',
       '<div id="proV3Recommendations" class="pro-v3-reco-list"><p class="pro-v3-empty">Recherche de missions…</p></div>',
      '</section>',
      '<div class="pro-v3-home-side">',
       '<section class="pro-v3-panel"><div class="pro-v3-panel-head"><h3>'+icon('ic-bolt')+' Alertes & nouveautés</h3></div><div id="proV3Alerts" class="pro-v3-alerts"><p class="pro-v3-empty">Aucune alerte.</p></div></section>',
       '<section class="pro-v3-panel"><div class="pro-v3-panel-head"><h3>'+icon('ic-dashboard')+' Mon activité</h3><button type="button" data-pro-screen="tracking">Suivi →</button></div><div class="pro-v3-activity"><div id="proV3ActivityStats"></div><div id="proV3Chart" class="pro-v3-chart" aria-label="Missions visibles publiées sur les 7 derniers jours"></div></div></section>',
       '<section class="pro-v3-panel pro-v3-actions"><div class="pro-v3-panel-head"><h3>'+icon('ic-bolt')+' Actions rapides</h3></div><div class="pro-v3-action-grid"><button data-pro-screen="watch">Définir ma veille</button><button data-pro-screen="assistant">Assistant IA</button><button data-pro-screen="preferences">Mes préférences</button><a href="/contact.html">Besoin d’aide ?</a></div></section>',
      '</div>',
    '</div>',
    '<section class="pro-v3-overview"><h3>Un espace pour chaque besoin</h3><div class="pro-v3-overview-grid">'+
     menu.slice(1).map(x=>'<button data-pro-screen="'+x[0]+'">'+icon(x[2])+'<strong>'+esc(x[1])+'</strong><span>Accéder à cet outil →</span></button>').join('')+'</div></section>',
   '</section>',
   '<section class="pro-v3-view" data-pro-panel="commercial" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">GESTION DES DEMANDES · OFFRYA</span><h2 id="proV3CommercialHeading">Demandes de missions</h2><p id="proV3CommercialDescription">Qualifiez les demandes, préparez vos réponses et suivez vos échanges.</p></div><div id="proV3CommercialSlot"></div><div id="proV3FollowupSlot" class="pro-v3-followup" hidden></div></section>',
   '<section class="pro-v3-view" data-pro-panel="watch" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">VEILLE · OFFRYA</span><h2>Veille automatisée</h2><p>Vos critères permettent de rechercher des missions et avis BOAMP correspondant à votre activité.</p></div><div class="pro-v3-metrics pro-v3-small-metrics"><div class="pro-v3-metric purple">'+icon('ic-bolt')+'<span><small>État de ma veille</small><strong id="proV3WatchState">—</strong><em>Activation volontaire</em></span></div><div class="pro-v3-metric blue">'+icon('ic-boamp')+'<span><small>Alertes reçues</small><strong id="proV3AlertCount">0</strong><em>Alertes BOAMP enregistrées</em></span></div></div><section class="pro-v3-panel"><div class="pro-v3-panel-head"><h3>Dernières alertes</h3><button data-pro-screen="preferences">Modifier mes critères →</button></div><div id="proV3WatchAlertList" class="pro-v3-alerts"></div><p class="pro-v3-helper">Les e-mails ne sont envoyés que si vous avez activé les préférences correspondantes et que le service d'envoi est configuré.</p></section></section>',
   '<section class="pro-v3-view" data-pro-panel="preferences" hidden><div class="pro-v3-page-intro"><span class="pro-v3-eyebrow">PERSONNALISATION · OFFRYA</span><h2>Préférences de veille</h2><p>Choisissez vos secteurs, votre département et les mots-clés à surveiller.</p></div><div class="pro-v3-panel" id="proV3PreferenceSlot"></div><p class="pro-v3-helper">Les alertes restent désactivées tant que vous ne les activez pas explicitement.</p></section>',
  ].join('');
  $('proDashboard').prepend(root);
  $('proV3CommercialSlot').appendChild(document.querySelector('#proDashboard .sales-workspace'));
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
  const rows=matched().slice(0,4);
  const box=$('proV3Recommendations');if(!box)return;
  box.innerHTML=rows.length?rows.map(m=>{
   const place=[m.city,m.department?'('+m.department+')':''].filter(Boolean).join(' ');
   const created=m.created_at?'Publiée le '+new Date(m.created_at).toLocaleDateString('fr-FR'):'';
   return '<article class="pro-v3-reco"><div class="pro-v3-reco-image" aria-hidden="true">'+categoryIcon(m.category||'')+'</div>'+
   '<div><strong>'+esc(m.title||'Mission')+'</strong><p><span>'+esc(m.category||'Service')+'</span> · '+esc(place||'Localisation non précisée')+'</p><small>'+esc(created)+'</small></div>'+
   '<button type="button" class="pro-v3-reco-btn" data-pro-mission="'+esc(m.id)+'">Voir la mission →</button></article>';
  }).join(''):'<div class="pro-v3-empty"><strong>Aucune mission recommandée pour le moment.</strong><p>Les demandes réelles des particuliers et des entreprises apparaîtront ici selon vos secteurs et votre zone.</p><button data-pro-screen="preferences">Personnaliser mes préférences →</button></div>';
 }
 function metrics(){
  const missions=available(), conversations=state.conversations||[];
  $('proV3MissionCount').textContent=String(missions.length);
  const boampLoaded=(state.boamp||[]).length>0 || Number(state.boampTotal)>0;
  $('proV3MarketCount').textContent=boampLoaded?String(state.boampTotal):'—';
  $('proV3ConversationCount').textContent=String(conversations.length);
  $('proV3TrackingCount').textContent=String((state.salesTracking||[]).length+(state.tenderTracking||[]).length);
  $('proV3WatchState').textContent=state.opportunityPrefs?.alerts_enabled?'Active':'Inactive';
  $('proV3AlertCount').textContent=String((state.opportunityAlerts||[]).length);
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
   [String(unseen.length)+' nouvelle(s) alerte(s) BOAMP','watch'],
   [String((state.tenderTracking||[]).length)+' marché(s) suivi(s)','tracking']
  ];
  $('proV3Alerts').innerHTML=rows.map(x=>'<button data-pro-screen="'+x[1]+'"><span class="pro-v3-alert-icon">'+(x[1]==='watch'?'♧':x[1]==='tracking'?'✓':'✦')+'</span>'+esc(x[0])+'<b>›</b></button>').join('');
  $('proV3WatchAlertList').innerHTML=alerts.length?alerts.slice(0,15).map(a=>{
   const href=/^https:\/\/[^\s]+$/i.test(a.url||'')?esc(a.url):null;
   return '<div class="pro-v3-watch-item"><strong>'+esc(a.title||'Marché public')+'</strong><small>'+esc(a.seen_at?'Déjà consultée':'Nouvelle alerte')+'</small>'+(href?'<a href="'+href+'" target="_blank" rel="noopener noreferrer">Ouvrir l’avis officiel ↗</a>':'')+'</div>';
  }).join(''):'<div class="pro-v3-empty">Aucune alerte BOAMP enregistrée pour le moment.</div>';
 }
 function syncTab(name){
  if(!initialized||!canUsePremium())return;
  if(name==='boamp'||name==='inbox'||name==='settings'||name==='missions'){
   document.querySelectorAll('.pro-v3-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.proScreen===(name==='missions'?'requests':name)));
  }else if(name==='professional')activeButtons();
 }
 function activeButtons(){
  document.querySelectorAll('.pro-v3-nav-btn').forEach(b=>{
   const active=b.dataset.proScreen===view;
   b.classList.toggle('active',active);
   if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
 }
 function show(next){
  if(!initialized||!canUsePremium())return;
  if(['boamp','inbox','settings'].includes(next)){tab(next);syncTab(next);return;}
  if(!['home','requests','assistant','tracking','watch','preferences'].includes(next))return;
  view=next;
  tab('professional');
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
  document.querySelectorAll('[data-pro-screen]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.proScreen)));
  $('proExperienceV3').addEventListener('click',e=>{
   const b=e.target.closest('[data-pro-mission]');if(b)openMission(b.dataset.proMission);
  });
  // The five existing mobile tabs continue to function, but "Accueil" shows
  // the Pro dashboard instead of the client's personal dashboard for eligible users.
  document.addEventListener('click',e=>{
   const b=e.target.closest('.sidebar [data-tab="dashboard"],#priorityAlertShortcut');
   if(b&&canUsePremium()){
    e.preventDefault();e.stopImmediatePropagation();show('home');
   }
  },true);
  document.addEventListener('click',e=>{
   const target=e.target.closest('[data-tab]');
   if(!target||!canUsePremium())return;
   const dest=target.dataset.tab;
   if(dest==='professional'){setTimeout(()=>{if(canUsePremium())show('home');},0);}
   else if(['missions','inbox','settings','boamp'].includes(dest)){setTimeout(()=>syncTab(dest),0);}
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
  if(user!==uid){uid=user;view='home';}
  const label=state.premium?.legal_name||state.profile?.display_name||'professionnel';
  $('proV3Hello').textContent=label;
  const temporary=Date.parse(state.testPremiumUntil||'')>Date.now();
  const status=temporary?'Accès temporaire':state.premium?.status==='verified'?'Compte vérifié · abonnement actif':'Compte professionnel actif';
  $('proV3Status').textContent=status;
  $('proV3PlanState').textContent=temporary?'Accès de test en cours':'Abonnement actif';
  metrics();recommendations();activity();alerts();
  const commercial=['requests','assistant','tracking'].includes(view);
  for(const section of $('proExperienceV3').querySelectorAll('[data-pro-panel]')){
   const on=section.dataset.proPanel===(commercial?'commercial':view);
   section.hidden=!on;
  }
  activeButtons();
 }
 return {init,render,show,syncTab};
}
