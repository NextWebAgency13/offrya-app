'use strict';
(async()=>{
 for(const siret of ['30613890001294','55210055400013']){
  const url='https://recherche-entreprises.api.gouv.fr/search?q='+siret+'&per_page=3';
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(12000)});
   const data=await r.json();
   const first=data.results?.[0];
   console.log(JSON.stringify({siret,status:r.status,total:data.total_results,keys:Object.keys(data).slice(0,15),sample:first&&{siren:first.siren,nom_complet:first.nom_complet,nom_raison_sociale:first.nom_raison_sociale,etat_administratif:first.etat_administratif,siege:first.siege,matching_etablissements:first.matching_etablissements?.slice(0,2)}}));
  }catch(err){console.log(JSON.stringify({siret,error:String(err)}));}
 }
})();
