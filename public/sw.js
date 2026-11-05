/* OFFRYA Push Worker. No offline caching of private pages or conversations. */
'use strict';
self.addEventListener('push',event=>{
 let payload={};
 try{payload=event.data?event.data.json():{};}catch(_){}
 const isTest=payload?.type==='test';
 const title=isTest?'OFFRYA · Test Android':'OFFRYA';
 const options={
  body:isTest?'Test push reçu sur cet appareil.':'Vous avez reçu un nouveau message.',
  icon:'/favicon.svg',
  badge:'/favicon.svg',
  tag:isTest?'offrya-test':'offrya-messages',
  renotify:true,
  data:{url:isTest?'/espace/reglages':'/espace/messagerie'}
 };
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const safe=event.notification.data?.url==='/espace/reglages'?'/espace/reglages':'/espace/messagerie';
 const target=self.location.origin+safe;
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
