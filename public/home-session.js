// Public landing is for visitors. A confirmed existing account enters /espace.
// getUser checks the account with Supabase instead of trusting local session data.
// Never redirect anonymous/unconfirmed sessions or block the public page on errors.
async function redirectConfirmedAccount(){
 try{
  const response=await fetch('/api/config',{cache:'no-store'});
  if(!response.ok)return;
  const config=await response.json();
  if(!config.supabaseUrl||!config.supabaseKey)return;
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm');
  const db=createClient(config.supabaseUrl,config.supabaseKey);
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session)return;
  const {data:{user},error:userError}=await db.auth.getUser();
  if(userError||!user||user.id!==session.user?.id)return;
  if(user.is_anonymous||!user.email_confirmed_at)return;
  location.replace('/espace');
 }catch(error){
  // Auth outage must not make the public landing inaccessible.
  console.warn('Redirection vers le tableau de bord indisponible');
 }
}
redirectConfirmedAccount();
