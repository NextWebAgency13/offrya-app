'use strict';
const crypto=require('node:crypto');
function signToken(id,secret){
 if(!/^[a-f0-9-]{36}$/i.test(id)||!secret||secret.length<32)throw Error('Configuration désabonnement invalide');
 const signature=crypto.createHmac('sha256',secret).update('offrya-alerts-v1:'+id).digest('base64url');
 return Buffer.from(id).toString('base64url')+'.'+signature;
}
function verifyToken(token,secret){
 if(!secret||secret.length<32||typeof token!=='string'||token.length>200)return null;
 const parts=token.split('.');if(parts.length!==2)return null;
 const id=Buffer.from(parts[0],'base64url').toString('utf8');
 if(!/^[0-9a-f-]{36}$/i.test(id))return null;
 const canonical=signToken(id,secret);
 const x=Buffer.from(canonical),y=Buffer.from(token);
 return x.length===y.length&&crypto.timingSafeEqual(x,y)?id:null;
}
module.exports={signToken,verifyToken};
