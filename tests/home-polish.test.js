'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),css=read('public/public.css'),pro=read('public/professionnels.html');
const otherPages=['public/professionnels.html','public/deposer-une-mission.html','public/connexion.html',
 ...['batiment','nettoyage','espaces-verts','transport','informatique','autres-prestations'].map(x=>'public/secteurs/'+x+'.html')];
test('Navigation : les accès Connexion et Inscription restent inchangés',()=>{
 assert.match(home,/class="header-signin" href="\/connexion\?next=%2Fespace"/);
 assert.match(home,/class="header-signup" href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/);
 assert.match(home,/class="home-nav-links mock-nav-links"/);
 for(const p of otherPages)assert.match(read(p),/class="account-link" href="\/espace"/,p);
});
test('Maquette : huit blocs dans le bon ordre et un seul H1',()=>{
 const sections=['class="mock-top"','class="mock-hero"','id="activite"','id="choisir-compte"','id="secteurs"','id="fonctionnement"','class="mock-container mock-assurance"','class="mock-end"'];
 // Les classes supplémentaires sont autorisées.
 const markers=['class="top home-top mock-top"','class="mock-hero"','class="mock-container mock-activity"','class="mock-container mock-choice"','class="mock-container mock-sectors"','class="mock-how"','class="mock-container mock-assurance"','class="mock-end"'];
 const indexes=markers.map(m=>home.indexOf(m));
 assert.ok(indexes.every(i=>i>=0));assert.deepEqual(indexes,[...indexes].sort((a,b)=>a-b));
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
 assert.match(home,/<h1 id="heroHeading">Votre projet mérite<br>le bon <span>professionnel\.<\/span><\/h1>/);
 assert.match(home,/class="mock-hero-wave"/);
 assert.match(home,/class="mock-pro-price"/);
 assert.match(home,/34,99 € TTC \/ mois/);
 assert.equal((home.match(/class="mock-sector(?: mock-sector-other)?"/g)||[]).length,7);
 assert.match(home,/src="\/activity\.js" defer/);
 assert.match(home,/id="publicActivity"/);
 assert.match(home,/Photographie d’illustration/);
});
test('Sécurité et parcours : aucun faux avis ni mission publique',()=>{
 assert.match(home,/href="\/deposer-une-mission"/);
 assert.match(home,/href="\/professionnels"/);
 assert.match(home,/Publiez votre mission après confirmation de l’e-mail/);
 assert.match(home,/Entreprise et dirigeant vérifiés/);
 assert.match(home,/34,99 €/);
 assert.match(pro,/Sans engagement, résiliable à tout moment\./);
 assert.doesNotMatch(home,/id="missionList"|id="statOpen"|id="dashMissions"|avis clients vérifiés|témoignages clients/i);
});
test('Responsive et isolation de la vitrine',()=>{
 assert.match(css,/\.mock-home \.mock-container\{/);
 assert.match(css,/\.mock-home \.mock-hero\{/);
 assert.match(css,/\.mock-home \.mock-sector-grid\{/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/\.mock-home \.mock-choice-grid\{/);
 assert.match(home,/class="home-skip" href="#contenu"/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});