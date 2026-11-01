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
 assert.match(form,/href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/);
 assert.match(form,/href="\/connexion\?next=%2Fdeposer-une-mission"/);
 assert.match(submit,/auth\.getUser\(\)/);
 assert.match(submit,/email_confirmed_at/);
 assert.match(submit,/user\.is_anonymous/);
 assert.match(submit,/\$\('publishArea'\)\.hidden=!user/);
 assert.match(submit,/from\('offrya_missions'\)\.insert/);
 assert.doesNotMatch(submit,/signInAnonymously|followupOptIn|auth\.updateUser\(\{email:|turnstile/i);
 assert.doesNotMatch(form,/followupOptIn|guestCaptcha|session invitée/i);
});
test('Connexion : retour sûr au dépôt après inscription ou confirmation par e-mail',()=>{
 assert.match(login,/value==='\/deposer-une-mission'/);
 assert.match(login,/query\.get\('mode'\)==='signup'/);
 assert.match(login,/emailRedirectTo:location\.origin\+'\/connexion\?next='/);
 assert.match(login,/email_confirmed_at/);
 assert.match(login,/shouldCreateUser:false/);
 assert.match(login,/resetPasswordForEmail/);
 assert.doesNotMatch(login,/signInAnonymously/);
});
test('Compte gratuit confirmé obligatoire aussi depuis le tableau de bord',()=>{
 assert.match(privatePage,/id="missionAccountNotice"/);
 assert.match(privatePage,/Gratuit · Compte confirmé/);
 assert.doesNotMatch(privatePage,/La publication est gratuite et sans inscription|Si vous publiez en invité/);
 assert.match(privateJs,/async function ensureMissionPublisher\(\)/);
 assert.match(privateJs,/auth\.getUser\(\)/);
 assert.match(privateJs,/user\.is_anonymous\|\|!user\.email\|\|!user\.email_confirmed_at/);
 assert.match(privateJs,/\$\('missionForm'\)\.classList\.toggle\('hidden',!publisherReady\)/);
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
 assert.match(home,/Publication gratuite avec compte confirmé/);
 assert.doesNotMatch(home,/sans inscription|sans compte|session invitée|Aucun compte n.est imposé/i);
 const faqs=[...home.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)];
 const schema=[...home.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(v=>JSON.parse(v[1])).find(s=>s['@type']==='FAQPage');
 assert.ok(schema);
 assert.equal(schema.mainEntity.length,faqs.length);
 for(let i=0;i<faqs.length;i++){assert.equal(schema.mainEntity[i].name,faqs[i][1]);assert.equal(schema.mainEntity[i].acceptedAnswer.text,faqs[i][2]);}
 for(const slug of ['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations']){
  const page=read('public/secteurs/'+slug+'.html');
  assert.match(page,/gratuite après création d'un compte et confirmation/);
  assert.doesNotMatch(page,/sans inscription obligatoire/);
 }
});
