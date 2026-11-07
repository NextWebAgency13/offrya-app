'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const pub=path.join(__dirname,'../public');
const theme=fs.readFileSync(path.join(pub,'brand-kit.css'),'utf8');
const markup=fs.readFileSync(path.join(pub,'espace.html'),'utf8');
const begin=theme.indexOf('/* OFFRYA — Identité NEON 2026');
const block=theme.slice(begin);
const styles=block.replace(/\/\*[\s\S]*?\*\//g,'');
const fields=['dashboard','missions','boamp','inbox','settings','professional'];

test('Le nouveau thème est isolé au workspace connecté, sans changer les pages publiques',()=>{
 assert.ok(begin>0,'Ne pas supprimer le kit graphique historique');
 assert.match(markup,/<link rel="stylesheet" href="\/brand-kit\.css"><\/head>/);
 assert.match(styles,/@media\s*\(max-width:780px\)/);
 assert.match(styles,/@media\s*\(min-width:781px\)/);
 for(const tab of fields)assert.ok(markup.includes('id="'+tab+'"'),'onglet '+tab);
 assert.ok(styles.includes('body.offrya-reference-ui'),'the theme must be session-scoped');
 assert.doesNotMatch(styles,/body\s*\{|\bhtml\s*\{|\.mock-home|#proStageCompany\.hidden\s*\{/);
 assert.equal((theme.match(/{/g)||[]).length,(theme.match(/}/g)||[]).length);
});

test('Quatre motifs différents sur les cartes, sans fausses données ni détournement de clics',()=>{
 for(const i of [2,3,4])assert.ok(styles.includes('role-premium-stats > button:nth-child('+i+')'),'motif carte '+i);
 assert.match(styles,/repeating-radial-gradient/);
 assert.match(styles,/repeating-linear-gradient/);
 assert.match(styles,/radial-gradient\(circle,#ed58edaa/);
 assert.match(styles,/pointer-events:none/);
 assert.doesNotMatch(styles,/(\b(?:fetch|localStorage|sessionStorage|innerHTML)\b|display\s*:\s*none[^;]*#boamp)/);
});

test('Tous les parcours utiles disposent de styles propres et la navigation garde ses actions',()=>{
 for(const tab of ['#missions.active','#inbox.active','#settings.active','#boamp.active','#professional.active'])
  assert.ok(styles.includes(tab),tab);
 for(const action of ['data-tab="dashboard"','data-tab="missions"','data-tab="boamp"','data-tab="inbox"','data-tab="settings"'])
  assert.ok(markup.includes(action),action);
 assert.match(styles,/data-offrya-role="premium"/);
 assert.match(styles,/not\(\[data-offrya-role="premium"\]\)/);
 assert.match(styles,/focus-visible/);
 assert.match(styles,/prefers-reduced-motion:reduce/);
});
