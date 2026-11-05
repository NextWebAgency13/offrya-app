'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const consoleSource=fs.readFileSync('public/opportunity-console.js','utf8');
const start=pro.indexOf(' const proScreens=[');
const end=pro.indexOf(' function show(next,fromHistory=false){',start);
assert.ok(start>=0&&end>start,'shared contextual history helper must exist');
const helper=pro.slice(start,end);
function createNavigator(starting=['/espace/missions','/espace/professionnel']){
 const visited=starting.map(url=>({url,state:null})),actions=[];
 let position=visited.length-1;
 const win={location:new URL(visited[position].url,'https://offrya.fr')};
 const update=url=>{win.location=new URL(url,'https://offrya.fr');};
 const history={
  get state(){return visited[position].state;},
  pushState(state,title,url){
   actions.push(['push',url]);visited.splice(++position);visited.push({url,state});update(url);
  },
  replaceState(state,title,url){
   actions.push(['replace',url]);visited[position]={url,state};update(url);
  },
  back(){if(position>0)update(visited[--position].url);},
  forward(){if(position<visited.length-1)update(visited[++position].url);}
 };
 const ctx=vm.createContext({window:win,history,URLSearchParams,canUsePremium:()=>true,view:'home',show:()=>{}});
 vm.runInNewContext(helper+'\nthis.sync=syncProViewHistory;this.route=screenFromRoute;this.back=backFromProScreen;',ctx);
 return {ctx,win,history,visited,actions};
}
test('Each Premium child is reachable from its actual parent via Android Back',()=>{
 const {ctx,win,history,visited}=createNavigator();
 ctx.sync('watch',false);
 ctx.sync('preferences',false);
 assert.equal(win.location.search,'?view=preferences');
 assert.equal(visited.length,4);
 history.back();
 assert.equal(ctx.route(),'watch','Back should restore originating watch view, not Missions');
 history.back();
 assert.equal(ctx.route(),'home');
 history.forward();
 assert.equal(ctx.route(),'watch','Forward restores the next Premium child');
});
test('Requests -> Proposal -> Back returns to Requests, not a fixed Premium root',()=>{
 const {ctx,win,history,visited}=createNavigator();
 ctx.sync('requests',false);ctx.sync('assistant',false);
 assert.equal(history.state.fromProScreen,'requests');
 assert.equal(visited.length,4);
 ctx.view='assistant';ctx.back();
 assert.equal(win.location.search,'?view=requests');
});
test('Repeated clicks and popstate do not create duplicate history entries',()=>{
 const {ctx,visited,actions}=createNavigator();
 ctx.sync('preferences',false);
 ctx.sync('preferences',false);ctx.sync('preferences',true);
 assert.equal(visited.length,3);
 assert.deepEqual(actions.map(([action])=>action),['push']);
});
test('After a successful preferences save, Back does not reopen the closed editor',()=>{
 const {ctx,win,history,actions}=createNavigator();
 ctx.sync('preferences',false);ctx.sync('home',false);
 assert.equal(win.location.pathname,'/espace/professionnel');
 assert.equal(win.location.search,'');
 assert.deepEqual(actions.map(([method])=>method),['push','replace']);
 history.back();
 assert.equal(win.location.pathname,'/espace/professionnel');
 assert.equal(win.location.search,'');
 assert.match(consoleSource,/tab\('boamp'\);/);
});
test('Unknown route values never reveal a private screen or bypass Premium checks',()=>{
 const {ctx,win}=createNavigator();
 win.location=new URL('/espace/professionnel?view=external-site','https://offrya.fr');
 assert.equal(ctx.route(),'home');
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
 assert.match(pro,/if\(route==='\/espace\/professionnel'\)show\(screenFromRoute\(\),true\)/);
 assert.match(pro,/view=screenFromRoute\(\)/);
 assert.match(app,/window\.addEventListener\('popstate',\(\)=>restoreContextualRoute/);
 assert.match(app,/professional:'\/espace\/professionnel'/);
});
test('Every child panel exposes accessible contextual return control',()=>{
 const count=(pro.match(/data-pro-back aria-label="Retour à l’écran précédent"/g)||[]).length;
 assert.equal(count,4,'Commercial, public markets, watch, preferences must all have a Back button');
 assert.match(pro,/closest\('\[data-pro-back\]'\)/);
 const status=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(status.status,0,status.stderr);
});
