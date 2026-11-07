'use strict';
const {test,expect}=require('@playwright/test');

test('Accueil : accès aux parcours demandeur et professionnel',async({page},testInfo)=>{
  const response=await page.goto('/',{waitUntil:'domcontentloaded'});
  expect(response.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.offrya-entry-path[data-journey="client"]')).toBeVisible();
  await expect(page.locator('.offrya-entry-path[data-journey="professional"]')).toBeVisible();
  await expect(page.locator('.offrya-entry-path[data-journey="manage"]')).toBeVisible();
  await testInfo.attach('accueil-'+testInfo.project.name,{
    body:await page.screenshot({fullPage:true}),contentType:'image/png'
  });
});

test('Les deux pages commerciales sont accessibles sur Android et ordinateur',async({page})=>{
  for(const pathname of ['/deposer-une-mission','/professionnels']){
    const response=await page.goto(pathname,{waitUntil:'domcontentloaded'});
    expect(response.status(),pathname).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
  }
});

test('Les pages privées restent non indexables sans exposer de données Premium',async({request})=>{
  for(const pathname of ['/espace','/espace/marches-publics','/espace/missions']){
    const response=await request.get(pathname);
    expect(response.status(),pathname).toBe(200);
    expect(response.headers()['x-robots-tag'],pathname).toContain('noindex');
    expect(response.headers()['cache-control'],pathname).toContain('no-store');
    const html=await response.text();
    expect(html).toContain('name="robots" content="noindex,nofollow"');
  }
});

test('Search Console : robots et sitemap annoncent uniquement les pages publiques',async({request})=>{
  const [robots,sitemap]=await Promise.all([request.get('/robots.txt'),request.get('/sitemap.xml')]);
  expect(robots.status()).toBe(200);
  expect(sitemap.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://offrya.fr/sitemap.xml');
  const xml=await sitemap.text();
  expect(xml).toContain('<loc>https://offrya.fr/</loc>');
  expect(xml).not.toMatch(/<loc>[^<]*\/espace(?:\/|<)/);
});
