// En-tête des pages publiques : « Se connecter » pour un visiteur, « Mon espace »
// quand une session OFFRYA existe déjà sur cet appareil (même règle que l'accueil).
// Aucune donnée n'est lue ni envoyée : seule la présence d'une session locale compte.
(()=>{
 const link=document.querySelector('.account-link');if(!link)return;
 let signedIn=false;
 try{
  for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i)||'';
   if(/^sb-[a-z0-9]+-auth-token$/i.test(key)&&localStorage.getItem(key)){signedIn=true;break;}
  }
 }catch(_){}
 const label=link.lastChild;
 if(signedIn){
  link.href='/espace';link.setAttribute('aria-label','Accéder à Mon espace');
  if(label&&label.nodeType===3)label.textContent=' Mon espace';
 }else{
  link.href='/connexion?next='+encodeURIComponent('/espace');link.setAttribute('aria-label','Se connecter');
  if(label&&label.nodeType===3)label.textContent=' Se connecter';
 }
})();
