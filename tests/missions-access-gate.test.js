'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/espace.html'),'utf8');
const uid='example-owner';
const rows=[
 {id:'own-open',owner_id:uid,status:'open',created_at:'2026-11-01T10:00:00Z',title:'Ma mission',description:'Une mission personnelle',category:'Bâtiment',city:'Toulouse',department:'31'},
 {id:'own-closed',owner_id:uid,status:'closed',created_at:'2026-10-27T10:00:00Z',title:'Ancienne annonce',description:'Une mission personnelle clôturée',category:'Bâtiment',city:'Toulouse',department:'31'},
 {id:'other-open',owner_id:'another-user',status:'open',created_at:'2026-11-01T12:00:00Z',title:'Mission d’un autre',description:'Invisible sans accès Pro',category:'Nettoyage',city:'Muret',department:'31'}
];
const slice=(before,after)=>{const start=app.indexOf(before),end=app.indexOf(after,start+before.length);assert.ok(start>=0&&end>start);return app.slice(start,end)};
const refreshSource=slice('async function refresh(){','function row(m,');
const renderSource=slice('function renderMissions(){','function renderInbox(){');

async function refreshed(role){
 const calls=[];
 const state={
  db:{from(table){
   const filters=[];
   const q={
    select(){return q},
    eq(field,value){filters.push([field,value]);return q},
    order(){return q},
    limit(){
     calls.push({table,filters:[...filters]});
     let data=table==='offrya_missions'?rows.filter(m=>filters.every(([field,value])=>m[field]===value)):
      table==='offrya_profiles'?[]:[];
     return Promise.resolve({data,error:null});
    },
    maybeSingle(){
     let data=null;
     if(table==='offrya_profiles')data={id:uid,role,display_name:'Compte test'};
     if(table==='offrya_premium_requests'&&role==='pro')data={status:'verified'};
     if(table==='offrya_premium_subscriptions'&&role==='pro')data={status:'active'};
     return Promise.resolve({data,error:null});
    }
   };
   return q;
  }},
  session:{user:{id:uid}},loaded:false,missions:[],favorites:[],proStepUserId:null,proStep:1,thread:null
 };
 const ctx={state,render(){},loadPriorityAlerts:async()=>{},loadMessages:async()=>{},
  canUsePremium(){return state.profile?.role==='pro'&&state.premium?.status==='verified'&&state.subscription?.status==='active'}};
 vm.runInNewContext(refreshSource,ctx);
 await ctx.refresh();
 return {state,calls};
}
test('Compte non Premium : la requête ne charge que les annonces du propriétaire',async()=>{
 const {state,calls}=await refreshed('client');
 assert.deepEqual(Array.from(state.missions,m=>m.id).sort(),['own-closed','own-open']);
 const missionQueries=calls.filter(c=>c.table==='offrya_missions');
 assert.equal(missionQueries.length,1);
 assert.deepEqual(Array.from(missionQueries[0].filters,x=>Array.from(x)),[['owner_id',uid]]);
});
test('Compte Premium : second chargement limité aux annonces ouvertes, avec annonces personnelles conservées',async()=>{
 const {state,calls}=await refreshed('pro');
 assert.deepEqual(Array.from(state.missions,m=>m.id).sort(),['other-open','own-closed','own-open']);
 const missionQueries=calls.filter(c=>c.table==='offrya_missions');
 assert.equal(missionQueries.length,2);
 assert.deepEqual(Array.from(missionQueries[1].filters,x=>Array.from(x)),[['status','open']]);
});
test('Recherche générale masquée avant certification, sans masquer les annonces personnelles',()=>{
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{
   value:'',textContent:'',innerHTML:'',hidden:false,
   classList:{states:new Map(),toggle(name,enabled){this.states.set(name,enabled)}}
  });
  return elements.get(id);
 };
 const state={session:{user:{id:uid,email_confirmed_at:'2026-11-01T10:00:00Z'}},missions:rows,favorites:[]};
 const ctx={state,$,canUsePremium:()=>false,isGuest:()=>false,
   row:m=>'<article>'+m.id+'</article>',esc:String};
 vm.runInNewContext(renderSource,ctx);
 ctx.renderMissions();
 assert.equal($('missionSearchFilters').classList.states.get('hidden'),true);
 assert.equal($('missionsListHeading').textContent,'Mes annonces publiées');
 assert.match($('missionList').innerHTML,/own-open/);
 assert.doesNotMatch($('missionList').innerHTML,/own-closed/);
 assert.doesNotMatch($('missionList').innerHTML,/other-open/);
 assert.doesNotMatch($('dashMissions').innerHTML,/other-open/);
 assert.doesNotMatch($('dashMissions').innerHTML,/own-closed/);
 assert.equal($('missionForm').classList.states.get('hidden'),false);
});
test('Le HTML ne montre pas la recherche avant activation par le code',()=>{
 assert.match(html,/class="panel filters hidden" id="missionSearchFilters"/);
 assert.doesNotMatch(html,/id="missionAccessNotice"/);
 assert.match(html,/id="missionsListHeading"/);
});
