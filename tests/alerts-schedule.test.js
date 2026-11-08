'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Premium alerts run hourly to stay within the free GitHub Actions quota',()=>{
 const yml=fs.readFileSync('.github/workflows/alerts.yml','utf8');
 assert.match(yml,/cron: '7 \* \* \* \*'/);
 assert.match(yml,/github\.event\.schedule == '7 \* \* \* \*'/);
 assert.doesNotMatch(yml,/\*\/5 /);
 assert.doesNotMatch(yml,/4,19,34,49/);
});
