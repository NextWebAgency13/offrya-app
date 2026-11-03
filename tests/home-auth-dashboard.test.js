'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('public/home-session.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const server=fs.readFileSync('server.js','utf8');
const auth=fs.readFileSync('public/connexion.js','utf8');
test('L accueil public redirige seulement un compte vérifié',()=>{
 assert.match(html,/<script type="module" src="\/home-session\.js"><\/script>/);
 assert.match(server,/\['\/home-session\.js','text\/javascript; charset=utf-8'\]/);
 assert.match(js,/db\.auth\.getSession\(\)/);
 assert.match(js,/db\.auth\.getUser\(\)/);
 assert.match(js,/user\.is_anonymous\|\|!user\.email_confirmed_at/);
 assert.match(js,/user\.id!==session\.user\?\.id/);
 assert.match(js,/location\.replace\('\/espace'\)/);
 assert.doesNotMatch(js,/signUp\(|updateUser\(|STRIPE_SECRET_KEY|SUPABASE_SECRET_KEY/);
});
test('La confirmation ouvre toujours le tableau de bord',()=>{
 assert.match(auth,/location\.replace\(confirmationReturn\?'\/espace':next\)/);
 assert.doesNotMatch(auth,/intent==='client'\?'\/espace':'\/'/);
});
