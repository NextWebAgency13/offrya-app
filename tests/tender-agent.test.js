'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {qualifyTender,isOfficial}=require('../lib/tender-assistant');
const {normalizeTedNotice,tedSearchBody,queryTed}=require('../lib/ted');
const {cleanRow,fingerprint,queryTerms,run}=require('../scripts/watch-sector-tenders');
const deadline=new Date(Date.now()+12*86400000).toISOString();
const prefs={user_id:'12345678-1234-4234-8234-123456789012',sectors:['Nettoyage'],keywords:'bureaux',department:'13'};
const boamp={id:'26-123456',title:'Prestations de nettoyage de bureaux',buyer:'Ville Test',
 departments:'13',description:'Entretien des bureaux',deadline,
 url:'https://www.boamp.fr/pages/avis/?q=idweb:26-123456',source:'BOAMP'};
const ted={...boamp,id:'TED-730007-2026',source:'TED',departments:'',
 url:'https://ted.europa.eu/fr/notice/-/detail/730007-2026'};
test('Only published official, unexpired and relevant tenders can trigger Premium alerts',()=>{
 const a=qualifyTender(boamp,prefs),b=qualifyTender(ted,prefs);
 assert.ok(a&&a.match_score>=45);
 assert.ok(b&&b.match_score>=45);
 assert.equal(a.source,'BOAMP');assert.equal(b.source,'TED');
 assert.equal(qualifyTender({...boamp,url:'https://attacker.example'},prefs),null);
 assert.equal(qualifyTender({...ted,url:'https://evil.example'},prefs),null);
 assert.equal(qualifyTender({...boamp,deadline:new Date(Date.now()-60000).toISOString()},prefs),null);
 assert.equal(qualifyTender({...boamp,title:'Conseil fiscal',description:'Droit fiscal'},prefs),null);
 assert.equal(qualifyTender(boamp,{sectors:[],keywords:''}),null);
 assert.equal(cleanRow(boamp,prefs.user_id,prefs).first_steps,undefined);
});
test('The TED source normalizes multilingual official titles and refuses expired/foreign notices',async()=>{
 const future=new Date(Date.now()+12*86400000).toISOString().slice(0,10);
 const row={'publication-number':'730007-2026','notice-title':{fra:['Nettoyage de bureaux'],eng:['Office cleaning']},
  'buyer-name':{fra:['Ville Test']},'buyer-country':['FRA'],'deadline-receipt-tender-date-lot':[future+'+01:00']};
 const a=normalizeTedNotice(row);assert.equal(a?.source,'TED');
 assert.equal(a?.title,'Nettoyage de bureaux');assert.equal(a?.id,'TED-730007-2026');
 assert.match(a.url,/ted\.europa\.eu/);
 assert.equal(normalizeTedNotice({...row,'buyer-country':['DEU']}),null);
 assert.equal(normalizeTedNotice({...row,'deadline-receipt-tender-date-lot':['2020-01-02']}),null);
 const request=tedSearchBody('Nettoyage');
 assert.match(request.query,/buyer-country=FRA/);
 assert.equal(request.scope,'ACTIVE');assert.ok(request.limit<=25);
 let called=0;
 const api=async(url,options)=>{called++;assert.match(url,/api\.ted\.europa\.eu/);
  assert.equal(options.method,'POST');return{ok:true,json:async()=>({notices:[row]})};};
 const fetched=await queryTed('Nettoyage',api);
 assert.equal(called,1);assert.equal(fetched.length,1);
});
test('Matching is deduplicated and never submits tenders or writes messages',async()=>{
 assert.deepEqual(queryTerms(prefs),['nettoyage','bureaux']);
 assert.equal(fingerprint(qualifyTender(boamp,prefs)),fingerprint(qualifyTender(ted,prefs)));
 const src=fs.readFileSync('scripts/watch-sector-tenders.js','utf8');
 const server=fs.readFileSync('server.js','utf8');
 const ui=fs.readFileSync('public/pro-experience.js','utf8');
 const sql=fs.readFileSync('sql/official_opportunity_alerts.sql','utf8');
 assert.match(src,/rpc\/offrya_agent_watch_targets/);
 assert.match(src,/resolution=ignore-duplicates/);
 assert.match(src,/queryTed/);
 assert.doesNotMatch(src,/resend\.com|sendMail|smtp|\/api\/pro\/tender-response/);
 assert.doesNotMatch(server,/\/api\/pro\/tender-preparation|\/api\/pro\/tender-response/);
 assert.doesNotMatch(ui,/data-pro-prepare|Préparer le dossier avec l’IA/);
 assert.match(sql,/s\.status='active'/);
 assert.match(sql,/s\.paid_through>now\(\)/);
 assert.match(sql,/source in \('BOAMP','TED'\)/);
});
test('Official URL filters never accept user-controlled links',()=>{
 assert.ok(isOfficial(ted));
 assert.ok(isOfficial(boamp));
 assert.equal(isOfficial({...ted,url:'https://ted.europa.eu.evil.com'}),false);
 assert.equal(isOfficial({...boamp,id:'FAKE-001'}),false);
});
