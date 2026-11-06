'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const me='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const c1='33333333-3333-4333-8333-333333333333';
const c2='44444444-4444-4444-8444-444444444444';
function load(conversations,hidden=[]){
 const state={session:{user:{id:me}},conversations,hiddenConversations:new Set(hidden)};
 const a=app.indexOf('function isConversationHidden'),b=app.indexOf('function messageUnread(){',a);
 assert.ok(a>0&&b>a);
 const ctx={state,Set,Boolean,Number,Array};
 vm.runInNewContext(app.slice(a,b)+'\nthis.api={visibleConversationCount,exchangesLabel};',ctx);
 return ctx.api;
}
const conv=id=>({id,mission_id:'m'+id,client_id:me,professional_id:other});

test('« Mes échanges » annonce les discussions en cours, même sans message non lu',()=>{
 const api=load([conv(c1)]);
 // Cas signalé : une discussion en cours, tout est lu → l’accueil affichait « 0 message ».
 assert.equal(api.exchangesLabel(api.visibleConversationCount(),0),'1 échange');
});

test('Le libellé gère zéro, pluriel et messages non lus',()=>{
 const api=load([]);
 assert.equal(api.exchangesLabel(0,0),'Aucun échange');
 assert.equal(api.exchangesLabel(2,0),'2 échanges');
 assert.equal(api.exchangesLabel(1,1),'1 échange · 1 non lu');
 assert.equal(api.exchangesLabel(3,2),'3 échanges · 2 non lus');
 assert.equal(api.exchangesLabel(undefined,undefined),'Aucun échange');
});

test('Un échange retiré par l’utilisateur n’est pas compté',()=>{
 assert.equal(load([conv(c1),conv(c2)],[c2]).visibleConversationCount(),1);
 assert.equal(load([conv(c1)],[c1]).visibleConversationCount(),0);
 assert.equal(load(undefined).visibleConversationCount(),0);
});

test('L’accueil et le compteur de discussions utilisent ce décompte',()=>{
 assert.match(app,/clientHomeUnreadLabel'\)\.textContent=exchangesLabel\(visibleConversationCount\(\),total\)/);
 assert.match(app,/\$\('statConvos'\)\.textContent=visibleConversationCount\(\)/);
 assert.doesNotMatch(app,/clientHomeUnreadLabel'\)\.textContent=total\+' message/);
 assert.ok(!/id="clientHomeUnreadLabel">0 message</.test(html),'Pas de « 0 message » par défaut avant chargement');
});
