'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('sql/rls_professional_read_permissions.sql','utf8');
test('Read-only fix fails closed unless premium request owner RLS exists',()=>{
 assert.match(sql,/relrowsecurity/);
 assert.match(sql,/premium_read_own/);
 assert.match(sql,/raise exception 'Owner-only/);
 assert.match(sql,/grant select on public\.offrya_premium_requests to authenticated/);
 assert.doesNotMatch(sql,/grant\s+all\s+on/i);
 assert.doesNotMatch(sql,/disable row level security/i);
});
test('Professional access helper callable by authenticated role only',()=>{
 assert.match(sql,/revoke execute on function offrya_private\.has_active_professional_access\(\) from public, anon/);
 assert.match(sql,/grant execute on function offrya_private\.has_active_professional_access\(\) to authenticated/);
 assert.doesNotMatch(sql,/grant execute.* to public/i);
});
