'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('sql/unified_opportunity_watch.sql','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const pro=fs.readFileSync('public/opportunity-console.js','utf8');
const worker=fs.readFileSync('scripts/watch-sector-tenders.js','utf8');
const workflow=fs.readFileSync('.github/workflows/sector-tender-watch.yml','utf8');
test('Two separate sources remain available in one professional dashboard',()=>{
 for(const id of ['proDashboard','opWatchForm','opMissionList','opTenderList','opTrackedList','opAlertsList','opMissionCount','opTenderCount'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(pro,/m\.owner_id===current\(\)/);
 assert.match(pro,/state\.missions\.filter/);
 assert.match(pro,/\/api\/annonces/);
 assert.match(pro,/canUsePremium\(\)/);
 assert.match(app,/function canUsePremium\(/);
 assert.match(app,/createOpportunityConsole\(/);
 assert.match(app,/opportunityConsole\.render\(\)/);
});
test('Only the owner can change their watch or tender tracking; privileged data cannot be self-assigned',()=>{
 for(const table of ['offrya_opportunity_preferences','offrya_tender_tracking','offrya_tender_alerts']){
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on public\\.'+table+' from public,anon,authenticated'));
 }
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/offrya_private\.has_active_professional_access\(\)/);
 assert.match(sql,/revoke all on function public\.offrya_watch_targets\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.offrya_watch_targets\(\) to service_role/);
 assert.doesNotMatch(sql,/grant execute on function public\.offrya_watch_targets\(\) to authenticated/);
});
test('Hourly opt-in source discovery deduplicates official tenders and never sends commercial mail',()=>{
 assert.match(workflow,/cron: '23 \* \* \* \*'/);
 assert.match(worker,/rpc\/offrya_agent_watch_targets/);
  const agentSQL=fs.readFileSync('sql/tender_agent_preparation.sql','utf8');
  assert.match(agentSQL,/grant execute on function public\.offrya_agent_watch_targets\(\) to service_role/);
  assert.match(agentSQL,/s\.status='active' and s\.paid_through>now\(\)/);
 assert.match(worker,/resolution=ignore-duplicates/);
 assert.match(worker,/queryBoamp/);
 assert.doesNotMatch(worker,/api\.resend\.com|sendMail|smtp/);
 assert.match(sql,/primary key\(user_id,tender_id\)/);
 assert.match(sql,/p\.alerts_enabled is true/);
});
test('Private missions and official BOAMP remain protected by existing backend authorization',()=>{
 const server=fs.readFileSync('server.js','utf8');
 assert.match(server,/verifyPremiumAccess\(req\.headers\.authorization/);
 assert.match(server,/\['\/opportunity-console\.js','text\/javascript/);
 assert.match(pro,/state\.db\.from\('offrya_tender_tracking'\)/);
 assert.match(pro,/state\.db\.from\('offrya_opportunity_preferences'\)/);
});
