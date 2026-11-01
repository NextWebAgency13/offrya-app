'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/app.js'),home=read('public/index.html'),dbsql=read('sql/offrya_marketplace_v2.sql');
const offer=read('public/professionnels.html');
test('Vitrine : statistiques publiques seulement et marque unifiée',()=>{
 assert.match(home,/id="missionCounts"/);
 assert.match(home,/src="\/mission-counts\.js" defer/);
 assert.match(home,/volume réel des missions par secteur et département/);
 assert.doesNotMatch(home,/Devenir Premium|abonnement Premium|professionnels habilités/i);
 assert.doesNotMatch(offer,/>Devenir Premium|OFFRYA PREMIUM|abonnement Premium/i);
 assert.match(offer,/OFFRYA Professionnel : développez votre activité/);
});
test('RLS : statistiques sans aucun identifiant ou détail d’annonce',()=>{
 const fn=dbsql.slice(dbsql.indexOf('create or replace function public.offrya_public_mission_counts()'),dbsql.indexOf('-- La lecture de photos'));
 assert.match(fn,/returns table\(category text, department text, count bigint\)/);
 assert.match(fn,/select m\.category,m\.department,count\(\*\)::bigint/);
 assert.match(fn,/m\.status='open' and m\.expires_at>now\(\)/);
 assert.doesNotMatch(fn,/select \*|m\.title|m\.description|owner_id|m\.city|budget_cents/i);
 assert.match(dbsql,/alter policy missions_read_authorized/);
 assert.match(dbsql,/alter policy conversation_open/);
 assert.match(dbsql,/storage\.objects for select to authenticated/);
 assert.match(dbsql,/verification_status='verified'/);
 assert.match(dbsql,/msg\.sender_id=c\.client_id/);
 assert.match(dbsql,/msg\.sender_id=c\.professional_id/);
 assert.match(dbsql,/created_at timestamptz not null default now/);
});
test('Formulaires : champs sectoriels et photos, aucun upload public',()=>{
 for(const p of ['public/deposer-une-mission.html','public/espace.html']){
  const html=read(p);
  for(const name of ['area_sqm','urgency','desired_date','place_type','photos'])assert.match(html,new RegExp('name="'+name+'"'));
  assert.match(html,/accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html,/mission-fields\.js/);
 }
 const photos=read('public/mission-photos.mjs');
 assert.match(photos,/MAX_IMAGES=6,MAX_BYTES=5\*1024\*1024/);
 assert.match(photos,/offrya-mission-images/);
 assert.doesNotMatch(photos,/getPublicUrl|public:true/i);
});
test('Attribution, avis, signalements et preuves ont une vérification en base',()=>{
 assert.match(dbsql,/public\.offrya_award_mission/);
 assert.match(dbsql,/where id=p_mission and owner_id=auth\.uid\(\)/);
 assert.match(dbsql,/create policy review_after_real_exchange/);
 assert.match(dbsql,/and m\.status='closed'/);
 assert.match(dbsql,/unique\(reporter_id,target_type,target_id\)/);
 assert.match(dbsql,/create policy report_owner_insert/);
 assert.match(dbsql,/create table if not exists public\.offrya_pro_proof_requests/);
 assert.match(dbsql,/Aucune politique d'INSERT\/UPDATE authentifiée/);
 for(const x of ['data-report-mission','data-report-message','data-review-mission','data-award-mission','createSignedUrl'])assert.ok(app.includes(x),x);
});
test('Endpoints publics : données agrégées minimales sans titres ni identité des demandeurs',async()=>{
 const server=createServer(require('../server').handle);
 const savedUrl=process.env.SUPABASE_URL,savedKey=process.env.SUPABASE_PUBLISHABLE_KEY,realFetch=global.fetch;
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='test-publishable';
 let calls=0;
 global.fetch=async (url,opts)=>{
  if(String(url).startsWith('https://example.supabase.co')){
   calls++;
   if(String(url).includes('offrya_public_mission_counts'))
    return new Response(JSON.stringify([
     {category:'Bâtiment',department:'13',count:2,title:'SECRET',owner_id:'SECRET'},
     {category:'Nettoyage',department:'31',count:1,title:'SECRET'}]),{status:200});
   if(String(url).includes('offrya_verified_pro_directory'))
    return new Response(JSON.stringify([{user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',display_name:'Entreprise exemple',sectors:['Bâtiment'],service_area:'13',presentation:'Entreprise vérifiée',badges:['Décennale contrôlée'],siret:'SECRET'}]),{status:200});
   if(String(url).includes('offrya_public_pro_reviews'))
    return new Response(JSON.stringify([{rating:5,comment:'Prestation terminée avec succès',created_at:'2026-11-01',client_id:'SECRET'}]),{status:200});
   return new Response('{}',{status:404});
  }
  return realFetch(url,opts);
 };
 try{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+server.address().port;
  const counter=await realFetch(base+'/api/mission-counts');
  assert.equal(counter.status,200);
  const text=await counter.text(),data=JSON.parse(text);
  assert.equal(data.total,3);assert.equal(data.sectors.length,2);assert.equal(data.departments.length,2);
  assert.doesNotMatch(text,/SECRET|owner_id|title|description|city/);
  const dir=await realFetch(base+'/api/professionnels-verifies');
  assert.equal(dir.status,200);
  const dirtext=await dir.text();assert.doesNotMatch(dirtext,/siret|SECRET/);
  const review=await realFetch(base+'/api/professionnels-verifies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avis');
  assert.equal(review.status,200);assert.doesNotMatch(await review.text(),/client_id|SECRET/);
  assert.ok(calls>=3);
 }finally{
  global.fetch=realFetch;
  if(savedUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=savedUrl;
  if(savedKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=savedKey;
  if(server.listening)await new Promise(done=>server.close(done));
 }
});
