'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pro=fs.readFileSync('public/pro-experience.js','utf8'),css=fs.readFileSync('public/brand-kit.css','utf8');
test('Ma veille : alertes structurées (source, état, pertinence, titre, date limite, boutons)',()=>{
 assert.match(pro,/<div class="watch-top"><span class="watch-source">/);
 assert.match(pro,/<span class="watch-score" title="Correspondance avec vos critères">Pertinence /);
 assert.match(pro,/<strong class="watch-title">/);
 assert.match(pro,/<small class="watch-deadline'\+\(soon\?' is-soon':''\)\+'">Date limite : /);
 assert.match(pro,/<a class="watch-official" href="'\+href\+'" target="_blank" rel="noopener noreferrer">Consulter la publication officielle ↗<\/a>/);
});
test('Marchés publics : en-tête avec marges, textes plus grands et plus contrastés, champs mobiles normaux',()=>{
 assert.match(css,/\.pro-v3-page-intro\{\n padding:20px 24px!important;/);
 assert.match(css,/\.pro-v3-market-lead\{font-size:15px!important;line-height:1\.55!important;color:#4E4260!important;/);
 assert.match(css,/\.pro-v3-watch-item \.watch-title\{display:block;font:750 16\.5px\/1\.4/);
 assert.match(css,/#premiumContent \.panel\.filters :is\(input,select,\.field\)\{flex:0 0 auto!important;height:48px!important;/);
});
