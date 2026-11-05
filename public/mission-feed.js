// OFFRYA mission feed. Supabase RLS is the authority for every returned row.
// This module never fetches other clients' missions without authorized Pro access.
export async function fetchMissionFeed(db, userId, premium, now=Date.now()){
 if(!db||!userId)return [];
 const owned=await db.from('offrya_missions').select('*')
  .eq('owner_id',userId).order('created_at',{ascending:false}).limit(200);
 if(owned.error)throw owned.error;
 const own=(Array.isArray(owned.data)?owned.data:[]).filter(m=>m.owner_id===userId);
 if(!premium)return own;
 const others=await db.from('offrya_missions').select('*')
  .eq('status','open').order('created_at',{ascending:false}).limit(200);
 if(others.error)throw others.error;
 const open=(Array.isArray(others.data)?others.data:[]).filter(m=>
  m.owner_id!==userId&&m.status==='open'&&
  (!m.expires_at||(Number.isFinite(Date.parse(m.expires_at))&&Date.parse(m.expires_at)>now)));
 const byId=new Map();
 for(const m of own.concat(open))if(m?.id)byId.set(m.id,m);
 return Array.from(byId.values()).sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0));
}


// Derive three independent, RLS-authorized lists. A favorite or a conversation
// is a followed opportunity, never a mission published by that professional.
// Own closed/awarded publications remain visible to their author only.
export function missionBuckets({missions=[],userId=null,premium=false,tracking=[],conversations=[],favorites=[],now=Date.now()}={}){
 const groups={available:[],published:[],followed:[]};
 if(!userId)return groups;
 const followedIds=new Set(
  (Array.isArray(favorites)?favorites:[]).filter(Boolean).map(String)
 );
 for(const row of Array.isArray(tracking)?tracking:[]){
  if(row?.mission_id&&row.stage&&row.stage!=='new')followedIds.add(String(row.mission_id));
 }
 for(const row of Array.isArray(conversations)?conversations:[]){
  if(row?.mission_id&&row.professional_id===userId)followedIds.add(String(row.mission_id));
 }
 const seen=new Set();
 for(const mission of Array.isArray(missions)?missions:[]){
  if(!mission?.id||seen.has(String(mission.id)))continue;
  seen.add(String(mission.id));
  if(mission.owner_id===userId){
   groups.published.push(mission);
   continue;
  }
  if(!premium||mission.status!=='open')continue;
  const deadline=mission.expires_at?Date.parse(mission.expires_at):null;
  if(mission.expires_at&&(!Number.isFinite(deadline)||deadline<=now))continue;
  groups.available.push(mission);
  if(followedIds.has(String(mission.id)))groups.followed.push(mission);
 }
 return groups;
}
