'use strict';
// DCE ZIP intake. Documents never leave this process or get persisted.
// Explicitly NOT an antivirus or an OCR service. Run only in a worker thread.
const yauzl=require('yauzl');
const {createHash}=require('node:crypto');
const {analyzeDce}=require('./dce-evidence');
const MAX_ZIP=20*1024*1024;
const MAX_ENTRIES=80;
const MAX_DOCUMENTS=12;
const MAX_FILE=8*1024*1024;
const MAX_TOTAL=36*1024*1024;
const MAX_PDF_PAGES=25;
const MAX_PAGES_TOTAL=80;
const ALLOWED=new Set(['.pdf','.docx','.xlsx','.txt']);
class DceImportError extends Error {
 constructor(message,status=422){super(message);this.name='DceImportError';this.status=status;}
}
const ext=s=>String(s).toLowerCase().match(/\.[^.]+$/)?.[0]||'';
function validateZipPath(path){
 if(typeof path!=='string'||!path||path.length>240||path.includes('\\')||path.startsWith('/')||
  /^[a-z]:/i.test(path)||path.split('/').some((x,i,a)=>x==='..'||(x===''&&i<a.length-1))||
  /[\x00-\x1f\x7f]/.test(path))throw new DceImportError('Le ZIP contient un chemin non autorisé.');
 return path;
}
function skipName(name){return name.startsWith('__MACOSX/')||name.split('/').some(s=>s.startsWith('.')||s==='');}
function readEntry(zip,entry,cap){
 return new Promise((resolve,reject)=>{
  zip.openReadStream(entry,(error,stream)=>{
   if(error)return reject(error);
   const chunks=[];let size=0,done=false;
   stream.on('data',piece=>{
    size+=piece.length;
    if(size>cap){done=true;stream.destroy(new DceImportError('Un fichier extrait dépasse la limite autorisée.'));}
    else chunks.push(piece);
   });
   stream.on('error',reject);
   stream.on('end',()=>{if(!done)resolve(Buffer.concat(chunks,size));});
  });
 });
}
function walkZip(buffer,callback,{inner=false}={}){
 return new Promise((resolve,reject)=>{
  let zip,completed=false,count=0,total=0,regular=0;
  const fail=err=>{
   if(completed)return;
   completed=true;
   if(zip)zip.close();
   reject(err instanceof DceImportError?err:new DceImportError('Archive ZIP invalide ou corrompue.'));
  };
  yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},
   (error,opened)=>{
    if(error)return fail(error);
    if(completed){opened.close();return;}
    zip=opened;
    zip.on('error',fail);
    zip.on('end',()=>{if(!completed){completed=true;zip.close();resolve({entries:count,files:regular,bytes:total});}});
    zip.on('entry',async entry=>{
     if(completed)return;
     try{
      count++;
      if(count>(inner?220:MAX_ENTRIES))throw new DceImportError('Nombre de fichiers excessif dans le ZIP.');
      const name=validateZipPath(entry.fileName);
      const mode=(entry.externalFileAttributes>>>16)&0o170000;
      if(mode===0o120000)throw new DceImportError('Les liens symboliques sont interdits.');
      if(name.endsWith('/')){zip.readEntry();return;}
      regular++;
      const size=entry.uncompressedSize,compressed=entry.compressedSize;
      if(!Number.isSafeInteger(size)||size<0||size>(inner?15*1024*1024:MAX_FILE))
       throw new DceImportError('Un fichier extrait dépasse la taille autorisée.');
      total+=size;
      if(total>(inner?32*1024*1024:MAX_TOTAL))throw new DceImportError('Volume décompressé trop important.');
      if(size>256*1024&&size/Math.max(1,compressed)>200)
       throw new DceImportError('Taux de compression anormal (ZIP potentiellement dangereux).');
      if(entry.isEncrypted?.()||entry.generalPurposeBitFlag&1)
       throw new DceImportError('Les fichiers ZIP chiffrés ne sont pas pris en charge.');
      if(inner){
       if(/(?:^|\/)(?:vbaProject\.bin|embeddings\/|externalLinks\/)/i.test(name))
        throw new DceImportError('Les macros, objets incorporés et liens externes ne sont pas acceptés.');
      }else if(!skipName(name)){
       await callback(entry,()=>readEntry(zip,entry,MAX_FILE));
      }
      if(!completed)zip.readEntry();
     }catch(e){fail(e);}
    });
    zip.readEntry();
   });
 });
}
function displayName(name){
 return name.split('/').filter(Boolean).join(' · ').slice(0,120);
}
async function extractPdf(buffer,name,limits,warnings){
 if(buffer.subarray(0,5).toString('ascii')!=='%PDF-')throw new DceImportError('Signature PDF invalide : '+name);
 const {PDFParse}=require('pdf-parse');
 const parser=new PDFParse({data:new Uint8Array(buffer)});
 try{
  const info=await parser.getInfo();
  const total=Math.min(Number(info.total)||0,MAX_PDF_PAGES,MAX_PAGES_TOTAL-limits.pages);
  if(!total){warnings.push(name+' : aucune page PDF analysable.');return null;}
  if(info.total>total)warnings.push(name+' : analyse partielle ('+total+'/'+info.total+' pages).');
  const pages=[];
  for(let n=1;n<=total;n++){
   const result=await parser.getText({partial:[n]});
   const text=String(result.text||'').slice(0,12000);
   if(text.trim().length<25)warnings.push(name+' : page '+n+' sans texte exploitable (OCR nécessaire).');
   pages.push({page:n,text,kind:'page'});
  }
  limits.pages+=pages.length;
  return {name,pages};
 }finally{await parser.destroy();}
}
async function extractDocx(buffer,name,warnings){
 await walkZip(buffer,async()=>{}, {inner:true});
 const mammoth=require('mammoth');
 const data=await mammoth.extractRawText({buffer});
 const text=String(data.value||'').slice(0,12000);
 if(!text.trim())warnings.push(name+' : document Word sans texte exploitable.');
 warnings.push(name+' : fichier Word sans pagination fixe ; référence à la section 1.');
 return {name,pages:[{page:1,text,kind:'section'}]};
}
function valueText(v){
 if(v==null)return '';
 if(typeof v==='object'){
  if(v.formula||v.sharedFormula)return '[Formule non évaluée]';
  if(v.richText)return v.richText.map(x=>x.text||'').join('');
  if(v.text)return String(v.text);
  if(v.result!==undefined)return '[Résultat de formule non validé]';
  return '';
 }
 return String(v);
}
async function extractXlsx(buffer,name,warnings){
 await walkZip(buffer,async()=>{}, {inner:true});
 const ExcelJS=require('exceljs');
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(buffer,{ignoreNodes:['dataValidations','conditionalFormatting','extLst']});
 const pages=[];
 for(const sheet of workbook.worksheets.slice(0,Math.min(10,MAX_PDF_PAGES))){
  const rows=[];
  sheet.eachRow((row,number)=>{
   if(rows.length>=200||rows.join('').length>=11000)return;
   const cells=[];
   row.eachCell({includeEmpty:false},(cell,col)=>{
    if(cells.length>=25)return;
    const value=valueText(cell.value).replace(/[\r\n]+/g,' ').slice(0,240);
    if(value)cells.push(col+': '+value);
   });
   if(cells.length)rows.push('Ligne '+number+' : '+cells.join(' | '));
  });
  const short=sheet.name.slice(0,40);
  pages.push({page:pages.length+1,text:('Feuille '+short+'\n'+rows.join('\n')).slice(0,12000),kind:'sheet',sheet:short});
 }
 if(workbook.worksheets.length>pages.length)warnings.push(name+' : certaines feuilles de calcul non analysées.');
 warnings.push(name+' : classeur Excel : numéros de page = numéros de feuille ; formules et montants à vérifier.');
 return {name,pages};
}
async function importDceZip(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.length>MAX_ZIP)
  throw new DceImportError('Le ZIP doit peser au maximum 20 Mo.',413);
 if(buffer.subarray(0,4).toString('hex')!=='504b0304'&&buffer.subarray(0,4).toString('hex')!=='504b0506')
  throw new DceImportError('Le fichier fourni n’est pas une archive ZIP.');
 const documents=[],warnings=[],limits={pages:0},names=new Set();let eligible=0;
 const digest=createHash('sha256').update(buffer).digest('hex');
 await walkZip(buffer,async (entry,read)=>{
  const name=displayName(entry.fileName),extension=ext(name);
  if(!ALLOWED.has(extension)){
   if(/\.(?:zip|rar|7z|tar|gz|exe|dll|js|bat|cmd|vbs|ps1|msi|xlsm|docm)$/i.test(name))
    throw new DceImportError('Archive imbriquée, macro ou fichier exécutable interdit : '+name);
   warnings.push(name+' : format non pris en charge, ignoré.');
   return;
  }
  if(++eligible>MAX_DOCUMENTS)throw new DceImportError('Le DCE contient plus de 12 documents compatibles.');
  if(names.has(name.toLowerCase()))throw new DceImportError('Deux fichiers du ZIP portent le même nom visible.');
  names.add(name.toLowerCase());
  if(limits.pages>=MAX_PAGES_TOTAL){
   warnings.push(name+' : quota de pages atteint, document non analysé.');
   return;
  }
  const data=await read();
  let doc;
  try{
   if(extension==='.pdf')doc=await extractPdf(data,name,limits,warnings);
   else if(extension==='.docx')doc=await extractDocx(data,name,warnings);
   else if(extension==='.xlsx')doc=await extractXlsx(data,name,warnings);
   else {
    const text=data.toString('utf8').slice(0,12000);
    doc={name,pages:[{page:1,text,kind:'section'}]};
    warnings.push(name+' : texte brut non paginé.');
   }
  }catch(error){
   if(error instanceof DceImportError)throw error;
   warnings.push(name+' : extraction impossible, fichier à vérifier manuellement.');
  }
  if(doc?.pages?.length){
   if(doc.pages.length>MAX_PAGES_TOTAL-limits.pages){
    doc.pages=doc.pages.slice(0,MAX_PAGES_TOTAL-limits.pages);
    warnings.push(name+' : contenu tronqué au quota de pages.');
   }
   if(extension!=='.pdf')limits.pages+=doc.pages.length;
   documents.push(doc);
  }
 });
 if(!documents.length)throw new DceImportError('Aucun document lisible : importer un ZIP contenant PDF, DOCX, XLSX ou TXT.');
 let budget=160000;
 for(const document of documents)for(const page of document.pages){
  if(page.text.length>budget){page.text=page.text.slice(0,budget);warnings.push(document.name+' : texte tronqué au plafond global d’analyse.');}
  budget=Math.max(0,budget-page.text.length);
 }
 const result=analyzeDce({documents});
 return {...result,archive:{sha256:digest,document_count:documents.length},
  warnings,ocr_available:false,stored:false,
  uncertainties:[...result.uncertainties,'Documents scannés sans texte et fichiers non pris en charge nécessitent une vérification manuelle.']};
}
module.exports={importDceZip,DceImportError,validateZipPath,walkZip,MAX_ZIP};
