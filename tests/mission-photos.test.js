'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=async()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('public/mission-photos.js','utf8')).toString('base64'));
function fakeDb({uploadError=null,insertError=null}={}){
 const calls=[],files=new Map(),rows=[];
 const db={
  storage:{from:bucket=>({
   upload:async(path,blob,opt)=>{calls.push(['upload',bucket,path,opt.contentType,opt.upsert]);if(uploadError)return {error:uploadError};files.set(path,blob);return {data:{path},error:null};},
   remove:async paths=>{calls.push(['remove',bucket,paths]);for(const p of paths)files.delete(p);return {data:[],error:null};},
   list:async folder=>({data:[...files.keys()].filter(k=>k.startsWith(folder+'/')).map(k=>({name:k.slice(folder.length+1)})),error:null}),
   createSignedUrls:async(paths,seconds)=>{calls.push(['sign',paths.length,seconds]);return {data:paths.map(path=>({path,signedUrl:'https://x.supabase.co/sign/'+path,error:null})),error:null};}
  })},
  from:table=>{const q={_f:{},select(){return q},eq(k,v){q._f[k]=v;return q},order(){return q},limit(){return q},
   insert:async row=>{calls.push(['insert',table,row]);if(insertError)return {error:insertError};rows.push({id:'r'+rows.length,...row});return {error:null};},
   delete(){q._del=true;return q},
   then(res){if(q._del){const i=rows.findIndex(r=>r.id===q._f.id);if(i>=0)rows.splice(i,1);return Promise.resolve({error:null}).then(res);}
    return Promise.resolve({data:rows.filter(r=>r.mission_id===q._f.mission_id).map(r=>({id:r.id,object_path:r.object_path})),error:null}).then(res);}};return q;}
 };
 return {db,calls,files,rows};
}
test('Envoi : chemin imposé par la base (utilisateur/mission/fichier), JPEG, 6 photos maximum',async()=>{
 const m=await load();const f=fakeDb();
 const out=await m.uploadMissionPhotos(f.db,'u1','m1',Array(8).fill(new Blob(['x'])));
 assert.deepEqual(out,{added:6,failed:0});
 const uploads=f.calls.filter(c=>c[0]==='upload');
 assert.equal(uploads.length,6);
 for(const u of uploads){assert.equal(u[1],'offrya-mission-images');assert.match(u[2],/^u1\/m1\/[\w-]+\.jpg$/);assert.equal(u[3],'image/jpeg');assert.equal(u[4],false);}
 assert.equal(f.rows.length,6);assert.ok(f.rows.every(r=>r.mission_id==='m1'&&r.object_path.startsWith('u1/m1/')));
});
test('Envoi : une ligne refusée par la base retire le fichier déjà envoyé',async()=>{
 const m=await load();const f=fakeDb({insertError:{message:'Six photos au maximum par mission.'}});
 const out=await m.uploadMissionPhotos(f.db,'u1','m1',[new Blob(['x'])]);
 assert.deepEqual(out,{added:0,failed:1});
 assert.ok(f.calls.some(c=>c[0]==='remove'));assert.equal(f.files.size,0);
});
test('Lecture : liens temporaires d’une heure ; suppression et purge à la clôture',async()=>{
 const m=await load();const f=fakeDb();
 await m.uploadMissionPhotos(f.db,'u1','m1',[new Blob(['a']),new Blob(['b'])]);
 const photos=await m.listMissionPhotos(f.db,'m1');
 assert.equal(photos.length,2);assert.ok(photos.every(p=>p.url.startsWith('https://x.supabase.co/sign/u1/m1/')));
 assert.ok(f.calls.some(c=>c[0]==='sign'&&c[2]===3600));
 await m.removeMissionPhoto(f.db,photos[0]);
 assert.equal(f.rows.length,1);assert.equal(f.files.size,1);
 assert.equal(await m.purgeMissionPhotos(f.db,'u1','m1'),1);assert.equal(f.files.size,0);
 assert.equal(m.MAX_PHOTOS,6);
});
test('Préparation : photo réenregistrée en JPEG ≤ 1600 px (sans métadonnées GPS)',()=>{
 const src=fs.readFileSync('public/mission-photos.js','utf8');
 assert.match(src,/const MAX_SIDE = 1600;/);
 assert.match(src,/canvas\.toBlob\(/);assert.match(src,/'image\/jpeg'/);
 assert.match(src,/imageOrientation: 'from-image'/);
});
test('Dépôt et fiche mission : ajout, affichage, suppression ; CSP et module servis',()=>{
 const html=fs.readFileSync('public/deposer-une-mission.html','utf8'),dep=fs.readFileSync('public/deposer.js','utf8'),app=fs.readFileSync('public/app.js','utf8'),server=fs.readFileSync('server.js','utf8');
 assert.match(html,/<input type="file" id="missionPhotos" accept="image\/jpeg,image\/png,image\/webp" multiple/);
 assert.match(html,/la position GPS des photos est retirée automatiquement/);
 assert.match(dep,/\.insert\(\{[\s\S]*?\}\)\.select\('id'\)\.single\(\)/);
 assert.match(dep,/uploadMissionPhotos\(db,uid,result\.data\.id,photos\.map\(p=>p\.blob\)\)/);
 assert.match(app,/data-mission-photos="'\+esc\(m\.id\)\+'"/);
 assert.match(app,/const canAdd=own&&m\.status==='open'&&photos\.length<MAX_PHOTOS;/);
 assert.match(app,/\(own\?'<button type="button" class="photo-remove"/);
 assert.match(app,/\['missionPhotos',state\.db\.from\('offrya_mission_photos'\)\.select\('mission_id'\)/);
 assert.match(app,/purgeMissionPhotos\(state\.db,state\.session\.user\.id,id\)/);
 assert.match(server,/\['\/mission-photos\.js','text\/javascript; charset=utf-8'\]/);
 assert.match(server,/img-src 'self' data: blob: https:\/\/images\.pexels\.com https:\/\/\*\.supabase\.co;/);
 const sql=fs.readFileSync('sql/mission_photos_owner_folder.sql','utf8');
 assert.match(sql,/create policy offrya_storage_owner_folder_read on storage\.objects/);
 assert.match(sql,/>= 6 then/);
});
