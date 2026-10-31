'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createServer}=require('node:http'),{handle}=require('../server');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/index.html'),js=read('public/app.js'),css=read('public/pro.css'),sql=read('sql/professional_onboarding_drafts.sql'),server=read('server.js');
test('Navigation : Espace pro et Marchés publics sont deux onglets différents',()=>{
 const nav=html.split('<nav id="nav"')[1].split('</nav>')[0];
 assert.match(nav,/data-tab="professional"/);
 assert.match(nav,/data-tab="boamp"/);
 assert.notEqual(nav.indexOf('data-tab="professional"'),nav.indexOf('data-tab="boamp"'));
 const pro=html.split('<section class="tab" id="professional">')[1].split('<section class="tab" id="boamp">')[0];
 const market=html.split('<section class="tab" id="boamp">')[1].split('<section class="tab" id="inbox">')[0];
 assert.ok(pro.includes('id="proLanding"')&&pro.includes('id="premiumRequestForm"'));
 assert.ok(!pro.includes('id="boampList"'));
 assert.ok(market.includes('id="boampGate"')&&market.includes('id="boampList"'));
 assert.ok(!market.includes('id="premiumRequestForm"'));
 assert.match(js,/professional:'Espace professionnel'/);
 assert.match(js,/tab\('professional'\)/);
});
test('Quatre étapes sans TOTP et sans paiement prématuré',()=>{
 for(const id of ['proStageCompany','proStageRepresentative','proStageReview','proStageBilling','identityPanel','premiumPlan','premiumSubscribe','proSubmitPanel']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/name="representative_kind"/);
 assert.match(html,/value="dirigeant"/);
 assert.doesNotMatch(html,/value="mandataire"/);
 assert.match(js,/identity_status==='verified'/);
 assert.match(js,/authority_status==='verified'/);
 assert.doesNotMatch(html,/mfa|totp|double authentification|id="mfaQr"/i);
 assert.doesNotMatch(js,/mfa|aal2|totp/i);
 assert.match(js,/state\.premium\?\.status==='verified'\?4/);
 assert.match(js,/state\.billingEnabled/);
});
test('Brouillons isolés et RLS empêchent de s’attribuer un accès',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/user_id=\(select auth.uid\(\)\)/);
 assert.doesNotMatch(sql,/premium_requests[^\n]*update\s+status/);
 assert.match(js,/saveProfessionalDraft/);
 assert.match(js,/offrya_professional_drafts/);
 assert.match(js,/onConflict:'user_id'/);
 assert.match(js,/from\('offrya_professional_drafts'\)\.delete/);
});
test('L’interface mobile dispose de cinq entrées et le nouveau style est servi',async()=>{
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(html,/href="\/pro.css"/);
 assert.match(server,/\['\/pro.css','text\/css; charset=utf-8'\]/);
 const app=createServer(handle);await new Promise(done=>app.listen(0,'127.0.0.1',done));
 try{
  const url='http://127.0.0.1:'+app.address().port;
  const [style,doc]=await Promise.all([fetch(url+'/pro.css'),fetch(url+'/')]);
  assert.equal(style.status,200);assert.match(style.headers.get('content-type'),/text\/css/);
  assert.equal(doc.status,200);assert.match(await doc.text(),/id="professional"/);
 }finally{await new Promise(done=>app.close(done));}
});
