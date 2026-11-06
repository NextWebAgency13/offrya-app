'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {scanDceArchive,verifyRecentSignatures}=require('../lib/dce-antivirus');
const {parseTsv,recognizePage}=require('../lib/dce-ocr');
const sample=Buffer.from('PK\x03\x04'+'.'.repeat(512),'binary');
async function fakeClamd(result,callback){
 const socketPath=path.join(os.tmpdir(),'offrya-clamd-'+randomUUID().slice(0,8)+'.sock');
 let packet=Buffer.alloc(0);
 const server=net.createServer(socket=>{
  socket.on('data',data=>{
   packet=Buffer.concat([packet,data]);
   if(packet.subarray(0,10).toString('utf8')!=='zINSTREAM\0')return;
   let pos=10;const chunks=[];
   while(packet.length>=pos+4){
    const size=packet.readUInt32BE(pos);if(size===0){
     if(typeof callback==='function')callback(Buffer.concat(chunks),packet);
     socket.write('stream: '+result+'\0');return;
    }
    if(packet.length<pos+4+size)break;
    chunks.push(packet.subarray(pos+4,pos+4+size));pos+=4+size;
   }
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
 try{return await callback.run(socketPath);}
 finally{await new Promise(resolve=>server.close(resolve));await fs.rm(socketPath,{force:true}).catch(()=>{});}
}
test('No local ClamAV socket blocks every raw DCE import',async()=>{
 await assert.rejects(scanDceArchive(sample,{socketPath:''}),/antivirus obligatoire/i);
 await assert.rejects(scanDceArchive(sample,{socketPath:'/tmp/offrya-clamd-not-existing.sock'}),/Antivirus injoignable/i);
});
test('Official ClamAV stream framing sends binary content and checks explicit OK',async()=>{
 let scanned=null;
 await fakeClamd('OK',Object.assign(data=>{scanned=data},{run:async socketPath=>{
  const result=await scanDceArchive(sample,{socketPath,timeoutMs:1000,signatureCheck:async()=>true});
  assert.equal(result.clean,true);assert.equal(result.verified,true);
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
 }}));
 assert.deepEqual(scanned,sample);
});
test('Virus signature detections, errors and invalid replies fail closed',async()=>{
 for(const response of ['Eicar-Test-Signature FOUND','ERROR','WRONG ANSWER']){
  await fakeClamd(response,{run:socketPath=>assert.rejects(scanDceArchive(sample,{socketPath,signatureCheck:async()=>true}),
   error=>error.status===422||error.status===503)});
 }
});
test('OCR TSV confidence is explicitly estimated; malformed/empty images rejected',async()=>{
 const tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
 +'5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t85\tCritères\n'
 +'5\t1\t1\t1\t1\t2\t10\t0\t5\t5\t65\td’attribution\n';
 const result=parseTsv(tsv);
 assert.equal(result.confidence,75);
 assert.equal(result.text,'Critères d’attribution');
 await assert.rejects(recognizePage(Buffer.alloc(0)),/Image OCR/);
});
test('Scanner precedes any ZIP parser or OCR worker; server checks Premium first',()=>{
 const server=require('node:fs').readFileSync('server.js','utf8');
 const route=server.slice(server.indexOf("if(p==='/api/pro/dce/import')"),server.indexOf("if(p==='/api/pro/dce/analyze')"));
 assert.ok(route.indexOf('verifyPremiumAccess')>=0);
 assert.ok(route.indexOf('verifyPremiumAccess')<route.indexOf('scanDceArchive(archive)'));
 assert.ok(route.indexOf('scanDceArchive(archive)')<route.indexOf('analyzeDceInWorker(archive)'));
 assert.match(server,/DCE_OCR_ENABLED==='true'/);
 assert.doesNotMatch(route,/service_role/);
});

test('Scanned OCR text cannot alone establish a definitive financial exclusion',()=>{
 const {analyzeDce}=require('../lib/dce-evidence');
 const scanned=analyzeDce({documents:[{name:'RC-scan.pdf',pages:[{page:2,kind:'page',
  ocr:true,ocr_confidence:77,text:'Chiffre d’affaires annuel minimum de 500 000 €.'}]}],
  company:{turnover_eur:90000,turnover_confirmed:true}});
 assert.equal(scanned.go_no_go.verdict,'A_VERIFIER');
 assert.equal(scanned.go_no_go.turnover_requirement,null);
 assert.equal(scanned.facts[0].source.ocr,true);
 assert.match(scanned.facts[0].confidence,/OCR incertain/);
});


test('ClamAV blocks archives when daily signatures are absent or older than 72 hours',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offrya-av-test-'));
 try{
  await assert.rejects(verifyRecentSignatures(dir),/daily absentes/);
  const file=path.join(dir,'daily.cld');
  await fs.writeFile(file,Buffer.alloc(100001));
  await fs.utimes(file,new Date(Date.now()-4*86400000),new Date(Date.now()-4*86400000));
  await assert.rejects(verifyRecentSignatures(dir),/trop anciennes/);
  await fs.utimes(file,new Date(),new Date());
  assert.equal(await verifyRecentSignatures(dir),true);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
