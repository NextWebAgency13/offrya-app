// OFFRYA: explainable local ranking of ALREADY AUTHORIZED opportunities.
// There is no external AI call, invented lead, auto-contact or tender submission.
// Only feed this module data retrieved under the existing Supabase RLS and Premium gate.
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const clamp=n=>Math.min(100,Math.max(0,Math.round(n)));
const day=86400000;
const official=url=>/^https:\/\/(?:www\.)?boamp\.fr\//i.test(url||'')
 || /^https:\/\/ted\.europa\.eu\/fr\/notice\/-\/detail\/\d{4,8}-20\d{2}$/i.test(url||'');
function missionLead(m,preferences,uid,now){
 if(!m||!m.id||m.owner_id===uid||m.status!=='open')return null;
 const expiry=Date.parse(m.expires_at||'');
 if(m.expires_at&&(!Number.isFinite(expiry)||expiry<=now))return null;
 const sectors=Array.isArray(preferences.sectors)?preferences.sectors.filter(Boolean):[];
 if(sectors.length&&!sectors.includes(m.category))return null;
 const department=String(preferences.department||'').toUpperCase();
 if(department&&m.department&&String(m.department).toUpperCase()!==department)return null;
 const keywords=norm(preferences.keywords).split(' ').filter(w=>w.length>=3).slice(0,6);
 const searchable=norm([m.title,m.description,m.city,m.category].join(' '));
 if(keywords.length&&!keywords.every(w=>searchable.includes(w)))return null;
 if(preferences.min_budget_cents!=null&&m.budget_cents!=null&&m.budget_cents<preferences.min_budget_cents)return null;
 if(preferences.max_budget_cents!=null&&m.budget_cents!=null&&m.budget_cents>preferences.max_budget_cents)return null;
 const reasons=[];let score=53;
 if(sectors.length){score+=17;reasons.push('secteur correspondant');}
 if(department&&m.department){score+=13;reasons.push('département correspondant');}
 if(keywords.length){score+=Math.min(12,keywords.length*4);reasons.push('mots-clés présents');}
 const age=(now-Date.parse(m.created_at||0))/day;
 if(Number.isFinite(age)&&age>=0&&age<=2){score+=14;reasons.push('mission récente');}
 else if(Number.isFinite(age)&&age<=7&&age>=0){score+=7;reasons.push('publication récente');}
 const expiresIn=m.expires_at?(expiry-now)/day:null;
 if(expiresIn!=null&&expiresIn<=3){score-=8;reasons.push('échéance proche');}
 if(!reasons.length)reasons.push('mission ouverte');
 return {kind:'mission',id:String(m.id),title:String(m.title||'Mission disponible'),source:'Mission OFFRYA',
  score:clamp(score),reasons,location:[m.city,m.department].filter(Boolean).join(' · '),
  deadline:m.expires_at||null,created_at:m.created_at||null};
}
function tenderLead(a,now){
 if(!a?.tender_id||!a.title||!official(a.url))return null;
 const expiration=Date.parse(a.deadline||'');
 if(!Number.isFinite(expiration)||expiration<=now)return null;
 const score=Number(a.match_score);
 if(!Number.isFinite(score)||score<45)return null;
 const days=Math.ceil((expiration-now)/day);
 const reason=String(a.match_reason||'').slice(0,350);
 return {kind:'tender',id:String(a.tender_id),title:String(a.title),source:['TED','APPROCH'].includes(a.source)?a.source:'BOAMP',
  score:clamp(score),reasons:reason?reason.split(' · ').slice(0,4):['correspondance estimée'],
  location:a.departments||'France / lieu à vérifier',deadline:a.deadline,url:a.url,
  created_at:a.detected_at||null,daysLeft:days};
}
export function buildRadar({missions=[],alerts=[],preferences={},userId=null,now=Date.now()}={}){
 const time=Number.isFinite(now)?now:Date.now();
 const missionRows=Array.isArray(missions)?missions.map(m=>missionLead(m,preferences,userId,time)).filter(Boolean):[];
 const tenderRows=Array.isArray(alerts)?alerts.map(a=>tenderLead(a,time)).filter(Boolean):[];
 const combined=[...missionRows,...tenderRows].sort((a,b)=>b.score-a.score ||
  (Date.parse(b.created_at||0)||0)-(Date.parse(a.created_at||0)||0));
 return {total:combined.length,relevant:combined.filter(x=>x.score>=65).length,
  urgent:combined.filter(x=>x.score>=65&&x.deadline&&Date.parse(x.deadline)-time<=7*day).length,
  items:combined};
}
export const radarOfficialUrl=official;
