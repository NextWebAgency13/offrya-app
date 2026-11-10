'use strict';
// Outils purs du bot : routes, classement et correctifs CSS volontairement limites.
const path=require('node:path');
const VIEWPORTS=[
 {id:'android-360',width:360,height:800},
 {id:'android-393',width:393,height:852},
 {id:'tablette-768',width:768,height:1024},
 {id:'desktop-1440',width:1440,height:900}
];
const MODES=[
 '/connexion?next=%2Fespace',
 '/connexion?mode=signup&role=client&next=%2Fespace',
 '/connexion?mode=signup&next=%2Fespace%2Fprofessionnel',
 '/connexion?mode=reset'
];
function pathsFromSitemap(xml){
 const result=[];
 for(const match of String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)){
  try{
   const url=new URL(match[1]);
   if(url.origin==='https://offrya.fr')result.push(url.pathname);
  }catch(_){}
 }
 return [...new Set([...result,...MODES])];
}
function slug(route){
 return String(route).replace(/^\/+/,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'accueil';
}
const SEVERITY={critical:4,high:3,medium:2,low:1};
function score(issues){return (issues||[]).reduce((n,issue)=>n+(SEVERITY[issue.severity]||1),0);}
const safeProperties=new Set(['font-size','line-height','gap','padding','margin','min-height','max-width','overflow-wrap','word-break','color','background-color','border-color','text-align']);
function safeDeclaration(property,value){
 const p=String(property||'').trim().toLowerCase(),v=String(value||'').trim().toLowerCase();
 if(!safeProperties.has(p)||v.length>55||/[;{}()!\\]/.test(v))return false;
 const pixels=/^(?:0|[1-9]\d{0,3})px$/;
 if(p==='font-size')return pixels.test(v)&&parseInt(v,10)>=14&&parseInt(v,10)<=26;
 if(p==='min-height')return pixels.test(v)&&parseInt(v,10)>=40&&parseInt(v,10)<=160;
 if(p==='max-width')return pixels.test(v)&&parseInt(v,10)>=240&&parseInt(v,10)<=1440;
 if(p==='gap')return pixels.test(v)&&parseInt(v,10)<=48;
 if(p==='padding'||p==='margin'){
  const parts=v.split(/\s+/);
  return parts.length<=4&&parts.every(x=>pixels.test(x)&&parseInt(x,10)<=64);
 }
 if(p==='line-height')return /^(?:1\.[3-9]|2(?:\.0)?)$/.test(v);
 if(p==='overflow-wrap')return v==='anywhere'||v==='break-word';
 if(p==='word-break')return v==='normal'||v==='break-word';
 if(p==='text-align')return ['left','center','right','start','end'].includes(v);
 return /^#[0-9a-f]{6}$/.test(v);
}
function approvedFix(fix,allowedSelectors=[]){
 if(!fix||typeof fix!=='object')return null;
 const selector=String(fix.selector||'').trim();
 // Pas de selecteurs universels, pseudo-selecteurs, :has, ni injection CSS.
 if(selector.length>120||!/^[.#][A-Za-z][\w-]*(?:\s+[.#][A-Za-z][\w-]*){0,3}$/.test(selector))return null;
 if(!allowedSelectors.includes(selector))return null;
 const declarations=Object.entries(fix.declarations||{}).filter(([k,v])=>safeDeclaration(k,v));
 if(!declarations.length||declarations.length>4)return null;
 const reason=String(fix.reason||'Ajustement de lisibilite').replace(/[\r\n*\/]/g,' ').slice(0,130);
 return {selector,declarations:Object.fromEntries(declarations),reason};
}
function renderCss(fixes){
 return fixes.map(x=>
  '/* OFFRYA VISUAL BOT : '+x.reason+' */\n'+x.selector+'{\n'+
  Object.entries(x.declarations).map(([k,v])=>'  '+k+': '+v+';').join('\n')+
  '\n}\n').join('\n');
}
function reportMarkdown(results,proposals,notes=[]){
 let md='# OFFRYA — Audit visuel\n\n';
 md+='Pages et tailles capturees : '+results.length+'.\n\n';
 const problems=results.flatMap(r=>r.issues.map(i=>({...i,route:r.route,viewport:r.viewport.id})));
 const counts=['critical','high','medium','low'].map(level=>level+': '+problems.filter(i=>i.severity===level).length).join(' · ');
 md+='Problemes releves : '+counts+'.\n\n';
 md+='| Page | Ecran | Score | Problemes | Capture |\n|---|---|---:|---:|---|\n';
 for(const r of results){
  md+='| '+r.route.replace(/\|/g,'%7C')+' | '+r.viewport.id+' | '+score(r.issues)+' | '+r.issues.length+' | '+(r.screenshot||'—')+' |\n';
 }
 md+='\n## Alertes prioritaires\n\n';
 for(const issue of problems.sort((a,b)=>(SEVERITY[b.severity]||1)-(SEVERITY[a.severity]||1)).slice(0,45)){
  md+='- **'+issue.severity+'** '+issue.route+' ['+issue.viewport+'] — '+issue.message.replace(/[\r\n]/g,' ').slice(0,200)+'\n';
 }
 md+='\n## Suggestions de correction\n\n';
 if(!proposals.length)md+='Aucune modification CSS proposee. L audit et les captures restent disponibles.\n';
 for(const fix of proposals)md+='- '+fix.selector+' : '+fix.reason+' ('+Object.keys(fix.declarations).join(', ')+')\n';
 if(notes.length)md+='\n## Notes\n\n'+notes.map(s=>'- '+s).join('\n')+'\n';
 md+='\nLes controles DOM et l analyse IA ne remplacent pas une validation humaine des captures avant/apres.\n';
 return md;
}
module.exports={VIEWPORTS,MODES,pathsFromSitemap,slug,score,approvedFix,renderCss,reportMarkdown,safeDeclaration};
