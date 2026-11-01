'use strict';
(async function(){
 const root=document.getElementById('missionCounts');
 if(!root)return;
 function el(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;}
 try{
  const response=await fetch('/api/mission-counts',{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('indisponible');
  const data=await response.json();
  if(!Number.isSafeInteger(data.total)||!Array.isArray(data.sectors)||!Array.isArray(data.departments))throw Error('données invalides');
  root.replaceChildren();
  const total=el('p',data.total.toLocaleString('fr-FR')+' mission'+(data.total===1?'':'s')+' ouverte'+(data.total===1?'':'s')+' actuellement');
  total.className='counts-total';root.append(total);
  const grid=el('div');grid.className='counts-grid';
  for(const [heading,rows] of [['Par secteur',data.sectors],['Par département',data.departments]]){
   const panel=el('div');panel.className='counts-panel';panel.append(el('h3',heading));
   if(!rows.length)panel.append(el('p','Aucune mission ouverte actuellement.'));
   else{
    const ul=el('ul');ul.className='count-list';
    for(const item of rows.slice(0,100)){
     const li=el('li');li.append(el('span',item.name),el('strong',Number(item.count).toLocaleString('fr-FR')));ul.append(li);
    }
    panel.append(ul);
   }
   grid.append(panel);
  }
  root.append(grid);
 }catch{
  root.replaceChildren(el('p','Le décompte des missions n’est pas disponible pour le moment. Aucune statistique estimée n’est affichée.'));
 }
})();
