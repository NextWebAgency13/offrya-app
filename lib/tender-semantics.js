'use strict';
// Narrow, explainable classification of public tenders by ACTUAL trade.
// Generic words (restauration, entretien, livraison, espaces) are deliberately
// excluded unless they occur in an unambiguous trade-specific phrase.
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const patterns={
 'Nettoyage':[
  [/\b(nettoyage|nettoiement|proprete|desinfection|vitrerie|blanchisserie|degraissage)\b/,5,'nettoyage de locaux'],
  [/\b(entretien des? (locaux|bureaux|sanitaires|salles|batiments)|hygiene des locaux|lavage (des|de) (vitres|sols))\b/,4,'entretien de locaux']
 ],
 'Espaces verts':[
  [/\b(espaces? verts?|amenagement paysager|travaux paysagers?|paysagisme)\b/,6,'espaces verts'],
  [/\b(elagage|debroussaillage|essouchage|abattage d arbres|patrimoine arbore|arbres? d alignement)\b/,6,'entretien des arbres'],
  [/\b(tonte|jardinage|jardins?|horticulture|vegetalisation|plantations? vegetales?)\b/,4,'jardinage ou végétalisation']
 ],
 'Bâtiment':[
  [/\b(travaux? de restauration|restauration (du patrimoine|de l eglise|d eglise|des? edifices?|des? monuments?|des? batiments?|de la ferme|des? facades?|d un ouvrage)|rehabilitation de batiments?)\b/,8,'restauration du patrimoine bâti'],
  [/\b(batiments?|construction|renovation|maconnerie|plomberie|robinetterie|chauffage|ventilation|toiture|couverture|zinguerie|genie civil|etancheite|electricite du batiment)\b/,5,'travaux du bâtiment'],
  [/\b(travaux de (renovation|rehabilitation|demolition|construction)|maintenance des? installations?|patrimoine bati)\b/,4,'travaux ou maintenance technique']
 ],
 'Informatique':[
  [/\b(informatique|logiciels?|cybersecurite|ordinateurs?|developpement web|application mobile|systemes? d information|reseau informatique|hebergement web)\b/,6,'informatique et numérique']
 ],
 'Transport':[
  [/\b(transport (de personnes|scolaire|routier|collectif|de voyageurs|de marchandises)|navettes?|autocars?|fret|coursiers?|logistique de transport|livraison de colis)\b/,6,'transport et logistique'],
  [/\b(location (de camions|de vehicules industriels)|transporteurs?)\b/,4,'transport professionnel']
 ],
 'Restauration & Hôtellerie':[
  [/\b(repas|traiteur|denrees? alimentaires?|restauration collective|restauration scolaire|cantines?|cuisines? centrales?|portage de repas|preparation de repas)\b/,6,'repas et restauration alimentaire'],
  [/\b(hotellerie|hebergement touristique|service hotelier|restauration commerciale|service de restauration)\b/,5,'hôtellerie ou restauration de personnes']
 ],
 'Bien-être & Beauté':[
  [/\b(coiffure|esthetique|instituts? de beaute|massages?|soins? du visage|spa thermal|bien etre corporel|thermes)\b/,6,'bien-être ou beauté']
 ]
};
function sectorsFor(title='',description='',family='',nature=''){
 const headline=normalize(title),details=normalize([description,family,nature].join(' '));
 const results=[];
 for(const [sector,rules] of Object.entries(patterns)){
  let weight=0;const signals=[];
  for(const [rx,w,label] of rules){
   if(rx.test(headline)){weight+=w*2;signals.push(label);}
   else if(rx.test(details)){weight+=w;signals.push(label);}
  }
  if(weight>0)results.push({sector,weight,signals});
 }
 return results.sort((a,b)=>b.weight-a.weight);
}
function departmentTokens(value){
 return String(value||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  .map(x=>/^\d{1,2}$/.test(x)?x.padStart(2,'0'):x);
}
function locality(departments,department=''){
 const codes=departmentTokens(departments),target=departmentTokens(department)[0]||'';
 if(!codes.length)return {kind:'unknown',reason:'Zone de réalisation non précisée',bonus:target?-12:-5};
 if(target&&!codes.includes(target))return {kind:'outside',reason:'Hors département',bonus:-100};
 if(target&&codes.length===1)return {kind:'local',reason:'Département '+target,bonus:15};
 if(target)return {kind:'regional',reason:'Plusieurs départements dont '+target,bonus:9};
 if(codes.length>1)return {kind:'multi',reason:'Marché interdépartemental',bonus:2};
 return {kind:'specified',reason:'Département '+codes[0],bonus:4};
}
function assessTender(notice,preferences={},now=Date.now()){
 if(!notice?.title)return null;
 const deadline=Date.parse(notice.deadline||'');
 if(!Number.isFinite(deadline)||deadline<=now)return null;
 const sectors=sectorsFor(notice.title,notice.description,notice.family,notice.nature);
 if(!sectors.length)return null;
 const chosen=(Array.isArray(preferences.sectors)?preferences.sectors:[])
  .filter(x=>Object.hasOwn(patterns,x));
 const relevant=chosen.length?sectors.filter(x=>chosen.includes(x.sector)):sectors;
 if(!relevant.length)return null;
 const primary=relevant[0],place=locality(notice.departments,preferences.department);
 if(place.kind==='outside')return null;
 const keywords=normalize(preferences.keywords).split(' ').filter(x=>x.length>=3).slice(0,8);
 const text=normalize([notice.title,notice.description,notice.family,notice.nature].join(' '));
 const keywordHits=keywords.filter(x=>(' '+text+' ').includes(' '+x+' '));
 if(keywords.length&&keywordHits.length!==keywords.length)return null;
 const days=Math.ceil((deadline-now)/86400000);
 const tradePoints=Math.min(27,11+primary.weight+primary.signals.length*2);
 const deadlinePoints=Math.min(8,Math.max(0,Math.round(Math.min(days,48)/6)));
 let score=45+tradePoints+place.bonus+deadlinePoints+Math.min(8,keywordHits.length*3);
 if(days<=2)score-=7;
 // For a departmental search, a TED notice without known territory may be
 // relevant nationally but must never be presented as a verified local match.
 if(place.kind==='unknown'&&preferences.department)score=Math.min(score,64);
 score=Math.max(0,Math.min(97,Math.round(score)));
 if(score<55)return null;
 const reasons=['Métier : '+primary.sector+' ('+primary.signals.slice(0,2).join(', ')+')',
  place.reason, 'Échéance : '+days+' jour'+(days>1?'s':'')];
 if(keywordHits.length)reasons.push('Mots-clés confirmés : '+keywordHits.join(', '));
 return {score,sector:primary.sector,signals:primary.signals,
  matchedSectors:relevant.map(x=>x.sector),reasons,locationType:place.kind,
  territoryKnown:place.kind!=='unknown',daysLeft:days};
}
module.exports={normalize,sectorsFor,assessTender,locality,departmentTokens};
