'use strict';
// A local ClamAV clamd daemon is REQUIRED. No third-party upload is performed.
// Official ClamAV zINSTREAM protocol over a private Unix domain socket.
// Refuse every DCE import if daemon or signatures are unavailable.
const net=require('node:net');
const path=require('node:path');
const {createHash}=require('node:crypto');
const MAX_ARCHIVE=20*1024*1024;
const CHUNK=64*1024;
class DceScanError extends Error{
 constructor(message,status=503){super(message);this.name='DceScanError';this.status=status;}
}
function scanDceArchive(buffer,{socketPath=process.env.DCE_CLAMD_SOCKET,timeoutMs=18000,connector=net.createConnection}={}){
 if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.length>MAX_ARCHIVE)
  return Promise.reject(new DceScanError('Archive DCE non conforme à la limite de 20 Mo.',413));
 if(typeof socketPath!=='string'||!path.isAbsolute(socketPath)||socketPath.length>200)
  return Promise.reject(new DceScanError('Contrôle antivirus obligatoire indisponible : configuration ClamAV manquante.'));
 const sha256=createHash('sha256').update(buffer).digest('hex');
 return new Promise((resolve,reject)=>{
  let socket,finished=false,position=0,received='';
  const fail=(message,status=503)=>finish(new DceScanError(message,status));
  function finish(error,data){
   if(finished)return;finished=true;
   if(socket)socket.destroy();
   if(error)reject(error);else resolve(data);
  }
  try{socket=connector(socketPath);}catch(_){return fail('Contrôle antivirus obligatoire indisponible.');}
  socket.setTimeout(Math.min(30000,Math.max(1000,timeoutMs)));
  socket.on('timeout',()=>fail('Antivirus injoignable (délai dépassé).'));
  socket.on('error',()=>fail('Antivirus injoignable : import bloqué.'));
  socket.on('close',()=>{if(!finished)fail('Contrôle antivirus incomplet : import bloqué.');});
  socket.on('data',data=>{
   received+=data.toString('utf8');
   if(received.length>600)return fail('Réponse antivirus invalide.');
   const sep=received.indexOf('\0');
   if(sep<0)return;
   const response=received.slice(0,sep).trim();
   if(/^stream:\s+OK$/i.test(response))
    return finish(null,{clean:true,sha256,scanner:'ClamAV clamd',verified:true});
   if(/^stream:\s+.+\s+FOUND$/i.test(response))
    return fail('Fichier dangereux détecté par antivirus : import refusé.',422);
   return fail('Antivirus en erreur : import refusé.');
  });
  socket.once('connect',()=>{
   socket.write('zINSTREAM\0',writeChunk);
  });
  function writeChunk(){
   if(finished)return;
   if(position>=buffer.length){
    socket.write(Buffer.alloc(4));
    return;
   }
   const chunk=buffer.subarray(position,Math.min(buffer.length,position+CHUNK));
   position+=chunk.length;
   const prefix=Buffer.alloc(4);prefix.writeUInt32BE(chunk.length,0);
   socket.write(prefix,()=>{
    if(!finished)socket.write(chunk,writeChunk);
   });
  }
 });
}
module.exports={scanDceArchive,DceScanError,MAX_ARCHIVE};
