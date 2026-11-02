'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../public/public.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');

// Photographies sélectionnées d'après leur contenu réel, et non la simple
// disponibilité d'une image libre. Garder un lien sujet -> nom de catégorie.
const sectors=[
 {cls:'building',name:'Bâtiment',id:'4509089'},
 {cls:'green',name:'Espaces verts',id:'38936350'},
 {cls:'clean',name:'Nettoyage',id:'4440537'},
 {cls:'restaurant',name:'Restauration',id:'3951656'},
 {cls:'beauty',name:'Bien-être',id:'3985332'},
 {cls:'taxi',name:'Transport',id:'5835272'}
];
test('Chaque secteur affiche une photo du métier correspondant, sans réutilisation trompeuse',()=>{
 const ids=new Set();
 for(const item of sectors){
  const section=html.match(new RegExp('<a class="mock-sector"[^>]*><span class="mock-sector-picture mock-sector-'+item.cls+'"[^>]*><\\/span><strong>([\\s\\S]*?)<\\/strong>'));
  assert.ok(section,'Tuile '+item.cls);
  assert.ok(section[1].includes(item.name),'Libellé '+item.name);
  const selector='.mock-home .mock-sector-'+item.cls+'{background-image:url("';
  const pos=css.indexOf(selector);
  assert.ok(pos>=0,'CSS de secteur '+item.cls);
  const photoUrl=css.slice(pos+selector.length).split('"')[0];
  const local='/images/pexels-'+item.id+'-800.jpg';
  const remote='https://images.pexels.com/photos/'+item.id+'/pexels-photo-'+item.id+'.jpeg?auto=compress&cs=tinysrgb&w=800';
  assert.ok(photoUrl===remote||photoUrl===local,'Photo de la bonne profession : '+item.cls);
  if(photoUrl===local){
   const file=path.join(__dirname,'../public',local);
   const bytes=fs.readFileSync(file);
   assert.ok(bytes.length>1000&&bytes[0]===255&&bytes[1]===216,'JPEG local valide '+item.cls);
  }
  assert.ok(!ids.has(item.id),'Chaque secteur a sa propre photo');
  ids.add(item.id);
 }
});
test('Maquette et parcours conservés sans modifier les missions',()=>{
 assert.equal(sectors.length,6);
 assert.match(html,/Votre projet mérite<br>le bon <span>professionnel/);
 assert.match(html,/id="choisir-compte"/);
 assert.match(html,/href="\/deposer-une-mission"/);
 assert.match(html,/href="\/professionnels"/);
 assert.doesNotMatch(html,/id="publicActivity"|mock-activity/);
 assert.match(css,/@media\(max-width:560px\)/);
});
