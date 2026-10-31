'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {ready,permitted,emailTemplate}=require('../scripts/send-premium-alerts');
const sql=fs.readFileSync(path.join(__dirname,'../sql/premium_priority_alerts.sql'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../sql/professional_launch.sql'),'utf8');
const frontend=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('La nouvelle mission enfile une notification privée seulement pour Premium vérifié',()=>{
 assert.match(sql,/after insert on public\.offrya_missions/);
 assert.match(sql,/req\.status='verified'/);
 assert.doesNotMatch(migration,/req\.premium_until>now\(\)/);
 assert.match(migration,/s\.status='active' and s\.paid_through>now\(\)/);
 assert.match(sql,/sub\.status='active' and sub\.paid_through>now\(\)/);
 assert.match(sql,/recipient_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/email_eligible/);
 assert.doesNotMatch(sql,/grant insert on public\.offrya_priority_alerts to authenticated/);
});
test('Alerte Premium visible dans le tableau de bord, sondage non intrusif',()=>{
 assert.match(frontend,/offrya_priority_alerts/);
 assert.match(frontend,/renderPriorityAlerts/);
 assert.match(frontend,/60000/);
 assert.match(frontend,/canUsePremium\(\)/);
});
test('Les e-mails prioritaires exigent accord antérieur, filtres et besoin ouvert',()=>{
 const mission={id:'m',owner_id:'owner',status:'open',category:'Nettoyage',department:'31'};
 const t=new Date(Date.now()-3600000).toISOString();
 const pref={missions_enabled:true,missions_consented_at:t,category:'Nettoyage',department:'31'};
 const alert={email_eligible:true,created_at:new Date().toISOString()};
 assert.equal(permitted(pref,mission,alert,'pro'),true);
 assert.equal(permitted({...pref,missions_enabled:false},mission,alert,'pro'),false);
 assert.equal(permitted({...pref,department:'13'},mission,alert,'pro'),false);
 assert.equal(permitted({...pref,category:'Transport'},mission,alert,'pro'),false);
 assert.equal(permitted(pref,mission,{...alert,email_eligible:false},'pro'),false);
 assert.equal(permitted({...pref,missions_consented_at:new Date(Date.now()+3600000).toISOString()},mission,alert,'pro'),false);
 assert.equal(permitted(pref,{...mission,status:'closed'},alert,'pro'),false);
 assert.equal(permitted(pref,mission,alert,'owner'),false);
 assert.equal(ready({}),false);
});
test('E-mail protégé contre HTML arbitraire et lien de désabonnement',()=>{
 const x=emailTemplate({mission:{title:'<script>alert(1)</script>',city:'Toulouse',category:'Nettoyage',department:'31'},siteUrl:'https://offrya-app.onrender.com',token:'abc'});
 assert.ok(!x.html.includes('<script>'));
 assert.match(x.html,/&lt;script&gt;/);
 assert.match(x.html,/api\/unsubscribe/);
});
test('Le digest quotidien exclut les missions prioritaires déjà envoyées',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../scripts/send-alerts.js'),'utf8');
 assert.match(src,/prioritySent/);assert.match(src,/!delivered\.has\(uid\+':'\+m\.id\)/);
});

test('Badge Premium global disponible même en dehors du tableau de bord',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 assert.match(html,/id="priorityAlertShortcut"/);
 assert.match(html,/id="priorityAlertBubble"/);
 assert.match(app,/state\.lastPriorityIds/);
});

test('Les alertes e-mail Premium prennent en charge un compte client devenu entreprise vérifiée',()=>{
 const worker=fs.readFileSync(path.join(__dirname,'../scripts/send-premium-alerts.js'),'utf8');
 assert.match(worker,/p\?\.role!=='pro'/);
});
