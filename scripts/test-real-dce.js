'use strict';
// Two genuine public consultation documents, from the publishing municipality.
// Historical, different procedures: never combine them as one real DCE.
// This is a read-only end-to-end parser smoke test, not republication.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {importDceZip}=require('../lib/dce-import');
const run=promisify(execFile);
const sources=[
 {name:'RC_Coupvray_2025.pdf',url:'https://www.coupvray.fr/wp-content/uploads/2025/05/01ST2025_RC.pdf',expect:'criteria'},
 {name:'CCTP_Coupvray_2022.pdf',url:'https://www.coupvray.fr/wp-content/uploads/2022/09/2022-CCTP.pdf',expect:null}
];
async function main(fetcher=fetch){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offrya-real-dce-'));
 const outcomes=[];
 try{
  for(const item of sources){
   const response=await fetcher(item.url,{headers:{Accept:'application/pdf'},
    signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error('Original PDF inaccessible ('+response.status+'): '+item.name);
   const length=Number(response.headers.get('content-length'));
   if(length>7*1024*1024)throw Error('Original PDF trop volumineux: '+item.name);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>7*1024*1024||bytes.subarray(0,5).toString('ascii')!=='%PDF-')
    throw Error('Réponse non PDF: '+item.name);
   const pdf=path.join(dir,item.name),zip=path.join(dir,item.name+'.zip');
   await fs.writeFile(pdf,bytes,{mode:0o600});
   await run('zip',['-j','-q','-X',zip,pdf],{timeout:12000});
   const extracted=await importDceZip(await fs.readFile(zip));
   if(extracted.documents.length!==1||extracted.documents[0].name!==item.name)
    throw Error('Document réellement extrait manquant: '+item.name);
   if(item.expect&&!extracted.facts.some(f=>f.type===item.expect&&f.source.document===item.name))
    throw Error('Exigence de consultation non citée: '+item.name+' '+item.expect);
   if(extracted.facts.some(f=>!f.source||!Number.isInteger(f.source.page)))
    throw Error('Fait sans page source: '+item.name);
   outcomes.push({document:item.name,bytes:bytes.length,
    pages:extracted.documents[0].pages,exigences:extracted.facts.length,
    pieces:extracted.checklist.length,archive_hash:extracted.archive.sha256.slice(0,14),
    source:item.url});
  }
  console.log('OFFRYA GENUINE DCE TEST '+JSON.stringify(outcomes));
  return outcomes;
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error('REAL DCE '+error.message);process.exitCode=1;});
module.exports={main};
