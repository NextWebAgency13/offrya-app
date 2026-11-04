'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const db=fs.readFileSync('sql/security_rls_premium_staged_review.sql','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const premium=fs.readFileSync('lib/premium.js','utf8');
test('Staged SQL denies other users missions even when they are authenticated',()=>{
 assert.match(db,/drop policy if exists missions_guest_owner_only on public\.offrya_missions/);
 assert.match(db,/create policy missions_guest_owner_only on public\.offrya_missions\s+as restrictive for select to authenticated/);
 assert.match(db,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(db,/raise exception 'Missing core missions_read_authorized policy/);
 assert.doesNotMatch(db,/disable row level security/i);
});
test('Profile lookup preserves self and actual conversation participants, no blanket authenticated SELECT',()=>{
 const policy=db.slice(db.indexOf('create policy profile_read'),db.indexOf('-- Preserve the verified identity'));
 assert.match(policy,/id=\(select auth\.uid\(\)\)/);
 assert.match(policy,/exists\s*\(\s*select 1 from public\.offrya_conversations c/);
 assert.match(policy,/c\.client_id=\(select auth\.uid\(\)\) and c\.professional_id=offrya_profiles\.id/);
 assert.match(policy,/c\.professional_id=\(select auth\.uid\(\)\) and c\.client_id=offrya_profiles\.id/);
 assert.doesNotMatch(policy,/using\s*\(\s*true\s*\)/);
});
test('Strict Pro authorization cannot be replaced by expired, fake or active QA grants',()=>{
 const fn=db.slice(db.indexOf('create or replace function offrya_private.has_active_professional_access()'));
 for(const required of [
  'p.role=\'pro\'','v.status=\'verified\'','v.representative_kind=\'dirigeant\'',
  'v.identity_live_verified is true','v.authority_status=\'verified\'',
  's.status=\'active\'','s.paid_through>now()'
 ])assert.ok(fn.includes(required),required);
 assert.doesNotMatch(fn,/or\s+offrya_private\.has_temporary_premium_access/);
 assert.match(db,/revoke all on function public\.offrya_test_premium_expires_at\(\) from public,anon,authenticated/);
 assert.doesNotMatch(premium,/offrya_test_premium_expires_at/);
 assert.doesNotMatch(app,/state\.db\.rpc\('offrya_test_premium_expires_at'\)/);
});
test('Existing publishing, messaging and professional billing flows retain their entry points',()=>{
 const html=fs.readFileSync('public/deposer-une-mission.html','utf8');
 const appserver=fs.readFileSync('server.js','utf8');
 assert.match(html,/id="missionForm"/);
 assert.match(app,/from\('offrya_conversations'\)/);
 assert.match(app,/from\('offrya_messages'\)/);
 assert.match(app,/from\('offrya_missions'\)/);
 assert.match(appserver,/p==='\/api\/billing\/checkout'/);
 assert.match(appserver,/p==='\/api\/billing\/portal'/);
 assert.match(appserver,/verifyPremiumAccess\(req\.headers\.authorization/);
});
test('No database mutation is shipped in Node startup; SQL remains staged until approval',()=>{
 const server=fs.readFileSync('server.js','utf8');
 assert.doesNotMatch(server,/security_rls_premium_staged_review/);
 assert.match(db,/begin;[\s\S]*commit;/);
});
