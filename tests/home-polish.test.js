'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('public/index.html'),css=read('public/public.css'),pro=read('public/professionnels.html');
const otherPages=['public/professionnels.html','public/deposer-une-mission.html','public/connexion.html',
 ...['batiment','nettoyage','espaces-verts','transport','informatique','restauration-hotellerie','bien-etre-beaute','autres-prestations'].map(x=>'public/secteurs/'+x+'.html')];
test('Navigation : en-tête minimal avec logo et seul bouton Se connecter',()=>{
 const header=home.match(/<header class="top home-top mock-top">([\s\S]*?)<\/header>/)?.[1];
 assert.ok(header,'En-tête accueil présent');
 assert.match(header,/class="brand" href="\/" aria-label="OFFRYA, accueil"/);
 assert.match(header,/class="header-signin" href="\/connexion\?next=%2Fespace">Se connecter<\/a>/);
 assert.equal((header.match(/<a /g)||[]).length,2,'Seulement le logo et la connexion sont cliquables');
 assert.doesNotMatch(header,/header-signup|home-nav-links|mock-nav-links|mock-brand-tagline|S’inscrire|<button/);
 assert.match(home,/href="\/connexion\?mode=signup&amp;next=%2Fdeposer-une-mission"/,'Inscription gratuite conservée dans la carte Demandeur');
 for(const p of otherPages.filter(p=>p!=='public/connexion.html'&&p!=='public/professionnels.html'))assert.match(read(p),/class="account-link" href="\/espace"/,p);
 assert.match(read('public/professionnels.html'),/class="account-link" href="\/connexion\?next=%2Fespace"/);
 assert.match(read('public/connexion.html'),/class="auth-home-link" href="\/"/,'La page d’authentification retourne à l’accueil, sans lien vers un espace encore inaccessible');
});
test('Maquette : huit blocs dans le bon ordre et un seul H1',()=>{
 const sections=['class="mock-top"','class="mock-hero"','id="choisir-compte"','id="secteurs"','id="fonctionnement"','class="mock-container mock-assurance"','class="mock-end"'];
 // Les classes supplémentaires sont autorisées.
 const markers=['class="top home-top mock-top"','class="mock-hero"','class="mock-container mock-choice"','class="mock-container mock-sectors"','class="mock-how"','class="mock-container mock-assurance"','class="mock-end"'];
 const indexes=markers.map(m=>home.indexOf(m));
 assert.ok(indexes.every(i=>i>=0));assert.deepEqual(indexes,[...indexes].sort((a,b)=>a-b));
 assert.equal((home.match(/<h1\b/g)||[]).length,1);
 assert.match(home,/<h1 id="heroHeading">Votre projet mérite<br>le bon <span>professionnel\.<\/span><\/h1>/);
 assert.match(home,/class="mock-hero-wave"/);
 assert.match(home,/class="mock-pro-price"/);
 assert.match(home,/34,99 € TTC \/ mois/);
 assert.equal((home.match(/class="mock-sector(?: mock-sector-other)?"/g)||[]).length,8);
 const sectorPosition=cls=>home.indexOf('class="mock-sector-picture mock-sector-'+cls+'"');
 assert.ok(sectorPosition("building")>=0 && sectorPosition("building")<sectorPosition("tech") && sectorPosition("tech")<sectorPosition("green"),"Informatique & Tech doit être entre Bâtiment et Espaces verts");
 assert.doesNotMatch(home,/mock-activity|id="publicActivity"|src="\/activity\.js" defer/);
 assert.ok(home.indexOf('class="mock-hero"')<home.indexOf('class="mock-container mock-choice"'));
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
test('Maquette 16:9 : le bandeau est supprimé et le contenu commence directement après le héros',()=>{
 const heroEnd=home.indexOf('</section>',home.indexOf('<section class="mock-hero"'));
 const nextSection=home.slice(heroEnd+10).trimStart();
 assert.match(nextSection,/^<section class="mock-container mock-choice"/);
 assert.doesNotMatch(home,/L’activité OFFRYA|Voir les statistiques|id="activite"|mock-activity/);
 assert.match(css,/\.mock-home \.mock-choice\{padding-top:34px/);
 assert.match(css,/\.mock-home \.mock-hero-wave\{/);
 assert.match(css,/@media\(max-width:560px\)/);
});

test('Les secteurs restauration et beauté ont leurs propres aperçus publics',()=>{
 const sectors=[['restaurant','restauration-hotellerie','Restauration &amp; Hôtellerie'],['beauty','bien-etre-beaute','Bien-être &amp; Beauté']];
 for(const [cls,slug,title] of sectors){
  assert.match(home,new RegExp('href="/secteurs/'+slug+'"><span class="mock-sector-picture mock-sector-'+cls+'"'));
  const page=read('public/secteurs/'+slug+'.html');
  assert.ok(page.includes('<h1>'+title+' :'),slug+' a son titre dédié');
  assert.ok(page.includes('https://offrya-app.onrender.com/secteurs/'+slug),slug+' a sa balise canonique');
  assert.ok(page.includes('href="/deposer-une-mission"'),'Le lien de dépôt existe');
 }
 assert.ok(css.includes('.mock-home .mock-pro .mock-card-cta{width:88.9%;min-height:40px'),'CTA professionnel redimensionné');
 assert.ok(css.includes('.mock-home .mock-pro-details{max-width:88.9%'),'Lien secondaire ajusté');
});
