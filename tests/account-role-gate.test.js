'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const src=app.slice(app.indexOf('function hasVerifiedProfessionalIdentity(){'),app.indexOf('function renderPremium(){'));
const verified={status:'verified',identity_status:'verified',identity_verified_at:'2026-10-29T12:00:00Z',authority_status:'verified',authority_verified_at:'2026-10-29T12:00:00Z',representative_kind:'dirigeant',registry_name_matched:true,registry_match_checked_at:'2026-10-29T12:00:00Z',registry_match_source:'official_search_rne',identity_live_verified:true,presence_verified_at:'2026-10-29T12:00:00Z',presence_method:'stripe_selfie',authority_review_method:'registry_representative'};
function access(premium,subscription,role='pro'){
 const state={session:{user:{id:'me',is_anonymous:false}},profile:{role},premium,subscription};
 const ctx={state,Date};vm.runInNewContext(src,ctx);return {verified:ctx.hasVerifiedProfessionalIdentity(),access:ctx.canUsePremium()};
}
test('account type cannot be selected or escalated from settings',()=>{
 assert.doesNotMatch(html,/id="profileRole"|name="role" required/);
 assert.match(html,/id="accountRoleStatus"/);
 assert.match(html,/data-tab="professional">Accéder à l’Espace pro/);
 assert.doesNotMatch(app,/f\.elements\.role\.value|x\.role==='pro'/);
 assert.match(app,/insert\(\{id,role:'client'/);
});
test('verified professional without an active subscription cannot browse opportunities',()=>{
 const a=access(verified,null);
 assert.equal(a.verified,true);
 assert.equal(a.access,false);
 const expired=access(verified,{status:'active',paid_through:'2026-01-01T00:00:00Z'});
 assert.equal(expired.access,false);
 const inactive=access(verified,{status:'canceled',paid_through:'2030-01-01T00:00:00Z'});
 assert.equal(inactive.access,false);
});
test('active payment plus complete identity/authority checks required',()=>{
 const active={status:'active',paid_through:'2030-01-01T00:00:00Z'};
 assert.equal(access(verified,active).access,true);
 assert.equal(access({...verified,identity_live_verified:false},active).access,false);
 assert.equal(access({...verified,registry_match_source:'unverified'},active).access,false);
 assert.equal(access(verified,active,'client').access,false);
});
test('client-side status does not replace RLS protection',()=>{
 assert.match(app,/if\(canUsePremium\(\)\)\{/);
 assert.match(app,/if\(!canUsePremium\(\)\)/);
 assert.match(app,/hasVerifiedProfessionalIdentity/);
});
