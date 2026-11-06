'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');

test('No duplicate upper action cards remain on Premium',()=>{
 assert.doesNotMatch(pro,/'<nav class="pro-v3-primary-tabs"/);
 assert.match(pro,/data-pro-panel="home"/);
 assert.match(pro,/Ma veille intelligente OFFRYA/);
 assert.doesNotMatch(pro,/proV3Search|proV3SearchInput|\.before\(search\)/);
 assert.match(pro,/pro-ai-welcome/);
 assert.match(pro,/pro-ai-filter-tabs/);
 assert.match(pro,/proV3Recommendations/);
 assert.doesNotMatch(pro,/querySelector\('\.pro-v3-primary-tabs'\)\.after\(search\)/);
});
test('Proposer mes services and Gérer mon activité are retained in the desktop sidebar only',()=>{
 assert.match(pro,/const primaryMenu=\[/);
 for(const value of ['Trouver des missions','Proposer mes services','Gérer mon activité'])assert.ok(pro.includes(value));
 assert.match(pro,/nav\.innerHTML=primaryMenu\.map\(navButton\)\.join\(''\)/);
 assert.match(html,/data-tab="boamp" aria-label="Espace Premium"/);
 assert.match(pro,/data-pro-screen/);
});
test('No top three-card strip can appear on small Android or desktop-site portrait viewports',()=>{
 assert.match(css,/body\.offrya-pro-v3 #proExperienceV3 \.pro-v3-primary-tabs\{display:none!important\}/);
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});

test('Top-right account menu has no Outils professionnels block at all',()=>{
 assert.doesNotMatch(pro,/accountPanel|accountToolsMenu|pro-v3-account-title/);
 // The desktop sidebar keeps its own professional tools.
 assert.match(pro,/extras\.innerHTML='<strong class="pro-v3-extras-title">Outils professionnels<\/strong>'\+secondaryMenu\.map\(navButton\)/);
 assert.match(html,/Mon compte et préférences/);
 for(const kept of ['Mon compte et préférences','Espace professionnel','Déconnexion'])assert.ok(html.includes(kept),kept);
});

test('Menu compte : l’identifiant fait doublon avec « Mon compte et préférences » et est masqué pour un compte connecté',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/\$\('authOpen'\)\.classList\.toggle\('hidden',yes&&!isGuest\(\)\)/);
 // « Se connecter » (visiteur) et « Suivi invité » restent affichés.
 assert.match(app,/\$\('authOpen'\)\.textContent=!yes\?'Se connecter':isGuest\(\)\?'Suivi invité'/);
 assert.match(html,/data-tab="settings">Mon compte et préférences<\/button>/);
});
