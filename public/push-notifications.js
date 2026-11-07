// OFFRYA Android push: permission, consentement mémorisé par compte et inscription vérifiée côté serveur.
// Le bouton ne reste jamais figé : chaque étape réseau a un délai maximal, la configuration est relue
// à chaque vérification (une panne ponctuelle ne la condamne plus) et tout blocage est expliqué à l'écran.
export function createPushNotifications({state,button,status,notify,timeoutMs=8000}){
 let config=null,configLoading=null,busy=false,active=false,inFlight=null,lastCheckedAt=0,retryTimer=null;
 const supported=()=>window.isSecureContext && 'serviceWorker' in navigator &&
  'PushManager' in window && 'Notification' in window;
 // Le choix est conservé sur cet appareil, sans e-mail, jeton ou clé push en stockage local.
 const preferenceKey=id=>'offrya:push:enabled:v1:'+id;
 function preference(id){
  if(!id)return false;
  try{return window.localStorage?.getItem(preferenceKey(id))==='1';}catch(_){return false;}
 }
 function remember(id,enabled){
  if(!id)return;
  try{window.localStorage?.setItem(preferenceKey(id),enabled?'1':'0');}
  catch(error){console.warn('OFFRYA: mémorisation du choix push indisponible',error);}
 }
 // Seuls un navigateur incompatible ou une autorisation refusée désactivent le bouton :
 // dans tous les autres cas il reste utilisable et un appui relance la vérification.
 function update(label,disabled=false){
  if(!button)return;
  button.disabled=disabled;
  button.setAttribute('role','switch');
  button.setAttribute('aria-label',label);
  button.setAttribute('aria-checked',active?'true':'false');
  button.title=label;
 }
 // Tant que tout va bien, la phrase reste réservée aux lecteurs d'écran ; dès qu'un
 // problème empêche l'usage normal du bouton, elle devient visible sous le titre.
 function tell(message,problem=false){
  if(!status)return;
  status.textContent=message;
  status.classList?.toggle('account-screen-reader-only',!problem);
  status.classList?.toggle('push-settings-problem',problem);
 }
 // Aucune étape ne peut bloquer le bouton indéfiniment (redémarrage Render, verrou de session, réseau).
 function limited(work,ms=timeoutMs,label='Le service met trop de temps à répondre. Réessayez dans un instant.'){
  if(typeof setTimeout!=='function')return Promise.resolve(work);
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);});
  return Promise.race([Promise.resolve(work),timeout]).finally(()=>{if(typeof clearTimeout==='function')clearTimeout(timer);});
 }
 function scheduleRetry(delay=20000){
  if(retryTimer||typeof setTimeout!=='function')return;
  retryTimer=setTimeout(()=>{
   retryTimer=null;
   if(busy||(typeof document!=='undefined'&&document.hidden))return;
   refreshStatus({force:true}).catch(()=>{});
  },delay);
  retryTimer?.unref?.();
 }
 async function loadConfig(){
  if(config?.enabled)return config;
  if(!configLoading){
   configLoading=(async()=>{
    try{
     config=await limited((async()=>{
      const response=await fetch('/api/push/config',{cache:'no-store'});
      return response.ok?await response.json():{enabled:false};
     })());
    }catch(error){config={enabled:false};console.warn('OFFRYA: configuration push indisponible',error);}
    return config;
   })().finally(()=>{configLoading=null;});
  }
  return configLoading;
 }
 async function registration(){return limited(navigator.serviceWorker.register('/sw.js',{scope:'/'}));}
 const currentSubscription=reg=>limited(reg.pushManager.getSubscription());
 function vapidBytes(value){
  const binary=atob((value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
 }
 async function account(){
  const result=await limited(state.db?.auth.getSession());
  const session=result?.data?.session;
  return {token:session?.access_token||null,userId:session?.user?.id||null};
 }
 async function api(path,data,token){
  return limited((async()=>{
   const response=await fetch('/api/push/'+path,{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(data),cache:'no-store'
   });
   const parsed=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(parsed.error||'Service de notifications indisponible.');
   return parsed;
  })(),timeoutMs*2);
 }
 async function subscribeDevice(reg,previous,token,userId){
  // La permission déjà accordée et le choix local du même compte permettent
  // de rétablir un abonnement expiré, sans redemander d'autorisation Android.
  const sub=previous||await limited(reg.pushManager.subscribe({
   userVisibleOnly:true,applicationServerKey:vapidBytes(config.publicKey)
  }),timeoutMs*2);
  try{await api('subscribe',{subscription:sub.toJSON()},token);}
  catch(error){
   if(!previous)await sub.unsubscribe().catch(()=>{});
   throw error;
  }
  remember(userId,true);
  active=true;
  update('Désactiver les notifications');
  tell('Appareil enregistré pour ce compte. Les alertes Android sont activées.');
 }
 async function checkStatus(){
  if(!supported()){
   active=false;update('Notifications non compatibles',true);
   tell('Ouvrez OFFRYA dans Chrome sur Android (HTTPS).',true);return;
  }
  const settings=await loadConfig();
  if(!settings?.enabled){
   // Une panne de configuration ne doit ni effacer l'activation mémorisée ni figer le bouton :
   // un appui, le retour sur la page ou la relance automatique refont la vérification.
   active=preference(state.session?.user?.id);
   update('Notifications temporairement indisponibles');
   tell('Le service de notifications ne répond pas pour le moment. Votre choix reste enregistré. Touchez le bouton pour réessayer.',true);
   scheduleRetry();return;
  }
  let token,userId;
  try{({token,userId}=await account());}
  catch(error){
   active=preference(state.session?.user?.id);
   update('Vérification des notifications indisponible');
   tell('Impossible de vérifier votre session pour les notifications. Touchez le bouton pour réessayer.',true);
   scheduleRetry();return;
  }
  if(!token||!userId){
   active=false;update('Reconnectez-vous');
   tell('Une session OFFRYA est nécessaire pour recevoir les notifications. Reconnectez-vous.',true);
   return;
  }
  const wanted=preference(userId);
  // Ne jamais afficher « désactivé » ni figer le bouton pendant une simple vérification réseau.
  active=wanted;
  update('Vérification des notifications…');
  tell('Vérification de votre abonnement Android…');
  if(Notification.permission==='denied'){
   active=false;update('Notifications bloquées',true);
   tell('Les notifications sont bloquées dans Chrome. Autorisez OFFRYA dans les paramètres Android.',true);
   return;
  }
  try{
   const reg=await registration();
   const sub=await currentSubscription(reg);
   if(sub){
    const remote=await api('status',{endpoint:sub.endpoint},token);
    if(remote.registered===true && Notification.permission==='granted'){
     active=true;remember(userId,true);
     update('Désactiver les notifications');
     tell('Appareil enregistré pour ce compte. Les alertes Android fonctionnent même lorsque la page est fermée (selon les réglages du navigateur).');
     return;
    }
    if(remote.registered!==true && wanted && Notification.permission==='granted'){
     await subscribeDevice(reg,sub,token,userId);
     return;
    }
    if(remote.registered!==true && !wanted){
     // Un endpoint existant peut appartenir à un ancien compte Android.
     // Sans consentement du compte courant, arrêter ce push dans le navigateur.
     await sub.unsubscribe();
     active=false;update('Activer les notifications push');
     tell('Aucune notification activée pour ce compte sur cet appareil.');
     return;
    }
   }else if(wanted && Notification.permission==='granted'){
    await subscribeDevice(reg,null,token,userId);
    return;
   }
   active=false;
   update(sub?'Réactiver les notifications push':'Activer les notifications push');
   tell(wanted
    ?'Autorisez les notifications dans Chrome pour reprendre les alertes sur cet appareil.'
    :sub?'Abonnement Chrome présent, mais appareil non enregistré pour ce compte. Appuyez sur Réactiver.'
    :'Aucun appareil enregistré pour ce compte. Activez les notifications sur cet appareil.');
  }catch(error){
   // Une coupure réseau ne révoque pas un consentement déjà confirmé.
   // Le message ne prétend toutefois pas que les push sont bien livrés.
   active=wanted;
   update(wanted?'Désactiver les notifications':'Réactiver les notifications push');
   tell(wanted
    ?'Notifications activées dans vos préférences, mais leur réception ne peut pas être vérifiée pour le moment.'
    :'Impossible de vérifier l’abonnement côté serveur. Touchez le bouton pour réessayer.',true);
   scheduleRetry();
  }
 }
 async function refreshStatus({force=false}={}){
  if(busy)return;
  if(inFlight)return inFlight;
  if(!force && Date.now()-lastCheckedAt<15000)return;
  lastCheckedAt=Date.now();
  inFlight=limited(checkStatus(),timeoutMs*5,'Vérification trop longue');
  try{await inFlight;}
  catch(error){
   // Filet de sécurité : le bouton ne reste jamais figé sur « Vérification… ».
   update(active?'Désactiver les notifications':'Activer les notifications push');
   tell('La vérification des notifications prend trop de temps. Touchez le bouton pour réessayer.',true);
   scheduleRetry();
  }
  finally{inFlight=null;}
 }
 async function syncExisting(){await refreshStatus();}
 async function disable({silent=false}={}){
  // Une déconnexion supprime l'accès push du compte sur cet appareil, mais
  // ne révoque PAS son choix : une reconnexion pourra rétablir l'abonnement.
  const {token,userId}=await account();
  if(supported()){
   const reg=await registration(),sub=await currentSubscription(reg);
   if(sub){
    if(token)await api('unsubscribe',{endpoint:sub.endpoint},token);
    await sub.unsubscribe();
   }
  }
  if(!silent)remember(userId,false);
  active=false;
  if(!silent)notify('Notifications push désactivées sur cet appareil.');
 }
 async function toggle(){
  if(busy||!supported())return;
  busy=true;update('Mise à jour…',true);
  try{
   if(active){await disable();return;}
   // Ce geste utilisateur seul est autorisé à ouvrir la demande de permission :
   // elle est demandée avant toute attente réseau, pour ne pas perdre le geste.
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted')throw Error('Autorisation refusée dans Chrome.');
   if(inFlight)await inFlight.catch(()=>{});
   // La configuration est relue ici : un échec au chargement de la page n'est plus définitif.
   const settings=await loadConfig();
   if(!settings?.enabled)throw Error('Les notifications sont momentanément indisponibles. Réessayez dans un instant.');
   const {token,userId}=await account();
   if(!token||!userId)throw Error('Reconnectez-vous à OFFRYA.');
   const reg=await registration();
   const previous=await currentSubscription(reg);
   await subscribeDevice(reg,previous,token,userId);
   notify('Notifications Android activées pour ce compte.');
  }catch(error){notify(error.message||'Activation indisponible.');}
  finally{busy=false;await refreshStatus({force:true}).catch(()=>{});}
 }
 async function init(){
  if(!button)return;
  button.addEventListener('click',toggle);
  // Le bouton est utilisable dès l'ouverture de l'écran et affiche tout de suite le choix mémorisé,
  // sans clignotement vers OFF : les vérifications réseau ne peuvent plus le figer.
  if(preference(state.session?.user?.id))active=true;
  update('Vérification des notifications…');
  tell('Vérification de votre abonnement Android…');
  await refreshStatus({force:true}).catch(error=>console.warn('OFFRYA: statut push indisponible',error));
 }
 return {init,disable,syncExisting};
}
