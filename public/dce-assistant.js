// OFFRYA Premium DCE: deliberately transient UI with no storage, tracking or auto-submission.
const byId=id=>document.getElementById(id);
const elm=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const shortSource=s=>s&&s.document?String(s.document)+' · '+(s.kind==='sheet'?'feuille '+(s.sheet||s.page):s.kind==='section'?'section '+s.page:'page '+s.page):'Référence non disponible';
const money=value=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value);
const accountFields=[
 ['company_name','dceCompany'],['siret','dceSiret'],['representative','dceRepresentative'],
 ['turnover_eur','dceTurnover'],['certifications','dceCertifications'],['references','dceReferences']
];
function safeNotice(value){
 try{
  const u=new URL(String(value||''));
  return u.protocol==='https:'&&['boamp.fr','www.boamp.fr','ted.europa.eu'].includes(u.hostname)?u.href:'';
 }catch{return '';}
}
function textRows(container,rows,mapper,emptyText){
 container.replaceChildren();
 if(!rows.length){container.append(elm('p','dce-empty',emptyText));return;}
 rows.forEach((r,i)=>container.append(mapper(r,i)));
}
export function initDceAssistant({state,canUsePremium,notify}){
 const root=byId('dceAssistant');if(!root)return;
 let evidence=null,awards=[],prepared=null,lockedAccount=null;
 function status(id,message,alert=false){
  const el=byId(id);if(!el)return;
  el.textContent=message;el.classList.toggle('dce-warning',alert);
 }
 function invalidate(){
  prepared=null;
  byId('dceExportDraft').hidden=true;
  byId('dceDrafts').hidden=true;
  byId('dceOfficialLink').hidden=true;
  status('dcePrepareStatus','Les brouillons doivent être régénérés après toute modification.');
 }
 root.addEventListener('input',event=>{
  if(event.target.id!=='dceZipFile'&&evidence)invalidate();
 });
 root.addEventListener('change',event=>{
  if(event.target.id!=='dceZipFile'&&evidence)invalidate();
 });
 function currentUser(){
  const uid=state.session?.user?.id;
  if(!uid||!canUsePremium()||!state.db)throw new Error('Accès professionnel Premium nécessaire.');
  if(lockedAccount&&uid!==lockedAccount){
   evidence=null;awards=[];invalidate();byId('dceResults').hidden=true;
   throw new Error('Le compte a changé : importez le DCE à nouveau.');
  }
  return uid;
 }
 async function token(){
  const uid=currentUser();
  const {data:{session},error}=await state.db.auth.getSession();
  if(error||!session?.access_token||session.user.id!==uid)throw new Error('Connexion expirée : reconnectez-vous.');
  return session.access_token;
 }
 async function responseJson(response){
  const payload=await response.json().catch(()=>({error:'Réponse du service invalide.'}));
  if(!response.ok)throw new Error(payload.error||'Service indisponible.');
  return payload;
 }
 function renderEvidence(){
  if(!evidence)return;
  byId('dceResults').hidden=false;
  textRows(byId('dceFacts'),(evidence.facts||[]).slice(0,60),(fact)=>{
   const row=elm('div','dce-evidence-line');
   row.append(elm('strong','',fact.label||fact.type),elm('p','',fact.value));
   row.append(elm('small','dce-citation',shortSource(fact.source)+' · à vérifier sur l’original'));
   return row;
  },'Aucune exigence détectée avec certitude. Consulter manuellement le RC.');
  textRows(byId('dceChecklist'),evidence.checklist||[],item=>{
   const wrap=elm('label','dce-piece-line'),checkbox=elm('input');
   checkbox.type='checkbox';checkbox.dataset.dceDocument=item.id;
   const desc=elm('span');
   desc.append(elm('strong','',item.id),elm('small','dce-citation',shortSource(item.source)+' · vérifier si obligatoire'));
   wrap.append(checkbox,desc);
   return wrap;
  },'Aucune pièce identifiée. Vérifier manuellement les documents de candidature.');
  const messages=(evidence.warnings||[]).slice(0,15);
  status('dceStatus',(evidence.archive?.document_count||evidence.documents?.length||0)+' document(s) analysé(s). '+
   (evidence.facts?.length||0)+' indice(s) relevé(s). '+messages.join(' '),messages.length>0);
 }
 byId('dceImportForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!canUsePremium())return notify('Accès Premium requis.');
  const file=byId('dceZipFile').files?.[0];
  if(!file||file.size<22||file.size>20*1024*1024)
   return status('dceStatus','Choisissez une archive ZIP valide de 20 Mo maximum.',true);
  const button=byId('dceRunImport');button.disabled=true;button.setAttribute('aria-busy','true');
  status('dceStatus','Analyse des documents en cours…');
  evidence=null;awards=[];prepared=null;lockedAccount=null;byId('dceResults').hidden=true;
  try{
   const access=await token();lockedAccount=state.session.user.id;
   const result=await fetch('/api/pro/dce/import',{
    method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/zip'},
    body:await file.arrayBuffer(),cache:'no-store'});
   evidence=await responseJson(result);renderEvidence();
  }catch(error){status('dceStatus',error.message,true);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
 });
 byId('dceAwardForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!evidence)return status('dceAwardStatus','Importez d’abord un DCE.',true);
  const cpv=byId('dceCpv').value.trim();
  if(!/^\d{8}$/.test(cpv))return status('dceAwardStatus','Le CPV doit comporter 8 chiffres.',true);
  awards=[];byId('dceAwards').replaceChildren();
  status('dceAwardStatus','Recherche officielle en cours…');
  try{
   const access=await token();
   const r=await fetch('/api/pro/dce/awards?cpv='+encodeURIComponent(cpv),{
    headers:{Authorization:'Bearer '+access},cache:'no-store'});
   const out=await responseJson(r);
   awards=Array.isArray(out.rows)?out.rows:[];
   status('dceAwardStatus',awards.length+' attribution(s) publique(s) retenue(s). Montants globaux, pas prix unitaires.');
   textRows(byId('dceAwards'),awards,row=>{
    const div=elm('div','dce-award-row');
    div.append(elm('strong','',row.title||'Marché attribué'),elm('span','',money(row.amount_eur)));
    div.append(elm('small','dce-citation','CPV '+row.cpv+' · '+(row.awarded_at||'date non publiée')+' · montant déclaré'));
    const a=elm('a','', 'Source officielle DECP');
    a.href=row.source_url;a.target='_blank';a.rel='noopener noreferrer';
    div.append(a);return div;
   },'Aucune attribution comparable disponible pour ce code CPV. Aucun tarif n’est déduit.');
  }catch(error){status('dceAwardStatus',error.message,true);}
 });
 function prepareInput(){
  const account={},confirmed_fields=[];
  const accepted=byId('dceIdentityConfirm').checked;
  for(const [field,id]of accountFields){
   const input=byId(id);
   if(!input.value.trim())continue;
   account[field]=field==='turnover_eur'?Number(input.value):input.value.trim();
   if(accepted)confirmed_fields.push(field);
  }
  account.confirmed_fields=confirmed_fields;
  const docs={};for(const input of root.querySelectorAll('input[data-dce-document]')){
   docs[input.dataset.dceDocument]=input.checked?'present_verified':'missing';
  }
  const confirmedDocs=byId('dceDossierDocsConfirm').checked;
  const review={
   identity:accepted&&/^\d{14}$/.test(String(account.siret||''))&&Boolean(account.company_name),
   documents:confirmedDocs&&Object.values(docs).every(v=>v==='present_verified'),
   document_statuses:docs
  };
  for(const input of root.querySelectorAll('input[data-dce-review]'))review[input.dataset.dceReview]=input.checked;
  const note=safeNotice(byId('dceNoticeUrl').value.trim());
  const cons={original_notice:note};
  for(const [field,id]of [['reference','dceTenderRef'],['buyer','dceBuyer'],['lots','dceLots']]){
   cons[field]=byId(id).value.trim();cons[field+'_confirmed']=accepted&&Boolean(cons[field]);
  }
  return {evidence,company:account,review,consultation:cons,awards};
 }
 function renderPrepared(result){
  const container=byId('dceDrafts');container.replaceChildren();container.hidden=false;
  const h=elm('h4','',result.filing.review_label);container.append(h);
  for(const draft of [result.drafts.dc1,result.drafts.dc2,result.drafts.dume]){
   const details=elm('details','dce-draft-details');
   details.append(elm('summary','',draft.title),elm('p','',draft.notice));
   for(const [key,value]of Object.entries(draft.fields)){
    details.append(elm('p','',key+' : '+value));
   }
   const link=elm('a','','Consulter le formulaire ou service officiel');
   link.href=draft.source_form;link.target='_blank';link.rel='noopener noreferrer';
   details.append(link);container.append(details);
  }
  const memoire=elm('details','dce-draft-details');
  memoire.append(elm('summary','','Trame du mémoire technique'));
  for(const section of result.drafts.memoire){
   memoire.append(elm('h5','',section.title),elm('small','dce-citation',shortSource(section.source)),
    elm('p','',section.draft));
  }
  container.append(memoire);
  for(const check of result.validation){
   container.append(elm('p','dce-review-state',(check.validated?'✓ ':'À confirmer : ')+check.label));
  }
  for(const warning of result.warnings)container.append(elm('p','dce-warning',warning));
  byId('dceExportDraft').hidden=false;
  const link=byId('dceOfficialLink');
  link.hidden=!result.filing.notice_url;
  if(result.filing.notice_url)link.href=result.filing.notice_url;
 }
 byId('dcePrepare').addEventListener('click',async()=>{
  if(!evidence)return status('dcePrepareStatus','Importez d’abord votre DCE.',true);
  const button=byId('dcePrepare');button.disabled=true;
  try{
   const access=await token();
   const data=prepareInput();
   const res=await fetch('/api/pro/dce/prepare',{
    method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
    body:JSON.stringify(data),cache:'no-store'});
   prepared=await responseJson(res);
   renderPrepared(prepared);
   status('dcePrepareStatus',prepared.all_review_items_confirmed?
    'Contrôles déclarés terminés. Relecture finale et dépôt manuel sur la plateforme acheteur requis.':
    'Brouillons préparés, mais la validation humaine et/ou les pièces restent incomplètes.');
  }catch(error){status('dcePrepareStatus',error.message,true);}
  finally{button.disabled=false;}
 });
 byId('dceExportDraft').addEventListener('click',()=>{
  if(!prepared||!canUsePremium())return;
  const payload=JSON.stringify(prepared,null,2);
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='offrya-dossier-brouillon.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
}
