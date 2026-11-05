'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const proCss=fs.readFileSync('public/pro-experience.css','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const parity=proCss.split('/* OFFRYA PC / Android parity, 05/11/2026.')[1];
assert.ok(parity,'Desktop/mobile parity rules must load last');

test('PC and Android use the same application and protected professional screens',()=>{
 assert.match(html,/href="\/styles\.css"/);
 assert.match(html,/href="\/pro-experience\.css"/);
 assert.match(app,/createProExperience/);
 assert.match(pro,/if\(!canUsePremium\(\)\|\|!current\)return \[\]/);
 for(const id of ['home','requests','tracking','boamp','watch','preferences','inbox','settings'])
  assert.ok(pro.includes("'"+id+"'"),'Missing professional screen '+id);
});

test('Desktop sidebar offers three primary actions plus all secondary professional tools',()=>{
 assert.match(pro,/const primaryMenu=\[/);
 for(const title of ['Trouver des missions','Proposer mes services','Gérer mon activité'])
  assert.ok(pro.includes(title),title);
 assert.match(pro,/extras\.id='proV3SidebarExtras'/);
 assert.match(pro,/secondaryMenu\.map\(navButton\)\.join\(''\)/);
 assert.match(pro,/nav\.after\(extras\);extras\.after\(badge\)/);
 assert.match(parity,/body\.offrya-pro-v3\.offrya-pro-workspace \.sidebar #proV3SidebarExtras\{/);
 assert.match(parity,/display:grid!important/);
 assert.match(parity,/@media\(min-width:621px\)/);
});

test('Android preserves secondary actions in the account menu and primary commercial routes',()=>{
 assert.match(pro,/id='proV3AccountTools'/);
 assert.match(pro,/accountPanel\.prepend\(tools\)/);
 assert.match(pro,/data-pro-screen/);
 assert.match(pro,/alertButton\.addEventListener\('click'/);
 assert.match(parity,/@media\(max-width:620px\)/);
 assert.match(parity,/body\.offrya-pro-v3 #proV3AccountTools\{display:grid!important\}/);
 assert.match(parity,/body\.offrya-pro-v3 \.pro-v3-primary-tabs\{display:grid\}/);
 assert.match(parity,/body\.offrya-pro-v3 \.pro-v3-search\{height:48px/);
});

test('Mission search is shared between desktop, Android and the existing secure mission feed',()=>{
 assert.match(pro,/\.querySelector\('\.pro-v3-primary-tabs'\)\.after\(search\)/);
 assert.doesNotMatch(pro,/header\.querySelector\('\.header-left'\)\.after\(search\)/);
 assert.match(pro,/search\.addEventListener\('submit'/);
 assert.match(pro,/\$\('missionQuery'\)\.value=\$\('proV3SearchInput'\)\.value/);
 assert.match(parity,/body\.offrya-pro-v3 \.pro-v3-search\{\s*display:flex!important/);
 assert.match(parity,/body\.offrya-pro-v3 \.pro-v3-search input\{font-size:16px\}/);
 assert.match(parity,/@media\(min-width:621px\) and \(max-width:930px\)/);
});

test('BOAMP listings and pagination are no longer silently hidden on either device',()=>{
 assert.doesNotMatch(proCss,/#boampList \.data-item:nth-child\(n\+6\)\{display:none\}/);
 assert.doesNotMatch(proCss,/#boampMore\{display:none!important\}/);
 assert.match(app,/boampMore/);
 assert.match(pro,/if\(next==='boamp'&&state\.boampStatus/);
});

test('Both viewports share OFFRYA plum header while cards remain light and responsive',()=>{
 assert.match(css,/@media\(min-width:621px\)\{\s*body:has\(\.app-shell\) \.app-shell \.header\{/);
 assert.match(css,/background:linear-gradient\(110deg,#351045,#4b1662\)!important/);
 assert.match(parity,/body\.offrya-pro-v3 \.app-shell \.header\{\s*background:linear-gradient\(110deg,#351045,#4b1662\)!important/);
 assert.match(parity,/body\.offrya-pro-v3\.offrya-pro-workspace \.app-shell \.sidebar\{/);
 assert.match(parity,/grid-template-columns:220px minmax\(0,1fr\)/);
 assert.match(proCss,/body\.offrya-pro-v3 \.pro-v3-panel\{background:#fff/);
 assert.match(css,/@media\(max-width:620px\)/);
});

test('The module remains valid and the three journeys still link to protected operations',()=>{
 const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 assert.match(pro,/if\(openProposal&&openProposal\(id\)\)\{show\('assistant'\);return;\}/);
 assert.match(pro,/return \{init,render,show,syncTab\}/);
 assert.doesNotMatch(pro,/service_role|VAPID_PRIVATE_KEY|OPENAI_API_KEY/);
});
