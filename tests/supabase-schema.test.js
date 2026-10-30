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
