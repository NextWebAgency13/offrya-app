'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {leboncoinUrl,getSourceId,departmentFor,classify,cleanListing,aiReview,removePersonalData}=require('../lib/leboncoin-demand');
const {allowedSearchUrls,detectChallenge,collect}=require('../scripts/collect-leboncoin');
const {rankCandidates}=require('../lib/ai-matching');
const base={
 url:'https://www.leboncoin.fr/ad/services/1234567890?utm_source=test',
 title:'Recherche jardinier pour entretenir un jardin',
 description:"Bonjour, j'ai besoin d'un paysagiste pour la tonte et l'élagage de mon terrain à Marseille. Merci.",
 city:'Marseille',postalCode:'13001'
};
const now=new Date('2026-11-06T12:00:00Z');
test('Only HTTPS Leboncoin ad URLs are accepted, without tracking query strings',()=>{
 assert.equal(leboncoinUrl(base.url),'https://www.leboncoin.fr/ad/services/1234567890');
 assert.equal(getSourceId(base.url),'1234567890');
 for(const invalid of ['http://www.leboncoin.fr/ad/services/1234567890',
  'https://leboncoin.fr.evil.example/ad/services/1234567890',
  'https://www.leboncoin.fr@evil.test/ad/services/1234567890',
  'https://www.leboncoin.fr/recherche?text=jardinier']){
  assert.equal(leboncoinUrl(invalid),null,invalid);
 }
 assert.deepEqual(allowedSearchUrls(JSON.stringify([
  'https://www.leboncoin.fr/recherche?category=34&text=cherche%20artisan',
  'https://www.leboncoin.fr/recherche?category=34&text=cherche%20artisan'
 ])),['https://www.leboncoin.fr/recherche?category=34&text=cherche%20artisan']);
 assert.throws(()=>allowedSearchUrls(['https://evil.test/recherche']),/non autorisée/);
});
test('Classifier detects client-side demand and rejects service offers, jobs and sales',()=>{
 const valid=classify(base);
 assert.equal(valid.accepted,true);
 assert.equal(valid.category,'Espaces verts');
 assert.equal(valid.department,'13');
 for(const [title,description] of [
  ['Entreprise de jardinage à votre service','Je propose mes services de jardinier et devis gratuit.'],
  ['Recherche emploi maçon','Je recherche un emploi de maçon en CDI.'],
  ['Recherche acheteur de matériel','À vendre tronçonneuse, prix à débattre.'],
  ['Vente d’une camionnette','Cherche acheteur dans la région']
 ]){
  assert.equal(classify({title,description}).accepted,false,title);
 }
 assert.equal(departmentFor('20100'),null);
 assert.equal(departmentFor('97120'),'971');
});
test('Stored external listings never contain contact information, URLs embedded in text or fabricated prices',()=>{
 const data=cleanListing({...base,description:base.description+
  ' Contact 0612345678 ou foo@example.com, https://example.com'},now);
 assert.ok(data);
 assert.equal(data.source,'leboncoin');
 assert.equal(data.source_id,'1234567890');
 assert.equal(data.source_url,'https://www.leboncoin.fr/ad/services/1234567890');
 assert.equal(data.category,'Espaces verts');
 assert.equal(data.confidence,0.93);
 assert.equal(data.source_last_seen_at,now.toISOString());
 assert.doesNotMatch(JSON.stringify(data),/0612345678|foo@example.com|https:\/\/example\.com/);
 assert.equal(data.budget_cents,undefined);
 assert.doesNotMatch(removePersonalData('Adresse : 14 rue des Lilas, Paris'),/14 rue des Lilas/i);
});
test('AI review cannot create demand, bypass deterministic classification or change category',async()=>{
 const row=cleanListing(base,now);
 const fetcher=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
  is_demand:true,confidence:0.95,category:'Bâtiment'})}}]})});
 assert.equal(await aiReview(row,{apiKey:'test',fetcher}),null);
 assert.equal(await aiReview(row,{apiKey:''}),row);
});
test('External opportunities must be published, legitimate and matched to Premium preferences',()=>{
 const data=cleanListing(base,now);
 const row={id:'e1111111-1111-4111-8111-111111111111',...data,
  status:'published',published_at:now.toISOString()};
 const options={external:[row],preferences:{sectors:['Espaces verts'],department:'13'},
  now:now.valueOf()+1000,userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 const result=rankCandidates(options);
 assert.equal(result.total,1);
 assert.equal(result.items[0].kind,'external');
 assert.equal(result.items[0].url,data.source_url);
 assert.equal(rankCandidates({...options,external:[{...row,status:'staged'}]}).total,0);
 assert.equal(rankCandidates({...options,external:[{...row,source_url:'https://evil.test/ad/services/1234567890'}]}).total,0);
 assert.equal(rankCandidates({...options,preferences:{department:'75'}}).total,0);
 assert.equal(rankCandidates({...options,preferences:{sectors:['Nettoyage']}}).total,0);
});
test('Collector is disabled until explicit configuration and stops on a challenge',async()=>{
 await assert.rejects(()=>collect({env:{LEBONCOIN_COLLECTOR_ENABLED:'false'}}),/désactivé/);
 await assert.rejects(()=>collect({env:{LEBONCOIN_COLLECTOR_ENABLED:'true',
  LEBONCOIN_SEARCH_URLS:'[]'}}),/Aucune URL/);
 assert.equal(detectChallenge('Just a moment - checking your browser'),true);
 assert.equal(detectChallenge('Découvrez les annonces de rénovation'),false);
});
test('SQL and Premium UI never expose or misattribute imported opportunities',()=>{
 const sql=fs.readFileSync('sql/leboncoin_external_opportunities.sql','utf8');
 const app=fs.readFileSync('public/pro-experience.js','utf8');
 const server=fs.readFileSync('server.js','utf8');
 assert.match(sql,/offrya_private\.has_active_professional_access\(\)/);
 assert.match(sql,/status='published'/);
 assert.match(sql,/revoke all on public\.offrya_external_opportunities from public,anon,authenticated/);
 assert.doesNotMatch(sql,/insert into public\.offrya_missions/i);
 assert.match(server,/OFFRYA_LEBONCOIN_ENABLED==='true'/);
 assert.match(server,/offrya_external_opportunities/);
 assert.match(app,/item\.kind==='external'/);
 assert.match(app,/Voir l’annonce sur Leboncoin/);
 assert.match(app,/leboncoin\\?\.fr|leboncoin/);
});
