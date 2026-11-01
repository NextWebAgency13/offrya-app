'use strict';
(function(){
 for(const form of document.querySelectorAll('form#missionForm')){
  const select=form.elements.category;
  if(!select)return;
  const update=()=>{
   for(const field of form.querySelectorAll('[data-sector-field]')){
    const allowed=(field.dataset.sectorField||'').split(',');
    field.hidden=!allowed.includes(select.value);
    const input=field.querySelector('input,select');if(field.hidden&&input)input.value='';
   }
  };
  select.addEventListener('change',update);update();
 }
})();