/* OFFRYA Push Worker: generic notifications, direct access to authorized conversations.
 * No offline caching of private pages, messages or sessions. */
'use strict';
const isUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function pushTarget(details){
 const conversation=isUuid(details?.conversationId)?details.conversationId:null;
 const message=isUuid(details?.messageId)?details.messageId:null;
 const search=new URLSearchParams();
 if(conversation)search.set('conversation',conversation);
 if(conversation&&message)search.set('message',message);
 const url=details?.type==='test'?'/espace/reglages':
  '/espace/messagerie'+(search.size?'?'+search.toString():'');
 return {url,conversationId:conversation,messageId:conversation?message:null};
}
self.addEventListener('push',event=>{
 let payload={};
 try{payload=event.data?event.data.json():{};}catch(_){}
 const isTest=payload?.type==='test';
 const target=pushTarget(payload);
 const options={
  body:isTest?'Test push reçu sur cet appareil.':'Vous avez reçu un nouveau message.',
  icon:'/assets/offrya/android-chrome-192x192.png',
  badge:'/assets/offrya/favicon-48.png',
  tag:isTest?'offrya-test':target.conversationId?'offrya-message-'+target.conversationId:'offrya-messages',
  renotify:true,
  data:target
 };
 event.waitUntil(self.registration.showNotification(isTest?'OFFRYA · Test Android':'OFFRYA',options));
});
self.addEventListener('notificationclick',event=>{
 const detail=pushTarget(event.notification.data||{});
 const target=self.location.origin+detail.url;
 event.waitUntil((async()=>{
  let windows=[];
  try{windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});}
  catch(error){console.warn('OFFRYA: recherche de fenêtres indisponible',error);}
  const existing=windows.find(client=>client.url.startsWith(self.location.origin+'/espace'));
  if(existing){
   // Navigate to the deep link when possible. Some Android Chrome clients
   // reject navigate(): still focus and notify the already-open SPA.
   try{
    const navigated=await existing.navigate(target);
    if(navigated){
     await navigated.focus();
     event.notification.close();
     return;
    }
   }catch(error){console.warn('OFFRYA: navigation push refusée',error);}
   try{
    const focused=await existing.focus();
    (focused||existing).postMessage({
     type:'OFFRYA_PUSH_OPEN',conversationId:detail.conversationId,messageId:detail.messageId
    });
    event.notification.close();
    return;
   }catch(error){console.warn('OFFRYA: activation de fenêtre indisponible',error);}
  }
  // Browser or installed PWA was closed: open a real URL. This path also
  // survives the login redirect without exposing conversation contents.
  try{
   const opened=await self.clients.openWindow(target);
   if(opened){
    if(typeof opened.focus==='function')await opened.focus();
    event.notification.close();
   }
  }catch(error){console.warn('OFFRYA: ouverture de la notification impossible',error);}
 })());
});
