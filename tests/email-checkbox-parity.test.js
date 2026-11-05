'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/role-reference.css','utf8');
const form=html.slice(html.indexOf('<form id="preferencesForm"'),html.indexOf('</form>',html.indexOf('<form id="preferencesForm"')));
const selector='body.offrya-reference-ui #settings #preferencesForm label.check-row > input[type="checkbox"]';

test('Mission and message alerts share exactly the same real checkbox component',()=>{
 assert.match(form,/<label class="check-row"><input type="checkbox" name="missions_enabled">/);
 assert.match(form,/<label class="check-row"><input type="checkbox" name="messages_enabled">/);
 assert.equal((form.match(/<label class="check-row"><input type="checkbox"/g)||[]).length,2);
 assert.doesNotMatch(form,/<input[^>]+type="hidden"[^>]*name="(?:missions_enabled|messages_enabled)"/);
});
test('Common Android control has one box size in both states, independent of native appearance',()=>{
 const i=css.indexOf(selector+'{');
 assert.ok(i>0,'shared checkbox selector present');
 const cssBlock=css.slice(i,css.indexOf('}',i)+1);
 for(const v of ['-webkit-appearance:none','appearance:none','box-sizing:border-box',
   'flex:0 0 22px','width:22px','height:22px','min-width:22px','max-width:22px',
   'min-height:22px','max-height:22px','border-radius:5px','margin:2px 0 0'])
  assert.ok(cssBlock.includes(v),'checkbox rule missing '+v);
 assert.ok(css.includes(selector+':checked{'),'checked state uses same control');
 assert.match(css,/input\[type="checkbox"\]:checked::after\s*\{/,'visible checkmark');
 assert.ok(css.includes(selector+':focus-visible{'),'keyboard focus remains visible');
 assert.doesNotMatch(cssBlock,/display:none|visibility:hidden/);
});
test('Styles are limited to e-mail preferences; other consent forms remain unaffected',()=>{
 assert.match(css,/#settings #preferencesForm label\.check-row/);
 assert.doesNotMatch(form,/Secteur surveillé|Département|name="category"|name="department"/);
});
