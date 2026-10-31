'use strict';
// The only acceptable source for a legal representative is a trusted public
// enterprise registry response, not a name typed into an OFFRYA form.
function norm(v){
 return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
  .replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim();
}
function fullNameMatches(first,last,registryFirst,registryLast){
 const f=norm(first),l=norm(last),rf=norm(registryFirst),rl=norm(registryLast);
 return Boolean(f&&l&&rf&&rl&&f===rf&&l===rl);
}
function declaredNameMatches(declared,first,last){
 const n=norm(declared),a=norm(first),b=norm(last);
 return Boolean(n&&a&&b&&(n===a+' '+b||n===b+' '+a));
}
function parseDirectors(company){
 // API Recherche d'Entreprises: "dirigeants" is the list supplied by RNE.
 // Never assume a shareholder, employee or generic legal entity can represent.
 if(!Array.isArray(company?.dirigeants))return [];
 return company.dirigeants
  .filter(d=>d&&typeof d==='object'&&!d.denomination&&!d.siren)
  .map(d=>({
    first:String(d.prenoms||d.prenom||'').trim(),
    last:String(d.nom||'').trim(),
    function:String(d.qualite||'').trim()
  }))
  .filter(d=>norm(d.first)&&norm(d.last));
}
function compareToDirectors({first,last,declared,representatives}){
 if(!declaredNameMatches(declared,first,last))return false;
 if(!Array.isArray(representatives))return false;
 return representatives.some(d=>fullNameMatches(first,last,d.first,d.last));
}
module.exports={norm,fullNameMatches,declaredNameMatches,parseDirectors,compareToDirectors};
