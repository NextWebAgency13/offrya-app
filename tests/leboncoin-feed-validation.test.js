'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateFeed}=require('../lib/leboncoin-feed-validation');
const {prepare,validationCsv,importFeed}=require('../scripts/import-leboncoin-feed');

const raw={list_id:1234567890,ad_type:'want',status:'active',
 url:'/ad/services/1234567890',
 subject:'Recherche plombier pour travaux dans ma maison',
 body:'Bonjour, je recherche un artisan plombier pour des travaux de réparation. Contact 0612345678',
 location:{city:'Marseille',zipcode:'13001'}};
const now=new Date('2026-11-06T08:00:00Z');

test('Validation distinguishes rejected advertisements, duplicates and accepted demand',()=>{
 const list=[raw,raw,{...raw,ad_type:'offer'},
  {...raw,status:'expired'}, {...raw,subject:'Court'},
  {...raw,location:{}},{...raw,list_id:1234567899},
  {...raw,url:'https://unsafe.example/ad/services/1234567890'}];
 const {rows,summary}=validateFeed({ads:list},now);
 assert.equal(summary.total,8);
 assert.equal(summary.ready,1);
 assert.equal(summary.duplicates,1);
 assert.equal(summary.ignored,6);
 assert.equal(summary.reasons.pas_une_demande,1);
 assert.equal(summary.reasons.statut_inactif,1);
 assert.equal(summary.reasons.titre_incomplet,1);
 assert.equal(summary.reasons.localisation_manquante,1);
 assert.equal(summary.reasons.identifiant_incoherent,1);
 assert.equal(summary.reasons.url_ou_identifiant_invalide,1);
 assert.equal(rows[0].department,'13');
 assert.doesNotMatch(JSON.stringify(rows),/0612345678/);
 assert.deepEqual(prepare({ads:[raw]},now),rows);
});
test('Structural JSON export and spreadsheet formula prevention',()=>{
 const parsed=validateFeed({props:{pageProps:{initialProps:{searchData:{ads:[raw]}}}}},now);
 assert.equal(parsed.summary.ready,1);
 const csv=validationCsv([{title:'=SUM(1,2)',source_id:'1234567890',status:'staged'}]);
 assert.match(csv,/'=SUM\(1,2\)/);
 assert.match(csv,/status_import/);
 assert.match(csv,/"ready"/);
 assert.doesNotMatch(csv,/0612345678/);
});
test('Simulated import writes only optional summary files, no database changes',async()=>{
 const output=new Map(),saves=[];
 const env={LEBONCOIN_FEED_ENABLED:'true',LEBONCOIN_FEED_FILE:'authorized.json',
  LEBONCOIN_VALIDATION_CSV:'validation.csv',LEBONCOIN_VALIDATION_REPORT:'validation.json',
  LEBONCOIN_DRY_RUN:'true'};
 const result=await importFeed({env,readFile:async()=>JSON.stringify({ads:[raw,{...raw,ad_type:'offer'}]}),
  writeFile:async(p,c)=>output.set(p,c),store:async row=>saves.push(row),now,logger:{info(){}}});
 assert.equal(result.qualified,1);
 assert.equal(result.published,0);
 assert.equal(saves.length,0);
 assert.equal(JSON.parse(output.get('validation.json')).ignored,1);
 assert.match(output.get('validation.csv'),/Recherche plombier/);
 assert.doesNotMatch(output.get('validation.csv'),/0612345678/);
});
test('Authorized import stages records until both publication switches are on',async()=>{
 const writes=[];
 const common={LEBONCOIN_FEED_ENABLED:'true',LEBONCOIN_FEED_FILE:'authorized.json',
  LEBONCOIN_DRY_RUN:'false'};
 const opts={readFile:async()=>JSON.stringify({ads:[raw]}),store:async row=>writes.push(row),
  now,logger:{info(){}}};
 await importFeed({...opts,env:common});
 assert.equal(writes[0].status,'staged');
 assert.equal(writes[0].published_at,null);
 await importFeed({...opts,env:{...common,LEBONCOIN_REPUBLICATION_AUTHORIZED:'true',
  LEBONCOIN_PUBLISH_ENABLED:'true'}});
 assert.equal(writes[1].status,'published');
 assert.equal(writes[1].published_at,now.toISOString());
});
