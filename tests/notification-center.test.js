'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/espace.html','utf8');
const css=fs.readFileSync('public/brand-kit.css','utf8');
test('La cloche ouvre un panneau de notifications au lieu de changer de page',()=>{
 assert.match(html,/id="messageShortcut" type="button" data-tab="inbox" aria-haspopup="dialog" aria-expanded="false" aria-label="Ouvrir les notifications" title="Notifications"/);
 assert.match(app,/const bell=e\.target\.closest\?\.\('#messageShortcut'\);\s*if\(bell\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);openNotificationPanel\(\);return;\}/);
 assert.match(app,/document\.addEventListener\('offrya:open-notifications',openNotificationPanel\);/);
 assert.match(css,/\.notif-panel\{position:fixed/);
});
test('Le panneau liste messages non lus et missions pertinentes ; chaque notification ouvre sa cible',()=>{
 assert.match(app,/kind:'message',id:c\.id/);
 assert.match(app,/for\(const m of notificationMissions\(\)\)items\.push\(\{kind:'mission'/);
 assert.match(app,/proExperience\.openNotification\(id\)/);
 assert.match(app,/tab\('inbox'\);state\.thread=id;renderInbox\(\);/);
 assert.match(app,/data-notif-read-all/);
 assert.match(app,/Aucune nouvelle notification\./);
});
test('La pastille de la cloche additionne messages non lus et missions pertinentes',()=>{
 assert.match(app,/const missionCount=notificationMissions\(\)\.length,all=total\+missionCount/);
 assert.match(app,/for\(const id of \['messageShortcutBubble','proV3AlertBubble'\]\)/);
 assert.match(app,/document\.addEventListener\('offrya:notifications-changed',\(\)=>paintMessageBadges\(\)\);/);
});
