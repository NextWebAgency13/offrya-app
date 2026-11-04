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
