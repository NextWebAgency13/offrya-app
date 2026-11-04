'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildCopilotRequest,parseCopilotResponse,payloadMission}=require('../lib/pro-copilot');
const {CATALOG,DEP,getApprovedFeeds,safeUrl,parsePublicRss,queryPublicPortals}=require('../lib/public-portal-feeds');
const {qualifyTender,isOfficial}=require('../lib/tender-assistant');
const {run,cleanRow,fingerprint}=require('../scripts/watch-sector-tenders');

const expires=new Date(Date.now()+12*86400000).toISOString();
const deadline=new Date(expires).toUTCString();
const rss=(source,host=source.domains[0])=>'<rss><channel><item><title><![CDATA[Nettoyage de bureaux municipaux]]></title><link>https://'+host+'/avis/consultation/122</link><guid>consultation-122</guid><description>Nettoyage et entretien de bureaux</description><deadline>'+deadline+'</deadline><departement>13</departement><acheteur>Ville Exemple</acheteur></item></channel></rss>';

test('PLACE must be explicitly enabled; regional URL must be approved and exact-host allowed',()=>{
 assert.deepEqual(getApprovedFeeds({}),[]);
 const on=getApprovedFeeds({OFFRYA_PLACE_RSS_APPROVED:'true',OFFRYA_PLACE_RSS_URL:'https://www.marches-publics.gouv.fr/reverified/rss.xml',OFFRYA_OCCITANIE_RSS_URL:'https://www.marches-occitanie.fr/rss.xml',OFFRYA_SUD_RSS_URL:'https://attacker.com/rss.xml'});
 assert.deepEqual(on.map(s=>s.id),['PLACE','OCCITANIE']);
 assert.equal(getApprovedFeeds({OFFRYA_PLACE_RSS_APPROVED:'false'}).length,0);
 const place=CATALOG.find(s=>s.id==='PLACE');
 assert.ok(safeUrl('https://www.marches-publics.gouv.fr/reverified/rss.xml',place,true));
 for(const url of ['http://www.marches-publics.gouv.fr/rss.xml','https://www.marches-publics.gouv.fr.evil.com/rss.xml','https://evil.com/rss.xml','https://www.marches-publics.gouv.fr:444/rss.xml','https://x@www.marches-publics.gouv.fr/rss.xml'])assert.equal(safeUrl(url,place,true),null,url);
 assert.equal(CATALOG.length,6);
 assert.deepEqual(getApprovedFeeds({OFFRYA_PLACE_RSS_APPROVED:'true'}),[]);
});
test('RSS feed is parsed only from approved sources and explicit unexpired dates',()=>{
 const src=CATALOG.find(s=>s.id==='SUD');
 const row=parsePublicRss(rss(src),src)[0];
 assert.equal(row.source,'SUD');assert.equal(row.departments,'13');assert.equal(row.title,'Nettoyage de bureaux municipaux');
 assert.match(row.id,/^SUD-[a-f0-9]{24}$/);
 assert.match(row.url,/^https:\/\/marches-publics\.maregionsud\.fr\//);
 assert.equal(parsePublicRss(rss(src).replace('<deadline>'+deadline+'</deadline>',''),src).length,0);
 assert.equal(parsePublicRss(rss(src).replace(deadline,'Mon, 01 Jan 2024 10:00:00 GMT'),src).length,0);
 assert.equal(parsePublicRss(rss(src).replace('https://'+src.domains[0], 'https://evil.example'),src).length,0);
 assert.throws(()=>parsePublicRss('<!DOCTYPE rss><rss/>',src),/Format XML risqué/);
});
test('Official public tender matching rejects unknown sources, foreign regions and fake URLs',()=>{
 const src=CATALOG.find(s=>s.id==='SUD');
 const notice=parsePublicRss(rss(src),src)[0];
 const pref={user_id:'12345678-1234-4234-8234-123456789012',sectors:['Nettoyage'],department:'13'};
 assert.equal(isOfficial(notice),true);
 assert.ok(qualifyTender(notice,pref));
 assert.equal(qualifyTender(notice,{...pref,department:'75'}),null);
 assert.equal(qualifyTender({...notice,url:'https://fake.example.com/avis'},pref),null);
 assert.equal(qualifyTender({...notice,source:'HACKED'},pref),null);
 assert.ok(DEP.SUD.includes('13'));
});
test('Source unavailability degrades gracefully without silently inventing any rows',async()=>{
 const env={OFFRYA_PLACE_RSS_APPROVED:'true',OFFRYA_PLACE_RSS_URL:'https://www.marches-publics.gouv.fr/reverified/rss.xml'};
 const fetched=await queryPublicPortals({env,fetcher:async()=>({ok:false,status:503,headers:{get:()=> 'application/rss+xml'}})});
 assert.deepEqual(fetched.items,[]);
 assert.deepEqual(fetched.health,[{id:'PLACE',status:'unavailable',count:0}]);
 const none=await queryPublicPortals({env:{}});
 assert.deepEqual(none,{items:[],health:[],sourcesEnabled:0});
});
test('Paid watch merges regional feeds with existing watch logic, without auto messages',async()=>{
 const user='12345678-1234-4234-8234-123456789012';
 const src=CATALOG.find(s=>s.id==='SUD'),notice=parsePublicRss(rss(src),src)[0];
 const calls=[];
 const store=async(path,opt)=>{calls.push({path,opt});if(path.startsWith('rpc/'))return [{user_id:user,sectors:['Nettoyage'],keywords:'',department:'13'}];return null;};
 const old=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
 // module captures env at import-time; fake config via temporarily primed require cache.
 const modPath=require.resolve('../scripts/watch-sector-tenders');const cache=require.cache[modPath];
 delete require.cache[modPath];
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-only';
 try{
  const {run:loaded}=require('../scripts/watch-sector-tenders');
  const stats=await loaded({boamp:async()=>({items:[]}),ted:async()=>[],
    portals:async()=>({items:[notice],health:[{id:'SUD',status:'ok',count:1}]}),
    store,logger:{log(){},warn(){}}});
  assert.equal(stats.processed,1);assert.ok(stats.proposed>=1);
  const write=calls.find(x=>x.path.startsWith('offrya_tender_alerts'));
  assert.ok(write);
  const rows=JSON.parse(write.opt.body);
  assert.equal(rows.length,1);assert.equal(rows[0].source,'SUD');
  assert.match(rows[0].match_reason,/nettoyage/i);
  assert.equal(rows[0].user_id,user);
 }finally{
  if(old===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old;
  if(secret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=secret;
  delete require.cache[modPath];if(cache)require.cache[modPath]=cache;
 }
});
test('AI data is allowlisted, and three tone drafts are structured and strictly human-reviewed',()=>{
 const request=buildCopilotRequest({mission:{title:'Nettoyage bureaux',description:'Besoin pour mardi',owner_id:'secret-owner',client_email:'secret@example.com',city:'Marseille',budget_cents:15000}});
 assert.equal(request.response_format.type,'json_schema');
 assert.equal(request.response_format.json_schema.strict,true);
 assert.equal(request.messages[0].role,'system');
 assert.ok(!request.messages[1].content.includes('secret-owner'));
 assert.ok(!request.messages[1].content.includes('secret@example.com'));
 assert.match(request.messages[0].content,/Ne fabrique jamais prix/);
 const sample={summary:'Entretien de bureaux à Marseille',information_status:'à préciser',missing_information:['Surface ?'],watchouts:[],next_action:'Contacter le demandeur',drafts:{professional:'Bonjour, je souhaite préciser le périmètre de votre demande.',concise:'Bonjour, pourriez-vous préciser la surface à traiter ?',clarification:'Bonjour, pouvez-vous préciser la superficie et la date souhaitée ?'}};
 const parsed=parseCopilotResponse(JSON.stringify(sample),'analyze');
 assert.equal(parsed.draft,sample.drafts.professional);
 assert.equal(Object.keys(parsed.drafts).length,3);
 const review=buildCopilotRequest({mission:{title:'Travaux'},action:'review',draft:'Bonjour, je peux vous accompagner après précisions.'});
 assert.equal(review.response_format.json_schema.name,'offrya_message_review');
 assert.throws(()=>buildCopilotRequest({mission:{title:'Travaux'},action:'review',draft:'court'}),/entre 10 et 2 500/);
 assert.throws(()=>parseCopilotResponse('Bonjour','analyze'),/structurée/);
});
test('Premium server gate, strict original links, and human message confirmation stay present',()=>{
 const server=fs.readFileSync('server.js','utf8');
 const ui=fs.readFileSync('public/pro-commercial.js','utf8');
 const pro=fs.readFileSync('public/pro-experience.js','utf8');
 const migration=fs.readFileSync('sql/approved_public_portal_sources.sql','utf8');
 assert.match(server,/p==='\/api\/pro\/copilot'/);
 assert.match(server,/verifyPremiumAccess\(req.headers.authorization/);
 assert.match(server,/mission\.status!=='open'\|\|mission\.owner_id===userId/);
 assert.match(ui,/data-sales-review/);
 assert.match(ui,/data-sales-draft-tone="concise"/);
 assert.match(ui,/data-sales-apply-review/);
 assert.match(ui,/confirm\('Envoyer cette réponse au demandeur/);
 assert.match(pro,/portalHosts/);
 assert.match(migration,/PLACE','MAXIMILIEN','MEGALIS','EBOURGOGNE','OCCITANIE','SUD'/);
 const src=fs.readFileSync('scripts/watch-sector-tenders.js','utf8');
 assert.doesNotMatch(src,/sendMail|\/api\/pro\/tender-response|stripe\.checkout/);
});
