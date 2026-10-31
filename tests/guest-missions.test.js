'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const get=p=>readFileSync(path.join(__dirname,'..',p),'utf8');
const html=get('public/index.html');
const app=get('public/app.js');
const sql=get('sql/guest_mission_publishing.sql');
const secureSql=get('sql/professional_identity_mfa.sql');

test('Accueil : dépôt gratuit sans inscription et consultation Premium',()=>{
 const home=html.split('<section class="tab active" id="dashboard">')[1].split('<section class="tab" id="missions">')[0];
 assert.match(home,/Sans créer de compte/);
 assert.match(home,/34,99 € TTC\/mois/);
 assert.match(home,/professionnels dont l’entreprise et l’identité sont vérifiées/);
 assert.doesNotMatch(home,/Créez un compte et précisez la prestation/);
});
test('Formulaire : aucune connexion imposée avant de publier',()=>{
 const missions=html.split('<section class="tab" id="missions">')[1].split('<section class="tab" id="professional">')[0];
 assert.match(missions,/Gratuit · Sans compte/);
 assert.match(missions,/id="missionForm"/);
 assert.match(missions,/session invitée privée/);
 assert.match(missions,/id="missionStatus"/);
 assert.match(app,/async function ensureMissionPublisher\(\)/);
 assert.match(app,/auth\.signInAnonymously/);
 assert.match(app,/captchaToken/);
 assert.match(app,/setupGuestCaptcha/);
 assert.match(app,/from\('offrya_profiles'\)\.insert/);
 assert.match(app,/state\.db\.from\('offrya_missions'\)\.insert/);
 assert.doesNotMatch(app,/\$\('missionForm'\)\.onsubmit=async e=>\{e\.preventDefault\(\);if\(!requireRole\('client'\)\)/);
 assert.match(app,/if\(f\.dataset\.sending==='true'\)return/);
});
test('Session invitée : textes et données absentes protégés',()=>{
 assert.match(app,/state\.session\.user\.email\?\.split/);
 assert.match(app,/function isGuest\(\)/);
 assert.match(app,/!yes\|\|isGuest\(\)/);
 assert.match(app,/même navigateur|ce navigateur/);
 assert.match(app,/signed|session invitée|Session invitée/);
});
test('L’invité ne peut ni s’auto-promouvoir Pro ni voir les autres missions',()=>{
 assert.match(sql,/profile_insert/);
 assert.match(sql,/profile_update/);
 assert.match(sql,/role='client'/);
 assert.match(sql,/missions_guest_owner_only/);
 assert.match(sql,/as restrictive for select to authenticated/);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/limit_guest_mission_posts/);
 assert.match(sql,/interval '24 hours'/);
 assert.match(secureSql,/has_active_professional_access/);
 assert.match(secureSql,/identity_status='verified'/);
 assert.match(secureSql,/authority_status='verified'/);
});
