'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../sql/schema.sql'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('Les favoris sont strictement privés et soumis à RLS',()=>{
 assert.match(sql,/alter table public\.offrya_favorites enable row level security/);
 assert.match(sql,/create policy favorites_read[\s\S]*?user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/create policy favorites_insert[\s\S]*?user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/create policy favorites_delete[\s\S]*?user_id=\(select auth\.uid\(\)\)/);
});
test('L’interface gère les favoris par utilisateur identifié',()=>{
 assert.match(app,/from\('offrya_favorites'\)\.select\('mission_id'\)/);
 assert.match(app,/from\('offrya_favorites'\)\.insert\(\{user_id:state\.session\.user\.id,mission_id:id\}\)/);
 assert.match(app,/data-favorite=/);
});

test('La couche SQL retire les permissions de devis sans effacer les données',()=>{
 const revokes=fs.readFileSync(path.join(__dirname,'../sql/disable_quotes_contracts.sql'),'utf8');
 assert.match(revokes,/revoke select,insert,update,delete on public\.offrya_quotes/);
 assert.match(revokes,/revoke execute on function public\.offrya_decide_quote/);
 assert.doesNotMatch(revokes,/drop table/i);
});

test('La migration sécurise les missions et impose représentant et paiement',()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../sql/professional_launch.sql'),'utf8');
 assert.match(migration,/revoke select on public\.offrya_missions from anon/);
 assert.match(migration,/drop policy if exists missions_read_public/);
 assert.match(migration,/has_active_professional_access/);
 assert.match(migration,/s\.status='active' and s\.paid_through>now\(\)/);
 assert.match(migration,/representative_name/);
 assert.match(migration,/revoke insert on public\.offrya_premium_requests from authenticated/);
 assert.match(app,/missionSearchFilters/);
 assert.doesNotMatch(app,/missionAccessNotice/);
 assert.match(app,/verification-request/);
});
