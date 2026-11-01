// Photos de mission : stockage privé, maximum 6 images de 5 Mo.
export const MAX_IMAGES=6,MAX_BYTES=5*1024*1024;
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
export function validateMissionPhotos(files){
 const list=Array.from(files||[]);
 if(list.length>MAX_IMAGES)throw Error('Maximum de 6 photos par mission.');
 for(const file of list){
  if(!TYPES.has(file.type))throw Error('Formats autorisés : JPEG, PNG et WebP.');
  if(file.size>MAX_BYTES||file.size<1)throw Error('Chaque photo doit peser au maximum 5 Mo.');
 }
 return list;
}
export async function uploadMissionPhotos(db,files,ownerId,missionId){
 const list=validateMissionPhotos(files);
 let done=0;
 for(const file of list){
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  const name=ownerId+'/'+missionId+'/'+crypto.randomUUID()+'.'+ext;
  const up=await db.storage.from('offrya-mission-images').upload(name,file,{contentType:file.type,upsert:false});
  if(up.error)throw Error(done+' photo(s) enregistrée(s). '+up.error.message);
  const meta=await db.from('offrya_mission_photos').insert({mission_id:missionId,object_path:name});
  if(meta.error)throw Error(done+' photo(s) enregistrée(s). '+meta.error.message);
  done++;
 }
 return done;
}