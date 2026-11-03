'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const signup=fs.readFileSync('public/connexion.js','utf8');
const signupHtml=fs.readFileSync('public/connexion.html','utf8');
const account=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const sql=fs.readFileSync('sql/signup_unique_pseudonyms.sql','utf8');

test('username is required and checked on every new signup',()=>{
 assert.match(signupHtml,/id="usernameRow"/);
 assert.match(signupHtml,/name="username"[^>]*minlength="3" maxlength="30"/);
 assert.match(signup,/userRow\.hidden=v!=='signup'/);
 assert.match(signup,/userRow\.querySelector\('input'\)\.required=v==='signup'/);
 assert.match(signup,/offrya_username:username/);
 assert.match(signup,/rpc\('offrya_username_available'/);
 assert.match(signup,/\^\[A-Za-z0-9_\]\{3,30\}\$/);
});
test('nickname is immutable from account page, no city or specialty editing',()=>{
 assert.match(account,/id="accountPseudonym"/);
 assert.match(account,/id="accountRoleStatus"/);
 assert.doesNotMatch(account,/id="profileForm"|name="specialty"|name="city"|name="display_name"/);
 assert.doesNotMatch(app,/\$\('profileForm'\)\.onsubmit|f\.elements\.specialty|f\.elements\.city/);
 assert.match(app,/\$\('accountPseudonym'\)\.textContent/);
 assert.match(app,/location\.assign\('\/connexion\?mode=signup&role=client/);
});
test('database controls unique signup pseudonym without rewriting existing users',()=>{
 assert.match(sql,/create unique index if not exists offrya_profiles_username_unique/);
 assert.match(sql,/lower\(display_name\)/);
 assert.match(sql,/create trigger offrya_signup_username after insert on auth\.users/);
 assert.match(sql,/if chosen is null then return new/);
 assert.match(sql,/insert into public\.offrya_profiles\(id,role,display_name,city,specialty\)/);
 assert.match(sql,/values\(new\.id,'client',chosen,'',''\)/);
 assert.match(sql,/offrya_immutable_username before update of display_name/);
 assert.doesNotMatch(sql,/delete from public\.offrya_profiles|update public\.offrya_profiles set display_name/i);
});
