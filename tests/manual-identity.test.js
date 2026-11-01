'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/espace.html'),js=read('public/app.js');
const sql=read('sql/manual_identity_review_requests.sql'),identitySql=read('sql/professional_identity_mfa.sql');
test('OFFRYA propose une vraie solution manuelle quand Stripe Identity est indisponible',()=>{
 for(const id of ['identityPanel','identityAutomatic','identityManual','manualIdentityRequest','manualIdentityDescription','manualIdentityStatus'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/Demander une assistance sécurisée/);
 assert.match(html,/Ne transmettez aucune pièce d’identité par e-mail/);
 assert.match(js,/\$\('identityAutomatic'\)\.classList\.toggle\('hidden',!state.identityEnabled\)/);
 assert.match(js,/\$\('identityPanel'\)\.classList\.toggle\('hidden',!canStart\)/);
 assert.match(js,/\$\('manualIdentityRequest'\)\.onclick=async/);
 assert.match(js,/from\('offrya_manual_identity_requests'\)\.insert/);
 assert.match(js,/from\('offrya_manual_identity_requests'\)\.select/);
});
test('Une demande ne peut pas approuver elle-même un dossier',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.offrya_manual_identity_requests from public,anon,authenticated/);
 assert.match(sql,/grant insert \(user_id\)/);
 assert.doesNotMatch(sql,/grant update .*authenticated/);
 assert.doesNotMatch(sql,/grant insert \(status\)/);
 assert.match(sql,/user_id=\(select auth.uid\(\)\)/);
 assert.match(sql,/is_anonymous/);
 assert.match(sql,/v.status='pending'/);
 assert.match(sql,/v.identity_status <> 'verified'/);
 assert.match(identitySql,/offrya_guard_professional_approval/);
 const fn=read('sql/professional_without_mfa.sql');
 assert.match(fn,/v.identity_status='verified'/);
 assert.match(fn,/v.authority_status='verified'/);
 assert.match(fn,/s.status='active'/);
});
test('Les dossiers en cours et le refus administratif sont visibles après reconnexion',()=>{
 assert.match(js,/state.manualIdentity=manualReview.data/);
 assert.match(js,/requested:'Demande reçue/);
 assert.match(js,/scheduled:'Contrôle manuel planifié/);
 assert.match(js,/rejected:'Demande non retenue/);
 assert.match(js,/\$\('manualIdentityRequest'\)\.classList\.toggle\('hidden',Boolean\(reviewStatus\)\)/);
});
