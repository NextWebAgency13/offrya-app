'use strict';
// Isolated EICAR signature protocol test on CI's REAL clamd; never uploads to users.
// EICAR is a harmless antivirus test string, not executable malware.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {scanDceArchive,verifyRecentSignatures}=require('../lib/dce-antivirus');
const run=promisify(execFile);
const eicar='X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
async function main(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offrya-clamd-real-'));
 try{
  if((await verifyRecentSignatures(process.env.DCE_CLAMDB_DIR))!==true)
   throw Error('ClamAV signature freshness failed.');
  const benign=path.join(dir,'benign.txt'),danger=path.join(dir,'eicar.txt');
  await fs.writeFile(benign,'DCE TEST : document administratif sans donnée client',{mode:0o600});
  await fs.writeFile(danger,eicar,{mode:0o600});
  const a=path.join(dir,'benign.zip'),b=path.join(dir,'infected.zip');
  await run('zip',['-q','-j','-X',a,benign],{timeout:10000});
  await run('zip',['-q','-j','-X',b,danger],{timeout:10000});
  const scanned=await scanDceArchive(await fs.readFile(a));
  if(scanned.clean!==true||scanned.scanner!=='ClamAV clamd')
   throw Error('Benign archive not approved by real clamd');
  let found=false;
  try{await scanDceArchive(await fs.readFile(b));}
  catch(error){
   if(error.status===422&&/dangereux détecté/.test(error.message))found=true;
   else throw error;
  }
  if(!found)throw Error('Real ClamAV failed to detect EICAR inside ZIP archive');
  console.log('OFFRYA REAL CLAMAV '+JSON.stringify({
   daemon:'clamd',clean_zip:'OK',eicar_in_zip:'FOUND',signature_freshness:'OK',
   socket:'Unix local',user_data_uploaded:false}));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
if(require.main===module)main().catch(e=>{console.error('REAL CLAMAV: '+e.message);process.exitCode=1;});
module.exports={main};
