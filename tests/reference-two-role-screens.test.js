'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync('public/espace.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/role-reference.css','utf8');
const server=fs.readFileSync('server.js','utf8');
const first=html.slice(html.indexOf('id="roleClientView"'),html.indexOf('id="rolePremiumView"'));
const second=html.slice(html.indexOf('id="rolePremiumView"'),html.indexOf('id="priorityAlertsPanel"'));

test('Reference client home matches its own verified-email journey, without Premium access',()=>{
 assert.match(first,/Bienvenue sur OFFRYA/);
 assert.match(first,/Publiez vos missions et recevez des propositions de professionnels vérifiés/);
 assert.match(first,/href="\/deposer-une-mission"/);
 for(const name of ['Mon espace demandeur','Mes missions','Mes échanges','Espace pro','Mon profil','Mes missions récentes'])
  assert.ok(first.includes(name),name);
 assert.ok(!first.includes('<strong>Notifications</strong>'),'La carte Notifications est remplacée par Espace pro');
 assert.match(first,/data-pro-entry class="role-ref-action-card">\s*<span class="role-ref-card-icon pink"><svg class="nav-icon" aria-hidden="true"><use href="#ic-shield"\/><\/svg><\/span>\s*<strong>Espace pro<\/strong>/);
 for(const id of ['clientStatOpen','clientStatPublished','clientStatConversations','clientStatClosed','clientHomeUnread','clientHomeProLabel','roleRecentMissions'])
  assert.match(first,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(first,/data-tab="boamp"|role-premium-pill|roleBusinessName/);
});
test('Premium reference home requires the real paid or explicitly temporary authorization',()=>{
 for(const id of ['roleBusinessName','roleCompanyVerifiedText','rolePremiumUntil','roleAvailableCount','roleOwnCount','roleConversationCount','roleAlertCount'])
  assert.match(second,new RegExp('id="'+id+'"'));
 for(const title of ['Compte Professionnel','Premium','Missions disponibles','Mes réponses','Nouveaux messages','Alertes secteur',
  'Consulter les missions','Espace Premium','Mon activité','Mon profil pro'])
  assert.ok(second.includes(title),title);
 assert.match(app,/const eligiblePro=canUsePremium\(\)/);
 assert.match(app,/roleClientView'\)\.classList\.toggle\('hidden',eligiblePro\)/);
 assert.match(app,/rolePremiumView'\)\.classList\.toggle\('hidden',!eligiblePro\)/);
 assert.match(app,/function hasVerifiedProfessionalIdentity\(/);
 assert.match(app,/state\.subscription\?\.status==='active'/);
 assert.match(app,/Date\.parse\(state\.subscription\?\.paid_through/);
});
test('Statistics are derived from authorized Supabase data, never fabricated reference values',()=>{
 assert.match(app,/own\.filter\(m=>m\.status==='open'\)/);
 assert.match(app,/roleAvailableCount'\)\.textContent=String\(eligiblePro/);
 assert.match(app,/m\.status==='open'&&m\.owner_id!==state\.session\?\.user\?\.id/);
 assert.match(app,/state\.salesTracking/);
 assert.match(app,/const submitted=new Set/);
 assert.match(app,/state\.priorityAlerts\|\|\[\]/);
 assert.match(app,/state\.opportunityAlerts\|\|\[\]/);
 assert.match(app,/clientHomeUnread/);
 assert.match(app,/roleRecentMissions'\)\.innerHTML=own\.length/);
 assert.doesNotMatch(html,/>48<|>12<|>3 Nouveaux messages|Actif jusqu’au 02 déc/);
});
test('Mobile bottom navigation has distinct five real destinations per account',()=>{
 const nav=html.slice(html.indexOf('<nav id="nav"'),html.indexOf('</nav>',html.indexOf('<nav id="nav"')));
 for(const target of ['dashboard','missions','boamp','inbox','settings'])
  assert.match(nav,new RegExp('data-tab="'+target+'"'));
 assert.match(nav,/data-role-deposit/);
 assert.match(app,/data-role-deposit/);
 assert.match(app,/email_confirmed_at/);
 assert.match(app,/data-role-pro-screen/);
 assert.match(app,/if\(canUsePremium\(\)\)proExperience\.show/);
 assert.match(app,/missionsLabel\.textContent=eligiblePro/);
 assert.match(css,/\[data-offrya-role="premium"\].*\.nav-link\[data-tab="boamp"\]/);
 assert.match(css,/:not\(\[data-offrya-role="premium"\]\).*\.nav-link\[data-role-deposit\]/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
});
test('Faithful visual reference is scoped without hiding protected account settings on desktop',()=>{
 assert.match(html,/href="\/role-reference\.css"/);
 assert.match(css,/background:linear-gradient\(110deg,#4B0058/);
 assert.match(css,/\.role-client-hero/);
 assert.match(css,/\.role-ref-client-cards/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.role-premium-stats/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/@media \(max-width:780px\)/);
 assert.match(css,/@media \(max-width:360px\)/);
 assert.match(css,/\.role-reference-premium:not\(\.hidden\)\{display:block!important\}/);
 assert.doesNotMatch(css,/SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|OPENAI_API_KEY/);
 assert.match(server,/\/espace\/professionnel/);
 assert.match(server,/\['\/role-reference\.css','text\/css; charset=utf-8'\]/);
});
test('Premium mobile card has the same rounded contours and inset as desktop',()=>{
 const mobile=css.slice(css.indexOf('@media (max-width:780px)'),css.indexOf('@media (max-width:360px)'));
 const header=mobile.match(/body\.offrya-reference-ui #dashboard \.role-premium-top\{([^}]*)\}/)?.[1];
 const company=mobile.match(/body\.offrya-reference-ui #dashboard \.role-company\{([^}]*)\}/)?.[1];
 assert.ok(header,'Mobile Premium header CSS must exist');
 assert.ok(company,'Mobile company card CSS must exist');
 assert.match(header,/border-radius:18px 18px 0 0!important/);
 assert.match(header,/margin:0 13px!important/);
 assert.match(company,/border-radius:0 0 18px 18px!important/);
 assert.match(company,/margin:0 13px 17px!important/);
 assert.doesNotMatch(header,/border-radius:0!important/);
 assert.match(css,/body\.offrya-reference-ui #dashboard \.role-premium-top\{/);
});

test('Existing messaging, professional workflows and Auth/RLS remain connected',()=>{
 assert.match(app,/data-role-pro-screen/);
 assert.match(app,/proExperience\.show\(n\.dataset\.roleProScreen\)/);
 assert.match(app,/const proExperience=createProExperience/);
 assert.match(app,/paintMessageBadges\(\)/);
 assert.match(app,/acknowledgeConversation\(id,state\.messages\)/);
 assert.match(app,/const paths=\{dashboard:'\/espace'/);
 for(const button of ['data-tab="inbox"','data-tab="settings"','data-tab="missions"','data-tab="boamp"'])
  assert.ok(html.includes(button),button);
 const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});


test('Approved Premium Android quick access is precisely scoped to its three-card view',()=>{
 const start=css.indexOf('/* Accès rapide Premium Android — rendu validé.');
 assert.ok(start>0,'approved scoped Android CSS must be present');
 const mobile=css.slice(start);
 assert.match(mobile,/@media \(max-width:780px\)/);
 assert.match(mobile,/body\.offrya-reference-ui\[data-offrya-role="premium"\] #dashboard \.role-reference-premium/);
 assert.match(mobile,/\.role-section-heading h3\{/);
 assert.match(mobile,/\.role-section-heading p\{/);
 assert.match(mobile,/\.role-pro-links > button\[data-tab="missions"\]\{\s*display:none!important/);
 assert.match(mobile,/\.role-pro-links > button:not\(\[data-tab="missions"\]\)/);
 assert.match(mobile,/\.role-ref-link-icon/);
 assert.match(mobile,/@media \(max-width:360px\)/);
 // The original destinations and all four HTML buttons remain in the DOM.
 const cards=second.slice(second.indexOf('<div class="role-pro-links">'),second.indexOf('</div>',second.indexOf('<div class="role-pro-links">')));
 assert.equal((cards.match(/<button\b/g)||[]).length,4);
 for(const label of ['Espace Premium','Mon activité','Mon profil pro'])assert.ok(cards.includes(label));
 assert.match(cards,/data-tab="missions"/);
 assert.match(cards,/data-tab="boamp"/);
 assert.match(cards,/data-tab="settings"/);
 assert.match(cards,/data-role-pro-screen="tracking"/);
 assert.doesNotMatch(mobile,/#roleClientView|#missions \.|#professional \./);
});
