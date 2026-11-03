'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const privateCss=fs.readFileSync('public/styles.css','utf8');
const publicCss=fs.readFileSync('public/public.css','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');

test('private workspace remains viewport responsive with five mobile destinations',()=>{
 assert.match(html,/name="viewport"/);
 assert.match(privateCss,/unified mobile-first refinement/);
 assert.match(privateCss,/repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(privateCss,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(privateCss,/client-dashboard-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('public pages adapt typography, forms and cards to touch screens',()=>{
 assert.match(publicCss,/common mobile-first refinements/);
 assert.match(publicCss,/\.form :is\(input,select,textarea\)\{font-size:16px\}/);
 assert.match(publicCss,/grid-template-columns:minmax\(0,1fr\)/);
});
test('mobile layout does not alter access control or marketplace routing',()=>{
 assert.match(app,/const paths=\{dashboard:'\/espace'/);
 assert.match(app,/function canUsePremium\(/);
 assert.doesNotMatch(privateCss,/STRIPE_SECRET_KEY|SUPABASE_SECRET_KEY/);
 assert.doesNotMatch(publicCss,/STRIPE_SECRET_KEY|SUPABASE_SECRET_KEY/);
});
