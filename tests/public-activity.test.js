'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const src=read('public/activity.js');
const home=read('public/index.html');
const server=read('server.js');
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.className='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
}
function texts(node){
 return [node.textContent,...node.children.flatMap(texts)].filter(Boolean);
}
async function render(rows,fail=false){
 const root=new Node('div'),requests=[];
 const document={
  getElementById:id=>id==='publicActivity'?root:null,
  createElement:tag=>new Node(tag)
 };
 const fetch=async (url,opts)=>{
  requests.push({url,opts});
  if(url==='/api/config')return {ok:true,json:async()=>({supabaseUrl:'https://example.supabase.co',supabaseKey:'sb_publishable_testing_key'})};
  if(fail)return {ok:false,status:503};
  return {ok:true,json:async()=>rows};
 };
 const scope={document,fetch,URL,Number,Set,Map,console:{warn(){}}};
 vm.runInNewContext(src.replace('(async()=>{','globalThis.__activityPromise=(async()=>{'),scope);
 await scope.__activityPromise;
 return {root,requests,all:texts(root).join(' ')};
}
test('La RPC anonyme reste sécurisée, sans bandeau de statistiques sur l’accueil',()=>{
 assert.doesNotMatch(home,/id="activite"|id="publicActivity"|src="\/activity\.js" defer/);
 assert.match(server,/activity\.js/);
 assert.doesNotMatch(src,/offrya_missions'\)|getPublicUrl|select\('\*'\)|mission\.description|mission\.owner_id/);
 assert.doesNotMatch(home,/id="missionList"|id="dashMissions"/);
});
test('La source publique est strictement une RPC de statistiques anonymes',async()=>{
 const {root,requests,all}=await render([
  {category:'Bâtiment',department:'13',count:2,title:'SECRET',owner_id:'private'},
  {category:'Nettoyage',department:'31',count:'1',description:'SECRET'}
 ]);
 assert.equal(requests.length,2);
 assert.equal(requests[0].url,'/api/config');
 assert.equal(requests[1].url,'https://example.supabase.co/rest/v1/rpc/offrya_public_mission_counts');
 assert.equal(requests[1].opts.method,'POST');
 assert.match(all,/3/);
 assert.match(all,/Bâtiment/);
 assert.match(all,/Nettoyage/);
 assert.match(all,/13/);
 assert.match(all,/31/);
 assert.doesNotMatch(all,/SECRET|owner_id|description|private/);
 assert.ok(root.children.length>1);
});
test('Aucune mission : afficher zéro sans inventer de demande',async()=>{
 const {all}=await render([]);
 assert.match(all,/0/);
 assert.match(all,/Aucune mission ouverte/);
});
test('Statistiques indisponibles : garder un accueil lisible et permettre les inscriptions',async()=>{
 const {all}=await render([],true);
 assert.match(all,/momentanément indisponibles/);
 assert.match(all,/inscriptions restent accessibles/);
});
test('Réponse inattendue : refuser les données risquées au lieu de les afficher',async()=>{
 const {all}=await render([{category:'Divers',department:'13',count:1}]);
 assert.match(all,/momentanément indisponibles/);
 assert.doesNotMatch(all,/Divers/);
});
