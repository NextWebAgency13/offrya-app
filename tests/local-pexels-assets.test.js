'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),pub=path.join(root,'public');
const manifestFile=path.join(pub,'images','manifest.json');
test('Images Pexels locales identiques sans traitement', {skip:!fs.existsSync(manifestFile)},()=>{
 const m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 assert.equal(m.images.length,15);
 assert.equal(m.preserved_original_url_params,true);
 const css=fs.readFileSync(path.join(pub,'public.css'),'utf8');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.doesNotMatch(css,/images\.pexels\.com/);
 for(const photo of m.images){
  assert.match(photo.path,/^\/images\/pexels-\d+-\d+\.jpg$/);
  assert.ok(css.includes(photo.path));
  assert.ok(!css.includes(photo.source_url));
  const bytes=fs.readFileSync(path.join(pub,photo.path));
  assert.equal(bytes.length,photo.size_bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),photo.sha256);
  assert.ok(bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217);
  assert.ok(server.includes(photo.path));
 }
 assert.match(server,/img-src 'self' data:;/);
 const home=fs.readFileSync(path.join(pub,'index.html'),'utf8');
 assert.match(home,/preload" href="\/images\/pexels-34670926-1250\.jpg"/);
});
test('Import Pexels non automatique sur Render',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.doesNotMatch(server,/vendor-pexels-images/);
});

test('Serveur Render : JPEG locaux accessibles en GET/HEAD et cache immuable', {skip:!fs.existsSync(manifestFile)},async()=>{
 const {createServer}=require('node:http');
 const {handle}=require('../server');
 const app=createServer(handle);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.address().port;
 const m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 try{
  for(const photo of m.images){
   const response=await fetch(origin+photo.path);
   assert.equal(response.status,200,photo.path);
   assert.match(response.headers.get('content-type')||'',/image\/jpeg/,photo.path);
   assert.match(response.headers.get('cache-control')||'',/max-age=31536000.*immutable/,photo.path);
   const bytes=Buffer.from(await response.arrayBuffer());
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),photo.sha256,photo.path);
  }
  const wrong=await fetch(origin+'/images/pexels-0-800.jpg');
  assert.equal(wrong.status,404);
 }finally{
  await new Promise(resolve=>app.close(resolve));
 }
});
