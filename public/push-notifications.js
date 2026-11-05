// OFFRYA Android push: browser permission + actual account-specific server registration.
export function createPushNotifications({state,button,status,notify}){
 let config=null,busy=false,active=false;
 const supported=()=>window.isSecureContext && 'serviceWorker' in navigator &&
  'PushManager' in window && 'Notification' in window;
 function update(label,disabled=false){
  if(button){
   // A switch must retain its visible thumb and expose the REAL server state.
   // Never present an active subscription as off or a failed check as on.
   button.disabled=disabled;
   button.setAttribute('role','switch');
   button.setAttribute('aria-label',label);
   button.setAttribute('aria-checked',active?'true':'false');
   button.title=label;
  }
 }
 function tell(message){if(status)status.textContent=message;}
 async function registration(){return navigator.serviceWorker.register('/sw.js',{scope:'/'});}
 function vapidBytes(value){
  const binary=atob((value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
 }
 async function sessionToken(){
  const result=await state.db?.auth.getSession();
  return result?.data?.session?.access_token||null;
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
 async function refreshStatus(){
  active=false;
  if(!supported()){update('Notifications non compatibles',true);tell('Ouvrez OFFRYA dans Chrome sur Android (HTTPS).');return;}
  if(!config?.enabled){update('Notifications indisponibles',true);tell('Le service push est temporairement indisponible.');return;}
  if(Notification.permission==='denied'){
   update('Notifications bloquées',true);
   tell('Autorisez les notifications du site OFFRYA dans les paramètres de Chrome.');
   return;
  }
  const reg=await registration();
  const sub=await reg.pushManager.getSubscription();
  if(!sub){
   update('Activer les notifications push');
   tell('Aucun appareil enregistré pour ce compte. Activez les notifications sur cet appareil.');
   return;
  }
  const token=await sessionToken();
  if(!token){update('Reconnectez-vous',true);tell('Une session OFFRYA est nécessaire pour recevoir les notifications.');return;}
  try{
   const remote=await api('status',{endpoint:sub.endpoint},token);
   active=remote.registered===true;
   update(active?'Désactiver les notifications':'Réactiver les notifications push');
   tell(active
    ?'Appareil enregistré pour ce compte. Les alertes Android fonctionnent même lorsque la page est fermée (selon les réglages du navigateur).'
    :'Abonnement Chrome présent, mais appareil non enregistré pour ce compte. Appuyez sur Réactiver.');
  }catch(error){
   update('Réactiver les notifications push');
   tell('Impossible de vérifier l’abonnement côté serveur. Vous pouvez tenter de le réactiver.');
  }
 }
 async function syncExisting(){
  // Never silently assign an existing browser endpoint to another signed-in account.
  await refreshStatus();
 }
 async function disable({silent=false}={}){
  if(!supported())return;
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(!sub)return;
  const token=await sessionToken();
  if(token)await api('unsubscribe',{endpoint:sub.endpoint},token);
  await sub.unsubscribe();
  active=false;
  if(!silent){notify('Notifications push désactivées sur cet appareil.');await refreshStatus();}
 }
 async function toggle(){
  if(busy||!supported()||!config?.enabled)return;
  busy=true;update('Mise à jour…',true);
  try{
   if(active){await disable();return;}
   // Permission must be requested as part of the direct user tap.
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted')throw Error('Autorisation refusée dans Chrome.');
   const token=await sessionToken();
   if(!token)throw Error('Reconnectez-vous à OFFRYA.');
   const reg=await registration();
   const previous=await reg.pushManager.getSubscription();
   const sub=previous||await reg.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:vapidBytes(config.publicKey)
   });
   try{await api('subscribe',{subscription:sub.toJSON()},token);}
   catch(error){
    if(!previous)await sub.unsubscribe().catch(()=>{});
    throw error;
   }
   notify('Notifications Android activées pour ce compte.');
  }catch(error){notify(error.message||'Activation indisponible.');}
  finally{busy=false;await refreshStatus().catch(()=>{});}
 }
 async function init(){
  if(!button)return;
  button.addEventListener('click',toggle);
  if(!supported()){await refreshStatus();return;}
  try{
   const response=await fetch('/api/push/config',{cache:'no-store'});
   config=response.ok?await response.json():{enabled:false};
  }catch(error){config={enabled:false};console.warn('OFFRYA: configuration push indisponible',error);}
  await refreshStatus().catch(error=>console.warn('OFFRYA: statut push indisponible',error));
 }
 return {init,disable,syncExisting};
}
