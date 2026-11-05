'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');

const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/pro-experience.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');

const start=pro.indexOf('export function professionalGreetingLabel(state){');
const end=pro.indexOf('// OFFRYA Pro UI v3',start);
assert.ok(start>=0&&end>start,'Greeting helper is available before the Pro UI module');
const greeting=vm.runInNewContext(
 pro.slice(start,end).replace('export function ','function ')+'\nprofessionalGreetingLabel;');

test('OFFRYA account pseudo takes priority over the company legal name',()=>{
 const state={
  profile:{display_name:'  Mon Pseudo  '},premium:{legal_name:'Entreprise SA'},
  session:{user:{user_metadata:{offrya_username:'Autre pseudo'}}}
 };
 assert.equal(greeting(state),'Mon Pseudo');
 assert.equal(greeting({profile:{display_name:''},premium:{legal_name:'Entreprise SA'},
  session:{user:{user_metadata:{offrya_username:'Pro Verte'}}}}),'Pro Verte');
});

test('Greeting skips technical IDs, handles empty profile and avoids generic profession label',()=>{
 assert.equal(greeting({profile:{display_name:'user_abcdefghijkl'},
  session:{user:{email:'contact-test@example.com',user_metadata:{}}}}),'contact-test');
 assert.equal(greeting({session:{user:{user_metadata:{}}}}),'');
 assert.match(greeting({profile:{display_name:'Z'.repeat(40)},session:{user:{}}}),/^Z{29}…$/);
 assert.equal(greeting({profile:{display_name:'Professionnel'},session:{user:{email:'moncompte@example.org'}}}),'moncompte');
 assert.match(pro,/greeting\.firstChild\.textContent=label\?'Bonjour, ':'Bienvenue sur '/);
 assert.doesNotMatch(pro,/label=rawLabel&&!technical\?rawLabel:'professionnel'/);
});

test('A tall touchscreen Chrome virtual desktop viewport receives phone navigation',()=>{
 const fallback=css.split('/* OFFRYA mobile fallback for Chrome Android')[1];
 assert.ok(fallback,'Android wide-viewport fallback exists');
 assert.match(fallback,/\(pointer:coarse\) and \(orientation:portrait\)/);
 assert.match(fallback,/\(min-width:621px\) and \(max-width:1100px\) and \(max-aspect-ratio:3\/5\)/);
 assert.match(fallback,/\.app-shell\s*,\s*body\.offrya-pro-v3 \.app-shell\{\s*display:block!important/);
 assert.match(fallback,/\.sidebar #nav\{\s*display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
 assert.match(fallback,/\.sidebar #nav \.nav-link\[data-tab="boamp"\]\{display:none!important\}/);
 assert.match(fallback,/\.pro-v3-sidebar-nav/);
 assert.match(fallback,/body\.offrya-pro-v3 \.pro-v3-primary-tabs\{/);
});

test('Conversations appear one at a time with an accessible back button in Android portrait desktop mode',()=>{
 assert.match(css,/body #inbox \.inbox-grid\{display:block!important;grid-template-columns:1fr!important\}/);
 assert.match(css,/body #inbox \.message-panel\{display:none!important\}/);
 assert.match(css,/body #inbox\.has-active-thread \.inbox-conversations\{display:none!important\}/);
 assert.match(css,/body #inbox\.has-active-thread \.message-panel\{display:block!important\}/);
 assert.match(css,/body #inbox \.inbox-mobile-back\{display:inline-flex!important/);
 assert.match(html,/id="inboxBackToList"/);
 assert.match(app,/state\.thread=conversationId/);
 assert.match(app,/acknowledgeConversation\(id,state\.messages\)/);
});

test('The same fallback retains account settings, tools and user privacy',()=>{
 assert.match(css,/body #settings \.push-notifications-settings\{flex-direction:column!important/);
 assert.match(css,/body\.offrya-pro-v3 #proV3AccountTools\{display:grid!important\}/);
 assert.match(css,/body\.offrya-pro-v3 \.pro-v3-search\{\s*display:flex!important/);
 assert.match(pro,/canUsePremium\(\)/);
 assert.match(pro,/if\(openProposal&&openProposal\(id\)\)\{show\('assistant'\);return;\}/);
 assert.match(html,/name="viewport" content="width=device-width,initial-scale=1"/);
 const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
