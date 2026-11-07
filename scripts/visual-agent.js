'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('@playwright/test');
const {VIEWPORTS,pathsFromSitemap,slug,score,approvedFix,renderCss,reportMarkdown}=require('../lib/visual-quality');
const root=path.join(__dirname,'..');
const output=path.join(root,'visual-report');
const cssFile=path.join(root,'public','visual-agent-fixes.css');
const base=String(process.env.OFFRYA_VISUAL_BASE_URL||'http://127.0.0.1:4199').replace(/\/$/,'');
const mode=process.argv.includes('--propose')?'propose':'audit';
const aiKey=process.env.OFFRYA_VISUAL_OPENAI_API_KEY||'';
const aiModel=process.env.OFFRYA_VISUAL_MODEL||'gpt-4.1-mini';
const aiLimit=Math.max(0,Math.min(25,Number(process.env.OFFRYA_VISUAL_AI_LIMIT||8)));
const notes=[];
function routes(){
 const xml=fs.readFileSync(path.join(root,'public','sitemap.xml'),'utf8');
 let paths=pathsFromSitemap(xml);
 const authState=process.env.OFFRYA_VISUAL_STATE_FILE;
 if(authState&&process.env.OFFRYA_VISUAL_ALLOW_PRIVATE==='1'){
  if(!fs.existsSync(authState))throw Error('Etat de connexion du compte test introuvable');
  paths.push('/espace','/espace/missions','/espace/messagerie','/espace/marches-publics','/espace/reglages','/espace/professionnel');
  notes.push('Captures privees : ne jamais publier les artefacts ou donner un vrai compte dans un job CI.');
 }
 if(process.env.OFFRYA_VISUAL_ROUTE_FILTER)paths=paths.filter(x=>x.includes(process.env.OFFRYA_VISUAL_ROUTE_FILTER));
 return [...new Set(paths)].slice(0,Math.max(1,Math.min(60,Number(process.env.OFFRYA_VISUAL_MAX_ROUTES||60))));
}
async function inspect(page){
 return page.evaluate(()=>{
  const issues=[],selectorSet=new Set(),width=innerWidth,html=document.documentElement;
  function visible(el){if(!(el instanceof HTMLElement))return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>0&&r.height>0;}
  function selector(el){
   if(el.id&&/^[A-Za-z][\w-]*$/.test(el.id))return '#'+el.id;
   const cls=[...el.classList].find(c=>/^[A-Za-z][\w-]*$/.test(c));
   return cls?'.'+cls:null;
  }
  function issue(severity,type,message,el){
   const s=el?selector(el):null;
   if(s)selectorSet.add(s);
   if(issues.length<90)issues.push({severity,type,message,selector:s});
  }
  if(html.scrollWidth>width+3)issue('high','horizontal-scroll','Page trop large : '+html.scrollWidth+'px pour '+width+'px',document.body);
  const els=[...document.querySelectorAll('body *')].filter(visible);
  for(const el of els){
   if(selectorSet.size>=130)break;
   const s=selector(el),p=el.parentElement?selector(el.parentElement):null;
   if(s)selectorSet.add(s);
   if(s&&p&&selectorSet.size<130)selectorSet.add(p+' '+s);
  }
  for(const el of els){
   if(el.closest('svg,script,style'))continue;
   const r=el.getBoundingClientRect();
   if(r.right>width+5&&r.left<width&&r.width<width*1.6&&issues.filter(i=>i.type==='overflow').length<10)
    issue('medium','overflow','Element '+el.tagName+' deborde de '+Math.round(r.right-width)+'px',el);
  }
  for(const el of els.filter(el=>el.matches('button,a,[role="button"],[role="switch"],input[type="submit"]')).slice(0,220)){
   const r=el.getBoundingClientRect();
   if((r.height<40||r.width<28)&&issues.filter(i=>i.type==='tap').length<18)
    issue('medium','tap','Cible tactile '+Math.round(r.width)+' x '+Math.round(r.height)+' px',el);
  }
  for(const el of els.filter(el=>el.matches('p,a,li,span,small,label,button')).slice(0,550)){
   if(!el.textContent||el.textContent.trim().length<8||el.closest('svg'))continue;
   if(el.children.length>2)continue;
   const size=parseFloat(getComputedStyle(el).fontSize);
   if(size<14&&issues.filter(i=>i.type==='small-font').length<22)
    issue('medium','small-font','Police '+size+'px : '+el.textContent.trim().slice(0,45),el);
  }
  const footer=els.find(el=>el.tagName==='FOOTER');
  if(footer&&html.scrollHeight<=innerHeight+10){
   const gap=innerHeight-footer.getBoundingClientRect().bottom;
   if(gap>48)issue('high','footer-gap','Espace vide de '+Math.round(gap)+'px sous le footer',footer);
  }
  return{issues,selectors:[...selectorSet],title:document.title,
   geometry:{innerWidth,innerHeight,scrollWidth:html.scrollWidth,scrollHeight:html.scrollHeight}};
 });
}
async function capture(browser,routeList,phase){
 const records=[],dir=path.join(output,'screenshots',phase);
 fs.mkdirSync(dir,{recursive:true});
 for(const viewport of VIEWPORTS){
  const state=process.env.OFFRYA_VISUAL_STATE_FILE;
  const context=await browser.newContext({
   viewport:{width:viewport.width,height:viewport.height},
   deviceScaleFactor:1,locale:'fr-FR',colorScheme:'light',
   isMobile:viewport.width<800,hasTouch:viewport.width<800,
   ...(state&&process.env.OFFRYA_VISUAL_ALLOW_PRIVATE==='1'?{storageState:state}:{})
  });
  for(const route of routeList){
   const page=await context.newPage();
   const item={route,viewport,issues:[],selectors:[],screenshot:null};
   try{
    const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:18000});
    item.status=response?.status()||null;
    await page.waitForTimeout(450);
    await page.evaluate(()=>document.fonts?.ready).catch(()=>{});
    if(!response||response.status()>=400)item.issues.push({severity:'critical',type:'http',message:'HTTP '+item.status});
    const data=await inspect(page);
    item.title=data.title;item.geometry=data.geometry;item.selectors=data.selectors;
    item.issues.push(...data.issues);
    const name=viewport.id+'-'+slug(route)+'.png';
    const full=path.join(dir,name);
    await page.screenshot({path:full,fullPage:true,animations:'disabled',timeout:15000});
    item.screenshot=path.relative(output,full).replace(/\\/g,'/');
    if(phase==='before'){
     item.previewPath=path.join(dir,'viewport-'+name);
     await page.screenshot({path:item.previewPath,animations:'disabled',timeout:15000});
    }
   }catch(error){item.issues.push({severity:'high',type:'browser',message:String(error.message||error).slice(0,180)});}
   finally{await page.close();}
   records.push(item);
   console.log('['+phase+'] '+viewport.id+' '+route+' : '+item.issues.length+' alertes');
  }
  await context.close();
 }
 return records;
}
function extractJson(value){
 const raw=String(value||'').trim();
 try{return JSON.parse(raw);}catch(_){}
 const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
 if(start>=0&&end>start)return JSON.parse(raw.slice(start,end+1));
 throw Error('Reponse IA non JSON');
}
async function aiReview(item){
 const image=fs.readFileSync(item.previewPath).toString('base64');
 const fullPath=item.screenshot?path.join(output,item.screenshot):null;
 const fullImage=fullPath&&fs.existsSync(fullPath)&&fs.statSync(fullPath).size<2500000
  ?fs.readFileSync(fullPath).toString('base64'):null;
 const instruction=[
 'Expert UX/UI pour OFFRYA, marketplace francaise violet/prune/corail.',
 'Analyse visuellement la capture. Cherche textes illisibles, contraste, alignement, espacement, surcharges, footer vide et responsive.',
 'Retourne UNIQUEMENT JSON: {"summary":"...","fixes":[{"selector":".classe","reason":"...","declarations":{"font-size":"16px"}}]}.',
 'Maximum deux corrections par capture. Si pas de correction certaine, fixes = [].',
 'Utilise seulement les selecteurs fournis. Aucun changement de texte, logo, acces, paiement, fonctionnalite, structure DOM ou CSS global.',
 'N emploie jamais position, display, height, z-index, overflow hidden, visibility, opacity, !important.',
 'Route: '+item.route+' ; taille '+item.viewport.width+'x'+item.viewport.height,
 'Geometrie: '+JSON.stringify(item.geometry),
 'Alertes: '+JSON.stringify(item.issues.slice(0,18)),
 'Selecteurs AUTORISES: '+JSON.stringify(item.selectors.slice(0,120))
 ].join('\n');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),40000);
 try{
  const r=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',signal:abort.signal,
   headers:{Authorization:'Bearer '+aiKey,'Content-Type':'application/json'},
   body:JSON.stringify({model:aiModel,max_output_tokens:1200,input:[
    {role:'user',content:[{type:'input_text',text:instruction},
     {type:'input_image',image_url:'data:image/png;base64,'+image,detail:'high'},
     ...(fullImage?[{type:'input_image',image_url:'data:image/png;base64,'+fullImage,detail:'low'}]:[])]}
   ]})
  });
  if(!r.ok)throw Error('OpenAI HTTP '+r.status+' '+(await r.text()).slice(0,100));
  const json=await r.json();
  const output=(json.output||[]).flatMap(x=>(x.content||[]).filter(c=>c.type==='output_text').map(c=>c.text)).join('\n');
  return extractJson(output);
 }finally{clearTimeout(timer);}
}
function publicRecords(records){return records.map(({previewPath,selectors,...r})=>r);}
async function main(){
 fs.mkdirSync(output,{recursive:true});
 if(mode==='propose'&&!aiKey)throw Error('OFFRYA_VISUAL_OPENAI_API_KEY requis pour proposer des corrections');
 if(mode==='propose'&&!['localhost','127.0.0.1'].includes(new URL(base).hostname))
  throw Error('Mode propose reserve a une instance locale pour comparer les captures avant/apres');
 if(process.env.OFFRYA_VISUAL_ALLOW_PRIVATE==='1'&&process.env.OFFRYA_VISUAL_STATE_FILE&&aiKey)
  throw Error('Ne pas envoyer de captures authentifiees a une IA externe');
 const routeList=routes();
 if(!routeList.length)throw Error('Aucune page cible');
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const original=fs.readFileSync(cssFile,'utf8');
 let before=[],after=[],fixes=[],suggestions=[];
 try{
  before=await capture(browser,routeList,'before');
  fs.writeFileSync(path.join(output,'before.json'),JSON.stringify(publicRecords(before),null,2));
  if(aiKey){
   const preference=r=>(r.viewport.width<400?3:0)+(r.route.includes('deposer-une-mission')?2:0);
   const selected=before.filter(r=>r.previewPath).sort((a,b)=>score(b.issues)+preference(b)-score(a.issues)-preference(a)).slice(0,aiLimit);
   for(const item of selected){
    try{
     const response=await aiReview(item);
     suggestions.push({route:item.route,viewport:item.viewport.id,summary:response?.summary,fixes:response?.fixes||[]});
     if(mode==='propose'){
      for(const raw of (Array.isArray(response?.fixes)?response.fixes:[])){
       const fix=approvedFix(raw,item.selectors);
       if(fix&&fixes.length<6&&!fixes.some(x=>x.selector===fix.selector&&JSON.stringify(x.declarations)===JSON.stringify(fix.declarations)))fixes.push(fix);
      }
     }
    }catch(e){notes.push('Analyse IA '+item.route+': '+String(e.message).slice(0,130));}
   }
  }else notes.push('Analyse par captures et mesures DOM seulement : ajouter le secret OpenAI pour la revue visuelle IA.');
  if(mode==='propose'&&fixes.length){
   fs.writeFileSync(cssFile,original.trimEnd()+'\n\n'+renderCss(fixes));
   after=await capture(browser,routeList,'after');
   fs.writeFileSync(path.join(output,'after.json'),JSON.stringify(publicRecords(after),null,2));
   const previous=new Map(before.map(r=>[r.route+'|'+r.viewport.id,r]));
   const bad=issues=>issues.filter(x=>x.severity==='high'||x.severity==='critical'||x.type==='overflow').length;
   const regressions=after.filter(r=>bad(r.issues)>bad(previous.get(r.route+'|'+r.viewport.id)?.issues||[]));
   if(regressions.length){
    fs.writeFileSync(cssFile,original);
    fixes=[];
    notes.push('Rollback des correctifs: anomalies nouvelles sur '+regressions.map(x=>x.route+' '+x.viewport.id).join(', '));
   }else notes.push('CSS propose en revision seulement: verifier les captures avant/apres avant fusion.');
  }
  fs.writeFileSync(path.join(output,'ai-suggestions.json'),JSON.stringify(suggestions,null,2));
  fs.writeFileSync(path.join(output,'report.md'),reportMarkdown(publicRecords(before),fixes,notes));
  if(after.length)fs.writeFileSync(path.join(output,'after-report.md'),reportMarkdown(publicRecords(after),fixes,notes));
  console.log('Audit termine: '+before.length+' ecrans; '+fixes.length+' correctifs proposes.');
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={routes,extractJson};
