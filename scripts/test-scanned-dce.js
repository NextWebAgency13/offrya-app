'use strict';
// On-the-fly scan of a REAL public consultation PDF page, never stored in Git.
// Re-renders the original page as a raster-only PDF and checks offline French OCR.
const {PDFParse}=require('pdf-parse');
const {PDFDocument}=require('pdf-lib');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {importDceZip}=require('../lib/dce-import');
const run=promisify(execFile);
const RC='https://www.coupvray.fr/wp-content/uploads/2025/05/01ST2025_RC.pdf';
async function main(fetcher=fetch){
 const check=await run('/usr/bin/tesseract',['--list-langs'],{timeout:10000});
 if(!/\bfra\b/.test(check.stdout))throw Error('Tesseract FR language pack not installed');
 const response=await fetcher(RC,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Source réelle RC inaccessible : '+response.status);
 const pdf=Buffer.from(await response.arrayBuffer());
 if(pdf.subarray(0,5).toString('ascii')!=='%PDF-'||pdf.length>8*1024*1024)
  throw Error('Document public RC non conforme');
 const parser=new PDFParse({data:new Uint8Array(pdf)});
 let shot;
 try{
  shot=await parser.getScreenshot({partial:[10],desiredWidth:1100,imageBuffer:true,imageDataUrl:false});
 }finally{await parser.destroy();}
 const data=shot.pages?.[0]?.data;
 if(!data)throw Error('Capture raster de la page réelle impossible.');
 const raster=Buffer.from(data);
 const output=await PDFDocument.create();
 const png=await output.embedPng(raster);
 const page=output.addPage([png.width,png.height]);
 page.drawImage(png,{x:0,y:0,width:png.width,height:png.height});
 const onlyRaster=Buffer.from(await output.save());
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offrya-ocr-scan-'));
 try{
  const name='RC_scanned_original_page_10.pdf';
  const input=path.join(dir,name),zip=path.join(dir,'scan.zip');
  await fs.writeFile(input,onlyRaster,{mode:0o600});
  await run('zip',['-q','-j','-X',zip,input],{timeout:10000});
  const result=await importDceZip(await fs.readFile(zip),{ocrEnabled:true});
  const pages=result.documents[0]?.ocr_pages||0;
  if(pages!==1||result.ocr_available!==true||result.ocr_pages_attempted!==1)
   throw Error('Scanned PDF page not recognized offline or confidence not recorded');
  if(!result.facts.some(f=>f.source?.ocr===true))
   throw Error('OCR text recognized but no attributable RC requirements extracted');
  if(!result.warnings.some(w=>/OCR local/.test(w)))
   throw Error('OCR uncertainty disclosure missing');
  console.log('OFFRYA REAL-PAGE OCR '+JSON.stringify({
   original_source:RC,original_page:10,pages_ocr:pages,
   extracted_signals:result.facts.length,
   verified_citations:result.facts.filter(f=>f.source?.ocr===true).length,
   manual_review_required:result.human_validation_required
  }));
  return result;
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
if(require.main===module&&process.env.OFFRYA_RUN_OCR_SMOKE==='true')main().catch(e=>{console.error('DCE OCR TEST '+e.message);process.exitCode=1;});
module.exports={main};
