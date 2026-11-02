'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');

test('Le navigateur publie avec ville officielle et champs structurés sans changer les noms Supabase',async()=>{
 const geo=await import('../public/mission-fields.mjs');
 assert.deepEqual(geo.normaliseCommune({nom:'Marseille',code:'13055',codeDepartement:'13'}),{nom:'Marseille',code:'13055',department:'13'});
 assert.equal(geo.normaliseCommune({nom:'Ville',code:'invalid',codeDepartement:'13'}),null);
 assert.equal(geo.normaliseCommune({nom:'Ville',code:'13055',codeDepartement:'99'}),null);
 const matches=await geo.searchCommunes('Mar',{fetcher:async(url)=>({
  ok:true,json:async()=>[{nom:'Marseille',code:'13055',codeDepartement:'13'},{nom:'Mauvaise',code:'x',codeDepartement:'13'}]
 })});
 assert.equal(matches.length,1);
 const none=await geo.searchCommunes('M',{fetcher:()=>{throw Error('No fetch expected')}});
 assert.equal(none.length,0);
});
test('Photos : formats, taille et quantité limitées dans le formulaire',async()=>{
 const m=await import('../public/mission-fields.mjs');
 assert.equal(m.inspectMissionPhotos({files:[{size:1100,type:'image/jpeg'}]}).length,1);
 assert.throws(()=>m.inspectMissionPhotos({files:Array(4).fill({size:1,type:'image/png'})}),/trois photos/);
 assert.throws(()=>m.inspectMissionPhotos({files:[{size:500,type:'application/pdf'}]}),/Format/);
 assert.throws(()=>m.inspectMissionPhotos({files:[{size:4000000,type:'image/png'}]}),/3 Mo/);
});
test('Dépôt non disponible dans le HTML public et dans aucun chemin anonyme',()=>{
 const html=read('public/deposer-une-mission.html'),js=read('public/deposer.js');
 assert.doesNotMatch(html,/<form id="missionForm"/);
 assert.match(html,/id="publishArea" hidden/);
 assert.match(js,/auth\.getUser\(\)/);
 assert.match(js,/form\.addEventListener\('submit',submitMission\)/);
 assert.match(js,/const payload=missionData\(form,uid\)/);
 assert.match(js,/uploadMissionPhotos\(db,uid,result\.data\.id,photoFiles\)/);
 const app=read('public/app.js');
 assert.match(app,/initCommunePicker\(\$\('missionForm'\)\)/);
 assert.match(app,/rpc\('offrya_close_mission'/);
 assert.match(app,/rpc\('offrya_award_mission'/);
 assert.match(app,/rpc\('offrya_finish_mission'/);
});
test('Signalements et contact bloqué protégés en base, pas seulement par JS',()=>{
 const html=read('public/espace.html'),app=read('public/app.js');
 const migration=read('sql/mission-photos-contact-blocks-REVIEW.sql');
 for(const id of ['reportDialog','reportForm','blockContact','awardThread','finishThread','reportContact'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/from\('offrya_reports'\)\.insert\(payload\)/);
 assert.match(app,/from\('offrya_contact_blocks'\)/);
 assert.match(migration,/alter table public\.offrya_contact_blocks enable row level security/);
 assert.match(migration,/create policy messages_write/);
 assert.match(migration,/offrya_private\.can_send_to_contact/);
 assert.match(migration,/bucket_id='offrya-mission-photos'/);
 assert.match(migration,/public=false/);
});
test('Authentification inscription CAPTCHA facultative et sécurisée côté Supabase Auth',()=>{
 const html=read('public/connexion.html'),auth=read('public/connexion.js'),server=read('server.js');
 assert.match(html,/id="signupCaptcha" hidden/);
 assert.match(auth,/if\(captchaRequired&&!captchaToken\)throw Error/);
 assert.match(auth,/captchaToken/);
 assert.match(auth,/window\.turnstile\.render/);
 assert.match(server,/OFFRYA_SIGNUP_CAPTCHA_ENABLED==='true'/);
 assert.match(server,/https:\/\/geo\.api\.gouv\.fr/);
});
test('Les scripts du client et du serveur conservent une syntaxe valide',()=>{
 for(const name of ['public/app.js','public/deposer.js','public/connexion.js','public/mission-fields.mjs','public/moderation.js','lib/moderation.js','server.js']){
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',path.join(root,name)]),name);
 }
});
