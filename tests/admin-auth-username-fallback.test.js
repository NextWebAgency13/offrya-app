'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('sql/admin_auth_username_fallback.sql','utf8');
const earlier=fs.readFileSync('sql/signup_unique_pseudonyms.sql','utf8');
const signup=fs.readFileSync('public/connexion.js','utf8');
test('Supabase Admin users and invitations receive a unique fallback nickname',()=>{
 assert.match(migration,/chosen := nullif\(btrim\(new\.raw_user_meta_data ->> 'offrya_username'\),''\)/);
 assert.match(migration,/if chosen is null then/);
 assert.match(migration,/chosen := 'user_' \|\| left\(replace\(new\.id::text,'-',''\),25\)/);
 assert.match(migration,/insert into public\.offrya_profiles/);
 assert.doesNotMatch(migration,/raise exception 'OFFRYA username required at signup'/);
});
test('Supabase keeps case-insensitive uniqueness and OFFRYA signup still requires a nickname',()=>{
 assert.match(earlier,/offrya_profiles_username_unique/);
 assert.match(signup,/offrya_username:username/);
 assert.match(signup,/offrya_username_available/);
});
