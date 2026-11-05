// Android/Web Push: only enabled after a direct click by the account holder.
export function createPushNotifications({state,button,status,notify}){
 let config=null,busy=false;
 const supported=()=>window.isSecureContext && 'serviceWorker' in navigator &&
  'PushManager' in window && 'Notification' in window;
 function update(text,disabled=false){
  if(button){button.textContent=text;button.disabled=disabled;}
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
  if(!response.ok)throw Error(parsed.error||'Enregistrement des notifications indisponible.');
  return parsed;
 }
 async function refreshStatus(){
  if(!supported()){update('Notifications non compatibles',true);tell('Utilisez Chrome sur Android avec une connexion HTTPS.');return;}
  if(!config?.enabled){update('Notifications indisponibles',true);tell('Les notifications push ne sont pas configurées sur le serveur.');return;}
  if(Notification.permission==='denied'){
   update('Notifications bloquées',true);
   tell('Autorisez les notifications OFFRYA dans les paramètres du navigateur Android.');
   return;
  }
  const reg=await registration();
  const active=await reg.pushManager.getSubscription();
  update(active?'Désactiver les notifications':'Activer les notifications push');
  tell(active?'Notifications activées sur cet appareil, même quand OFFRYA est fermé.':
   'Recevez une alerte Android lorsqu’un nouveau message arrive. Aucun aperçu privé.');
 }
 async function syncExisting(){
  if(!supported()||!config?.enabled||!state.session)return;
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(!sub)return;
  const token=await sessionToken();
  if(token)await api('subscribe',{subscription:sub.toJSON()},token);
 }
 async function disable({silent=false}={}){
  if(!supported())return;
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(!sub)return;
  const token=await sessionToken();
  if(token){
   // Server deletion precedes browser unsubscription to prevent ghost pushes.
   await api('unsubscribe',{endpoint:sub.endpoint},token);
  }
  await sub.unsubscribe();
  if(!silent){notify('Notifications push désactivées.');await refreshStatus();}
 }
 async function toggle(){
  if(busy||!supported()||!config?.enabled)return;
  busy=true;update('Mise à jour…',true);
  try{
   const reg=await registration();
   const existing=await reg.pushManager.getSubscription();
   if(existing){await disable();return;}
   // Android requires the permission prompt to come from an explicit click.
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw Error('Autorisation refusée. Activez-la dans Chrome si vous changez d’avis.');
   const token=await sessionToken();
   if(!token)throw Error('Reconnectez-vous pour activer les notifications.');
   const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidBytes(config.publicKey)});
   try{await api('subscribe',{subscription:sub.toJSON()},token);}
   catch(error){await sub.unsubscribe().catch(()=>{});throw error;}
   notify('Notifications Android activées.');
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
   if(config.enabled)await syncExisting();
  }catch(error){config={enabled:false};console.warn('OFFRYA: push non disponible',error);}
  await refreshStatus().catch(error=>console.warn('OFFRYA: état push non disponible',error));
 }
 return {init,disable,syncExisting};
}
