'use strict';
// Contrôle du site réellement déployé. N'appelle aucune API Stripe et ne crée aucun paiement.
const assert=require('node:assert/strict');
const base='https://offrya-app.onrender.com';
async function request(path,options={}){
 let last;
 for(let i=0;i<3;i++){
  try {
   const r=await fetch(base+path,{...options,redirect:'follow',signal:AbortSignal.timeout(100000),headers:{'User-Agent':'OFFRYA-Production-Smoketest/1.0',...(options.headers||{})}});
   const text=await r.text();
   let json=null;try{json=JSON.parse(text);}catch{}
   return {status:r.status,json,text,headers:r.headers};
  }catch(e){last=e;if(i<2)await new Promise(resolve=>setTimeout(resolve,6000));}
 }
 throw new Error('Render inaccessible sur '+path+': '+(last?.cause?.code||last?.message));
}
async function run(){
 const health=await request('/api/health');
 assert.equal(health.status,200,'Santé Render (HTTP /api/health)');
 assert.equal(health.json?.ok,true,'Santé backend');
 console.log('PASS: site Render joignable et sain');
 const page=await request('/');
 assert.equal(page.status,200,'Page d’accueil');
 assert.match(page.text,/<html/i);
 assert.match(page.text,/offrya/i);
 console.log('PASS: page d’accueil accessible');
 // Vérifier explicitement la publication du nouveau parcours d'accueil.
 // Render peut mettre plusieurs instants à reconstruire après le push : attendre une fois le backend joignable.
 let releaseVisible=false;
 for(let attempt=0;attempt<14;attempt++){
  const landing=await request('/');
  const authPage=await request('/connexion');
  const authScript=await request('/connexion.js');
  const header=landing.text.match(/<header class="top home-top mock-top">([\s\S]*?)<\/header>/)?.[1]||'';
  releaseVisible=header.includes('class="header-signin"')
   &&header.includes('class="brand"')
   &&!header.includes('header-signup')
   &&!header.includes('home-nav-links')
   &&!header.includes('mock-brand-tagline')
   &&landing.text.includes('id="choisir-compte"')
   &&authPage.text.includes('id="accountTypeChoice"')
   &&authScript.text.includes('offrya_signup_intent');
  if(releaseVisible)break;
  if(attempt<13)await new Promise(resolve=>setTimeout(resolve,15000));
 }
 assert.ok(releaseVisible,'La version Render ne présente pas encore Connexion / Inscription et les deux parcours du compte');
 console.log('PASS: nouvelle version OFFRYA (connexion, inscription, 2 parcours) visible en production');

 // Déploiement de la nouvelle connexion : attendre le vrai HTML/CSS/JS
 // avant d'annoncer le succès, sans créer de compte ni envoyer de courriel.
 let authRedesignReady=false;
 for(let attempt=0;attempt<16;attempt++){
  const [page,styles,script]=await Promise.all([
   request('/connexion?next=%2Fdeposer-une-mission',{headers:{'Cache-Control':'no-cache'}}),
   request('/auth.css',{headers:{'Cache-Control':'no-cache'}}),
   request('/connexion.js',{headers:{'Cache-Control':'no-cache'}})
  ]);
  const tabs=page.text.match(/id="authTabs"[\s\S]*?<\/div>/)?.[0]||'';
  authRedesignReady=page.status===200&&styles.status===200&&script.status===200
   &&page.text.includes('class="auth-page"')
   &&page.text.includes('id="resetLinkWrap" hidden')
   &&tabs.includes('data-mode="login"')&&tabs.includes('data-mode="signup"')
   &&!tabs.includes('data-mode="reset"')
   &&page.text.includes('id="authBack"')
   &&styles.text.includes('.auth-page [hidden]{display:none!important}')
   &&script.text.includes("resetLinkWrap').hidden=v!=='login'")
   &&script.text.includes("ps.hidden=v==='reset'");
  if(authRedesignReady)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(authRedesignReady,'Nouvelle interface de connexion / inscription non encore visible sur Render');
 console.log('PASS: connexion, inscription et recuperation distinctes deployee sur Render');

 // Design approuvé : vérifier les éléments réellement servis, sans toucher
 // aux données clients ni appeler un paiement.
 let designVisible=false;
 for(let attempt=0;attempt<16;attempt++){
  const [landing,styles]=await Promise.all([request('/',{headers:{'Cache-Control':'no-cache'}}),request('/public.css',{headers:{'Cache-Control':'no-cache'}})]);
  designVisible=landing.status===200&&styles.status===200
   &&landing.text.includes('class="mock-hero"')
   &&landing.text.includes('Votre projet mérite<br>le bon <span>professionnel.</span>')
   &&!landing.text.includes('class="mock-activity-title"')
   &&!landing.text.includes('id="publicActivity"')
   &&!landing.text.includes('src="/activity.js"')
   &&landing.text.includes('class="mock-choice-grid"')
   &&landing.text.includes('class="mock-sector-grid"')
   &&landing.text.includes('class="footer mock-legal"')
   &&styles.text.includes('.mock-home .mock-hero')
   &&styles.text.includes('@media(max-width:560px)');
  if(designVisible)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(designVisible,'Render ne présente pas encore le design photographique approuvé');
 console.log('PASS: maquette OFFRYA desktop/mobile fidèle servie sur Render');

 // Preuve de déploiement de cette PR : les sept pictogrammes professionnels
 // doivent être présents dans le HTML réellement servi par Render.
 let professionalIconsVisible=false;
 const names=['file-text','message-square','circle-check','shield-check','award','lock-keyhole','headset'];
 for(let attempt=0;attempt<16;attempt++){
  const [page,styles]=await Promise.all([
   request('/',{headers:{'Cache-Control':'no-cache'}}),
   request('/public.css',{headers:{'Cache-Control':'no-cache'}})
  ]);
  professionalIconsVisible=page.status===200&&styles.status===200
    &&names.every(name=>page.text.includes('data-icon="'+name+'"'))
    &&!page.text.includes('<div class="mock-how-glyph" aria-hidden="true">▤</div>')
    &&!page.text.includes('<span aria-hidden="true">♢</span>')
    &&styles.text.includes('.mock-home .mock-assurance-icon .mock-icon-svg')
    &&styles.text.includes('.mock-home .mock-legal')
    &&styles.text.includes('.mock-home .mock-how-glyph .mock-icon-svg');
  if(professionalIconsVisible)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(professionalIconsVisible,'Les sept pictogrammes SVG ne sont pas encore visibles sur le site Render');
 console.log('PASS: huit pictogrammes SVG professionnels réellement servis par Render');


 // Bouton professionnel explicitement demandé : confirmer le HTML réellement
 // livré par Render, sa destination d'inscription et l'affichage responsive.
 let proSignupVisible=false;
 for(let attempt=0;attempt<16;attempt++){
  const [landing,styles,auth]=await Promise.all([
   request('/',{headers:{'Cache-Control':'no-cache'}}),
   request('/public.css',{headers:{'Cache-Control':'no-cache'}}),
   request('/connexion?mode=signup&next=%2Fespace%2Fprofessionnel',{headers:{'Cache-Control':'no-cache'}})
  ]);
  const proCard=landing.text.match(/<article class="mock-choice-card mock-pro">([\s\S]*?)<\/article>/)?.[1]||'';
  proSignupVisible=landing.status===200&&styles.status===200&&auth.status===200
   &&proCard.includes('href="/connexion?mode=signup&amp;next=%2Fespace%2Fprofessionnel">Créer un compte professionnel')
   &&proCard.includes('href="/professionnels">Découvrir l’offre OFFRYA Professionnel')
   &&styles.text.includes('.mock-home .mock-pro .mock-card-cta{margin-top:16px;')
   &&styles.text.includes('.mock-home .mock-pro .mock-card-cta{min-height:54px;')
   &&auth.text.includes('data-signup-type="pro"');
  if(proSignupVisible)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(proSignupVisible,'Bouton création compte pro absent du site Render, ou styles mobiles non déployés');
 console.log('PASS: bouton Créer un compte professionnel présent sur Render, avec styles mobiles et route Pro');


 // Vérifie les six photos précisément dans la feuille de style servie par Render.
 // Les liens de catégories et le contrôle de paiement sont testés séparément.
 const sectorStyles=await request('/public.css',{headers:{'Cache-Control':'no-cache'}});
 assert.equal(sectorStyles.status,200,'CSS public disponible');
 const sectorPhotos={building:'4509089',green:'38936350',clean:'4440537',
  restaurant:'3951656',beauty:'3985332',taxi:'5835272'};
 for(const [sector,id] of Object.entries(sectorPhotos)){
  const expected='.mock-home .mock-sector-'+sector+'{background-image:url("https://images.pexels.com/photos/'+id+'/pexels-photo-'+id+'.jpeg?auto=compress&cs=tinysrgb&w=800")}';
  assert.ok(sectorStyles.text.includes(expected),'Photo métier '+sector+' non déployée');
 }
 console.log('PASS: six photographies sectorielles pertinentes visibles dans le CSS Render');

 // Vérifie que le nouveau domaine est réellement déployé : route existante,
 // photo de dépannage informatique et disposition responsive des 8 cartes.
 let techDeployed=false;
 for(let attempt=0;attempt<16;attempt++){
  const [home,styles,category]=await Promise.all([
   request('/',{headers:{'Cache-Control':'no-cache'}}),
   request('/public.css',{headers:{'Cache-Control':'no-cache'}}),
   request('/secteurs/informatique',{headers:{'Cache-Control':'no-cache'}})
  ]);
  techDeployed=home.status===200&&styles.status===200&&category.status===200
   &&home.text.includes('href="/secteurs/informatique"><span class="mock-sector-picture mock-sector-tech"')
   &&home.text.includes('<strong>Informatique<br>&amp; Tech</strong>')
   &&styles.text.includes('.mock-home .mock-sector-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr))')
   &&styles.text.includes('.mock-home .mock-sector-tech{background-image:url("https://images.pexels.com/photos/7639370/pexels-photo-7639370.jpeg?auto=compress&cs=tinysrgb&w=800")}')
   &&styles.text.includes('.mock-home .mock-sector-grid{grid-template-columns:repeat(4,minmax(0,1fr))}')
   &&styles.text.includes('.mock-home .mock-sector-grid{grid-template-columns:repeat(2,minmax(0,1fr))}');
  if(techDeployed)break;
  if(attempt<15)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 assert.ok(techDeployed,'La carte Informatique & Tech ou sa mise en page ne sont pas encore visibles sur Render');
 console.log('PASS: carte Informatique & Tech servie par Render avec sa photo et ses formats responsive');




 // Contrôle de livraison des fonctions récentes (présence du code réellement servi).
 const [appLatest,privateLatest,styleLatest]=await Promise.all([
  request('/app.js',{headers:{'Cache-Control':'no-cache'}}),
  request('/espace/messagerie',{headers:{'Cache-Control':'no-cache'}}),
  request('/styles.css',{headers:{'Cache-Control':'no-cache'}})
 ]);
 assert.equal(appLatest.status,200,'JavaScript métier actuel accessible');
 assert.equal(privateLatest.status,200,'Espace privé actuel accessible');
 assert.equal(styleLatest.status,200,'Feuille de style actuelle accessible');
 for(const marker of ['function renderMissionDetail(m)','data-view-mission','mission-listing','offrya-conversation','inboxBackToList'])
  assert.ok(appLatest.text.includes(marker),'Fonction récente absente de la production : '+marker);
 for(const marker of ['id="roleClientView"','id="rolePremiumView"','id="inboxBackToList"','id="threadContext"'])
  assert.ok(privateLatest.text.includes(marker),'Interface récente absente de la production : '+marker);
 for(const marker of ['mission-detail-description','mission-listing-actions','offrya-conversation','has-active-thread'])
  assert.ok(styleLatest.text.includes(marker),'Style récent absent de la production : '+marker);
 console.log('PASS: tableaux de bord, fiches de mission et messagerie mobile servis en production');

 // Les routes doivent être vraies, pas un fallback global HTTP 200.
 const publicPaths=['/professionnels','/deposer-une-mission','/connexion','/secteurs/batiment','/secteurs/nettoyage','/secteurs/espaces-verts','/secteurs/transport','/secteurs/informatique','/secteurs/restauration-hotellerie','/secteurs/bien-etre-beaute','/secteurs/autres-prestations'];
 for(const route of publicPaths){
  const r=await request(route);assert.equal(r.status,200,route);assert.match(r.text,/<h1[^>]*>/i,route);
 }
 console.log('PASS: neuf pages publiques accessibles sur URL directe');
 for(const route of ['/espace','/espace/missions','/espace/marches-publics','/espace/messagerie','/espace/reglages','/espace/professionnel']){
  const r=await request(route);
  assert.equal(r.status,200,route);assert.match(r.headers.get('x-robots-tag')||'',/noindex/,route);assert.match(r.text,/name="robots" content="noindex,nofollow"/,route);
 }
 console.log('PASS: six chemins privés et en-têtes noindex');
 const robots=await request('/robots.txt'),map=await request('/sitemap.xml');
 assert.equal(robots.status,200);assert.equal(map.status,200);
 assert.match(robots.text,/Sitemap:/);assert.ok(!map.text.includes('<loc>https://offrya-app.onrender.com/espace'));
 console.log('PASS: robots.txt et sitemap.xml publics uniquement');
 const nonexistent=await request('/ce-chemin-n-existe-pas');assert.equal(nonexistent.status,404);
 console.log('PASS: véritable page 404');

 for(const [p,text] of [['/cgv.html','34,99'],['/confidentialite.html','Stripe'],['/remboursements.html','14 jours'],['/contact.html','nextwebagency.contact@gmail.com'],['/mentions-legales.html','SIREN']]){
   const r=await request(p);
   assert.equal(r.status,200,'Page légale '+p);
   assert.ok(r.text.includes(text),'Texte attendu sur '+p);
 }
 console.log('PASS: CGV, confidentialité, remboursements, support et mentions légales accessibles');
 const app=await request('/app.js');
 assert.equal(app.status,200,'Code client disponible');
 assert.match(app.text,/premium/i);
 console.log('PASS: JavaScript de l’application accessible');

 // Valider la version Render réellement servie, pas seulement le code GitHub.
 // La recherche de missions des tiers ne doit être activée qu'après vérification Pro.
 let missionGateDeployed=false;
 for(let attempt=0;attempt<18;attempt++){
  const [script,privatePage]=await Promise.all([
   request('/app.js',{headers:{'Cache-Control':'no-cache'}}),
   request('/espace',{headers:{'Cache-Control':'no-cache'}})
  ]);
  missionGateDeployed=script.status===200
   &&privatePage.status===200
   &&script.text.includes("const owned=await state.db.from('offrya_missions')")
   &&script.text.includes("if(canUsePremium()){")
   &&script.text.includes("missionSearchFilters")
   &&privatePage.text.includes('id="missionSearchFilters"');
  if(missionGateDeployed)break;
  if(attempt<17)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert.ok(missionGateDeployed,'Render ne sert pas encore le verrouillage des missions avant certification Pro');
 console.log('PASS: Render sert la version verrouillant la recherche des missions avant certification Premium');

 // Contrôle de restauration : vérifier que la version v2 à l'origine du repli
 // n'est plus distribuée par Render, y compris après invalidation de cache.
 let restored=false;
 for(let attempt=0;attempt<20;attempt++){
  const [script,publicPage,privatePage]=await Promise.all([
   request('/app.js',{headers:{'Cache-Control':'no-cache'}}),
   request('/deposer-une-mission',{headers:{'Cache-Control':'no-cache'}}),
   request('/espace',{headers:{'Cache-Control':'no-cache'}})
  ]);
  restored=script.status===200 && publicPage.status===200 && privatePage.status===200
   && !script.text.includes("from './mission-photos.mjs'")
   && !script.text.includes('offrya_pro_proof_requests')
   && !publicPage.text.includes('name="area_sqm"')
   && !privatePage.text.includes('id="reportDialog"');
  if(restored)break;
  if(attempt<19)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert.ok(restored,'Rollback non encore visible sur Render : l’ancienne interface v2 est toujours servie.');
 console.log('PASS: rollback effectif sur Render, interface stable servie sans fonctionnalites v2');

 const cfg=await request('/api/config');
 assert.equal(cfg.status,200,'Configuration API');
 assert.equal(cfg.json?.supabaseUrl,'https://hhxtutvmvlphkutqscad.supabase.co');
 assert.equal(cfg.json?.premiumPriceEuros,34.99);
 assert.equal(typeof cfg.json?.billingEnabled,'boolean');
 assert.equal(cfg.json?.billingEnabled,health.json?.paymentsEnabled);
 console.log('PASS: configuration publique Supabase et prix professionnel à 34,99 euros');

 // Le widget statistique a été retiré du visuel à la demande du propriétaire.
 // La RPC privée de détails reste indépendante et la RPC agrégée reste testée.
 const landingWithoutBanner=await request('/');
 assert.ok(!landingWithoutBanner.text.includes('id="publicActivity"'));
 assert.ok(!landingWithoutBanner.text.includes('mock-activity'));
 assert.ok(landingWithoutBanner.text.includes('class="mock-container mock-choice"'));
 console.log('PASS: bandeau statistique retiré et choix des espaces accessible');
 const publicConfig=cfg.json||{};
 assert.ok(typeof publicConfig.supabaseKey==='string'&&publicConfig.supabaseKey.length>10);
 const rpc=await fetch(publicConfig.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/offrya_public_mission_counts',{
  method:'POST',headers:{apikey:publicConfig.supabaseKey,'Content-Type':'application/json'},body:'{}',
  signal:AbortSignal.timeout(20000)
 });
 assert.equal(rpc.status,200,'RPC public de statistiques');
 const aggregates=await rpc.json();
 assert.ok(Array.isArray(aggregates)&&aggregates.length<=700,'Réponse agrégée');
 for(const entry of aggregates){
  assert.deepEqual(Object.keys(entry).sort(),['category','count','department']);
  assert.ok(Number.isSafeInteger(Number(entry.count))&&Number(entry.count)>=0);
 }
 console.log('PASS: statistiques réelles secteur/département accessibles sans aucune mission privée');

 const protectedApi=await request('/api/annonces');
 assert.equal(protectedApi.status,401,'BOAMP doit refuser les accès anonymes');
 console.log('PASS: recherche BOAMP protégée sans connexion');
 const checkout=await request('/api/billing/checkout',{method:'POST'});
 assert.equal(checkout.status,cfg.json.billingEnabled?401:503,'Checkout sans autorisation');
 console.log('PASS: Checkout refuse la demande non authentifiée ('+checkout.status+')');
 const portal=await request('/api/billing/portal',{method:'POST'});
 assert.equal(portal.status,cfg.json.billingEnabled?401:503,'Portail de facturation sans autorisation');
 console.log('PASS: portail de facturation protégé ('+portal.status+')');
 const webhook=await request('/api/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(webhook.status,cfg.json.billingEnabled?400:503,'Webhook doit rejeter une requête non signée');
 console.log('PASS: webhook rejette une requête non signée ('+webhook.status+')');
 const identityStart=await request('/api/identity/start',{method:'POST'});
 assert.equal(identityStart.status,cfg.json.identityEnabled?401:503,'Démarrage de vérification d’identité sans authentification');
 console.log('PASS: début de vérification d’identité protégé ('+identityStart.status+')');
 const identityWebhook=await request('/api/identity/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(identityWebhook.status,cfg.json.identityEnabled?400:503,'Webhook Identity refuse toute requête sans signature');
 console.log('PASS: webhook Identity rejette une requête non signée ('+identityWebhook.status+')');
 console.log('ETAT STRIPE IDENTITY RENDER: '+(cfg.json.identityEnabled?'ACTIVE (configuration reconnue, pièce et selfie réels non testés)':'DESACTIVEE (au moins un paramètre de configuration absent)'));
 console.log('ETAT FACTURATION RENDER: '+(cfg.json.billingEnabled?'ACTIVE (vérification production réelle non prouvée)':'DESACTIVEE'));
}
run().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
