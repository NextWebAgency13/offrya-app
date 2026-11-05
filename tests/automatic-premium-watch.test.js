'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {cleanRow,queryTerms}=require('../scripts/watch-sector-tenders');
const sql=fs.readFileSync('sql/automatic_premium_watch.sql','utf8');
const ui=fs.readFileSync('public/opportunity-console.js','utf8');
const markup=fs.readFileSync('public/espace.html','utf8');
const notice={id:'26-123456',title:'Marché de nettoyage et entretien des bureaux',
 description:'Entretien de locaux administratifs',buyer:'Ville Test',departments:'13',source:'BOAMP',
 url:'https://www.boamp.fr/pages/avis/?q=idweb:26-123456',
 deadline:new Date(Date.now()+10*86400000).toISOString()};
test('Automatic watch operates without manual preferences or opt-in',()=>{
 const terms=queryTerms({sectors:[],keywords:'',department:''});
 assert.ok(terms.includes('nettoyage'));
 assert.ok(terms.includes('informatique'));
 assert.ok(terms.includes('transport'));
 const row=cleanRow(notice,'12345678-1234-4234-8234-123456789012',{sectors:[],keywords:'',department:''});
 assert.ok(row);
 assert.ok(row.match_score>=45);
 assert.equal(row.source,'BOAMP');
});
test('Professionals may refine matching without being forced to choose a sector',()=>{
 assert.deepEqual(queryTerms({sectors:['Nettoyage'],keywords:'',department:'13'}),['nettoyage']);
 assert.ok(queryTerms({sectors:['Autre'],keywords:''}).length>=5);
 assert.ok(queryTerms({sectors:[],keywords:'plomberie'}).includes('plomberie'));
 assert.match(sql,/left join public\.offrya_opportunity_preferences op/);
 assert.doesNotMatch(sql,/op\.alerts_enabled\s*(?:is\s+true|=\s*true)/i);
 assert.match(sql,/coalesce\(op\.department,''\)/);
 assert.match(sql,/pf\.specialty/);
});
test('Only verified paid professionals or expressly granted professional QA accounts are monitored',()=>{
 assert.match(sql,/s\.status='active' and s\.paid_through>now\(\)/);
 assert.match(sql,/v\.identity_live_verified is true/);
 assert.match(sql,/u\.email_confirmed_at is not null/);
 assert.match(sql,/revoke all on function public\.offrya_agent_watch_targets\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.offrya_agent_watch_targets\(\) to service_role/);
 assert.match(sql,/offrya_private\.temporary_premium_grants g/);
 assert.match(sql,/g\.user_id=pf\.id and g\.expires_at>now\(\)/);
 assert.match(sql,/pf\.role='pro'/);
 assert.match(sql,/or exists \(/);
 assert.match(sql,/v\.status='verified'/);
 assert.doesNotMatch(sql,/offrya_alert_preferences/);
});
test('UI exposes no activation toggle or compulsory sector and describes automatic watch',()=>{
 assert.doesNotMatch(markup,/name="alerts_enabled"/);
 assert.doesNotMatch(ui,/f\.elements\.alerts_enabled/);
 assert.doesNotMatch(ui,/Sélectionnez un secteur ou saisissez un mot-clé pour activer/);
 assert.match(markup,/automatiquement les opportunités publiques/);
 assert.match(ui,/alerts_enabled:true/);
});
