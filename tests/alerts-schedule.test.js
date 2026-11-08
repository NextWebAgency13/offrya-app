'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Premium alerts run every 5 minutes, the shortest GitHub Actions schedule',()=>{
 const yml=fs.readFileSync('.github/workflows/alerts.yml','utf8');
 assert.match(yml,/cron: '\*\/5 \* \* \* \*'/);
 assert.match(yml,/github\.event\.schedule == '\*\/5 \* \* \* \*'/);
 assert.match(yml,/cron: '17 7 \* \* \*'/);
});
