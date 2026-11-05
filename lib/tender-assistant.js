'use strict';
// Explainable matching of official public procurement notices. No AI response,
// pricing, application drafts, buyer communication, or tender submissions.
const {assessTender}=require('./tender-semantics');
const sectorTerms={
 'Nettoyage':['nettoyage','propreté','vitrerie'],
 'Espaces verts':['espaces verts','élagage','aménagement paysager'],
 'Bâtiment':['rénovation','plomberie','travaux de restauration'],
 'Informatique':['informatique','logiciel','cybersécurité'],
 'Transport':['transport de personnes','navette','livraison de colis'],
 'Restauration & Hôtellerie':['repas','restauration collective','hôtellerie'],
 'Bien-être & Beauté':['coiffure','esthétique','massage']
};
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
 // Explicit qualifier calls without a métier or keyword are not watch targets.
 // The automatic worker supplies its vetted default trade list separately.
 const selected=Array.isArray(prefs.sectors)?prefs.sectors.filter(x=>sectorTerms[x]):[];
 if(!selected.length&&!String(prefs.keywords||'').trim())return null;
 const result=assessTender(notice,prefs,now.getTime());
 if(!result)return null;
 return {user_id:prefs.user_id,tender_id:short(notice.id,80),title:short(notice.title,500),
  url:short(notice.url,800),deadline:notice.deadline,buyer:short(notice.buyer||'',250),
  departments:short(String(notice.departments||'').toUpperCase(),100),
  match_score:result.score,match_reason:short(result.reasons.join(' · '),500),
  source:notice.source==='TED'?'TED':'BOAMP'};
}
module.exports={qualifyTender,isOfficial,sectorTerms};
