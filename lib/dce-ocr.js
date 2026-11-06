'use strict';
// Optional offline OCR backend for pages without a PDF text layer.
// Requires an installed local /usr/bin/tesseract and fra language files.
// No cloud API, OCR cannot make factual statements authoritative.
const {spawn}=require('node:child_process');
const MAX_IMAGE_BYTES=4*1024*1024;
const MAX_RESULT_BYTES=360*1024;
function parseTsv(tsv){
 const lines=String(tsv).split(/\r?\n/);const words=[],scores=[];
 for(const line of lines.slice(1,20000)){
  const cols=line.split('\t');
  if(cols.length<12||cols[0]!=='5')continue;
  const word=cols.slice(11).join('\t').trim();
  const score=Number(cols[10]);
  if(!word||!Number.isFinite(score)||score<0)continue;
  words.push(word.slice(0,100));scores.push(score);
  if(words.join(' ').length>12000)break;
 }
 const confidence=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
 return {text:words.join(' ').slice(0,12000),confidence,wordCount:words.length};
}
function recognizePage(image,{binary='/usr/bin/tesseract',language='fra',timeoutMs=9500,launcher=spawn}={}){
 if(!Buffer.isBuffer(image)||image.length<100||image.length>MAX_IMAGE_BYTES)
  return Promise.reject(new Error('Image OCR hors limite de taille.'));
 if(binary!=='/usr/bin/tesseract'||language!=='fra')
  return Promise.reject(new Error('Binaire OCR ou langue non autorisés.'));
 return new Promise((resolve,reject)=>{
  let child,settled=false,size=0;const chunks=[];
  const finish=(error,result)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   if(error){if(child)child.kill('SIGKILL');reject(error);}else resolve(result);
  };
  const timer=setTimeout(()=>finish(new Error('OCR : délai dépassé.')),Math.max(1000,Math.min(12000,timeoutMs)));
  try{
   child=launcher(binary,['stdin','stdout','-l',language,'--psm','3','tsv'],
    {stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',HOME:'/tmp',OMP_THREAD_LIMIT:'1'}});
  }catch(_){return finish(new Error('OCR local indisponible.'));}
  child.once('error',()=>finish(new Error('OCR local indisponible.')));
  child.stdout.on('data',part=>{
   size+=part.length;
   if(size>MAX_RESULT_BYTES)return finish(new Error('Réponse OCR trop volumineuse.'));
   chunks.push(part);
  });
  // Consume and intentionally discard stderr: it may include document content.
  child.stderr.on('data',()=>{});
  child.on('close',code=>{
   if(code!==0)return finish(new Error('OCR local échoué (données à contrôler manuellement).'));
   const result=parseTsv(Buffer.concat(chunks).toString('utf8'));
   if(!result.wordCount)return finish(new Error('Aucun texte OCR exploitable.'));
   return finish(null,result);
  });
  child.stdin.on('error',()=>{});
  child.stdin.end(image);
 });
}
module.exports={recognizePage,parseTsv,MAX_IMAGE_BYTES};
