'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const pro=fs.readFileSync('public/pro-experience.js','utf8');
const from=pro.indexOf('function greetingUsername(state){');
const to=pro.indexOf('export function createProExperience(',from);
assert.ok(from>=0&&to>from);
const resolveName=vm.runInNewContext(pro.slice(from,to)+'\ngreetingUsername');

test('The Pro greeting prefers the pseudonym stored in the user profile over any company name',()=>{
 assert.equal(resolveName({
  profile:{display_name:'ArtisanPierre'},
  session:{user:{user_metadata:{offrya_username:'PreviousPseudo'}}},
  premium:{legal_name:'Entreprise Maçonnerie SAS'}
 }),'ArtisanPierre');
 assert.doesNotMatch(pro,/rawLabel=String\(state\.premium\?\.legal_name/);
});
test('The Pro greeting supports legacy profiles with signup metadata but no saved profile pseudonym',()=>{
 assert.equal(resolveName({profile:{display_name:null},session:{user:{user_metadata:{offrya_username:'Astra_Pro13'}}}}),'Astra_Pro13');
});
test('Technical/test placeholders, UUIDs and HTML cannot become a displayed pseudonym',()=>{
 for(const value of [
  'user_edb8b5e034854ad7a37a91966',
  'ce15707c-6460-4119-8c36-28d5ad7a902f',
  '<script>danger</script>',
  'Professionnel OFFRYA',
  ''
 ]){
  assert.equal(resolveName({profile:{display_name:value},session:{user:{user_metadata:{}}}}),'',value);
 }
 assert.equal(resolveName({profile:{display_name:'user_edb8b5e034854ad7a37a91966'},session:{user:{user_metadata:{offrya_username:'ArtisanSud13'}}}}),'ArtisanSud13');
});
test('Greeting is built with textContent, not HTML, and has a neutral fallback when the user has no username',()=>{
 assert.match(pro,/<h2>Bonjour<span id="proV3Hello"><\/span><\/h2>/);
 assert.match(pro,/\$\('proV3Hello'\)\.textContent=username\?', '\+username:' !'/);
 assert.match(pro,/\$\('proV3Hello'\)\.title=username\?'Pseudonyme : '\+username:''/);
 assert.doesNotMatch(pro,/<h2>Bonjour, <span id="proV3Hello">professionnel<\/span>/);
});
test('UI module parses and premium access restrictions remain unchanged',()=>{
 const c=spawnSync(process.execPath,['--input-type=module','--check'],{input:pro,encoding:'utf8'});
 assert.equal(c.status,0,c.stderr);
 assert.match(pro,/if\(!initialized\|\|!canUsePremium\(\)\)return/);
 assert.match(pro,/return \(state\.missions\|\|\[\]\)\.filter\(m=>m\.owner_id!==current/);
});
