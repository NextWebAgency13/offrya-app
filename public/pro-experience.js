import {buildRadar} from './radar.js';
// Prefer the chosen username over a corporate legal label or technical identifier.
export function professionalGreetingLabel(state){
 const user=state.session?.user, metadata=user?.user_metadata||{};
 const candidates=[
  state.profile?.display_name, metadata.offrya_username, metadata.username,
  metadata.display_name, metadata.full_name, state.premium?.legal_name,
  typeof user?.email==='string'?user.email.split('@')[0]:''
 ];
 for(const item of candidates){
  const label=String(item??'').replace(/[\r\n\t]+/g,' ').trim().replace(/\s+/g,' ');
  if(!label||label.length>80)continue;
  if(/^(?:professionnel|utilisateur offrya|user[_-][a-z0-9_-]{6,}|[a-f0-9-]{24,}|[0-9]{10,})$/i.test(label))continue;
  return label.length>32?label.slice(0,29).trimEnd()+'…':label;
 }
 return '';
}

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
 let radarFilter='all',radarSort='score',radarQuery='';
 let tenderRefreshing=false,priorityOnly=false,trackingBusy=false;
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
   serverRadar=data;state.radarMatches=data;
   recommendations();metrics();alerts();
   document.dispatchEvent(new CustomEvent('offrya:ranking-updated'));

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
  const extras=document.createElement('nav');
  extras.id='proV3SidebarExtras';extras.className='pro-v3-sidebar-extras';
  extras.setAttribute('aria-label','Outils professionnels complémentaires');
  extras.innerHTML='<strong class="pro-v3-extras-title">Outils professionnels</strong>'+secondaryMenu.map(navButton).join('');
  nav.after(extras);extras.after(badge);
  // Secondary Pro screens appear in the existing mobile account menu.
  const accountPanel=document.querySelector('#accountMenu .account-menu-panel');
  if(accountPanel&&!accountPanel.querySelector('#proV3AccountTools')){
   const tools=document.createElement('nav');tools.id='proV3AccountTools';tools.className='pro-v3-account-tools';
   tools.setAttribute('aria-label','Outils professionnels');
   tools.innerHTML='<strong class="pro-v3-account-title">Outils professionnels</strong>'+[...primaryMenu.filter(item=>item[0]!=='home'),...secondaryMenu].map(navButton).join('');
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
   // The three upper cards are redundant with Espace Premium and the account
   // tools. Keep professional actions in the desktop sidebar and Android menu.
   '<section class="pro-v3-view" data-pro-panel="home">',
    '<div class="pro-ai-welcome"><div class="pro-ai-welcome-main"><span class="pro-ai-welcome-eyebrow">ESPACE PROFESSIONNEL · OFFRYA</span><h2>Bonjour, <span id="proV3Hello">professionnel</span></h2><p>Vos missions et marchés publics, sélectionnés selon votre activité.</p></div><span class="pro-ai-welcome-status" id="proV3Status">Compte professionnel</span></div>',
   '<section class="pro-ai-hero" aria-labelledby="proAiHeroTitle">',
    '<div class="pro-ai-hero-main"><span class="pro-ai-intelligence">'+icon('ic-sparkles')+' IA</span><h2 id="proAiHeroTitle">Ma veille intelligente OFFRYA</h2><p>L’IA analyse les nouveaux appels d’offres et missions et vous propose les opportunités les plus pertinentes selon vos critères.</p></div>',
    '<div class="pro-ai-robot" aria-hidden="true"><i class="pro-ai-robot-glow"></i><i class="pro-ai-robot-antenna"></i><i class="pro-ai-robot-head"><b></b><b></b></i><i class="pro-ai-robot-body">✦</i></div>',
    '<div class="pro-ai-criteria"><div class="pro-ai-criteria-head"><strong>Mes critères actuels</strong><button type="button" data-pro-screen="preferences">'+icon('ic-settings')+' Modifier</button></div><div id="proAiCriteria" class="pro-ai-criteria-chips"></div></div>',
   '</section>',
   '<section class="pro-v3-opportunities pro-ai-discovery" aria-label="Radar des opportunités">',
    '<div class="pro-ai-filter-tabs" role="group" aria-label="Type d’opportunité"><button class="is-active" type="button" data-pro-filter="all" aria-pressed="true">'+icon('ic-sparkles')+' Tout <span class="pro-ai-tab-count" id="proAiTabAll">0</span></button><button type="button" data-pro-filter="mission" aria-pressed="false">'+icon('ic-missions')+' Missions <span class="pro-ai-tab-count" id="proAiTabMissions">0</span></button><button type="button" data-pro-filter="tender" aria-pressed="false">'+icon('ic-boamp')+' Marchés <span class="pro-ai-tab-count" id="proAiTabTenders">0</span></button></div>',
    '<p class="pro-ai-inline-summary" id="proAiInlineSummary" role="status">Analyse des opportunités en cours…</p>',
    '<div class="pro-ai-stats" aria-label="Opportunités correspondantes"><div class="pro-ai-stat is-green">'+icon('ic-check')+'<div><strong id="proAiStatAll">0</strong><small>opportunités trouvées</small></div></div><div class="pro-ai-stat is-violet">'+icon('ic-sparkles')+'<div><strong id="proAiStatTenders">0</strong><small>appels d’offres BOAMP / TED</small></div></div><div class="pro-ai-stat is-blue">'+icon('ic-missions')+'<div><strong id="proAiStatMissions">0</strong><small>missions OFFRYA</small></div></div></div>',
    '<div class="pro-ai-heading"><h3>'+icon('ic-sparkles')+' Opportunités recommandées par l’IA</h3><div class="pro-ai-toolbar"><label for="proAiSort">Trier par :</label><select id="proAiSort" aria-label="Trier les opportunités"><option value="score">Pertinence</option><option value="recent">Plus récentes</option><option value="deadline">Échéance proche</option></select><button type="button" data-refresh-radar="true" aria-label="Actualiser" title="Actualiser">'+icon('ic-bolt')+'</button></div></div>',
    '<button class="pro-ai-priority-alert" id="proAiPriorityAlert" type="button" data-pro-priority="true" hidden></button>',
    '<p class="sr-only" id="proV3RadarSummary" role="status" aria-live="polite">Analyse des opportunités…</p>',
    '<div id="proV3Recommendations" class="pro-v3-reco-list pro-ai-results"><p class="pro-v3-empty">Analyse des opportunités accessibles…</p></div>',
    '<p class="pro-v3-radar-disclaimer pro-ai-disclaimer">Les scores sont indicatifs et calculés sur des annonces réelles. Aucun budget inventé ni contact automatique. <span id="proV3MatchingStatus"></span></p>',
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
 function euroRadar(c){return c==null?'Budget non communiqué':(Number(c)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
 function normRadar(x){return String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
 function dateRadar(x){return Number.isFinite(Date.parse(x||''))?new Date(x).toLocaleDateString('fr-FR'):'À vérifier';}

 // Refresh the RLS-authorized alert rows, not just the cached ranking.
 async function refreshTenderRadar(){
  if(tenderRefreshing||!canUsePremium()||!state.db||!state.session?.user?.id)return;
  const user=state.session.user.id;
  const button=$('proExperienceV3')?.querySelector('[data-refresh-radar]');
  tenderRefreshing=true;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  try{
   const response=await state.db.from('offrya_tender_alerts')
    .select('user_id,tender_id,title,buyer,departments,url,deadline,source,match_score,match_reason,detected_at,seen_at')
    .eq('user_id',user).order('detected_at',{ascending:false}).limit(100);
   if(response.error)throw response.error;
   if(state.session?.user?.id!==user||!canUsePremium())return;
   state.opportunityAlerts=Array.isArray(response.data)?response.data:[];
   serverRadar=null;state.radarMatches=null;radarKey='';radarAt=0;
   recommendations();
  }catch(error){
   console.warn('OFFRYA : lecture des alertes BOAMP/TED impossible',error);
   if(state.session?.user?.id===user&&canUsePremium())
    notify('Impossible d’actualiser les marchés publics. Vérifiez votre connexion et réessayez.');
  }finally{
   tenderRefreshing=false;
   if(button){button.disabled=false;button.removeAttribute('aria-busy');}
  }
 }
 function recommendations(){
  const panel=$('proV3Recommendations');if(!panel||!canUsePremium())return;
  const user=state.session?.user?.id;
  const fingerprint=JSON.stringify([user,state.opportunityPrefs,
   (state.missions||[]).map(m=>[m.id,m.status,m.created_at]).slice(0,220),
   (state.opportunityAlerts||[]).map(a=>[a.tender_id,a.match_score,a.deadline]).slice(0,100)]);
  if(fingerprint!==radarKey){radarKey=fingerprint;serverRadar=null;state.radarMatches=null;priorityOnly=false;radarAt=0;}
  if(!radarLoading&&Date.now()-radarAt>5*60*1000)queueMicrotask(()=>loadMatchedRadar(fingerprint,user));
  const p=state.opportunityPrefs||{};
  const sectors=Array.isArray(p.sectors)?p.sectors.filter(Boolean):[];
  const allSectors=sectors.length>=7;
  const sectorLabel=allSectors?'Tous les secteurs':sectors.length?sectors[0]:'Tous les secteurs';
  const deptNames={'13':'Bouches-du-Rhône','30':'Gard','34':'Hérault','83':'Var',
   '84':'Vaucluse','06':'Alpes-Maritimes','75':'Paris','69':'Rhône'};
  const dept=p.department?String(p.department).toUpperCase():'';
  const criteria=[sectorLabel,dept?(deptNames[dept]?deptNames[dept]+' ('+dept+')':'Département '+dept):'Toute la France'];
  if(!allSectors&&sectors.length>1)criteria.push('+'+(sectors.length-1)+' secteurs');
  const more=[];
  if(p.min_budget_cents!=null||p.max_budget_cents!=null)more.push('budget défini');
  if(p.keywords)more.push('mots-clés définis');
  if(more.length)criteria.push(more.join(' et '));
  $('proAiCriteria').innerHTML=criteria.map((value,i)=>'<span class="pro-ai-criteria-chip" title="'+esc(value)+'">'+['▦','⌖','+','⋯'][i]+' '+esc(value)+'</span>').join('');
  const fallback=buildRadar({missions:available(),alerts:state.opportunityAlerts||[],preferences:p,userId:user});
  const missions=new Map(available().map(m=>[String(m.id),m]));
  const notices=new Map((state.opportunityAlerts||[]).filter(a=>a?.deadline&&Date.parse(a.deadline)>Date.now()).map(a=>[String(a.tender_id),a]));
  const seen=new Set();
  const rows=(serverRadar?.items||fallback.items).filter(item=>{
   if(!item||!['mission','tender'].includes(item.kind))return false;
   const key=item.kind+':'+item.id;if(seen.has(key))return false;
   if(item.kind==='mission'&&!missions.has(String(item.id)))return false;
   if(item.kind==='tender'){const a=notices.get(String(item.id));
    if(!a||a.url!==item.url||!(/^https:\/\/(www\.)?boamp\.fr\//i.test(a.url||'')||
      /^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(a.url||'')))return false;
    const codes=String(a.departments||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(x=>/^\d{1,2}$/.test(x)?x.padStart(2,'0'):x);
    if(p.department&&codes.length&&!codes.includes(String(p.department).toUpperCase()))return false;
    if(serverRadar&&p.sectors?.length&&!p.sectors.includes(item.category))return false;
   }
   seen.add(key);return true;
  }).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const nMission=rows.filter(x=>x.kind==='mission').length,nTender=rows.filter(x=>x.kind==='tender').length;
  $('proAiInlineSummary').textContent=rows.length+' opportunité'+(rows.length!==1?'s':'')+' correspondant à vos critères, dont '+nTender+' marché'+(nTender!==1?'s':'')+' public'+(nTender!==1?'s':'')+' et '+nMission+' mission'+(nMission!==1?'s':'')+'.';
  for(const [id,n] of [['proAiTabAll',rows.length],['proAiStatAll',rows.length],['proAiTabMissions',nMission],['proAiStatMissions',nMission],['proAiTabTenders',nTender],['proAiStatTenders',nTender]])$(id).textContent=String(n);
  const priority=serverRadar?rows.filter(item=>{
   const a=notices.get(String(item.id));
   return item.kind==='tender'&&Number(item.score)>=75&&a&&!a.seen_at;
  }):[];
  const priorityButton=$('proAiPriorityAlert');
  if(priorityButton){
   priorityButton.hidden=!priority.length;
   priorityButton.textContent=priority.length+' nouveau'+(priority.length>1?'x':'')+
    ' marché'+(priority.length>1?'s':'')+' prioritaire'+(priority.length>1?'s':'')+' · Voir les alertes';
   priorityButton.setAttribute('aria-pressed',String(priorityOnly));
  }
  const selected=rows.filter(item=>{
   if(radarFilter!=='all'&&radarFilter!==item.kind)return false;
   if(priorityOnly&&(!priority.some(x=>x.id===item.id)||item.kind!=='tender'))return false;
   if(!radarQuery)return true;
   const m=missions.get(String(item.id)),a=notices.get(String(item.id));
   return normRadar([item.title,item.location,item.source,item.description,m?.description,m?.category,a?.buyer,...(item.reasons||[])].join(' ')).includes(normRadar(radarQuery));
  }).sort((a,b)=>radarSort==='recent'
   ?(Date.parse(b.created_at||0)||0)-(Date.parse(a.created_at||0)||0)
   :radarSort==='deadline'
    ?(Date.parse(a.deadline||'')||Infinity)-(Date.parse(b.deadline||'')||Infinity)
    :Number(b.score||0)-Number(a.score||0));
  for(const b of $('proExperienceV3').querySelectorAll('[data-pro-filter]')){
   const active=b.dataset.proFilter===radarFilter;
   b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));
  }
  $('proV3MatchingStatus').textContent=serverRadar?.mode==='ai'?'Classement métier vérifié, puis affiné par IA.':
   serverRadar?'Correspondance calculée selon le métier, la zone et l’échéance.':
   'Correspondances provisoires, calcul métier en cours de chargement.';
  $('proV3RadarSummary').textContent=selected.length+' opportunité'+(selected.length>1?'s':'')+
   ' affichée'+(selected.length>1?'s':'')+'.';
  const tracked=new Map((state.tenderTracking||[]).map(t=>[String(t.tender_id),t]));
  panel.innerHTML=selected.length?selected.slice(0,24).map(item=>{
   const tender=item.kind==='tender',m=missions.get(String(item.id)),a=notices.get(String(item.id));
   const follow=tender?tracked.get(String(item.id)):null;
   const description=String(m?.description||item.description||'').trim();
   const desc=description?'<p class="pro-ai-card-description">'+esc(description.slice(0,175))+(description.length>175?'…':'')+'</p>':'';
   const date=tender?item.deadline:m?.desired_date;
   const due=date&&Number.isFinite(Date.parse(date))?
    '<span class="pro-ai-card-due'+(Date.parse(date)<Date.now()+7*86400000?' urgent-date':'')+'">'+
    (tender?'Date limite : ':'Date souhaitée : ')+esc(dateRadar(date))+'</span>':'';
   const reasons=(Array.isArray(item.reasons)?item.reasons.slice(0,3):[]).filter(Boolean);
   const reason=tender&&!serverRadar?'Classement métier en cours de vérification.':reasons.join(' · ');
   const why=reason?'<p class="pro-ai-match-reason"><b>Pourquoi ce marché ?</b> '+esc(reason.slice(0,240))+'</p>':'';
   const score=Math.min(100,Math.max(0,Math.round(Number(item.score)||0)));
   const scoreLabel=tender&&!serverRadar?'Pertinence en cours de calcul':
    score+' % pertinent'+(item.locationType==='unknown'?' · Zone à confirmer':'');
   const source=tender?esc(item.source==='TED'?'TED':'BOAMP'):'MISSION OFFRYA';
   const action=tender
    ?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer" class="pro-v3-reco-btn">Consulter l’appel d’offres →</a>'
    :'<button type="button" class="pro-v3-reco-btn" data-pro-view-mission="'+esc(item.id)+'" title="Voir la mission et Préparer une proposition">Voir la mission →</button>';
   const favorite=tender?'<div class="pro-ai-follow-actions">'+
    (follow?'<label class="pro-ai-stage-label">Suivi <select class="pro-ai-stage-select" data-pro-stage-tender="'+esc(item.id)+'">'+
      [['saved','Enregistré'],['reviewing','À analyser'],['preparing','Dossier en préparation'],['submitted','Candidature déposée'],['done','Terminé']]
       .map(([value,label])=>'<option value="'+value+'"'+(follow.stage===value?' selected':'')+'>'+label+'</option>').join('')+
      '</select></label><button type="button" class="pro-ai-track-action" data-pro-remove-tender="'+esc(item.id)+'" aria-label="Retirer du suivi">Retirer</button>':
      '<button type="button" class="pro-ai-track-action" data-pro-save-tender="'+esc(item.id)+'" aria-label="Enregistrer ce marché">☆ Enregistrer</button>')+'</div>':'';
   const price=!tender&&m?.budget_cents!=null?'<span class="pro-ai-mission-budget">Budget : '+esc(euroRadar(m.budget_cents))+'</span>':'';
   return '<article class="pro-v3-radar-row pro-ai-card '+(tender?'pro-ai-card-tender':'pro-ai-card-mission')+'">'+
    '<div class="pro-ai-card-icon">'+(tender?icon('ic-boamp'):icon('ic-missions'))+'</div>'+
    '<div class="pro-v3-radar-body pro-ai-card-content"><div class="pro-ai-card-labels">'+
    '<span class="pro-ai-card-origin">'+source+'</span>'+
    (m?.urgency==='urgent'?'<span class="pro-ai-card-urgent">Urgent</span>':'')+
    '</div><h4 title="'+esc(item.title)+'">'+esc(item.title)+'</h4>'+
    '<div class="pro-v3-radar-details pro-ai-card-place"><span>⌖ '+esc(item.location||'Zone non précisée')+'</span>'+
    (tender?'<span class="pro-ai-buyer">Acheteur : '+esc(a?.buyer||'Non précisé')+'</span>':'')+
    '</div>'+desc+why+'</div>'+
    '<div class="pro-v3-radar-side pro-ai-card-side"><strong class="pro-ai-score'+(tender&&!serverRadar?' is-pending':'')+'">'+esc(scoreLabel)+'</strong>'+
    '<div class="pro-ai-card-budget">'+due+price+'</div>'+action+favorite+'</div></article>';
  }).join('') :'<div class="pro-v3-empty pro-ai-empty"><strong>'+
   (priorityOnly?'Aucune nouvelle alerte prioritaire.':radarFilter==='tender'?
    'Aucun appel d’offres officiel ne correspond à vos critères.':'Aucune opportunité correspondant à vos critères.')+
   '</strong><p>'+ (serverRadar?'Les métiers, la localisation et les échéances ont été vérifiés. Ajustez vos critères pour élargir la recherche.':
    'Le classement métier est en cours de vérification. Actualisez si le chargement persiste.')+
   '</p><button type="button" data-pro-screen="preferences">Modifier mes critères →</button>'+
   '<button type="button" data-pro-screen="boamp">Rechercher les avis BOAMP →</button></div>';

 }
 function metrics(){
  const missions=available(),count=unreadMatchedNotifications().length;
  $('proV3WatchState').textContent=Date.parse(state.testPremiumUntil||'')>Date.now()?'Accès test':'Automatique';
  $('proV3AlertCount').textContent=serverRadar?String(serverRadar.items.filter(x=>x.kind==='tender'&&x.score>=75).length):'—';
  const bubble=$('proV3AlertBubble');
  if(bubble){bubble.hidden=!count;bubble.textContent=String(Math.min(count,99));}
  const trigger=$('proV3MobileAlert');
  if(trigger)trigger.setAttribute('aria-label',count?'Ouvrir '+count+' mission(s) correspondant à mes filtres':'Consulter les missions disponibles');
  for(const el of document.querySelectorAll('[data-pro-count="requests"]')){el.textContent=String(missions.length);el.hidden=!missions.length;}
  for(const el of document.querySelectorAll('[data-pro-count="inbox"]')){const count=Number(state.messageUnreadCount||0);el.textContent=count>99?'99+':String(count);el.hidden=!count;}
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
  const node=$('proV3WatchAlertList');if(!node)return;
  if(!serverRadar){node.innerHTML='<div class="pro-v3-empty">Vérification des métiers en cours. Les alertes prioritaires apparaîtront après classement.</div>';return;}
  const notices=new Map((state.opportunityAlerts||[]).map(a=>[String(a.tender_id),a]));
  const rows=serverRadar.items.filter(x=>x.kind==='tender'&&Number(x.score)>=75)
   .filter(x=>notices.has(String(x.id))&&(!x.deadline||Date.parse(x.deadline)>Date.now()));
  node.innerHTML=rows.length?rows.slice(0,15).map(item=>{
   const a=notices.get(String(item.id));
   const official=/^https:\/\/(www\.)?boamp\.fr\//i.test(a.url||'')||
    /^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(a.url||'');
   const href=official?esc(a.url):null;
   const name=a.source==='TED'?'TED · Union européenne':'BOAMP · DILA';
   const why=(item.reasons||[]).slice(0,2).join(' · ');
   return '<div class="pro-v3-watch-item"><small>'+esc(name)+' · '+
    esc(a.seen_at?'Déjà consultée':'Marché prioritaire non consulté')+'</small>'+
    '<strong>'+esc(a.title||'Marché public')+'</strong>'+
    '<small>Pertinence : '+Math.round(Number(item.score))+'/100 · '+esc(why)+'</small>'+
    '<small>Échéance : '+esc(a.deadline?new Date(a.deadline).toLocaleDateString('fr-FR'):'À vérifier')+'</small>'+
    (href?'<a href="'+href+'" target="_blank" rel="noopener noreferrer">Consulter la publication officielle</a>':'')+'</div>';
  }).join(''):'<div class="pro-v3-empty">Aucun marché suffisamment pertinent pour une alerte prioritaire. Les avis moins pertinents restent consultables dans le radar.</div>';
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
 function openMissionDetail(id){
  const mission=available().find(m=>String(m.id)===String(id));if(!mission)return;
  acknowledgeMatchedNotifications(id);
  $('missionQuery').value='';$('missionCategory').value='';$('missionDept').value='';
  state.selectedMissionId=mission.id;
  // Preserve the detail selection. renderMissions switches to the available
  // scope when an opportunity is opened from the professional radar.
  renderMissions();
  tab('missions',false,true);
 }
 function openMission(id){
  const m=available().find(x=>x.id===id);if(!m)return;
  acknowledgeMatchedNotifications(id);
  if(openProposal&&openProposal(id)){show('assistant');return;}
  notify('Impossible d’ouvrir cette mission. Actualisez vos opportunités et réessayez.');
 }
 async function updateTenderTracking(tenderId,stage){
  if(trackingBusy||!canUsePremium()||!state.session?.user?.id||!state.db)return;
  const user=state.session.user.id;
  const current=(state.tenderTracking||[]).find(row=>String(row.tender_id)===tenderId);
  const allowed=['saved','reviewing','preparing','submitted','done'];
  if(stage!==null&&!allowed.includes(stage))return;
  const notice=(state.opportunityAlerts||[]).find(row=>String(row.tender_id)===tenderId);
  if(!current&&!notice)return;
  const url=String(current?.url||notice?.url||'');
  if(!(/^https:\/\/(www\.)?boamp\.fr\//i.test(url)||
   /^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(url)))return;
  trackingBusy=true;
  try{
   let result;
   if(stage===null){
    result=await state.db.from('offrya_tender_tracking').delete().eq('user_id',user).eq('tender_id',tenderId);
   }else if(current){
    result=await state.db.from('offrya_tender_tracking').update({stage,updated_at:new Date().toISOString()})
     .eq('user_id',user).eq('tender_id',tenderId);
   }else{
    result=await state.db.from('offrya_tender_tracking').insert({
     user_id:user,tender_id:tenderId,title:String(notice.title).slice(0,500),
     url,stage:'saved',updated_at:new Date().toISOString()
    });
   }
   if(result.error)throw result.error;
   if(state.session?.user?.id!==user||!canUsePremium())return;
   state.tenderTracking=(state.tenderTracking||[]).filter(t=>String(t.tender_id)!==tenderId);
   if(stage!==null){
    state.tenderTracking.push(current?{...current,stage,updated_at:new Date().toISOString()}:
     {user_id:user,tender_id:tenderId,title:String(notice.title).slice(0,500),url,stage:'saved'});
   }
   recommendations();
   notify(stage===null?'Marché retiré du suivi.':current?'Suivi du marché mis à jour.':'Marché enregistré dans votre suivi.');
  }catch(error){
   console.warn('OFFRYA : suivi du marché inaccessible',error);
   notify('Impossible de modifier ce suivi. Vérifiez votre accès Premium et réessayez.');
   recommendations();
  }finally{trackingBusy=false;}
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
   const priority=e.target.closest('[data-pro-priority]');
   if(priority&&canUsePremium()){
    priorityOnly=!priorityOnly;radarFilter=priorityOnly?'tender':'all';recommendations();return;
   }
   const save=e.target.closest('[data-pro-save-tender]');
   if(save&&canUsePremium()){updateTenderTracking(save.dataset.proSaveTender,'saved');return;}
   const remove=e.target.closest('[data-pro-remove-tender]');
   if(remove&&canUsePremium()){updateTenderTracking(remove.dataset.proRemoveTender,null);return;}
   const radarButton=e.target.closest('[data-refresh-radar]');
   if(radarButton&&canUsePremium()){refreshTenderRadar();return;}
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
   const typeFilter=e.target.closest('[data-pro-filter]');
   if(typeFilter&&canUsePremium()){priorityOnly=false;radarFilter=typeFilter.dataset.proFilter;recommendations();return;}
   const detail=e.target.closest('[data-pro-view-mission]');
   if(detail&&canUsePremium()){openMissionDetail(detail.dataset.proViewMission);return;}
   const b=e.target.closest('[data-pro-mission]');if(b)openMission(b.dataset.proMission);
    
  });
  $('proExperienceV3').addEventListener('change',event=>{
   const select=event.target.closest('[data-pro-stage-tender]');
   if(select&&canUsePremium())updateTenderTracking(select.dataset.proStageTender,select.value);
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
   else if(route==='/espace/marches-publics')show('home',true);
   else syncTab(route==='/espace'?'dashboard':route.includes('/missions')?'missions':route.includes('/messagerie')?'inbox':route.includes('/reglages')?'settings':'boamp');
  });
  const header=document.querySelector('.app-shell .header');
  const search=document.createElement('form');search.id='proV3Search';search.className='pro-v3-search';
  search.setAttribute('role','search');search.innerHTML='<label class="sr-only" for="proV3SearchInput">Rechercher missions et appels d’offres</label><input id="proV3SearchInput" placeholder="Rechercher une mission, un appel d’offre, une ville…" autocomplete="off" maxlength="100"><button type="submit" aria-label="Rechercher">'+icon('ic-search')+'</button>';
  $('proExperienceV3').querySelector('[data-pro-panel="home"]').before(search);
  search.addEventListener('submit',e=>{e.preventDefault();if(!canUsePremium())return;$('missionQuery').value=$('proV3SearchInput').value;radarQuery=$('proV3SearchInput').value.trim();show('home');recommendations();});
  $('proV3SearchInput').addEventListener('input',e=>{if(!canUsePremium())return;radarQuery=e.target.value.trim();recommendations();});
  $('proAiSort').addEventListener('change',e=>{if(!canUsePremium())return;radarSort=e.target.value;recommendations();});
 }
 function render(){
  if(!initialized)return;
  const premium=Boolean(canUsePremium());
  document.body.classList.toggle('offrya-pro-v3',premium);
  if(!premium){uid=null;serverRadar=null;radarKey='';radarAt=0;return;}
  const user=state.session?.user?.id;
  if(user!==uid){uid=user;view='home';state.radarMatches=null;
  }
  const label=professionalGreetingLabel(state);
  $('proV3Hello').textContent=label||'OFFRYA';
  $('proV3Hello').title=label||'OFFRYA';
  const greeting=$('proV3Hello').parentElement;
  if(greeting?.firstChild?.nodeType===Node.TEXT_NODE)
   greeting.firstChild.textContent=label?'Bonjour, ':'Bienvenue sur ';
  const temporary=Date.parse(state.testPremiumUntil||'')>Date.now();
  const status=temporary?'Accès Premium de test':state.premium?.status==='verified'?'Professionnel vérifié · abonné':'Compte professionnel actif';
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
