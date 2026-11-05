'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const sales=fs.readFileSync('public/pro-commercial.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const sql=fs.readFileSync('sql/pro_commercial_pipeline.sql','utf8');
test('Commercial dashboard mirrors request/assistant/tracking workflow without example clients',()=>{
 for(const id of ['salesRequestsCount','salesPendingCount','salesQuotesCount','salesRequestsPane','salesAssistantPane','salesTrackingPane','salesRequestsList','salesAssistantContent','salesTrackingList'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const tab of ['requests','assistant','tracking'])assert.match(html,new RegExp('data-sales-tab="'+tab+'"'));
 assert.match(sales,/state\.missions\.filter\(m=>m\.owner_id!==uid\(\)&&m\.status==='open'\)/);
 assert.doesNotMatch(html,/Entretien de jardin|Nettoyage de bureaux|Élagage de deux arbres/);
 assert.match(sales,/Aucune demande pour le moment/);
});
test('Authorization is never granted by UI and real message sends need explicit confirmation',()=>{
 assert.match(sales,/canUsePremium\(\)/);
 assert.match(sales,/state\.profile\?\.role!=='pro'/);
 assert.match(sales,/confirm\('Envoyer cette proposition au demandeur/);
 assert.match(sales,/from\('offrya_messages'\)\.insert/);
 assert.match(sales,/from\('offrya_conversations'\)\.insert/);
 assert.match(sales,/from\('offrya_pro_lead_tracking'\)\.upsert/);
 assert.match(app,/createSalesWorkspace/);
 assert.match(app,/salesWorkspace\.render\(\)/);
 assert.match(app,/salesWorkspace\.init\(\)/);
});
test('Server AI route only works for authorized professionals and returns editable drafts',()=>{
 assert.match(server,/p==='\/api\/pro\/draft'&&req\.method==='POST'/);
 assert.match(server,/verifyPremiumAccess\(req\.headers\.authorization/);
 assert.match(server,/if\(!entitlement\.allowed\)return json/);
 assert.match(server,/mission\.status!=='open'\|\|mission\.owner_id===userId/);
 assert.match(server,/process\.env\.OPENAI_API_KEY/);
 assert.match(server,/api\.openai\.com\/v1\/chat\/completions/);
 assert.match(sales,/data-sales-generate/);
 assert.match(sales,/Générer avec l’IA/);
 assert.match(sales,/data-sales-send/);
 assert.match(server,/pro-commercial\.js/);
});
test('Tracking rows are isolated by RLS and verified professional entitlement',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.offrya_pro_lead_tracking from public,anon,authenticated/);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/offrya_private\.has_active_professional_access\(\)/);
 assert.match(sql,/m\.owner_id<>\(select auth\.uid\(\)\)/);
 assert.match(sql,/primary key\(user_id,mission_id\)/);
});
