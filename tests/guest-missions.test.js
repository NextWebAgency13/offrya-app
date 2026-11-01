'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const publicHome=get('public/index.html'),form=get('public/deposer-une-mission.html'),submit=get('public/deposer.js'),privateJs=get('public/app.js'),sql=get('sql/guest_mission_publishing.sql'),secure=get('sql/legal_representative_only.sql');
test('Publication publique séparée et gratuite sans compte',()=>{
 assert.match(publicHome,/sans inscription/i);
 assert.match(form,/id="missionForm"/);
 assert.match(form,/id="followupOptIn"/);
 assert.match(form,/id="followupForm"/);
 assert.match(form,/id="missionStatus"/);
 assert.match(submit,/auth\.signInAnonymously/);
 assert.match(submit,/from\('offrya_profiles'\)\.insert/);
 assert.match(submit,/from\('offrya_missions'\)\.insert/);
 assert.match(submit,/dataset\.sending/);
 assert.doesNotMatch(form,/Création de compte obligatoire/);
});
test('Suivi e-mail strictement facultatif, explicite, sans marketing',()=>{
 assert.match(submit,/auth\.updateUser\(\{email\}/);
 assert.match(submit,/followupForm'\)\.addEventListener\('submit'/);
 assert.match(form,/Aucun e-mail commercial ni alerte automatique/);
 assert.match(submit,/is_anonymous/);
});
test('L’invité ne peut ni lire les missions des autres ni accéder au Premium',()=>{
 assert.match(sql,/missions_guest_owner_only/);
 assert.match(sql,/as restrictive for select to authenticated/);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/limit_guest_mission_posts/);
 assert.match(secure,/is_anonymous/);
 assert.match(secure,/registry_name_matched is true/);
 assert.match(secure,/s\.status='active'/);
 assert.match(privateJs,/function isGuest\(\)/);
});
