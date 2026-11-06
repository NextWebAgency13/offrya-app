'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const pub=path.join(__dirname,'../public');
const css=fs.readFileSync(path.join(pub,'premium-dashboard-visual.css'),'utf8');
const markup=fs.readFileSync(path.join(pub,'espace.html'),'utf8');
const themeStart=css.indexOf('/* OFFRYA — Premium Android secondary tabs');
const scopedTheme=css.slice(themeStart).replace(/\/\*[\s\S]*?\*\//g,'');

test('Le style Android validé couvre Missions, Messages et Mon compte pour Premium uniquement',()=>{
 assert.ok(themeStart>0,'Le style de l’accueil Premium doit précéder les nouveaux styles');
 assert.match(markup,/href="\/premium-dashboard-visual\.css\?v=20261106"/);
 for(const tab of ['missions','inbox','settings'])assert.ok(scopedTheme.includes('#'+tab+'.active'),tab);
 assert.match(scopedTheme,/\[data-offrya-role="premium"\]:has\(#missions\.active,#inbox\.active,#settings\.active\)/);
 assert.match(scopedTheme,/@media\s*\(max-width:780px\)/);
});

test('Espace Premium et les données métier restent en dehors des règles visuelles secondaires',()=>{
 assert.doesNotMatch(scopedTheme,/#boamp\b/);
 assert.doesNotMatch(scopedTheme,/#dashboard\.active/);
 assert.doesNotMatch(scopedTheme,/\b(?:innerHTML|localStorage|fetch\s*\()/);
 assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
});