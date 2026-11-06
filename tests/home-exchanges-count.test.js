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
 vm.runInNewContext(app.slice(a,b)+'\nthis.api={visibleConversationCount,exchangesLabel,proEntry};',ctx);
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

const slice=(from,to)=>{const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>0&&b>a,from);return app.slice(a,b);};
const request=status=>({status});

test('La carte « Espace pro » choisit son libellé et sa destination selon l’état du compte',()=>{
 const {proEntry}=load([]);
 const cases=[
  [{session:false},'login','Se connecter'],
  [{session:true,guest:true},'login','Se connecter'],
  [{session:true,eligible:true},'workspace','Mon espace pro'],
  [{session:true},'start','Devenir pro'],
  [{session:true,hasProProfile:true},'resume','Finir mon dossier'],
  [{session:true,draft:{step:2}},'resume','Finir mon dossier'],
  [{session:true,hasProProfile:true,request:request('pending')},'review','En vérification'],
  [{session:true,hasProProfile:true,request:request('verified')},'billing','Activer l’accès'],
  [{session:true,hasProProfile:true,request:request('rejected')},'fix','Dossier à corriger']
 ];
 for(const [input,key,label] of cases){
  const entry=proEntry(input);
  assert.equal(entry.key,key,JSON.stringify(input));
  assert.equal(entry.label,label,JSON.stringify(input));
  assert.ok(entry.label.length<=21,'Libellé court : tient sur une ligne dans la carte');
 }
 assert.equal(proEntry().key,'login','Sans session, jamais d’accès sans connexion');
});

function click({session=true,guest=false,eligible=false,profile=null,premium=null,draft=null}={}){
 const calls=[];
 const state={session:session?{user:{id:me,is_anonymous:guest}}:null,profile,premium,draft};
 const a=app.indexOf('function proEntry('),b=app.indexOf('function messageUnread(){',a);
 const ctx={state,Set,Boolean,Number,Array,
  isGuest:()=>Boolean(state.session?.user?.is_anonymous),canUsePremium:()=>eligible,
  tab:(...args)=>calls.push(['tab',...args]),
  proExperience:{show:(...args)=>calls.push(['pro',...args])},
  location:{assign:url=>calls.push(['assign',url])}};
 vm.runInNewContext(app.slice(a,b)+'\n'+slice('function currentProEntry','for(const n of document.querySelectorAll(\'[data-pro-entry]\')')+'\nthis.openProEntry=openProEntry;this.currentProEntry=currentProEntry;',ctx);
 return {calls,open:ctx.openProEntry,current:ctx.currentProEntry};
}

test('Le clic envoie chaque compte au bon endroit',()=>{
 const client=click({profile:{role:'client'}});
 client.open();
 assert.equal(JSON.stringify(client.calls),JSON.stringify([['tab','professional']]),'Demandeur : page de démarrage de l’Espace pro');
 const noProfile=click({profile:null});
 noProfile.open();
 assert.equal(JSON.stringify(noProfile.calls),JSON.stringify([['tab','professional']]));
 const resume=click({profile:{role:'pro'},draft:{step:2}});
 resume.open();
 assert.equal(JSON.stringify(resume.calls),JSON.stringify([['tab','professional']]),'Inscription en cours : reprise dans l’Espace pro');
 const review=click({profile:{role:'pro'},premium:{status:'pending'}});
 review.open();
 assert.equal(JSON.stringify(review.calls),JSON.stringify([['tab','professional']]),'Dossier en vérification : suivi dans l’Espace pro');
 const billing=click({profile:{role:'pro'},premium:{status:'verified'}});
 billing.open();
 assert.equal(JSON.stringify(billing.calls),JSON.stringify([['tab','professional']]),'Dossier approuvé : étape abonnement');
 const active=click({profile:{role:'pro'},premium:{status:'verified'},eligible:true});
 active.open();
 assert.equal(JSON.stringify(active.calls),JSON.stringify([['pro','home']]),'Compte actif : espace pro direct');
 const guest=click({guest:true});
 guest.open();
 assert.equal(JSON.stringify(guest.calls),JSON.stringify([['assign','/connexion?next=%2Fespace%2Fprofessionnel']]),'Invité : connexion d’abord');
 const out=click({session:false});
 out.open();
 assert.equal(JSON.stringify(out.calls),JSON.stringify([['assign','/connexion?next=%2Fespace%2Fprofessionnel']]));
});

test('La carte ne change jamais le rôle du compte et remplace bien Notifications',()=>{
 assert.ok(!/clientHomeNotificationText/.test(app+html),'Plus de référence à l’ancienne carte Notifications');
 assert.match(html,/<button type="button" data-pro-entry class="role-ref-action-card">/);
 assert.doesNotMatch(html,/data-pro-entry[^>]*data-tab|data-tab="professional" class="role-ref-action-card"/);
 assert.match(app,/\$\('clientHomeProLabel'\)\.textContent=currentProEntry\(\)\.label/);
 assert.match(app,/querySelectorAll\('\[data-pro-entry\]'\)\)n\.addEventListener\('click',openProEntry\)/);
 const handler=slice('function openProEntry','for(const n of document.querySelectorAll(\'[data-pro-entry]\')');
 assert.doesNotMatch(handler,/offrya_profiles|\.update\(|\.insert\(|\.upsert\(/,'Aucune écriture : le rôle ne change qu’au clic sur « Commencer les vérifications »');
});
