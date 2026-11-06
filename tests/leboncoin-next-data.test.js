'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractNextData,qualifiedAd,parseSearchNextData,parseSearchJson}=require('../lib/leboncoin-next-data');
const {cleanListing}=require('../lib/leboncoin-demand');
const demand={list_id:1234567890,ad_type:'want',subject:'Recherche un artisan pour rénover ma cuisine',
 body:"Bonjour, je recherche un artisan pour des travaux de peinture. Contact 0612345678, moi@example.fr",
 url:'/ad/services/1234567890',status:'active',location:{city:'Lyon',zipcode:'69003'}};
test('Structured __NEXT_DATA__ is parsed independently of HTML script attribute order',()=>{
 const data={props:{pageProps:{searchData:{ads:[demand,{...demand,list_id:1234567891,url:'/ad/services/1234567891',ad_type:'offer'}]}}}};
 const html='<html><script nonce="test" type="application/json" id="__NEXT_DATA__">'+JSON.stringify(data)+'</script></html>';
 assert.deepEqual(extractNextData(html),data);
 assert.equal(parseSearchJson(JSON.stringify(data)).length,1);
 assert.equal(parseSearchJson(JSON.stringify(data))[0].ad_type,'want');
 assert.equal(parseSearchJson('{broken'),null);
 assert.equal(extractNextData('<html>No data</html>'),null);
});
test('Only real wanted-service entries and canonical Leboncoin URLs are retained',()=>{
 assert.equal(qualifiedAd({...demand,ad_type:'offer'}),null);
 assert.equal(qualifiedAd({...demand,url:'https://evil.example/ad/services/1234567890'}),null);
 assert.equal(qualifiedAd({...demand,status:'expired'}),null);
 const rows=parseSearchNextData({props:{pageProps:{initialProps:{searchData:{ads:[
  demand,demand,{...demand,url:'https://www.leboncoin.fr.evil.test/ad/services/1234567899'},
  {...demand,ad_type:'offer',url:'/ad/services/1234567899'}
 ]}}}}});
 assert.equal(rows.length,1);
 assert.equal(rows[0].url,'https://www.leboncoin.fr/ad/services/1234567890');
 assert.equal(rows[0].city,'Lyon');
 assert.equal(rows[0].postalCode,'69003');
});
test('Only sanitized metadata is persisted and no contact or scraped price leaks',()=>{
 const a=qualifiedAd(demand);
 const row=cleanListing(a,new Date('2026-11-06T08:00:00Z'));
 assert.ok(row);
 assert.equal(row.department,'69');
 assert.doesNotMatch(JSON.stringify(row),/0612345678|moi@example.fr/);
 assert.equal(row.price,undefined);
 assert.equal(row.ad_type,undefined);
});
