'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const sql=fs.readFileSync('sql/schema.sql','utf8');
test('Les fonctions privilégiées ne sont pas dans le schéma API public',()=>{
 const matches=[...sql.matchAll(/create(?: or replace)? function (public\.\w+)\([^)]*\)[\s\S]*?(?=\$\$;)/g)];
 assert.equal(/create or replace function public\.offrya_decide_quote[\s\S]*?security definer/i.test(sql),false);
 assert.match(sql,/create or replace function offrya_private\.decide_quote/);
 assert.match(sql,/create function public\.offrya_decide_quote[\s\S]*?security invoker/);
 assert.match(sql,/create schema if not exists offrya_private/);
});
