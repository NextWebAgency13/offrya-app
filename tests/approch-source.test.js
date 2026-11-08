'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {normalizeApproch,approchQuery,queryApproch}=require('../lib/approch');
const {qualifyTender,isOfficial}=require('../lib/tender-assistant');
const now=new Date('2026-11-08T10:00:00Z');
const raw={code:66961,libelle:'Prestations d’entretien des espaces verts sur le réseau routier de la DIRMED',
 description:'Entretien des espaces verts, tonte et élagage.',categorie_d_achat:'Services',
 date_previsionnelle_de_publication:'2026-11-30',date_cible_de_remise_des_offres:null,
 lien_vers_la_consultation:null,montant_estime_du_marche:'5M - 10M€',duree_previsionnelle_du_marche:48,
 departement_s_d_execution_du_marche:'04|05|13|83',responsable:'Jean Agent'};
test('APProch projects become official notices without the agent name',()=>{
 const n=normalizeApproch(raw,now.getTime());
 assert.equal(n.id,'APPROCH-66961');
 assert.equal(n.url,'https://projets-achats.marches-publics.gouv.fr/project/66961');
 assert.equal(n.departments,'04, 05, 13, 83');
 assert.equal(n.deadline,'2026-11-30T23:59:59.000Z');
 assert.match(n.description,/Montant estimé : 5M - 10M€/);
 assert.doesNotMatch(JSON.stringify(n),/Jean Agent/);
 assert.equal(isOfficial(n),true);
});
test('Past, untitled or nationwide projects are handled safely',()=>{
 assert.equal(normalizeApproch({...raw,date_previsionnelle_de_publication:'2026-01-01'},now.getTime()),null);
 assert.equal(normalizeApproch({...raw,libelle:''},now.getTime()),null);
 assert.equal(normalizeApproch({...raw,code:'abc'},now.getTime()),null);
 const national=Array.from({length:95},(_,i)=>String(i+1).padStart(2,'0')).join('|');
 assert.equal(normalizeApproch({...raw,departement_s_d_execution_du_marche:national},now.getTime()).departments,'');
 // Une date limite des offres connue prime sur la date de publication.
 assert.equal(normalizeApproch({...raw,date_cible_de_remise_des_offres:'2027-01-15'},now.getTime()).deadline,'2027-01-15T23:59:59.000Z');
});
test('Query never requests the agent name and sanitizes search terms',()=>{
 const q=approchQuery('espaces "verts") or (1=1','13','2026-11-08');
 assert.doesNotMatch(q.get('select'),/responsable/);
 assert.doesNotMatch(q.get('where'),/"verts"|\(1=1/);
 assert.match(q.get('where'),/like "13"/);
 assert.match(q.get('where'),/date'2026-11-08'/);
 assert.doesNotMatch(approchQuery('nettoyage','13; drop','2026-11-08').toString(),/drop/);
 assert.equal(approchQuery('ab','','2026-11-08'),null);
});
test('APProch fetch maps results and reports HTTP errors',async()=>{
 const items=await queryApproch('espaces verts',{now,fetcher:async()=>({ok:true,json:async()=>({results:[raw]})})});
 assert.equal(items.length,1);
 await assert.rejects(queryApproch('nettoyage',{now,fetcher:async()=>({ok:false,status:503})}),/HTTP 503/);
});
test('APProch alerts keep their source and match trades',()=>{
 const row=qualifyTender(normalizeApproch(raw,now.getTime()),
  {user_id:'00000000-0000-0000-0000-000000000001',sectors:['Espaces verts'],department:'13'},now);
 assert.equal(row.source,'APPROCH');
 assert.equal(row.tender_id,'APPROCH-66961');
 assert.equal(isOfficial({...normalizeApproch(raw,now.getTime()),url:'https://evil.example/project/66961'}),false);
});
test('Watch worker only calls APProch when enabled, and the DB allows the source',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='k';
 delete require.cache[require.resolve('../scripts/watch-sector-tenders')];
 const {run}=require('../scripts/watch-sector-tenders');
 const target=[{user_id:'00000000-0000-0000-0000-000000000001',sectors:['Espaces verts'],department:'13'}];
 const logger={log(){},warn(){}};
 for(const approchEnabled of [false,true]){
  let calls=0;const saved=[];
  await run({boamp:async()=>({items:[]}),ted:async()=>[],approchEnabled,logger,
   approch:async()=>{calls++;return [normalizeApproch(raw,Date.now()-1)].filter(Boolean);},
   store:async(path,opts)=>{if(path.startsWith('rpc/'))return target;saved.push(...JSON.parse(opts.body));return null;}});
  assert.equal(calls>0,approchEnabled);
  if(approchEnabled)assert.ok(saved.every(r=>r.source==='APPROCH'));
 }
 const sql=fs.readFileSync('sql/approch_opportunity_source.sql','utf8');
 assert.match(sql,/'BOAMP','TED','APPROCH'/);
 assert.match(fs.readFileSync('.github/workflows/sector-tender-watch.yml','utf8'),/OFFRYA_APPROCH_ENABLED: \$\{\{ vars\.OFFRYA_APPROCH_ENABLED \}\}/);
});
