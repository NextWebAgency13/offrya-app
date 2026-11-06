'use strict';
const {workerData,parentPort}=require('node:worker_threads');
const {importDceZip,DceImportError}=require('./dce-import');
if(parentPort){
 importDceZip(Buffer.from(workerData.archive||workerData),{ocrEnabled:workerData.ocrEnabled===true}).then(
  result=>parentPort.postMessage({ok:true,result}),
  error=>parentPort.postMessage({
   ok:false,status:error instanceof DceImportError?error.status:422,
   error:error instanceof DceImportError?error.message:'Document illisible ou extraction impossible.'
  })
 );
}
