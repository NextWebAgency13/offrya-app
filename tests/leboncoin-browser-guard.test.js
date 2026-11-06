'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {allowedDocument,installBrowserGuard}=require('../lib/leboncoin-browser-guard');
const frame={id:1};
const page={mainFrame:()=>frame};
function request({url='https://www.leboncoin.fr/ad/services/1234567890',type='document',
 navigation=true,redirect=null,activeFrame=frame}={}){
 return {url:()=>url,resourceType:()=>type,isNavigationRequest:()=>navigation,
  redirectedFrom:()=>redirect,frame:()=>activeFrame};
}
test('Only exact top-level HTML documents from permitted source URLs are allowed',()=>{
 assert.equal(allowedDocument(request(),page),true);
 assert.equal(allowedDocument(request({url:'https://www.leboncoin.fr/recherche?category=34&text=cherche'}),page),true);
 assert.equal(allowedDocument(request({url:'https://www.leboncoin.fr/ad/services/1234567890',type:'image'}),page),false);
 assert.equal(allowedDocument(request({url:'https://www.leboncoin.fr/ad/services/1234567890',type:'script'}),page),false);
 assert.equal(allowedDocument(request({url:'https://other.example/ad/services/1234567890'}),page),false);
 assert.equal(allowedDocument(request({url:'https://www.leboncoin.fr/ad/services/1234567890',activeFrame:{id:2}}),page),false);
 assert.equal(allowedDocument(request({navigation:false}),page),false);
 assert.equal(allowedDocument(request({redirect:{}}),page),false);
});
test('Installed guard aborts all images and trackers while allowing a valid document',async()=>{
 const routes=[];
 const mocked={...page,route:async(pattern,cb)=>{assert.equal(pattern,'**/*');routes.push(cb);}};
 assert.equal(await installBrowserGuard(mocked),true);
 const handler=routes[0];
 let action='';
 await handler({request:()=>request({type:'image'}),abort:()=>{action='abort';},continue:()=>{action='continue';}});
 assert.equal(action,'abort');
 await handler({request:()=>request({url:'https://thirdparty.test/track.js',type:'script'}),
  abort:()=>{action='abort';},continue:()=>{action='continue';}});
 assert.equal(action,'abort');
 await handler({request:()=>request(),abort:()=>{action='abort';},continue:()=>{action='continue';}});
 assert.equal(action,'continue');
 await assert.rejects(()=>installBrowserGuard(page),/obligatoire/);
 assert.equal(await installBrowserGuard(page,{allowMock:true}),false);
});
