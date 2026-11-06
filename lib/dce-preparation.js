'use strict';
// Deterministic, evidence-first application preparation. No official form is
// generated or signed. All candidate assertions require explicit confirmation.
const DC1='https://www.economie.gouv.fr/daj/les-formulaires-de-declaration-du-candidat';
const DUME='https://entreprendre.service-public.gouv.fr/vosdroits/R44043';
const DECP='https://data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/';
const FIELDS=['company_name','siret','company_address','representative','sector','insurance',
 'certifications','references','turnover_eur','contact_email','contact_phone'];
const CONFIRM=['identity','documents','commitments','pricing','deadline','dce_version','final_reading'];
const sanitize=(v,n=300)=>String(v==null?'':v).replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n);
function validateInput(data){
 if(!data||typeof data!=='object'||!data.evidence||!Array.isArray(data.evidence.facts)||
  !Array.isArray(data.evidence.checklist)||data.evidence.facts.length>180||
  data.evidence.checklist.length>50||JSON.stringify(data).length>180000)
  throw new TypeError('Analyse DCE invalide ou trop volumineuse.');
 if(!data.evidence.facts.every(f=>f&&typeof f.type==='string'&&f.source&&
  typeof f.source.document==='string'&&Number.isInteger(f.source.page)&&
  f.source.page>0&&typeof f.source.excerpt==='string'))
  throw new TypeError('Les données de préparation doivent conserver la provenance des pièces.');
 return data;
}
function draftFields(input){
 const values={},declared=new Set(Array.isArray(input?.confirmed_fields)?input.confirmed_fields:[]);
 for(const field of FIELDS){
  if(!declared.has(field))continue;
  const value=field==='turnover_eur'?Number(input[field]):sanitize(input[field],field==='references'?1000:400);
  if(field==='turnover_eur'){
   if(Number.isFinite(value)&&value>=0&&value<=1e12&&input[field]!=='')values[field]=value;
  }else if(value){
   if(field==='siret'&&!/^\d{14}$/.test(value))continue;
   values[field]=value;
  }
 }
 return values;
}
function reference(f){
 const r=f?.source;
 return r&&typeof r.document==='string'&&Number.isInteger(r.page)?{
  document:sanitize(r.document,120),page:r.page,excerpt:sanitize(r.excerpt,320)
 }:null;
}
function createDrafts(evidence,identity,consultation){
 const base={
  marche:consultation.reference||'[Référence du marché à confirmer]',
  acheteur:consultation.buyer||'[Acheteur à confirmer]',
  lots:consultation.lots||'[Lots à confirmer]',
  candidat:identity.company_name||'[Dénomination non confirmée]',
  siret:identity.siret||'[SIRET non confirmé]',
  adresse:identity.company_address||'[Adresse non confirmée]',
  representant:identity.representative||'[Représentant non confirmé]'
 };
 const dc1={title:'DC1 — données préparatoires',notice:'Brouillon de saisie uniquement, formulaire officiel non généré ni signé.',
  fields:base,source_form:DC1};
 const dc2={title:'DC2 — données préparatoires',notice:'Capacités et justificatifs à vérifier dans le règlement de consultation.',
  fields:{...base,turnover_eur:identity.turnover_eur??'[Chiffre d’affaires non confirmé]',
   references:identity.references||'[Références non confirmées]',
   certifications:identity.certifications||'[Certifications non confirmées]',
   assurance:identity.insurance||'[Assurance non confirmée]'},source_form:DC1};
 const dume={title:'DUME — aide à la saisie',notice:'Reporter uniquement les déclarations confirmées dans le DUME officiel.',
  fields:{...base,turnover_eur:identity.turnover_eur??'[Non confirmé]',
   certifications:identity.certifications||'[Non confirmées]',
   references:identity.references||'[Non confirmées]'},source_form:DUME};
 const memoire=(evidence.facts||[]).filter(f=>f.type==='criteria').slice(0,14).map((fact,index)=>({
  section:index+1,title:sanitize(fact.value,200),source:reference(fact),
  draft:'[Décrire la méthode, les moyens, l’organisation et les preuves factuelles correspondant à ce sous-critère. Validation par le professionnel requise.]'
 }));
 if(!memoire.length)memoire.push({section:1,title:'Critères techniques non identifiés',
  source:null,draft:'[Consulter le règlement de consultation, identifier les sous-critères et leurs pondérations avant rédaction.]'});
 return {dc1,dc2,dume,memoire};
}
function prepareDce(data){
 validateInput(data);
 const values=draftFields(data.company||{});
 const cons=data.consultation||{};
 const consultation={
  reference:cons.reference_confirmed===true?sanitize(cons.reference,120):'',
  buyer:cons.buyer_confirmed===true?sanitize(cons.buyer,200):'',
  lots:cons.lots_confirmed===true?sanitize(cons.lots,120):'',
  original_notice:/^https:\/\/(?:www\.)?(?:boamp\.fr|ted\.europa\.eu)\//.test(String(cons.original_notice||''))
   ?sanitize(cons.original_notice,600):null
 };
 const statuses=data.review?.document_statuses&&typeof data.review.document_statuses==='object'?data.review.document_statuses:{};
 const checklist=data.evidence.checklist.map(item=>{
  const status=statuses[item.id]==='present_verified'?'Déclaré contrôlé par le professionnel':'À vérifier dans le RC et à joindre si requis';
  return {id:sanitize(item.id,120),status,
   source:reference(item),mandatory:'Non déterminé automatiquement : vérifier le règlement de consultation'};
 });
 const required=CONFIRM.map(key=>({id:key,validated:data.review?.[key]===true,
  label:{
   identity:'Identité, SIRET et représentation de l’entreprise contrôlés',
   documents:'Pièces du dossier contrôlées',
   commitments:'Déclarations, attestations et engagements vérifiés',
   pricing:'Tous les montants, unités, taxes et totaux vérifiés',
   deadline:'Date et heure limites vérifiées sur la plateforme acheteur',
   dce_version:'Dernier DCE, rectificatifs et questions/réponses vérifiés',
   final_reading:'Relecture et dépôt manuel assumés par le professionnel'
  }[key]}));
 const allChecked=required.every(item=>item.validated);
 const documentsChecked=checklist.every(item=>item.status==='Déclaré contrôlé par le professionnel');
 const warnings=['Les données proposées ne constituent pas des formulaires DC1/DC2 ou un DUME officiels.',
  'Les pièces signalées dans le DCE ne sont pas nécessairement toutes obligatoires.',
  'Le contrôle, la signature et le dépôt final sur le profil acheteur sont exclusivement manuels.'];
 if(data.evidence?.go_no_go?.verdict==='NO_GO_POTENTIEL')
  warnings.push('Une incompatibilité de capacité a été signalée : contrôler l’éligibilité avant dépôt.');
 if(!consultation.original_notice)warnings.push('Lien officiel vers l’avis à confirmer manuellement.');
 if(!allChecked||!documentsChecked)warnings.push('Revue non terminée : certaines validations ou pièces manquent.');
 const history=Array.isArray(data.awards)?data.awards.slice(0,12).filter(row=>
  row&&row.source==='DECP_DAJ'&&/^https:\/\/(?:www\.)?data\.economie\.gouv\.fr\//.test(String(row.source_url||''))&&
  Number.isFinite(row.amount_eur)&&row.amount_eur>0).map(row=>({
    objet:sanitize(row.title,250),cpv:sanitize(row.cpv,16),montant_attribue_eur:row.amount_eur,
    duree_mois:Number.isInteger(row.duration_months)?row.duration_months:null,
    date_notification:sanitize(row.awarded_at,30),source_url:sanitize(row.source_url,600),
    note:'Montant global attribué : ne pas extrapoler un prix unitaire sans quantités, lots et périmètre comparables.'
  })):[];
 return {version:'dce-preparation-v1',
  drafts:createDrafts(data.evidence,values,consultation),
  checklist,validation:required,all_review_items_confirmed:allChecked&&documentsChecked,
  filing:{can_submit_automatically:false,deposit_method:'Ouvrir la plateforme officielle et déposer manuellement',
   notice_url:consultation.original_notice,review_label:allChecked&&documentsChecked?'Relecture déclarée terminée, dépôt manuel à effectuer':'Dossier à vérifier avant dépôt'},
  pricing:{comparables:history,estimated_bid_price:null,recommended_price:null,
   dataset_url:DECP,warning:'Les attributions publiques ne donnent pas un coût de revient ni un prix unitaire prêt à utiliser.'},
  warnings,source_document_count:Array.isArray(data.evidence.documents)?data.evidence.documents.length:0};
}
module.exports={prepareDce,draftFields,createDrafts,validateInput};
