'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const radarSource=fs.readFileSync('public/radar.js','utf8');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const home=fs.readFileSync('public/index.html','utf8');
const submit=fs.readFileSync('public/deposer.js','utf8');
const deposit=fs.readFileSync('public/deposer-une-mission.html','utf8');
const auth=fs.readFileSync('public/connexion.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const today=Date.now();
const date=days=>new Date(today+days*86400000).toISOString();
const userId='12345678-1234-4234-8234-123456789012';
const mission={id:'m1',owner_id:'somebody-else',title:'Nettoyage professionnel de bureaux',description:'Entretien de bureaux',category:'Nettoyage',status:'open',department:'13',city:'Marseille',created_at:date(-1),expires_at:date(12)};
const tender={tender_id:'26-123456',title:'Nettoyage de locaux publics',url:'https://www.boamp.fr/avis/26-123456',source:'BOAMP',departments:'13',match_score:83,match_reason:'secteur : Nettoyage · échéance : 12 jour(s)',deadline:date(12),detected_at:date(-1)};
async function radar(){
 return import('data:text/javascript;base64,'+Buffer.from(radarSource).toString('base64'));
}
test('Radar ranks only real, visible, non-owned missions and official tender alerts',async()=>{
 const {buildRadar}=await radar();
 const o=buildRadar({missions:[mission,{...mission,id:'own',owner_id:userId},{...mission,id:'closed',status:'closed'}],
  alerts:[tender,{...tender,tender_id:'x',url:'https://fake.example/avis'}],
  preferences:{sectors:['Nettoyage'],department:'13'},userId,now:today});
 assert.equal(o.total,2);
 assert.equal(o.items[0].kind,'mission');
 assert.ok(o.items.every(x=>x.score>=0&&x.score<=100));
 assert.equal(o.items[1].source,'BOAMP');
 assert.equal(o.relevant,2);
});
test('Ranking rejects expired, unrelated, spoofed and invalid public notices',async()=>{
 const {buildRadar,radarOfficialUrl}=await radar();
 const o=buildRadar({missions:[{...mission,expires_at:date(-1)},{...mission,id:'wrong',category:'Informatique'}],
  alerts:[{...tender,url:'https://ted.europa.eu.evil.example/'},{...tender,tender_id:'past',deadline:date(-2)}],
  preferences:{sectors:['Nettoyage']},userId,now:today});
 assert.equal(o.total,0);
 assert.equal(radarOfficialUrl('https://example.com'),false);
 assert.equal(radarOfficialUrl('https://ted.europa.eu/fr/notice/-/detail/750090-2026'),true);
});
test('The radar is displayed only behind the existing pro authorization and can never send bids',()=>{
 assert.match(pro,/import \{buildRadar,radarOfficialUrl\} from '\.\/radar\.js'/);
 assert.match(pro,/if\(!panel\|\|!canUsePremium\(\)\)return/);
 assert.match(pro,/missions:available\(\),alerts:state\.opportunityAlerts\|\|\[\]/);
 assert.match(pro,/proV3RadarRelevant/);
 assert.match(pro,/Score indicatif de correspondance/);
 assert.match(server,/\['\/radar\.js','text\/javascript/);
 assert.doesNotMatch(radarSource,/fetch\(|sendMail|smtp|authorization|stripe|openai/);
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:radarSource,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});
test('Acquisition starter is a GET form, safely prefills all valid categories and never publishes anonymously',()=>{
 for(const cat of ['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration &amp; Hôtellerie','Bien-être &amp; Beauté','Autre']){
  assert.match(home,new RegExp(cat.includes('&amp;')?cat:cat));
  assert.match(deposit,new RegExp(cat.includes('&amp;')?cat:cat));
 }
 assert.match(home,/<form class="mock-quick-mission" action="\/deposer-une-mission" method="get"/);
 assert.match(home,/name="category"/);
 assert.match(home,/name="city"/);
 assert.match(deposit,/next=%2Fespace/);
 assert.match(fs.readFileSync('public/espace.html','utf8'),/id="missionStarterResume"/);
 assert.match(fs.readFileSync('public/app.js','utf8'),/offrya:mission-starter:v1/);
 assert.match(submit,/offrya:mission-starter:v1/);
 assert.match(submit,/sessionStorage\.removeItem\(DRAFT_KEY\)/);
 assert.match(submit,/user\.email_confirmed_at/);
 assert.match(submit,/await currentPublisher\(\)/);
 assert.match(auth,/location\.replace\(confirmationReturn\?'\/espace':next\)/);
});
test('Public SEO URLs now point to the requested OFFRYA domain',()=>{
 for(const path of ['public/index.html','public/deposer-une-mission.html','public/professionnels.html','public/sitemap.xml','public/robots.txt',
  'public/secteurs/batiment.html','public/secteurs/nettoyage.html','public/secteurs/espaces-verts.html','public/secteurs/informatique.html','public/secteurs/transport.html','public/secteurs/restauration-hotellerie.html','public/secteurs/bien-etre-beaute.html','public/secteurs/autres-prestations.html']){
  const value=fs.readFileSync(path,'utf8');
  assert.doesNotMatch(value,/offrya-app\.onrender\.com/);
  assert.match(value,/https:\/\/offrya\.fr/);
 }
});
