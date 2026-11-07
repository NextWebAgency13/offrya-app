'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/espace.html','utf8'),css=fs.readFileSync('public/brand-kit.css','utf8');
const slice=(from,to)=>{const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>0&&b>a,from);return app.slice(a,b);};
const me='u-me',pro='u-pro';
function harness(){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,innerHTML:'',textContent:'',value:'',dataset:{},classList:{toggle(){},contains:()=>false},button:{disabled:false},elements:{body:{dataset:{},placeholder:'Écrivez votre message…',disabled:false}},querySelector(){return this.button;}});return nodes.get(id);};
 const now=Date.now(),iso=ms=>new Date(now-ms).toISOString();
 const state={session:{user:{id:me}},thread:null,messages:[],missions:[{id:'m1',owner_id:me}],
  conversations:[
   {id:'c-old',mission_id:'m1',client_id:me,professional_id:pro,created_at:iso(9*864e5)},
   {id:'c-new',mission_id:'m2',client_id:me,professional_id:pro,created_at:iso(5*864e5)}],
  messageHeaders:[{id:'x1',conversation_id:'c-old',sender_id:pro,created_at:iso(60e3)},{id:'x2',conversation_id:'c-new',sender_id:me,created_at:iso(3*864e5)}],
  hiddenConversations:new Set()};
 const ctx={state,$:node,esc:s=>String(s??'').replace(/</g,'&lt;'),date:s=>s,Date,Math,String,Number,Boolean,Map,Set,Array,
  profileName:()=>'Guy Borne',titleForMission:id=>'Mission '+id,messageUnread:()=>({total:1,byThread:new Map([['c-old',1]])}),
  isConversationHidden:id=>state.hiddenConversations.has(id),renderMessages(){},canUsePremium:()=>false};
 vm.runInNewContext(slice('function conversationClosed','\n')+'\n'+slice('const TRASH_ICON','function renderMessages(){')+'\nthis.api={renderInbox,shortWhen,lastActivity};',ctx);
 return {state,node,api:ctx.api};
}
test('Liste : triée par dernière activité, heure du dernier message, nouveaux messages signalés',()=>{
 const h=harness();h.api.renderInbox();
 const list=h.node('conversationList').innerHTML;
 assert.ok(list.indexOf('data-thread="c-old"')<list.indexOf('data-thread="c-new"'),'la discussion active en premier');
 assert.match(list,/1 nouveau message/);
 assert.match(list,/Vous avez répondu/);
 assert.equal(h.node('inboxCount').textContent,'2');
 assert.equal(h.node('inboxSearch').hidden,true,'recherche masquée sous 5 discussions');
 assert.match(h.node('threadContext').textContent,/1 discussion avec des messages non lus/);
});
test('Fil ouvert : interlocuteur, « Voir la mission » si la mission est accessible',()=>{
 const h=harness();h.state.thread='c-old';h.api.renderInbox();
 assert.equal(h.node('threadContext').textContent,'Professionnel : Guy Borne');
 assert.equal(h.node('threadMission').hidden,false);assert.equal(h.node('threadMission').dataset.mission,'m1');
 h.state.thread='c-new';h.api.renderInbox();
 assert.equal(h.node('threadMission').hidden,true);
});
test('Saisie : zone de texte multiligne, Entrée envoie (ordinateur), Maj+Entrée va à la ligne',()=>{
 assert.match(html,/<form id="messageForm" class="send-form"><textarea class="field" name="body" rows="1" maxlength="2500"/);
 assert.match(app,/if\(event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing&&!touch\)/);
 assert.match(app,/\$\('messageForm'\)\.requestSubmit\(\);/);
 assert.match(app,/f\.reset\(\);sizeMessageField\(\);/);
 assert.match(app,/<p class="bubble-text">\$\{esc\(m\.body\)\}<\/p>/);
 assert.match(css,/\.bubble \.bubble-text\{margin:0;white-space:pre-wrap;/);
 assert.match(app,/class="message-day" role="separator"/);
});
test('Mise en page : écran plein sur ordinateur, fil plein écran sur mobile, saisie masquée sans discussion',()=>{
 assert.match(css,/html body #inbox > \.section-top\{display:none!important\}/);
 assert.match(css,/height:calc\(100vh - 150px\);min-height:520px;/);
 assert.match(css,/html body #inbox:not\(\.has-active-thread\) #messageForm,/);
 assert.match(css,/html body #inbox\.has-active-thread > \.section-top\{display:none!important\}/);
 assert.doesNotMatch(html,/<span class="tag">Échange direct<\/span>/);
 assert.match(html,/class="inbox-privacy"/);
});
