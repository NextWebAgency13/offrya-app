// Proposals are manually approved messages, not binding quotes.
export function buildProposalMessage(text,{amount='',delay=''}={}){
 const message=String(text||'').trim();
 if(!message)throw Error('Rédigez un message avant l’envoi.');
 const raw=String(amount??'').trim();
 let price='';
 if(raw){
  if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(raw))throw Error('Montant indicatif invalide.');
  const value=Number(raw.replace(',','.'));
  if(!Number.isFinite(value)||value<1||value>1000000)throw Error('Montant indicatif invalide.');
  price=value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
 }
 const timing=String(delay||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 if(timing.length>90)throw Error('Indiquez un délai de 90 caractères maximum.');
 const info=[
  ...(price?['Montant estimatif : '+price+' (taxes et conditions à préciser)']:[]),
  ...(timing?['Délai estimé : '+timing]:[])
 ];
 const full=info.length?message+'\n\nProposition indicative, à confirmer après échange :\n'+info.join('\n')+'\nCette estimation ne constitue pas un devis ferme.':message;
 if(full.length>2500)throw Error('Votre proposition dépasse 2 500 caractères.');
 return full;
}
// OFFRYA Pro commercial workspace. Mission discovery is always RLS-protected.
// Replies are never sent without the professional pressing "Valider et envoyer".
export function createSalesWorkspace({state,element,canUsePremium,tab,notify,refresh,onNavigate}){
 const $=element;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\x27':'&#39;'}[c]));
 const stageNames={new:'À qualifier',qualifying:'Informations manquantes',reply_ready:'Réponse à valider',contacted:'Client contacté',followup:'À relancer',quote:'Devis en préparation',won:'Mission obtenue',lost:'Clôturé sans suite'};
 let selected=null,view='requests',accountId=null,drafts=new Map(),proposalMeta=new Map(),busy=false;
 const uid=()=>state.session?.user?.id||null;
 const accessible=()=>canUsePremium()?state.missions.filter(m=>m.owner_id!==uid()&&m.status==='open'): [];
 const tracking=()=>new Map((state.salesTracking||[]).map(x=>[x.mission_id,x.stage]));
 function effectiveStage(m,t){
  if(t.has(m.id))return t.get(m.id);
  return (state.conversations||[]).some(c=>c.mission_id===m.id&&c.professional_id===uid())?'contacted':'new';
 }
 function switchView(next){
  if(!['requests','assistant','tracking'].includes(next))return;
  view=next;
  for(const btn of document.querySelectorAll('[data-sales-tab]')){
   const isActive=btn.dataset.salesTab===next;
   btn.setAttribute('aria-selected',String(isActive));
  }
  for(const [name,id] of [['requests','salesRequestsPane'],['assistant','salesAssistantPane'],['tracking','salesTrackingPane']]){
   $(id).hidden=name!==next;
  }
 }
 function leadCard(m,t){
  const status=effectiveStage(m,t);
  const loc=[m.city,m.department&&'('+m.department+')'].filter(Boolean).join(' ');
  return '<button type="button" class="sales-lead" data-sales-open="'+esc(m.id)+'"><strong>'+esc(m.title||'Mission')+'</strong><span class="sales-chevron" aria-hidden="true">›</span><small>'+esc([m.category,loc].filter(Boolean).join(' · ')||'Localisation non précisée')+'</small><span class="sales-lead-status">'+esc(stageNames[status]||'À qualifier')+'</span><span class="sales-lead-action">Préparer une proposition →</span></button>';
 }
 function buildDraft(m){
  const area=m.area_sqm?String(m.area_sqm)+' m²':'';
  const date=m.desired_date?new Date(m.desired_date).toLocaleDateString('fr-FR'):'';
  const description=String(m.description||'').toLowerCase();
  const requests=[];
  if(!area&&/(jardin|terrain|tonte|nettoyage|bureaux|surface)/i.test(m.title+' '+description))requests.push('la surface approximative concernée');
  if(!date)requests.push('la date ou la période souhaitée pour l’intervention');
  if(!m.budget_cents)requests.push('votre budget indicatif, si vous en avez un');
  if(/(jardin|elag|élag|travaux|rénov|peinture|répar)/i.test(m.title+' '+description))requests.push('quelques photos utiles pour évaluer la prestation');
  const detail=requests.length?'Pourriez-vous me préciser '+requests.slice(0,3).join(', ')+' ?':'Pourriez-vous me confirmer les modalités pratiques et les disponibilités pour échanger sur cette prestation ?';
  return 'Bonjour,\n\nMerci pour votre demande concernant « '+String(m.title||'votre projet').slice(0,110)+' »'+(m.city?' à '+m.city:'')+'.\n\n'+detail+'\n\nCes informations nous permettront d’étudier votre besoin et de revenir vers vous avec une proposition adaptée.\n\nCordialement';
 }
 function renderAssistant(m,t){
  const node=$('salesAssistantContent');
  if(!m){
   node.innerHTML='<div class="sales-empty">Sélectionnez une demande dans l’onglet Demandes pour préparer une réponse.</div>';
   return;
  }
  const status=effectiveStage(m,t);
  const loc=[m.city,m.department].filter(Boolean).join(' · ');
  node.innerHTML='<div class="sales-assistant-detail"><button class="sales-back" type="button" data-sales-back>← Toutes les demandes</button><h5>'+esc(m.title)+'</h5><p class="muted">'+esc(loc||'Localisation non précisée')+'</p>'+
   '<div class="sales-received"><strong>Demande reçue</strong><p>'+esc(m.description||'Description non précisée.')+'</p><small>'+esc([m.area_sqm?m.area_sqm+' m²':null,m.desired_date?'Date souhaitée : '+m.desired_date:null].filter(Boolean).join(' · '))+'</small></div>'+
   '<div class="sales-draft"><strong>Ma proposition au client</strong><p class="tiny muted">Présentez votre intervention. Le montant et le délai sont facultatifs.</p><label for="salesDraftText">Votre message</label><textarea id="salesDraftText" class="field" rows="6" maxlength="2200"></textarea><div class="sales-proposal-fields"><label for="salesQuoteAmount">Montant estimatif (€) <small>facultatif</small><input id="salesQuoteAmount" class="field" type="number" min="1" max="1000000" step="0.01" inputmode="decimal" placeholder="Ex. 250"></label><label for="salesDeliveryText">Délai estimé <small>facultatif</small><input id="salesDeliveryText" class="field" maxlength="90" placeholder="Ex. Sous deux semaines"></label></div><div class="sales-actions"><button type="button" class="button primary" data-sales-send>Envoyer ma proposition</button><button type="button" class="button secondary" data-sales-copy>Copier mon message</button></div><details class="sales-optional-tools"><summary>Aide à la rédaction (facultative)</summary><button type="button" class="button secondary" data-sales-generate>Générer avec l’IA</button></details><p class="tiny muted">L’envoi exige votre validation. Les estimations ne constituent pas un devis ferme.</p></div>'+
   '<label class="sales-stage">Statut du dossier<select id="salesStageSelect" class="field">'+Object.entries(stageNames).map(([k,v])=>'<option value="'+k+'"'+(k===status?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label></div>';
  $('salesDraftText').value=drafts.has(m.id)?drafts.get(m.id):buildDraft(m);
  const extra=proposalMeta.get(m.id)||{};
  $('salesQuoteAmount').value=extra.amount||'';
  $('salesDeliveryText').value=extra.delay||'';
 }
 function render(){
  const current=uid();
  if(accountId!==current){accountId=current;selected=null;view='requests';drafts.clear();proposalMeta.clear();}
  if(!current||!canUsePremium()){
   $('salesRequestsCount').textContent='0';$('salesPendingCount').textContent='0';$('salesQuotesCount').textContent='0';
   $('salesRequestsList').innerHTML='<div class="sales-empty">Espace réservé aux professionnels autorisés.</div>';
   $('salesAssistantContent').innerHTML='';$('salesTrackingList').innerHTML='';
   return;
  }
  const ms=accessible().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  const t=tracking();
  const stages=ms.map(m=>effectiveStage(m,t));
  $('salesRequestsCount').textContent=String(ms.length);
  $('salesPendingCount').textContent=String(stages.filter(s=>['new','qualifying','reply_ready'].includes(s)).length);
  $('salesQuotesCount').textContent=String(stages.filter(s=>s==='quote').length);
  $('salesRequestsList').innerHTML=ms.length?ms.slice(0,50).map(m=>leadCard(m,t)).join(''):
   '<div class="sales-empty"><strong>Aucune demande pour le moment.</strong><p>Les missions publiées par des particuliers ou entreprises apparaîtront ici dès qu’elles seront accessibles à votre compte.</p></div>';
  const m=ms.find(m=>m.id===selected);
  if(!m)selected=null;
  renderAssistant(m,t);
  const followed=ms.filter(m=>effectiveStage(m,t)!=='new');
  $('salesTrackingList').innerHTML=followed.length?followed.map(m=>leadCard(m,t)).join(''):
    '<div class="sales-empty"><strong>Aucun dossier suivi.</strong><p>Ouvrez une mission pour préparer une réponse ou modifier son statut.</p></div>';
  switchView(view);
 }
 async function saveStage(missionId,stage){
  if(!uid()||!canUsePremium()||!accessible().some(m=>m.id===missionId)||!stageNames[stage])return;
  const {error}=await state.db.from('offrya_pro_lead_tracking').upsert({user_id:uid(),mission_id:missionId,stage,updated_at:new Date().toISOString()},{onConflict:'user_id,mission_id'});
  if(error)throw error;
  state.salesTracking=(state.salesTracking||[]).filter(x=>x.mission_id!==missionId).concat([{mission_id:missionId,stage}]);
 }
 async function generate(){
  if(busy||!uid()||!canUsePremium())return;
  const mission=accessible().find(m=>m.id===selected);if(!mission)return;
  busy=true;
  const button=$('salesAssistantContent').querySelector('[data-sales-generate]');
  if(button){button.disabled=true;button.textContent='Génération en cours…';}
  try{
   const session=(await state.db.auth.getSession()).data?.session;
   if(!session)throw Error('Session expirée.');
   const resp=await fetch('/api/pro/draft',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({mission_id:mission.id}),cache:'no-store'});
   const result=await resp.json();
   if(!resp.ok)throw Error(result.error||'Assistant IA momentanément indisponible.');
   if(!result.draft||typeof result.draft!=='string')throw Error('Brouillon invalide.');
   drafts.set(mission.id,result.draft.slice(0,2500));
   $('salesDraftText').value=drafts.get(mission.id);
   await saveStage(mission.id,'reply_ready');
   notify('Brouillon IA prêt : vérifiez-le avant envoi.');
  }catch(e){notify(e.message||'Génération indisponible. Le brouillon guidé reste utilisable.');}
  finally{busy=false;if(button){button.disabled=false;button.textContent='Générer avec l’IA';}}
 }
 async function send(){
  if(busy||!uid()||!canUsePremium())return;
  const mission=accessible().find(m=>m.id===selected);
  if(!mission){notify('Sélectionnez une mission autorisée.');return;}
  let body;
  try{body=buildProposalMessage($('salesDraftText')?.value,{
   amount:$('salesQuoteAmount')?.value,delay:$('salesDeliveryText')?.value
  });}catch(e){notify(e.message);return;}
  if(state.profile?.role!=='pro'){notify('La messagerie professionnelle exige un profil professionnel actif.');return;}
  if(!confirm('Envoyer cette proposition au demandeur ? Vos estimations éventuelles seront visibles dans la messagerie privée.'))return;
  busy=true;
  try{
   let conversation=(state.conversations||[]).find(c=>c.mission_id===mission.id&&c.professional_id===uid());
   if(!conversation){
    const r=await state.db.from('offrya_conversations').insert({mission_id:mission.id,client_id:mission.owner_id,professional_id:uid()}).select('id,mission_id,professional_id').single();
    if(r.error){
     if(r.error.code!=='23505')throw r.error;
     const existing=await state.db.from('offrya_conversations').select('id,mission_id,professional_id').eq('mission_id',mission.id).eq('professional_id',uid()).maybeSingle();
     if(existing.error)throw existing.error;
     conversation=existing.data;
    }else conversation=r.data;
   }
   if(!conversation)throw Error('Conversation introuvable.');
   const result=await state.db.from('offrya_messages').insert({conversation_id:conversation.id,sender_id:uid(),body});
   if(result.error)throw result.error;
   drafts.delete(mission.id);proposalMeta.delete(mission.id);
   try{await saveStage(mission.id,'contacted');}catch(e){console.warn('Suivi commercial indisponible après envoi',e);}
   notify('Proposition envoyée. Retrouvez-la dans vos dossiers et vos échanges.');await refresh();
   selected=mission.id;render();
   if(onNavigate)onNavigate('tracking');else switchView('tracking');
  }catch(error){console.error(error);notify('Envoi impossible. Vérifiez votre autorisation ou réessayez.');}
  finally{busy=false;}
 }
 function openMission(missionId){
  if(!uid()||!canUsePremium())return false;
  if(accountId!==uid()){accountId=uid();selected=null;view='requests';drafts.clear();proposalMeta.clear();}
  if(!accessible().some(m=>m.id===missionId))return false;
  selected=missionId;view='assistant';render();return true;
 }
 function init(){
  for(const btn of document.querySelectorAll('[data-sales-tab]'))btn.addEventListener('click',()=>switchView(btn.dataset.salesTab));
  function openLead(e){const b=e.target.closest('[data-sales-open]');if(!b)return;if(openMission(b.dataset.salesOpen)&&onNavigate)onNavigate('assistant');}
  $('salesRequestsList')?.addEventListener('click',openLead);
  $('salesTrackingList')?.addEventListener('click',openLead);
  $('salesAssistantContent')?.addEventListener('click',e=>{
   if(e.target.closest('[data-sales-back]')){if(onNavigate)onNavigate('back');else switchView('requests');return;}
   if(e.target.closest('[data-sales-copy]')){const text=$('salesDraftText')?.value||'';if(!text)return;navigator.clipboard?.writeText(text).then(()=>notify('Réponse copiée.')).catch(()=>notify('Copie indisponible.'));return;}
   if(e.target.closest('[data-sales-generate]')){generate();return;}
   if(e.target.closest('[data-sales-send]'))send();
  });
  $('salesAssistantContent')?.addEventListener('input',e=>{
   if(!selected)return;
   if(e.target.id==='salesDraftText')drafts.set(selected,e.target.value);
   if(['salesQuoteAmount','salesDeliveryText'].includes(e.target.id)){
    const old=proposalMeta.get(selected)||{};
    proposalMeta.set(selected,{...old,[e.target.id==='salesQuoteAmount'?'amount':'delay']:e.target.value});
   }
  });
  $('salesAssistantContent')?.addEventListener('change',async e=>{
   if(e.target.id!=='salesStageSelect'||!selected)return;
   try{await saveStage(selected,e.target.value);notify('Suivi mis à jour.');render();}
   catch(err){console.error(err);notify('Impossible d’enregistrer le suivi.');render();}
  });
  switchView('requests');
 }
 return {init,render,openMission};
}
