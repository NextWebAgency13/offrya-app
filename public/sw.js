/* OFFRYA Push Worker. No offline caching of private pages or conversations. */
'use strict';
self.addEventListener('push',event=>{
 let payload={};
 try{payload=event.data?event.data.json():{};}catch(_){}
 const title='OFFRYA';
 const options={
  body:'Vous avez reçu un nouveau message.',
  icon:'/favicon.svg',
  badge:'/favicon.svg',
  tag:'offrya-messages',
  renotify:true,
  data:{url:'/espace/messagerie'}
 };
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=self.location.origin+'/espace/messagerie';
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.startsWith(self.location.origin+'/espace'));
  if(existing){
   await existing.navigate(target);
   return existing.focus();
  }
  return self.clients.openWindow(target);
 })());
});
