'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Premium alerts run every 15 minutes to save GitHub Actions minutes',()=>{
 const yml=fs.readFileSync('.github/workflows/alerts.yml','utf8');
 assert.match(yml,/cron: '4,19,34,49 \* \* \* \*'/);
 assert.match(yml,/github\.event\.schedule == '4,19,34,49 \* \* \* \*'/);
 assert.doesNotMatch(yml,/\*\/5 /);
});
