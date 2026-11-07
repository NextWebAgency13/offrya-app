'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {boampRespondLink,tedRespondLink,cleanUrl}=require('../lib/tender-links');
const {normalizeRecord}=require('../lib/boamp');
const {normalizeTedNotice,tedSearchBody,queryTed}=require('../lib/ted');
const {qualifyTender}=require('../lib/tender-assistant');
const {safeNotice}=require('../lib/live-tender-discovery');

const fnSimple=JSON.stringify({FNSimple:{initial:{communication:{
 urlDocConsul:'https://www.marches-publics.gouv.fr/entreprise/consultation/3100527?orgAcronyme=g6l',
 urlProfilAch:'https://www.marches-publics.gouv.fr/',adresseMailContact:'contact@exemple.fr'}}}});
const eforms=JSON.stringify({EFORMS:{ContractNotice:{
 'cac:ProcurementProjectLot':{'cac:TenderingTerms':{
  'cac:CallForTendersDocumentReference':{'cbc:ID':'DOC 01','cac:Attachment':{'cac:ExternalReference':{'cbc:URI':'https://www.achatpublic.com/'}}},
  'cac:TenderRecipientParty':{'cbc:EndpointID':'https://www.achatpublic.com/sdm/ent/gen/ent_detail.do?PCSLID=CSL_2026_ABC'}}},
 'efac:Organizations':{'efac:Company':{'cbc:WebsiteURI':'https://www.ville.fr','cbc:EndpointID':'http://www.ville.fr'}}}}});

