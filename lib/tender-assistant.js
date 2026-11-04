'use strict';
// Explainable matching of official public procurement notices. No AI response,
// pricing, application drafts, buyer communication, or tender submissions.
const sectorTerms={
 'Nettoyage':['nettoyage','entretien','proprete','hygiene'],
 'Espaces verts':['espaces verts','paysager','elagage','jardin','vegetaux'],
 'Bâtiment':['travaux','batiment','renovation','construction','maçonnerie'],
 'Informatique':['informatique','logiciel','numerique','cyber','maintenance informatique'],
 'Transport':['transport','mobilite','navette','logistique','livraison'],
 'Restauration & Hôtellerie':['restauration','repas','traiteur','hotellerie','cuisine'],
 'Bien-être & Beauté':['coiffure','esthetique','bien-etre','beaute','spa']
};
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const short=(s,n)=>String(s||'').slice(0,n);
function isOfficial(notice){
 if(!notice?.id||!notice?.title)return false;
 const url=String(notice.url||'');
 if(notice.source==='TED')return /^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(url)
   && /^TED-\d{4,8}-20\d{2}$/.test(notice.id);
 return /^https:\/\/(www\.)?boamp\.fr\//i.test(url)&&/^\d{2}-\d{3,9}$/.test(notice.id);
}
function qualifyTender(notice,prefs={},now=new Date()){
 if(!isOfficial(notice))return null;
 const deadline=Date.parse(notice.deadline||'');
 if(!Number.isFinite(deadline)||deadline<=now.getTime())return null;
 const sectors=(Array.isArray(prefs.sectors)?prefs.sectors:[])
  .filter(x=>Object.prototype.hasOwnProperty.call(sectorTerms,x)).slice(0,8);
 const words=normalize(prefs.keywords).split(' ').filter(w=>w.length>=3).slice(0,8);
 if(!sectors.length&&!words.length)return null;
 const content=normalize([notice.title,notice.description,notice.family,notice.nature].join(' '));
 const matchingSectors=sectors.filter(s=>sectorTerms[s].some(w=>content.includes(normalize(w))));
 const matchingWords=words.filter(w=>content.includes(w));
 if(!matchingSectors.length&&!matchingWords.length)return null;
 const department=String(prefs.department||'').toUpperCase();
 const departments=String(notice.departments||'').toUpperCase();
 const deptMatched=Boolean(department&&new RegExp('(^|[^A-Z0-9])'+department+'([^A-Z0-9]|$)').test(departments));
 const days=Math.max(0,Math.ceil((deadline-now.getTime())/86400000));
 let score=25+Math.min(40,matchingSectors.length*25)+Math.min(20,matchingWords.length*10)
  +(deptMatched?10:0)+(days>=7?10:days>=3?5:0);
 if(department&&departments&&!deptMatched)score-=20;
 if(days<2)score-=20;
 score=Math.max(0,Math.min(100,score));
 if(score<45)return null;
 const reasons=[
  ...(matchingSectors.length?['secteur : '+matchingSectors.join(', ')]:[]),
  ...(matchingWords.length?['mots-clés : '+matchingWords.join(', ')]:[]),
  ...(deptMatched?['département : '+department]:[]),'échéance : '+days+' jour(s)'
 ];
 return {user_id:prefs.user_id,tender_id:short(notice.id,80),title:short(notice.title,500),
  url:short(notice.url,800),deadline:notice.deadline,buyer:short(notice.buyer||'',250),
  departments:short(departments,100),match_score:score,match_reason:short(reasons.join(' · '),500),
  source:notice.source==='TED'?'TED':'BOAMP'};
}
module.exports={qualifyTender,isOfficial,sectorTerms};
