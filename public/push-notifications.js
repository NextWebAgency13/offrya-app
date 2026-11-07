// OFFRYA Android push: permission, consentement mémorisé par compte et inscription vérifiée côté serveur.
export function createPushNotifications({state,button,status,notify}){
 let config=null,busy=false,active=false,inFlight=null,lastCheckedAt=0;
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
 function update(label,disabled=false){
  if(!button)return;
  button.disabled=disabled;
  button.setAttribute('role','switch');
  button.setAttribute('aria-label',label);
  button.setAttribute('aria-checked',active?'true':'false');
  button.title=label;
 }
 function tell(message){if(status)status.textContent=message;}
 async function registration(){return navigator.serviceWorker.register('/sw.js',{scope:'/'});}
 function vapidBytes(value){
  const binary=atob((value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
 }
 async function account(){
  const result=await state.db?.auth.getSession();
  const session=result?.data?.session;
  return {token:session?.access_token||null,userId:session?.user?.id||null};
 }
 async function api(path,data,token){
  const response=await fetch('/api/push/'+path,{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(data),cache:'no-store'
  });
  const parsed=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(parsed.error||'Service de notifications indisponible.');
  return parsed;
 }
 async function subscribeDevice(reg,previous,token,userId){
  // La permission déjà accordée et le choix local du même compte permettent
  // de rétablir un abonnement expiré, sans redemander d'autorisation Android.
  const sub=previous||await reg.pushManager.subscribe({
   userVisibleOnly:true,applicationServerKey:vapidBytes(config.publicKey)
  });
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
   tell('Ouvrez OFFRYA dans Chrome sur Android (HTTPS).');return;
  }
  if(!config?.enabled){
   active=false;update('Notifications indisponibles',true);
   tell('Le service push est temporairement indisponible.');return;
  }
  let token,userId;
  try{({token,userId}=await account());}
  catch(error){
   active=preference(state.session?.user?.id);
   update('Vérification des notifications indisponible',true);
   tell('Impossible de vérifier votre session pour les notifications.');return;
  }
  if(!token||!userId){
   active=false;update('Reconnectez-vous',true);
   tell('Une session OFFRYA est nécessaire pour recevoir les notifications.');return;
  }
  const wanted=preference(userId);
  // Ne jamais afficher « désactivé » pendant une simple vérification réseau.
  active=wanted;
  update('Vérification des notifications…',true);
  tell('Vérification de votre abonnement Android…');
  if(Notification.permission==='denied'){
   active=false;update('Notifications bloquées',true);
   tell('Les notifications sont bloquées dans Chrome. Autorisez OFFRYA dans les paramètres Android.');
   return;
  }
  try{
   const reg=await registration();
   const sub=await reg.pushManager.getSubscription();
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
    :'Impossible de vérifier l’abonnement côté serveur. Vous pouvez tenter de le réactiver.');
  }
 }
 async function refreshStatus({force=false}={}){
  if(busy)return;
  if(inFlight)return inFlight;
  if(!force && Date.now()-lastCheckedAt<15000)return;
  lastCheckedAt=Date.now();
  inFlight=checkStatus();
  try{await inFlight;}finally{inFlight=null;}
 }
 async function syncExisting(){await refreshStatus();}
 async function disable({silent=false}={}){
  // Une déconnexion supprime l'accès push du compte sur cet appareil, mais
  // ne révoque PAS son choix : une reconnexion pourra rétablir l'abonnement.
  const {token,userId}=await account();
  if(supported()){
   const reg=await registration(),sub=await reg.pushManager.getSubscription();
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
  if(busy||inFlight||!supported()||!config?.enabled)return;
  busy=true;update('Mise à jour…',true);
  try{
   if(active){await disable();return;}
   // Ce geste utilisateur seul est autorisé à ouvrir la demande de permission.
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted')throw Error('Autorisation refusée dans Chrome.');
   const {token,userId}=await account();
   if(!token||!userId)throw Error('Reconnectez-vous à OFFRYA.');
   const reg=await registration();
   const previous=await reg.pushManager.getSubscription();
   await subscribeDevice(reg,previous,token,userId);
   notify('Notifications Android activées pour ce compte.');
  }catch(error){notify(error.message||'Activation indisponible.');}
  finally{busy=false;await refreshStatus({force:true}).catch(()=>{});}
 }
 async function init(){
  if(!button)return;
  button.addEventListener('click',toggle);
  if(!supported()){await refreshStatus({force:true});return;}
  try{
   const response=await fetch('/api/push/config',{cache:'no-store'});
   config=response.ok?await response.json():{enabled:false};
  }catch(error){config={enabled:false};console.warn('OFFRYA: configuration push indisponible',error);}
  await refreshStatus({force:true}).catch(error=>console.warn('OFFRYA: statut push indisponible',error));
 }
 return {init,disable,syncExisting};
}