test('BOAMP (ancien format) : le dossier de consultation est prioritaire',()=>{
 assert.deepEqual(boampRespondLink(fnSimple),{url:'https://www.marches-publics.gouv.fr/entreprise/consultation/3100527?orgAcronyme=g6l',kind:'documents'});
 assert.deepEqual(boampRespondLink(JSON.stringify({FNSimple:{initial:{communication:{urlProfilAch:'https://marchespublics596280.fr/'}}}})),
  {url:'https://marchespublics596280.fr/',kind:'platform'});
});
test('BOAMP eForms : page d’accueil = « plateforme de l’acheteur », jamais le site de l’organisme',()=>{
 assert.deepEqual(boampRespondLink(eforms),{url:'https://www.achatpublic.com/',kind:'platform'});
 const onlySubmission=JSON.stringify({x:{'cac:TenderRecipientParty':{'cbc:EndpointID':'https://depot.exemple.fr/consultation/42'}},
  y:{'efac:Company':{'cbc:EndpointID':'https://www.ville.fr/'}}});
 assert.deepEqual(boampRespondLink(onlySubmission),{url:'https://depot.exemple.fr/consultation/42',kind:'submission'});
});
test('Adresses refusées : e-mail, javascript, identifiants, BOAMP lui-même, données illisibles',()=>{
 for(const bad of ['mailto:a@b.fr','javascript:alert(1)','https://user:pw@site.fr/','https://www.boamp.fr/avis/1','ftp://x.fr','pas une url','https://localhost/'])
  assert.equal(cleanUrl(bad),null,bad);
 assert.equal(cleanUrl('www.achatpublic.com'),'https://www.achatpublic.com/');
 assert.equal(boampRespondLink('{pas du json'),null);
 assert.equal(boampRespondLink(null),null);
});
test('Avis BOAMP normalisé : lien pour répondre transmis',()=>{
 const n=normalizeRecord({idweb:'26-108086',objet:'Mission AMO',url_avis:'https://www.boamp.fr/pages/avis/?q=idweb:26-108086',nomacheteur:'SGAMI',donnees:fnSimple});
 assert.equal(n.respondKind,'documents');
 assert.match(n.respondUrl,/marches-publics\.gouv\.fr\/entreprise\/consultation\/3100527/);
 const plain=normalizeRecord({idweb:'26-1',objet:'X',url_avis:'https://www.boamp.fr/pages/avis/?q=idweb:26-1'});
 assert.equal(plain.respondUrl,undefined);
});
test('TED : champs liens demandés, avec repli si l’API les refuse',async()=>{
 assert.ok(tedSearchBody('nettoyage').fields.includes('document-url-lot'));
 assert.ok(!tedSearchBody('nettoyage',false).fields.includes('document-url-lot'));
 const raw={'publication-number':'123456-2026','notice-title':{fra:'Nettoyage'},'buyer-name':{fra:'Ville'},
  'deadline-receipt-tender-date-lot':['2099-01-01+01:00'],'buyer-country':['FRA'],'document-url-lot':['https://plateforme.fr/dce/9']};
 assert.deepEqual([normalizeTedNotice(raw).respondUrl,normalizeTedNotice(raw).respondKind],['https://plateforme.fr/dce/9','documents']);
 const calls=[];
 const fetcher=async(url,opt)=>{const body=JSON.parse(opt.body);calls.push(body.fields.length);
  return calls.length===1?{ok:false,status:400}:{ok:true,status:200,json:async()=>({notices:[raw]})};};
 const out=await queryTed('nettoyage',fetcher);
 assert.equal(calls.length,2);assert.ok(calls[0]>calls[1]);assert.equal(out.length,1);
});
test('Veille et radar : le lien est conservé jusqu’au navigateur',()=>{
 const notice={id:'26-108086',title:'Nettoyage des locaux',url:'https://www.boamp.fr/pages/avis/?q=idweb:26-108086',
  deadline:new Date(Date.now()+10*864e5).toISOString(),buyer:'Ville',departments:'13',respondUrl:'https://plateforme.fr/dce/1',respondKind:'documents'};
 assert.equal(safeNotice(notice).respond_url,'https://plateforme.fr/dce/1');
 const row=qualifyTender(notice,{sectors:['Nettoyage'],user_id:'u'});
 assert.ok(row);assert.equal(row.respond_url,'https://plateforme.fr/dce/1');assert.equal(row.respond_kind,'documents');
 const server=fs.readFileSync('server.js','utf8');
 assert.match(server,/respond_url,respond_kind\}\)\)\},/);
 assert.match(server,/'Dossier \/ réponse'/);
});
test('Affichage : bouton « Dossier de consultation / Plateforme de l’acheteur » et autres plateformes',()=>{
 const pro=fs.readFileSync('public/pro-experience.js','utf8'),app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/espace.html','utf8');
 assert.match(pro,/respondLink\(a,'pro-v3-reco-btn pro-tender-respond'\)/);
 assert.match(pro,/rel="noopener noreferrer nofollow"/);
 assert.match(app,/\$\{respondButton\(m\)\}/);
 assert.match(app,/select\('user_id,tender_id,title,buyer,departments,url,deadline,source,match_score,match_reason,detected_at,seen_at,respond_url,respond_kind'\)/);
 assert.match(html,/id="tenderPlatformList"/);
 assert.match(fs.readFileSync('server.js','utf8'),/\['\/tender-platforms\.js','text\/javascript; charset=utf-8'\]/);
});
test('Plateformes : liens préremplis par métier et région, sans extraction',async()=>{
 const src=fs.readFileSync('public/tender-platforms.js','utf8');
 const m=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const list=m.tenderPlatforms({term:'espaces verts',dept:'13'});
 assert.equal(list.find(p=>p.id==='place').url,'https://www.marches-publics.gouv.fr/?page=Entreprise.EntrepriseAdvancedSearch&AllCons&keyWord=espaces%20verts');
 assert.equal(list.find(p=>p.id==='emp').url,'https://www.e-marchespublics.com/appel-offre/provence-alpes-cote-d-azur/');
 assert.ok(m.tenderPlatforms({dept:'75'}).some(p=>p.id==='maximilien'));
 assert.ok(m.tenderPlatforms({dept:'35'}).some(p=>p.id==='megalis'));
 assert.equal(m.platformTerm({sectors:['Bâtiment']}),'travaux');
 assert.equal(m.normalizeDept('5'),'05');
 assert.doesNotMatch(src,/fetch\(/);
});
test('Veille : chaque ligne envoyée a les mêmes colonnes (insertion groupée)',()=>{
 const {cleanRow}=require('../scripts/watch-sector-tenders');
 const base={title:'Nettoyage des locaux administratifs',buyer:'Ville',departments:'13',source:'BOAMP',
  deadline:new Date(Date.now()+15*864e5).toISOString()};
 const a=cleanRow({...base,id:'26-100001',url:'https://www.boamp.fr/pages/avis/?q=idweb:26-100001',respondUrl:'https://plateforme.fr/dce/1',respondKind:'documents'},'u',{sectors:['Nettoyage']});
 const b=cleanRow({...base,id:'26-100002',url:'https://www.boamp.fr/pages/avis/?q=idweb:26-100002'},'u',{sectors:['Nettoyage']});
 assert.ok(a&&b);
 assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
 assert.equal(b.respond_url,null);
});
test('Navigation unifiée : un seul menu (mêmes noms que le mobile) et Marchés publics en sous-onglets',()=>{
 const pro=fs.readFileSync('public/pro-experience.js','utf8'),css=fs.readFileSync('public/brand-kit.css','utf8'),app=fs.readFileSync('public/app.js','utf8');
 assert.match(pro,/\['home','Opportunités','ic-sparkles'\]/);
 assert.match(pro,/\['watch','Marchés publics','ic-boamp'\]/);
 assert.match(pro,/premiumLink\.after\(subnav\)/);
 assert.match(pro,/\['watch','Ma veille'\],\['boamp','Rechercher un avis'\],\['preferences','Mes critères'\]/);
 for(const screen of ['boamp','watch','preferences'])assert.match(pro,new RegExp("marketIntro\\('"+screen+"'"));
 assert.match(pro,/b\.dataset\.proGroup==='markets'&&marketScreens\.includes\(view\)/);
 assert.match(pro,/#proV3Subnav,#proV3SidePlan'\)/);
 assert.match(css,/:is\(nav#proV3Sidebar,nav#proV3SidebarExtras\)\{display:none!important\}/);
 assert.match(css,/@media \(min-width:781px\) and \(not \(\(pointer:coarse\)/);
 assert.match(app,/professional:canUsePremium\(\)\?'Espace Premium'/);
});
