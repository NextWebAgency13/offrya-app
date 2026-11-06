'use strict';
// Real, historical, one-consultation DCE parts from the public buyer's own website.
// Separate synthetic rectificatif / Q&A files exercise revision tracking; they
// are NOT attributed to the buyer. All bytes live only in a GitHub runner temp dir.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {importDceZip}=require('../lib/dce-import');
const run=promisify(execFile);
const prefix='https://www.coupvray.fr/wp-content/uploads/2026/01/';
const entries=[
 ['RC_01ST2026.pdf','01ST2026_RC.pdf','%PDF-'],
 ['CCAP_01ST2026.pdf','01ST2026_CCAP-communs-a-tous-les-lots.pdf','%PDF-'],
 ['CCTP_Lot1_01ST2026.pdf','01ST2026_CCTP-lot-1.pdf','%PDF-'],
 ['AE_Lot1_01ST2026.docx','01ST2026_AE-lot-01.docx','PK'],
 ['BPU_Lot1_01ST2026.xlsx','4.1-bpu-lot-01.xlsx','PK'],
 ['DQE_Lot1_01ST2026.xlsx','5.1-dqe-lot-01.xlsx','PK']
];
const TOTAL_LIMIT=15*1024*1024;
async function downloadDocument(url,{fetcher=fetch,cap=7*1024*1024}={}){
 const response=await fetcher(url,{headers:{Accept:'application/pdf,application/octet-stream,*/*'},
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Document officiel indisponible: '+url+' HTTP '+response.status);
 if(Number(response.headers.get('content-length'))>cap)throw Error('Document trop volumineux: '+url);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>cap||bytes.length<100)throw Error('Document vide ou volumineux: '+url);
 return bytes;
}
async function main(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offrya-real-whole-dce-'));
 let total=0;const docs=[];
 try{
  for(const [name,urlPart,signature]of entries){
   const buffer=await downloadDocument(prefix+urlPart);
   total+=buffer.length;
   if(total>TOTAL_LIMIT)throw Error('Documents officiels dépassant la limite du test');
   if(!buffer.subarray(0,5).toString('utf8').startsWith(signature))
    throw Error('Signature PDF/Office invalide dans '+name);
   await fs.writeFile(path.join(dir,name),buffer,{mode:0o600});
   docs.push(name);
  }
  const archive=path.join(dir,'original_public_components.zip');
  await run('zip',['-q','-j','-X',archive,...docs.map(x=>path.join(dir,x))],{timeout:12000});
  const original=await importDceZip(await fs.readFile(archive));
  if(original.archive.document_count!==6)throw Error('Le dossier réel n’a pas les six pièces attendues');
  const names=new Set(original.documents.map(d=>d.name));
  for(const file of docs)if(!names.has(file))throw Error('Pièce officielle absente: '+file);
  const sheets=original.facts.filter(f=>f.source?.kind==='sheet');
  if(!original.documents.some(d=>/^BPU/.test(d.name)&&d.pages>0)||
     !original.documents.some(d=>/^DQE/.test(d.name)&&d.pages>0))
    throw Error('BPU ou DQE n’a pas été analysé');
  if(!original.documents.some(d=>d.name.startsWith('AE_')))
    throw Error('Document AE DOCX non reconnu');
  if(!original.facts.some(f=>f.source?.document==='RC_01ST2026.pdf'))
    throw Error('Exigences du RC absentes');
  // Revision test only: the two extra files are NOT issued by the municipality.
  const simulated=[
   ['Rectificatif_SIMULATION_TEST.txt',
    'Rectificatif de TEST — modification du DCE : date limite de remise des offres à contrôler sur la plateforme officielle.'],
   ['Questions_Reponses_SIMULATION_TEST.txt',
    'Réponses aux questions TEST : le bordereau des prix unitaires du lot 1 doit être vérifié.']
  ];
  for(const [name,text]of simulated)await fs.writeFile(path.join(dir,name),text,{mode:0o600});
  const revision=path.join(dir,'revision_simulation.zip');
  await run('zip',['-q','-j','-X',revision,...[...docs,...simulated.map(p=>p[0])]
   .map(x=>path.join(dir,x))],{timeout:12000});
  const updated=await importDceZip(await fs.readFile(revision));
  if(updated.archive.sha256===original.archive.sha256)throw Error('Digest revision inchangé');
  for(const [name]of simulated){
   if(!updated.facts.some(f=>f.type==='amendment'&&f.source?.document===name))
    throw Error('Rectificatif ou question-réponse TEST sans provenance '+name);
  }
  if(updated.archive.document_count!==8)throw Error('Nombre de pièces versionnées incorrect');
  const report={consultation:'01/ST/2026',buyer:'Coupvray',
   real_documents:docs.length,docx_files:1,xlsx_files:2,
   imported_documents:original.archive.document_count,
   simulated_revision_files:simulated.length,revision_detected:true,
   price_files_detected:true,source_documents:docs,
   facts:original.facts.length,checklist:original.checklist.length,
   evidence_cited:original.facts.filter(f=>f.source?.document&&f.source.page>=1).length,
   limited_pages:original.warnings.filter(w=>w.includes('analyse partielle')).length,
   source:'https://www.coupvray.fr/territoire/marches-publics-et-finances/marches/'};
  console.log('OFFRYA SINGLE-CONSULTATION DCE '+JSON.stringify(report));
  return report;
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
if(require.main===module&&process.env.OFFRYA_RUN_FULL_DCE_TEST==='true')
 main().catch(error=>{console.error('OFFRYA FULL DCE TEST: '+error.message);process.exitCode=1;});
module.exports={main};
