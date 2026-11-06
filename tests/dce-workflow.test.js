'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {analyzeDce}=require('../lib/dce-evidence');
const {prepareDce}=require('../lib/dce-preparation');
const {queryUrl,awardRecord,queryAwards}=require('../lib/decp');
const {importDceZip,validateZipPath}=require('../lib/dce-import');
const zip='UEsDBBQAAAAIABMPZl3cgUGUhAAAAJMAAAAGAAAAUkMudHh0FY3LDcIwEETvqWIu3FAULBQkrsmRJhyyESv5A+t1xJE26ADqSCdUgn16TzMjzWiV4NhzwUwQ8pyqJcRlkYIzzAkhruQnIZjO9M0grNunlvPv9baqwlNWjqGM78JPHDvs9litoyxQut4CPzKhL3HbXAjjcAApXDWDFIOWR2/DvH1T2/wBUEsDBBQAAAAIABMPZl0DbeQRLwAAADAAAAAHAAAAQlBVLnR4dHPKL0pJLUpNLFVISS1WKCjKrFAozcssScwsAnKtFMryM4sUcoDMxLy81IrUYj0AUEsBAhQDFAAAAAgAEw9mXdyBQZSEAAAAkwAAAAYAAAAAAAAAAAAAAIABAAAAAFJDLnR4dFBLAQIUAxQAAAAIABMPZl0DbeQRLwAAADAAAAAHAAAAAAAAAAAAAACAAagAAABCUFUudHh0UEsFBgAAAAACAAIAaQAAAPwAAAAAAA==';
const malicious='UEsDBBQAAAAIABMPZl2WBRHZMAAAADMAAAAJAAAALi4vUkMudHh0c0ksSVXIyczNBFIpqQpFqbmZxSBWsUJ+WloRkLJSMDJXyMsvS81NKkpVMDIwMgMAUEsBAhQDFAAAAAgAEw9mXZYFEdkwAAAAMwAAAAkAAAAAAAAAAAAAAIABAAAAAC4uL1JDLnR4dFBLBQYAAAAAAQABADcAAABXAAAAAAA=';
test('DCE ZIP extracts exact source pages, text and hash without storing data',async()=>{
 const out=await importDceZip(Buffer.from(zip,'base64'));
 assert.equal(out.stored,false);
 assert.equal(out.archive.document_count,2);
 assert.match(out.archive.sha256,/^[a-f0-9]{64}$/);
 assert.ok(out.facts.some(x=>x.type==='deadline'&&x.source.document==='RC.txt'&&x.source.page===1));
 assert.ok(out.checklist.some(x=>x.id==='DC1'));
 assert.equal(out.ocr_available,false);
});
test('DCE ZIP rejects path traversal and invalid magic',async()=>{
 for(const name of ['../secrets','/tmp/secrets','C:\\fake','dir/../another','dir\\file']){
  assert.throws(()=>validateZipPath(name));
 }
 await assert.rejects(importDceZip(Buffer.from(malicious,'base64')));
 await assert.rejects(importDceZip(Buffer.from('not-a-zip')));
});
test('Drafts contain placeholders unless explicit field-by-field confirmation',()=>{
 const evidence=analyzeDce({documents:[{name:'RC.pdf',pages:[{page:5,text:
  'Critères d’attribution : valeur technique 60 %, prix 40 %.\nLe DC1, le DC2 et le mémoire technique sont demandés.'}]}]});
 const draft=prepareDce({evidence,company:{company_name:'Société test',siret:'12345678901234'}});
 assert.match(draft.drafts.dc1.fields.candidat,/non confirmée/i);
 assert.equal(draft.all_review_items_confirmed,false);
 assert.equal(draft.filing.can_submit_automatically,false);
 assert.equal(draft.drafts.memoire[0].source.page,5);
 assert.ok(draft.checklist.every(x=>x.source?.document==='RC.pdf'));
});
test('Explicit company and review confirmation never sign or file application',()=>{
 const evidence=analyzeDce({documents:[{name:'RC.pdf',pages:[{page:2,text:'Le DC1 et le DC2 sont demandés.'}]}]});
 const r=prepareDce({evidence,
  company:{company_name:'Atelier local',siret:'12345678901234',
   confirmed_fields:['company_name','siret']},
  consultation:{reference:'M2026-01',reference_confirmed:true,original_notice:'https://www.boamp.fr/pages/avis/?q=idweb:26-22222'},
  review:{identity:true,documents:true,document_statuses:{DC1:'present_verified',DC2:'present_verified'},
   commitments:true,pricing:true,deadline:true,dce_version:true,final_reading:true}});
 assert.equal(r.drafts.dc1.fields.candidat,'Atelier local');
 assert.equal(r.drafts.dc1.fields.siret,'12345678901234');
 assert.equal(r.filing.can_submit_automatically,false);
 assert.equal(r.all_review_items_confirmed,true);
 assert.ok(r.filing.notice_url.startsWith('https://www.boamp.fr/'));
});
test('DECP source accepts trusted awarded records only; no inferred unit price',async()=>{
 assert.match(queryUrl('90910000'),/codecpv/);
 assert.throws(()=>queryUrl('90910%00'));
 const row=awardRecord({id:'A-001',montant:35000,codecpv:'90910000-9',objet:'Nettoyage locaux',
  datenotification:'2025-10-10',dureemois:12});
 assert.equal(row.amount_eur,35000);
 const out=await queryAwards('90910000',async()=>({ok:true,json:async()=>({results:[{
  id:'A-001',montant:35000,codecpv:'90910000-9',objet:'Nettoyage locaux'}]})}));
 assert.equal(out.rows[0].source,'DECP_DAJ');
 const prep=prepareDce({evidence:analyzeDce({documents:[{name:'RC.pdf',pages:[{page:2,text:'Durée du marché : 12 mois.'}]}]}),awards:out.rows});
 assert.equal(prep.pricing.estimated_bid_price,null);
 assert.equal(prep.pricing.recommended_price,null);
 assert.equal(prep.pricing.comparables[0].montant_attribue_eur,35000);
});
test('Premium DCE UI remains embedded in authorized market panel, with isolated endpoints',()=>{
 const html=fs.readFileSync('public/espace.html','utf8');
 const app=fs.readFileSync('public/app.js','utf8');
 const server=fs.readFileSync('server.js','utf8');
 const client=fs.readFileSync('public/dce-assistant.js','utf8');
 assert.ok(html.indexOf('id="dceAssistant"')>html.indexOf('id="premiumContent"'));
 assert.match(app,/initDceAssistant\(\{state,canUsePremium,notify:toast\}\)/);
 for(const endpoint of ['import','prepare','awards']){
  const text="/api/pro/dce/"+endpoint;
  assert.ok(server.includes(text));
 }
 assert.match(server,/verifyPremiumAccess\(req\.headers\.authorization/);
 assert.match(client,/dceOfficialLink/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|auto.?submit|service_role/);
});
