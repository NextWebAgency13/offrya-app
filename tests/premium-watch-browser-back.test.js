'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const consoleSource=fs.readFileSync('public/opportunity-console.js','utf8');
const start=pro.indexOf(' function syncPreferencesHistory(next,fromHistory){');
const end=pro.indexOf(' function show(next,fromHistory=false){',start);
assert.ok(start>=0&&end>start,'history helper must exist');
const helper=pro.slice(start,end);

function createNavigator(starting=['/espace/missions','/espace/professionnel']){
 const visited=[...starting],actions=[];
 let position=visited.length-1;
 const win={location:new URL(visited[position],'https://offrya.fr')};
 const setUrl=url=>{win.location=new URL(url,'https://offrya.fr');};
 const history={
  pushState(state,title,url){actions.push(['push',url]);visited.splice(++position);visited.push(url);setUrl(url);},
  replaceState(state,title,url){actions.push(['replace',url]);visited[position]=url;setUrl(url);},
  back(){if(position>0)setUrl(visited[--position]);},
  forward(){if(position<visited.length-1)setUrl(visited[++position]);}
 };
 const ctx=vm.createContext({window:win,history,URLSearchParams});
 vm.runInContext(helper+'\nthis.sync=syncPreferencesHistory;',ctx);
 return {ctx,win,history,visited,actions};
}
test('Opening preferences creates a distinct browser history entry after Espace Premium',()=>{
 const {ctx,win,history,visited}=createNavigator();
 ctx.sync('preferences',false);
 assert.equal(win.location.pathname,'/espace/professionnel');
 assert.equal(win.location.search,'?view=preferences');
 assert.deepEqual(visited,['/espace/missions','/espace/professionnel','/espace/professionnel?view=preferences']);
 history.back();
 assert.equal(win.location.pathname,'/espace/professionnel','Android Back must return to Premium, not Missions');
 assert.equal(win.location.search,'');
 history.forward();
 assert.equal(win.location.search,'?view=preferences','Forward must restore the preference screen');
});
test('Repeat preference clicks and popstate do not create duplicate history entries',()=>{
 const {ctx,visited,actions}=createNavigator();
 ctx.sync('preferences',false);
 ctx.sync('preferences',false);
 ctx.sync('preferences',true);
 assert.equal(visited.length,3);
 assert.deepEqual(actions.map(([action])=>action),['push']);
});
test('Successful save or explicit home navigation closes editor without reopening it on Back',()=>{
 const {ctx,win,history,actions}=createNavigator();
 ctx.sync('preferences',false);
 ctx.sync('home',false);
 assert.equal(win.location.pathname,'/espace/professionnel');
 assert.equal(win.location.search,'');
 assert.deepEqual(actions.map(([method])=>method),['push','replace']);
 history.back();
 assert.equal(win.location.pathname,'/espace/professionnel');
 assert.equal(win.location.search,'');
 assert.match(consoleSource,/tab\('boamp'\);/,'Saved criteria should still navigate via the guarded Premium route');
});
test('Popstate, reload and access restrictions retain the proper Premium view',()=>{
 assert.match(pro,/tab\('professional',fromHistory\);\s*syncPreferencesHistory\(next,fromHistory\)/);
 assert.match(pro,/route==='\/espace\/professionnel'\)show\(new URLSearchParams\(window\.location\.search\)\.get\('view'\)==='preferences'\?'preferences':'home',true\)/);
 assert.match(pro,/view=window\.location\.pathname==='\/espace\/professionnel'&&new URLSearchParams\(window\.location\.search\)\.get\('view'\)==='preferences'\?'preferences':'home'/);
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
 assert.match(app,/window\.addEventListener\('popstate',\(\)=>tab\(pathsReverse\[location\.pathname\]\|\|'dashboard',true\)\)/);
 assert.match(app,/professional:'\/espace\/professionnel'/);
});
test('No syntax errors introduced into the professional navigation',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
