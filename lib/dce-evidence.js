'use strict';
// OFFRYA — première brique d'analyse DCE. Reçoit uniquement du texte déjà
// extrait de documents téléchargés par le professionnel. N'aspire aucune
// plateforme acheteur et n'envoie aucun contenu à un modèle externe.
const MAX_DOCS=12,MAX_PAGES=40,MAX_CHARS=160000;
const patterns=[
 ['deadline','Date limite de remise',/\b(?:date limite (?:de )?(?:remise|réception|dépôt)|remise des (?:offres|candidatures)|réception des offres)\b/i],
 ['criteria','Critère et pondération',/\b(?:critères? (?:d['’ ]attribution|de jugement)|valeur technique|prix des prestations|qualité de l['’ ]offre|pondération)\b/i],
 ['capacity','Capacité ou qualification',/\b(?:chiffre d['’ ]affaires|capacités? (?:financières?|techniques?|professionnelles?)|références? similaires?|certificat(?:ion)?s?|qualibat|rge|habilitation|qualification professionnelle)\b/i],
 ['visit','Visite obligatoire',/\bvisite\b.{0,55}\b(?:obligatoire|impérative|exigée)\b/i],
 ['lots','Lots',/\b(?:lot n[°o.]?\s*\d+|alloti|allotissement|lots? (?:distincts?|séparés?))\b/i],
 ['duration','Durée du marché',/\b(?:durée (?:du marché|du contrat|d['’ ]exécution)|période d['’ ]exécution|reconduction)(?=\s|[.,;:]|$)/i],
 ['staff','Reprise du personnel',/\b(?:reprise|transfert) du personnel\b/i],
 ['pages','Limite de pages',/\b(?:mémoire technique|offre technique)\b.{0,90}\b(?:pages?|feuillets?)\b|\b(?:pages?|feuillets?)\b.{0,50}\bmaximum\b/i],
 ['amendment','Rectificatif ou questions-réponses',/\b(?:rectificatif|additif au dce|modification du dce|réponses? aux questions|questions[\s/-]*réponses)\b/i]
];
const requirements=[
 ['DC1',/\bdc[\s-]?1\b/i],
 ['DC2',/\bdc[\s-]?2\b/i],
 ['DUME',/\bdume\b|\bdocument unique de marché européen\b/i],
 ['Mémoire technique',/\bmémoire technique\b/i],
 ['BPU',/\bbpu\b|\bbordereau (?:des )?prix unitaires\b/i],
 ['DPGF',/\bdpgf\b|\bdécomposition du prix global et forfaitaire\b/i],
 ['DQE',/\bdqe\b|\bdétail quantitatif estimatif\b/i],
 ['Attestation fiscale',/\battestation(?:s)? fiscale(?:s)?\b/i],
 ['Attestation sociale',/\battestation(?:s)? sociale(?:s)?\b/i],
 ['Assurance décennale',/\b(?:assurance|attestation) décennale\b/i],
 ['Assurance RC professionnelle',/\b(?:responsabilité civile professionnelle|rc pro)\b/i],
 ['Références',/\bréférences? (?:professionnelles?|similaires?|de prestations)\b/i],
 ['Extrait Kbis',/\b(?:k[\s-]?bis|extrait du registre du commerce)\b/i]
];
function cleanLine(text){return String(text).replace(/\s+/g,' ').trim().slice(0,320);}
function normalizeInput(input){
 if(!input||typeof input!=='object'||!Array.isArray(input.documents)||input.documents.length<1||input.documents.length>MAX_DOCS)
  throw new TypeError('1 à 12 documents avec leurs pages extraites sont requis.');
 let total=0;
 return input.documents.map((doc,index)=>{
  if(!doc||typeof doc.name!=='string'||!/^[^\/\\\x00-\x1f]{1,120}$/.test(doc.name)
    ||!Array.isArray(doc.pages)||!doc.pages.length||doc.pages.length>MAX_PAGES)
   throw new TypeError('Document DCE invalide à la position '+(index+1)+'.');
  const seen=new Set();
  const pages=doc.pages.map(page=>{
   if(!page||!Number.isInteger(page.page)||page.page<1||page.page>9999||seen.has(page.page)
      ||typeof page.text!=='string'||page.text.length>12000)
    throw new TypeError('Page extraite invalide dans '+doc.name+'.');
   seen.add(page.page);total+=page.text.length;
   if(total>MAX_CHARS)throw new TypeError('Texte DCE trop volumineux.');
   return {page:page.page,text:page.text,kind:['page','sheet','section'].includes(page.kind)?page.kind:'page',sheet:typeof page.sheet==='string'?page.sheet.slice(0,40):null,ocr:page.ocr===true,ocr_confidence:page.ocr===true&&Number.isFinite(page.ocr_confidence)?Math.min(100,Math.max(0,page.ocr_confidence)):null};
  });
  return {name:doc.name,pages};
 });
}
function cite(doc,page,line){return {document:doc,page:page.page,kind:page.kind||'page',sheet:page.sheet||null,ocr:page.ocr===true,ocr_confidence:page.ocr_confidence,excerpt:cleanLine(line)};}
function numericEuros(text){
 const m=/\bchiffre d['’ ]affaires\b.{0,85}\b(?:minimum|minimal|au moins)\b\s*(?:de|à)?\s*([\d ]{2,15}(?:[.,]\d{1,2})?)\s*(?:€|euros)(?=\s|[.,;:)]|$)/i.exec(text);
 if(!m)return null;
 const n=Number(m[1].replace(/\s/g,'').replace(',','.'));
 return Number.isSafeInteger(n)&&n>0&&n<=1e10?n:null;
}
function assessCompany(facts,company={}){
 // Les données du client sont des déclarations; aucun chiffre n'est inventé.
 const c=company&&typeof company==='object'&&!Array.isArray(company)?company:{};
 const turnoverFact=facts.find(f=>f.type==='capacity'&&f.minimum_turnover_eur);
 const threshold=turnoverFact?.minimum_turnover_eur||null;
 const turnover=Number.isFinite(c.turnover_eur)&&c.turnover_eur>=0?c.turnover_eur:null;
 const confirmed=c.turnover_confirmed===true;
 const risks=[];
 if(threshold!==null&&confirmed&&turnover!==null&&turnover<threshold){
  risks.push({code:'turnover_below_minimum',label:'Chiffre d’affaires déclaré inférieur au minimum identifié.',
   source:turnoverFact.source});
 }
 const criticalMissing=['deadline','criteria','capacity'].filter(type=>!facts.some(f=>f.type===type));
 if(criticalMissing.length)risks.push({code:'insufficient_dce',label:'Éléments essentiels non trouvés dans les extraits : '+criticalMissing.join(', '),source:null});
 if(facts.some(f=>f.type==='visit')&&c.visit_confirmed!==true)
  risks.push({code:'visit_unconfirmed',label:'Visite obligatoire à confirmer.',source:facts.find(f=>f.type==='visit').source});
 const verdict=risks.some(r=>r.code==='turnover_below_minimum')?'NO_GO_POTENTIEL':'A_VERIFIER';
 return {verdict,score:null,score_reason:'Un score chiffré go/no-go exige une analyse complète et des justificatifs confirmés.',
  risks,turnover_requirement:threshold===null?null:{minimum_eur:threshold,source:turnoverFact.source},
  turnover_declared:confirmed&&turnover!==null?turnover:null};
}
function analyzeDce(input){
 const documents=normalizeInput(input);
 const facts=[],checklist=new Map(),duplicates=new Set();
 for(const doc of documents)for(const page of doc.pages){
  // Segmentation documentaire conservatrice : chaque ligne garde sa page.
  for(const raw of page.text.split(/\r?\n/)){
   const line=cleanLine(raw);if(line.length<8)continue;
   for(const [type,label,rx] of patterns){
    if(!rx.test(line))continue;
    const key=type+'|'+doc.name+'|'+page.page+'|'+line;
    if(duplicates.has(key))continue;
    duplicates.add(key);
    const fact={type,label,value:line,source:cite(doc.name,page,line),confidence:page.ocr===true?'OCR incertain : contrôle visuel obligatoire':'à confirmer sur le document original'};
    if(type==='capacity'){
     const min=numericEuros(line);if(min!==null)fact.minimum_turnover_eur=min;
    }
    facts.push(fact);
    if(facts.length>=180)break;
   }
   for(const [id,rx] of requirements){
    if(rx.test(line)&&!checklist.has(id))checklist.set(id,{id,required:'à vérifier dans le RC',
      status:'non_confirmé',source:cite(doc.name,page,line)});
   }
   if(facts.length>=180)break;
  }
 }
 const c=input.company&&typeof input.company==='object'?input.company:{};
 const supplied=Array.isArray(c.documents_confirmed)?c.documents_confirmed.filter(x=>typeof x==='string'):[];
 for(const item of checklist.values()){
  if(supplied.includes(item.id))item.status='déclaré disponible, non vérifié';
 }
 const gap=assessCompany(facts,c);
 const relevantCriteria=facts.filter(f=>f.type==='criteria').slice(0,12);
 const draft=relevantCriteria.map(f=>({
  heading:f.value.slice(0,140),source:f.source,
  text:'[À compléter : décrire les moyens, méthodes et preuves de l’entreprise pour ce critère. Ne pas inclure de déclaration non validée.]'
 }));
 return {version:'dce-evidence-v1',documents:documents.map(d=>({name:d.name,pages:d.pages.length,ocr_pages:d.pages.filter(p=>p.ocr).length})),
  facts,checklist:[...checklist.values()],go_no_go:gap,memoire_draft:draft,
  uncertainties:[
   'Seuls les textes des pages transmis ont été examinés : l’absence d’une exigence ne signifie pas qu’elle n’existe pas.',
   'Présence dans un extrait ne prouve pas qu’une pièce soit obligatoire : vérifier le règlement de consultation.',
   'Aucun dépôt, déclaration, prix ou formulaire administratif n’est généré automatiquement.'
  ],human_validation_required:true};
}
module.exports={analyzeDce,normalizeInput,assessCompany,numericEuros};
