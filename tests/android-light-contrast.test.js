'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/brand-kit.css','utf8');
const block=css.slice(css.indexOf('/* ===== Android (vidéo du 07/11, 12 h 39)'));
test('Android : barre du bas claire et lisible sur tous les onglets, Espace Premium compris',()=>{
 assert.ok(block.length>100);
 assert.match(block,/html body\.offrya-reference-ui\[data-offrya-role="premium"\]:has\(\.tab\.active\) \.app-shell \.sidebar,/);
 assert.match(block,/:has\(#professional\.active,#deposit\.active\) \.app-shell \.sidebar\{\n  background:linear-gradient\(120deg,#FFFCFF 0%,#F0E5FB 100%\)!important;/);
 assert.match(block,/\.nav-link:not\(\.active\) :is\(\.nav-icon,svg,span:not\(\.message-unread-badge\)\)\{\n  color:#35255F!important;opacity:1!important;/);
});
test('Android : textes des en-têtes, « Actualiser », badge IA et « Modifier » lisibles',()=>{
 assert.match(block,/> \.section-top:first-child p:not\(\.eyebrow\)\{\n  color:#5B4E70!important;/);
 assert.match(block,/#missions\.active \.mission-header-actions \.button\.secondary\{\n  background:#fff!important;border:1px solid #DCCBEE!important;color:#5E3692!important;/);
 assert.match(block,/\.pro-ai-hero \.pro-ai-intelligence\{\n  background:#EFE3FB!important;color:#5E2A93!important;/);
 assert.match(block,/\.pro-ai-criteria-head button\{\n  background:#fff!important;color:#5E3692!important;/);
});
test('Ma veille intelligente : « Modifier » descendu sur la ligne des critères, sans chevaucher le robot',()=>{
 assert.match(css,/grid-template-areas:"title title" "chips edit";/);
 assert.match(css,/#professional \.pro-ai-hero \.pro-ai-criteria-head\{display:contents!important\}/);
 assert.match(css,/grid-area:edit;align-self:end;justify-self:end;margin:0 0 2px!important;\n\}/);
});
test('« Modifier » : moins transparent sur ordinateur, sous le robot sur mobile',()=>{
 assert.match(css,/background:linear-gradient\(115deg,rgba\(134,80,197,\.92\),rgba\(111,63,171,\.92\)\)!important;/);
 assert.match(css,/grid-template-areas:"title title" "chips edit";align-items:end;column-gap:10px;/);
 assert.match(css,/#proAiCriteria\{grid-area:chips;display:flex!important;flex-wrap:wrap;gap:8px!important\}/);
 assert.match(css,/grid-area:edit;justify-self:end;align-self:end;margin:0 0 2px!important;\n  background:linear-gradient\(115deg,rgba\(134,80,197,\.92\)/);
});
