'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html');
const form=read('public/deposer-une-mission.html');
const submit=read('public/deposer.js');
const login=read('public/connexion.js');
const privatePage=read('public/espace.html');
const privateJs=read('public/app.js');
const sql=read('sql/confirmed_mission_authors.sql');
const oldSql=read('sql/guest_mission_publishing.sql');
const premiumSql=read('sql/legal_representative_only.sql');

test('Publication : inscription et e-mail confirmé AVANT d’afficher le formulaire',()=>{
 assert.match(form,/id="accountGate"/);
 assert.match(form,/id="publishArea" hidden/);
 assert.match(form,/id="missionForm"/);
 assert.match(form,/href="\/connexion\?mode=signup&amp;role=client&amp;next=%2Fespace"/);
 assert.match(form,/href="\/connexion\?next=%2Fdeposer-une-mission"/);
 assert.match(submit,/auth\.getUser\(\)/);
 assert.match(submit,/email_confirmed_at/);
 assert.match(submit,/user\.is_anonymous/);
 assert.match(submit,/\$\('publishArea'\)\.hidden=!user/);
 assert.match(submit,/from\('offrya_missions'\)\.insert/);
 assert.doesNotMatch(submit,/signInAnonymously|followupOptIn|auth\.updateUser\(\{email:|turnstile/i);
 assert.doesNotMatch(form,/followupOptIn|guestCaptcha|session invitée/i);
});
test('Connexion : retour sûr à l’espace demandeur après inscription',()=>{
 assert.match(login,/value==='\/deposer-une-mission'/);
 assert.match(login,/query\.get\('mode'\)==='signup'/);
 assert.match(login,/if\(mode==='signup'\)\{/);
 assert.match(login,/emailRedirectTo:location\.origin\+'\/connexion\?confirmation=1&next'/);
 assert.match(login,/offrya_signup_intent/);
 assert.match(login,/location\.replace\(confirmationReturn\?'\/espace':next\)/);
 assert.match(login,/resetPasswordForEmail/);
 assert.match(login,/email_confirmed_at/);
 assert.doesNotMatch(login,/signInWithOtp|mode==='magic'/);
 assert.match(login,/resetPasswordForEmail/);
 assert.doesNotMatch(login,/signInAnonymously/);
});
test('Publication accessible par une page dédiée après connexion et e-mail confirmé',()=>{
 assert.doesNotMatch(privatePage,/id="missionAccountNotice"|id="missionForm"/);
 assert.match(privatePage,/id="newMissionBtn"/);
 assert.match(privateJs,/\$\('newMissionBtn'\)\.onclick=\(\)=>location\.assign\('\/deposer-une-mission'\)/);
 assert.doesNotMatch(privateJs,/async function ensureMissionPublisher\(\)|\$\('missionForm'\)/);
 assert.match(submit,/auth\.getUser\(\)/);
 assert.match(submit,/email_confirmed_at/);
 assert.doesNotMatch(privateJs,/signInAnonymously|setupGuestCaptcha|guestCaptchaWidget/);
});
test('Protection SQL : mission INSERT restreint sans altérer les droits Premium et la lecture des anciennes missions',()=>{
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/from auth\.users u/);
 assert.match(sql,/u\.is_anonymous is false/);
 assert.match(sql,/u\.email_confirmed_at is not null/);
 assert.match(sql,/as restrictive for insert to authenticated/);
 assert.match(sql,/offrya_private\.has_confirmed_mission_account\(\)/);
 assert.doesNotMatch(sql,/drop policy if exists missions_read_authorized|delete from public\.offrya_missions|offrya_private\.has_active_professional_access/);
 assert.match(oldSql,/missions_guest_owner_only/);
 assert.match(premiumSql,/registry_name_matched is true/);
 assert.match(premiumSql,/s\.status='active'/);
});
test('Accueil : communication cohérente et FAQ HTML / JSON-LD identiques',()=>{
 assert.match(home,/Publiez votre mission après confirmation de l’e-mail/);
 assert.doesNotMatch(home,/sans inscription|sans compte|session invitée|Aucun compte n.est imposé/i);
 // La maquette fidèle ne comporte pas de FAQ sur l'accueil. Aucune FAQ JSON-LD masquée.
 assert.doesNotMatch(home,/\\"@type\\":\\"FAQPage\\"/);
 assert.match(home,/class="mock-how"/);
 for(const slug of ['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations']){
  const page=read('public/secteurs/'+slug+'.html');
  assert.match(page,/gratuite après création d'un compte et confirmation/);
  assert.doesNotMatch(page,/sans inscription obligatoire/);
 }
});
