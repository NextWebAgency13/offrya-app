'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),css=read('public/public.css'),pro=read('public/professionnels.html');
test('Navigation publique minimaliste : logo et connexion, sans lien vers une mission privée',()=>{
 const header=home.match(/<header class="top home-top mock-top">([\s\S]*?)<\/header>/)?.[1];
 assert.ok(header);
 assert.match(header,/class="header-signin" href="\/connexion\?next=%2Fespace">Se connecter<\/a>/);
 assert.equal((header.match(/<a /g)||[]).length,2);
 assert.doesNotMatch(header,/header-signup|<button/);
});
test('Trois parcours visibles et une seule décision à prendre sur la vitrine',()=>{
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
 assert.match(home,/<h1 id="heroHeading">Votre projet mérite<br>le bon <span>professionnel\.<\/span><\/h1>/);
 const paths=[...home.matchAll(/data-journey="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(paths,['client','professional','manage']);
 for(const wording of ['Je cherche un professionnel','Je décris mon projet gratuitement','Je suis professionnel',
  'Je trouve une mission et je propose mes services','Je gère mon activité','Je retrouve mes échanges et mes dossiers'])assert.ok(home.includes(wording),wording);
 assert.doesNotMatch(home,/class="mock-container mock-choice"|id="choisir-compte"|class="mock-pro-price"/);
 const heroEnd=home.indexOf('</section>',home.indexOf('<section class="mock-hero'));
 const next=home.slice(heroEnd+10).trimStart();
 assert.match(next,/^<section class="mock-container mock-sectors"/);
 assert.match(home,/34,99 € TTC \/ mois/);
});
test('Les trois CTA utilisent les parcours existants sécurisés, sans exposer les missions',()=>{
 assert.match(home,/href="\/deposer-une-mission" data-journey="client"/);
 assert.match(home,/href="\/professionnels" data-journey="professional"/);
 assert.match(home,/href="\/connexion\?next=%2Fespace" data-journey="manage"/);
 assert.match(home,/après confirmation de l'e-mail/);
 assert.match(home,/Professionnels vérifiés/);
 assert.match(pro,/Sans engagement, résiliable à tout moment\./);
 assert.doesNotMatch(home,/id="missionList"|id="statOpen"|id="dashMissions"|avis clients vérifiés|témoignages clients/i);
});
test('Les secteurs, les garanties et les trois étapes restent accessibles',()=>{
 assert.equal((home.match(/class="mock-sector(?: mock-sector-other)?"/g)||[]).length,8);
 const sectorPosition=cls=>home.indexOf('class="mock-sector-picture mock-sector-'+cls+'"');
 assert.ok(sectorPosition('building')<sectorPosition('tech')&&sectorPosition('tech')<sectorPosition('green'));
 for(const marker of ['id="secteurs"','id="fonctionnement"','mock-container mock-assurance','La confiance au cœur d’OFFRYA'])assert.ok(home.includes(marker),marker);
 for(const slug of ['informatique','batiment','nettoyage','espaces-verts','restauration-hotellerie','bien-etre-beaute','transport']){
  assert.match(read('public/secteurs/'+slug+'.html'),/href="\/deposer-une-mission\?category=/);
 }
});
test('Responsive, focus clavier et lisibilité du parcours sur mobile',()=>{
 assert.match(css,/\.mock-home \.offrya-entry-paths\{/);
 assert.match(css,/@media\(max-width:820px\)\{\s*\.mock-home \.offrya-entry-paths\{grid-template-columns:1fr/);
 assert.match(css,/\.offrya-entry-path:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(home,/aria-label="Que souhaitez-vous faire \?"/);
});
