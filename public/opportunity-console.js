// OFFRYA unified opportunity console. Does not grant authorization:
// private missions are read under Supabase RLS; BOAMP requests require a
// server-verified professional entitlement, independent of the browser.
export function createOpportunityConsole({state,element,canUsePremium,tab,renderMissions,notify}){
 const $=element;
 const sectors=['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre'];
 const search={Nettoyage:'nettoyage', 'Espaces verts':'espaces verts',Bâtiment:'travaux',Informatique:'informatique',Transport:'transport','Restauration & Hôtellerie':'restauration','Bien-être & Beauté':'beauté',Autre:''};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\x27':'&#39;'}[c]));
 let ready=false,loadedUser=null,lastSearch=0,searching=false,tenders=[],scanError=null,previousFingerprint='',refreshInProgress=false;
 let activeView='missions';
 function selectView(view){
  if(view!=='missions'&&view!=='tenders')return;
  activeView=view;
  for(const button of document.querySelectorAll('[data-op-view]')){
   const selected=button.dataset.opView===view;
   button.classList.toggle('is-active',selected);
   button.setAttribute('aria-selected',String(selected));
  }
  for(const [key,id] of [['missions','opMissionPane'],['tenders','opTenderPane']]){
   const panel=$(id);if(!panel)continue;
   panel.hidden=key!==view;
   panel.classList.toggle('hidden',key!==view);
  }
 }

 const current=()=>state.session?.user?.id;
 function prefs(){return state.opportunityPrefs||{sectors:[],department:'',keywords:''};}
 function matchMission(m,p){
  if(m.status!=='open'||m.owner_id===current())return false;
  if(p.sectors?.length&&!p.sectors.includes(m.category))return false;
  if(p.department&&m.department!==p.department)return false;
  if(p.keywords&&!String(m.title+' '+m.description+' '+m.city).toLocaleLowerCase('fr').includes(p.keywords.toLocaleLowerCase('fr')))return false;
  if(p.min_budget_cents!=null&&m.budget_cents!=null&&m.budget_cents<p.min_budget_cents)return false;
  if(p.max_budget_cents!=null&&m.budget_cents!=null&&m.budget_cents>p.max_budget_cents)return false;
  return true;
 }
 function missions(){return state.missions.filter(m=>matchMission(m,prefs())).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));}
 const money=c=>c==null?'Budget non précisé':(c/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
 const fmtDate=s=>s?new Date(s).toLocaleDateString('fr-FR'):'Non précisée';
 function render(){
  if(!$('opWatchForm')||!canUsePremium())return;
  const uid=current();
  if(uid!==loadedUser){loadedUser=uid;ready=false;lastSearch=0;previousFingerprint='';tenders=[];}
  const p=prefs();
  if(!ready){
   const form=$('opWatchForm');
   form.elements.department.value=p.department||'';
   form.elements.keywords.value=p.keywords||'';
   for(const c of $('opSectorChoices').querySelectorAll('input'))c.checked=Boolean(p.sectors?.includes(c.value));
   ready=true;
  }
  const ms=missions();
  $('opMissionCount').textContent=String(ms.length);
  $('opTenderCount').textContent=scanError?'—':lastSearch?String(tenders.length):'—';
  $('opMessagesCount').textContent=String(state.conversations?.length||0);
  $('opSavedCount').textContent=String(state.tenderTracking?.length||0);
  $('opAccessStatus').textContent=Date.parse(state.testPremiumUntil||'')>Date.now()?'Mode test · accès temporaire':'Professionnel actif';
  $('opMissionList').innerHTML=ms.length?ms.slice(0,8).map(m=>
   '<article class="op-result"><div><span class="op-source">MISSION OFFRYA</span><h5>'+esc(m.title)+'</h5><p>'+esc(m.category)+' · '+esc(m.city)+' ('+esc(m.department)+') · '+esc(money(m.budget_cents))+'</p></div><button type="button" class="button secondary" data-op-mission="'+esc(m.id)+'">Consulter</button></article>'
  ).join(''):'<p class="muted">Aucune mission ouverte ne correspond à vos critères pour le moment. Les nouvelles annonces des particuliers et entreprises apparaîtront ici.</p>';
  renderTenders();renderTracked();renderAlerts();
  selectView(activeView);
  const fp=JSON.stringify([uid,p.sectors,p.department,p.keywords]);
  if(fp!==previousFingerprint){previousFingerprint=fp;lastSearch=0;tenders=[];scanError=null;}
  if(!lastSearch&&!searching&&!refreshInProgress&&uid)queueMicrotask(()=>refreshTenders());
 }
 function renderTenders(){
  const list=$('opTenderList');if(!list)return;
  if(searching&&!tenders.length){list.innerHTML='<p class="muted">Recherche des avis officiels en cours…</p>';return;}
  if(scanError&&!tenders.length){list.innerHTML='<p class="muted">Recherche BOAMP indisponible. Réessayez plus tard. Aucune annonce fictive n’est affichée.</p>';return;}
  if(!lastSearch){list.innerHTML='<p class="muted">Lancement de la recherche sectorielle…</p>';return;}
  const tracked=new Set((state.tenderTracking||[]).map(x=>x.tender_id));
  list.innerHTML=tenders.length?tenders.slice(0,9).map(t=>
   '<article class="op-result"><div><span class="op-source">MARCHÉ PUBLIC · BOAMP</span><h5>'+esc(t.title)+'</h5><p>'+esc(t.buyer)+' · '+esc(t.departments||'France')+' · Échéance : '+esc(fmtDate(t.deadline))+'</p><a href="'+esc(t.url)+'" target="_blank" rel="noopener noreferrer">Avis officiel ↗</a></div><button type="button" class="button secondary" data-op-save="'+esc(t.id)+'" '+(tracked.has(t.id)?'disabled':'')+'>'+(tracked.has(t.id)?'Enregistré':'Suivre')+'</button></article>'
  ).join(''):'<p class="muted">Aucun marché ouvert correspondant à ces filtres dans les résultats interrogés. Élargissez votre zone ou vos secteurs.</p>';
  $('opTenderUpdated').textContent=lastSearch?'Dernière recherche : '+new Date(lastSearch).toLocaleString('fr-FR')+' · BOAMP / DILA · Résultats de recherche, non exhaustifs.':'Aucune recherche lancée.';
 }
 function renderAlerts(){
  const node=$('opAlertsList');if(!node)return;
  const rows=[...(state.opportunityAlerts||[])].filter(a=>!a.deadline||Date.parse(a.deadline)>Date.now())
   .sort((a,b)=>(b.match_score||0)-(a.match_score||0));
  node.innerHTML=rows.length?rows.slice(0,15).map(a=>{
   const source=a.source==='TED'?'TED · Union européenne':'BOAMP · DILA';
   const allowed=/^https:\/\/(www\.)?boamp\.fr\//i.test(a.url||'')
    ||/^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(a.url||'');
   const link=allowed?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">Consulter l’annonce publique officielle</a>':'';
   const score=Number.isInteger(a.match_score)?' · Correspondance '+a.match_score+'/100':'';
   return '<article class="op-result"><div><span class="op-source">'+esc(source)+' · '+(a.seen_at?'DÉJÀ CONSULTÉ':'NOUVELLE OPPORTUNITÉ')+'</span><h5>'+esc(a.title)+'</h5><p>Détectée le '+esc(fmtDate(a.detected_at))+' · Échéance : '+esc(fmtDate(a.deadline))+score+'</p>'+link+'</div>'+
    (a.seen_at?'':'<button class="button secondary" data-op-seen="'+esc(a.tender_id)+'">Marquer comme lu</button>')+'</article>';
  }).join(''):'<p class="muted">Aucune opportunité qualifiée enregistrée. Activez la veille pour recevoir les annonces publiques BOAMP et TED correspondant à vos critères.</p>';
 }
 function renderTracked(){
  const rows=state.tenderTracking||[];
  $('opTrackedList').innerHTML=rows.length?rows.map(t=>
   '<article class="op-result"><div><span class="op-source">MARCHÉ SUIVI</span><h5>'+esc(t.title||t.tender_id)+'</h5>'+(t.url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(t.url)+'">Ouvrir l’avis officiel ↗</a>':'')+'</div><label>Suivi<select class="field" data-op-stage="'+esc(t.tender_id)+'">'+
   [['saved','Enregistré'],['reviewing','À analyser'],['preparing','Dossier en préparation'],['submitted','Candidature déposée'],['done','Terminé']].map(([k,v])=>'<option value="'+k+'" '+(t.stage===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label></article>'
  ).join(''):'<p class="muted">Aucun marché public suivi. Vous pouvez enregistrer un avis depuis les résultats BOAMP.</p>';
 }
 async function refreshTenders(){
  if(!canUsePremium()||searching||!current())return;
  const uid=current(),p=prefs();searching=true;scanError=null;renderTenders();
  const queries=(p.sectors?.length?p.sectors.slice(0,5).map(x=>search[x]||'').filter(Boolean):[p.keywords||'']).slice(0,5);
  if(!queries.length)queries.push('');
  try{
   const session=(await state.db.auth.getSession()).data?.session;
   if(!session)throw Error('Session expirée');
   const combined=new Map();
   for(const term of queries){
    if(current()!==uid)break;
    const q=[term,p.keywords||''].filter(Boolean).join(' ').trim().slice(0,90);
    const url='/api/annonces?'+new URLSearchParams({q,dept:p.department||'',offset:'0'});
    const r=await fetch(url,{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
    if(!r.ok)throw Error('BOAMP '+r.status);
    const data=await r.json();
    for(const item of data.items||[])if(item?.id&&!combined.has(item.id))combined.set(item.id,item);
   }
   if(uid===current()){tenders=Array.from(combined.values()).filter(x=>!x.deadline||Date.parse(x.deadline)>Date.now()).sort((a,b)=>Date.parse(a.deadline||'9999-01-01')-Date.parse(b.deadline||'9999-01-01'));lastSearch=Date.now();}
  }catch(e){scanError=e;lastSearch=Date.now();console.warn('OFFRYA: recherche sectorielle BOAMP indisponible',e);}
  finally{searching=false;renderTenders();if($('opTenderCount'))$('opTenderCount').textContent=scanError?'—':String(tenders.length);}
 }
 async function saveWatch(event){
  event.preventDefault();if(!canUsePremium())return;
  const f=event.currentTarget,p={user_id:current(),
   sectors:[...$('opSectorChoices').querySelectorAll('input:checked')].map(x=>x.value).filter(x=>sectors.includes(x)),
   department:f.elements.department.value.trim().toUpperCase(),keywords:f.elements.keywords.value.trim(),
   alerts_enabled:true,updated_at:new Date().toISOString()};
  if(p.department&&!/^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(p.department)){notify('Indiquez un département valide ou laissez vide.');return;}
  const result=await state.db.from('offrya_opportunity_preferences').upsert(p,{onConflict:'user_id'});
  if(result.error){notify('Préférences non enregistrées.');console.warn(result.error);return;}
  state.opportunityPrefs=p;lastSearch=0;previousFingerprint='';$('opWatchFeedback').textContent='Veille automatique incluse dans votre abonnement Premium. Vos critères facultatifs sont enregistrés.';
  render();notify('Filtres facultatifs enregistrés. La veille reste automatique.');
 }
 async function trackTender(t){
  if(!canUsePremium())return;
  const record={user_id:current(),tender_id:t.id,title:String(t.title).slice(0,500),url:t.url,stage:'saved',updated_at:new Date().toISOString()};
  const {error}=await state.db.from('offrya_tender_tracking').upsert(record,{onConflict:'user_id,tender_id'});
  if(error){notify('Impossible d’enregistrer ce marché.');return;}
  state.tenderTracking=[...(state.tenderTracking||[]).filter(x=>x.tender_id!==t.id),record];render();notify('Marché ajouté à votre suivi.');
 }
 async function changeStage(tenderId,stage){
  if(!canUsePremium()||!['saved','reviewing','preparing','submitted','done'].includes(stage))return;
  const {error}=await state.db.from('offrya_tender_tracking').update({stage,updated_at:new Date().toISOString()}).eq('user_id',current()).eq('tender_id',tenderId);
  if(error){notify('Enregistrement indisponible.');return;}
  state.tenderTracking=(state.tenderTracking||[]).map(x=>x.tender_id===tenderId?{...x,stage}:x);
  notify('Suivi mis à jour.');
 }
 function init(){
  document.querySelectorAll('[data-op-view]').forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.opView)));
  $('opOpenWatch')?.addEventListener('click',()=>{
   const details=$('opWatchDetails');if(!details)return;
   details.open=true;
   details.scrollIntoView({block:'start',behavior:'smooth'});
  });
  $('opGoMessages')?.addEventListener('click',()=>tab('inbox'));
  $('opWatchForm')?.addEventListener('submit',saveWatch);
  $('opTenderRefresh')?.addEventListener('click',()=>refreshTenders());
  $('opAllMissions')?.addEventListener('click',()=>tab('missions'));
  $('opAllTenders')?.addEventListener('click',()=>tab('boamp'));
  $('opGoSettings')?.addEventListener('click',()=>tab('settings'));
  $('opMissionList')?.addEventListener('click',e=>{
   const target=e.target.closest('[data-op-mission]');if(!target)return;
   state.selectedMissionId=target.dataset.opMission;
   $('missionQuery').value='';$('missionCategory').value='';$('missionDept').value='';
   renderMissions();tab('missions',false,true);
  });
  $('opTenderList')?.addEventListener('click',e=>{
   const target=e.target.closest('[data-op-save]');if(!target)return;
   const t=tenders.find(x=>x.id===target.dataset.opSave);if(t)trackTender(t).catch(console.error);
  });
  $('opAlertsList')?.addEventListener('click',async e=>{
   const button=e.target.closest('[data-op-seen]');if(!button||!canUsePremium())return;
   const id=button.dataset.opSeen;
   const {error}=await state.db.from('offrya_tender_alerts').update({seen_at:new Date().toISOString()}).eq('user_id',current()).eq('tender_id',id);
   if(error){notify('Impossible de mettre à jour cette alerte.');return;}
   state.opportunityAlerts=(state.opportunityAlerts||[]).map(a=>a.tender_id===id?{...a,seen_at:new Date().toISOString()}:a);
   renderAlerts();
  });
  $('opTrackedList')?.addEventListener('change',e=>{
   if(e.target.matches('[data-op-stage]'))changeStage(e.target.dataset.opStage,e.target.value).catch(console.error);
  });
  // Refresh while the user is actively using the application. No external
  // e-mail messages are sent by this client-side feature.
  setInterval(()=>{if(!document.hidden&&current()&&canUsePremium()&&Date.now()-lastSearch>20*60*1000)refreshTenders();},60*1000);
 }
 return {init,render,refreshTenders};
}
