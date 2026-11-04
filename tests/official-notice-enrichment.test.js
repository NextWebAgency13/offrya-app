'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildBoampUrl,validBefore}=require('../lib/boamp');
const {fingerprint,buildRequest,validate,enrichPublicNotice}=require('../lib/official-notice-ai');
const notice={
 id:'26-123456',title:'Nettoyage de bureaux municipaux',buyer:'Mairie Exemple',
 departments:'13',description:'Entretien des locaux, estimation budgétaire 10 000 €.',
 published:new Date().toISOString(),deadline:new Date(Date.now()+14*86400000).toISOString(),
 source:'BOAMP',url:'https://www.boamp.fr/pages/avis/?q=idweb:26-123456'
};
test('BOAMP query safely filters sector, department and deadline using official ODSQL',()=>{
 const q=buildBoampUrl({q:'bureaux',dept:'13',sector:'Nettoyage',deadlineBefore:'2026-12-01'});
 const where=q.searchParams.get('where');
 assert.match(where,/datelimitereponse >= now\(\)/);
 assert.match(where,/search\(objet, descripteur_libelle, "bureaux"\)/);
 assert.match(where,/search\(objet, descripteur_libelle, "nettoyage"\)/);
 assert.match(where,/datelimitereponse <= date'2026-12-01T23:59:59'/);
 assert.equal(q.searchParams.get('refine'),'code_departement:13');
 assert.equal(validBefore('2026-02-31'),null);
 assert.equal(validBefore("2026-12-01' OR 1=1"),null);
 assert.ok(!buildBoampUrl({deadlineBefore:"2026-12-01' OR 1=1",sector:'other'}).searchParams.get('where').includes('1=1'));
});
test('Official notice summaries are structured, limited to public fields and capped at two short sentences',()=>{
 const req=buildRequest({...notice,internal_secret:'never-sent'});
 assert.equal(req.response_format.type,'json_schema');
 assert.equal(req.response_format.json_schema.strict,true);
 assert.equal(req.messages[0].role,'system');
 assert.doesNotMatch(req.messages[1].content,/never-sent/);
 assert.deepEqual(Object.keys(req.response_format.json_schema.schema.properties),
 ['summary','category','location','budget_eur','budget_evidence']);
 const key1=fingerprint(notice);
 const key2=fingerprint({...notice,source:'TED',id:'TED-123456-2026'});
 assert.equal(key1,key2);
});
test('Budget is displayed only when exact amount and explicit source evidence agree',()=>{
 const data={summary:'La mairie cherche un prestataire pour entretenir ses locaux. Échéance indiquée dans l’avis officiel.',
  category:'Nettoyage',location:'Marseille',budget_eur:10000,budget_evidence:'10 000 €'};
 const valid=validate(data,notice);
 assert.equal(valid.ai_budget_eur,10000);
 assert.equal(valid.ai_category,'Nettoyage');
 assert.ok(valid.ai_summary.length<=210);
 assert.equal(validate({...data,budget_eur:50000},notice).ai_budget_eur,null);
 assert.equal(validate({...data,budget_evidence:'30 000 €'},notice).ai_budget_eur,null);
 assert.equal(validate({...data,budget_eur:0,budget_evidence:null},notice).ai_budget_eur,null);
 assert.equal(validate({...data,budget_eur:10000,budget_evidence:'non indiqué'},notice).ai_budget_eur,null);
});
test('OpenAI request uses server-only key, validates JSON, and never sends private profiles',async()=>{
 let calls=0;
 const response=await enrichPublicNotice(notice,{apiKey:'test-only-secret',fetcher:async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer test-only-secret');
  const body=JSON.parse(options.body);
  assert.doesNotMatch(JSON.stringify(body),/test-only-secret/);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
   summary:'La mairie recherche un prestataire pour le nettoyage régulier de bureaux. Une consultation est ouverte.',
   category:'Nettoyage',location:'Marseille',budget_eur:10000,budget_evidence:'10 000 €'
  })}}]})};
 }});
 assert.equal(calls,1);assert.equal(response.ai_budget_eur,10000);
 await assert.rejects(enrichPublicNotice(notice,{apiKey:null}),/non configurée/);
});
test('Hourly cron analyzes one unique public notice across multiple paid users and reuses cache',async()=>{
 const modulePath=require.resolve('../scripts/watch-sector-tenders');
 const oldBase=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SECRET_KEY='dummy-service-secret';
 delete require.cache[modulePath];
 try{
  const {run}=require('../scripts/watch-sector-tenders');
  const ids=['12345678-1234-4234-8234-123456789012','22345678-1234-4234-8234-123456789012'];
  const events=[],dbCache=new Map();
  const store=async(path,opts)=>{
   events.push({path,opts});
   if(path.startsWith('rpc/'))return ids.map(user_id=>({user_id,sectors:['Nettoyage'],department:'13'}));
   if(path.includes('digest?select='))return [...dbCache.values()];
   if(path.startsWith('offrya_public_tender_digest?on_conflict')){
    const rows=JSON.parse(opts.body);rows.forEach(row=>dbCache.set(row.digest_key,row));return null;
   }
   return null;
  };
  let count=0;
  const fakeAI=async()=>{count++;return {ai_summary:'La mairie cherche une entreprise de nettoyage. Les locaux se situent dans son département.',ai_category:'Nettoyage',ai_location:'Marseille',ai_budget_eur:10000,ai_status:'completed',ai_model:'test-model'};};
  const args={boamp:async()=>({items:[notice]}),ted:async()=>[],portals:async()=>({items:[],health:[]}),
   store,enricher:fakeAI,env:{OFFRYA_AI_API_KEY:'dummy-key',OFFRYA_AI_MAX_PER_HOUR:'12'},logger:{log(){},warn(){}}};
  const first=await run(args);
  assert.equal(first.processed,2);
  assert.equal(first.uniqueNotices,1);
  assert.equal(count,1);
  const inserted=events.filter(e=>e.path.startsWith('offrya_tender_alerts?'));
  assert.equal(inserted.length,2);
  for(const entry of inserted){
   assert.match(entry.opts.headers.Prefer,/merge-duplicates/);
   const rows=JSON.parse(entry.opts.body);assert.equal(rows.length,1);
   assert.ok(rows[0].ai_summary);
   assert.ok(rows[0].digest_key);
   assert.equal(rows[0].seen_at,undefined);
   assert.equal(rows[0].detected_at,undefined);
  }
  await run(args);
  assert.equal(count,1,'cache should avoid re-billing OpenAI on the next run');
 }finally{
  if(oldBase===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldBase;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
  delete require.cache[modulePath];
 }
});
test('Premium daily digests never contaminate the other-users mission dashboard',()=>{
 const pro=fs.readFileSync('public/pro-experience.js','utf8'),
  html=fs.readFileSync('public/espace.html','utf8'),
  app=fs.readFileSync('public/app.js','utf8'),
  sql=fs.readFileSync('sql/public_tender_ai_enrichment.sql','utf8'),
  blueprint=fs.readFileSync('docs/render-veille-cron.example.yaml','utf8');
 assert.match(pro,/data-pro-panel="boamp".*proV3TodayAlerts/);
 assert.match(pro,/Appels d’offres du jour/);
 assert.match(pro,/data-pro-panel="home"/);
 assert.match(pro,/ai_summary/);
 assert.match(pro,/ai_category/);
 assert.match(pro,/ai_budget_eur/);
 assert.match(html,/id="boampSector"/);
 assert.match(html,/id="boampDeadline"/);
 assert.match(app,/ai_summary,ai_category,ai_location,ai_budget_eur,ai_status/);
 assert.match(sql,/revoke all on public\.offrya_public_tender_digest from public,anon,authenticated/);
 assert.match(sql,/offrya_tender_alerts_daily_premium_idx/);
 assert.match(blueprint,/schedule: "0 \* \* \* \*"/);
 assert.match(blueprint,/OFFRYA_AI_API_KEY/);
 assert.match(blueprint,/sync: false/);
 assert.doesNotMatch(blueprint,/sk-[A-Za-z0-9]{20}/);
});
