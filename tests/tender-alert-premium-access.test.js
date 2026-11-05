'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const sql=fs.readFileSync('sql/fix_premium_tender_alerts_rls.sql','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');

test('Tender alerts use the same active Premium access predicate as protected opportunities',()=>{
 assert.match(sql,/create policy offrya_tender_alerts_read[\s\S]*?for select to authenticated/);
 assert.match(sql,/create policy offrya_tender_alerts_seen[\s\S]*?for update to authenticated/);
 const statements=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
 assert.equal((statements.match(/offrya_private\.has_active_professional_access\(\)/g)||[]).length,3);
 assert.equal((sql.match(/user_id = \(select auth\.uid\(\)\)/g)||[]).length,3);
 assert.match(sql,/with check/);
 assert.match(sql,/enable row level security/);
 // Keep account verification, paid access and explicit temporary QA checks in the
 // existing helper, never in client-controlled metadata or a universal policy.
 assert.doesNotMatch(sql,/using\s*\(\s*true\s*\)|to anon|grant\s+execute|insert\s+into/i);
});
test('Radar refreshes RLS-authorized BOAMP/TED rows, then resets ranking cache',()=>{
 assert.match(pro,/async function refreshTenderRadar\(\)/);
 assert.match(pro,/if\(tenderRefreshing\|\|!canUsePremium\(\)/);
 assert.match(pro,/state\.db\.from\('offrya_tender_alerts'\)/);
 assert.match(pro,/\.eq\('user_id',user\)/);
 assert.match(pro,/if\(state\.session\?\.user\?\.id!==user\|\|!canUsePremium\(\)\)return/);
 assert.match(pro,/if\(response\.error\)throw response\.error/);
 assert.match(pro,/state\.opportunityAlerts=Array\.isArray\(response\.data\)/);
 assert.match(pro,/serverRadar=null;radarKey='';radarAt=0/);
 assert.match(pro,/if\(radarButton&&canUsePremium\(\)\)\{refreshTenderRadar\(\)/);
 assert.doesNotMatch(pro,/service_role|OFFRYA_SUPABASE_SECRET_KEY/);
 const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
