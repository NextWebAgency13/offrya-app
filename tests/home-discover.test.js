'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const home = read('public/index.html');
const css = read('public/public.css');

test('L’accueil permet de découvrir les six secteurs avant les explications', () => {
  assert.ok(home.indexOf('id="secteurs"') < home.indexOf('id="fonctionnement"'));
  assert.match(home, /href="#secteurs"/);
  for (const slug of ['batiment', 'nettoyage', 'espaces-verts', 'transport', 'informatique', 'autres-prestations']) {
    assert.match(home, new RegExp('class="sector" href="/secteurs/' + slug + '"'));
  }
  assert.equal((home.match(/class="sector" href=/g) || []).length, 6);
});

test('Le parcours de publication et la confidentialité ne changent pas', () => {
  assert.match(home, /Créez un compte gratuit et confirmez votre e-mail avant de publier/);
  assert.match(home, /seuls les professionnels vérifiés et abonnés peuvent les consulter/);
  assert.match(home, /href="\/deposer-une-mission"/);
  assert.match(home, /34,99 €[\s\S]*TTC \/ mois/);
  assert.doesNotMatch(home, /id="missionForm"|id="dashMissions"|id="boampList"|src="\/app.js"/);
});

test('Les cartes disposent de styles responsive et du respect des préférences de mouvement', () => {
  assert.match(css, /\.home-discover \.grid\.sectors/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(home, /aria-labelledby="secteurs-heading"/);
});
