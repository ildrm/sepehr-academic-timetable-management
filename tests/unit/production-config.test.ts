import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseUrl,redisConnection,validateProduction} from '../../packages/backend-core/config';

test('production configuration fails closed for plaintext dependencies and development access',()=>{
  const changed=['APP_ENV','NODE_ENV','DATABASE_URL','QUEUE_REDIS_URL','ENABLE_DEVELOPMENT_AUTH'];
  const prior=new Map(changed.map(k=>[k,process.env[k]]));
  try{
    process.env.APP_ENV='production';
    process.env.DATABASE_URL='postgresql://runtime:test@db.example.invalid/academic';
    assert.throws(databaseUrl,/verify-full/);
    process.env.DATABASE_URL+='?sslmode=verify-full';
    assert.ok(databaseUrl().includes('verify-full'));
    process.env.QUEUE_REDIS_URL='redis://:secret@redis.example.invalid/2';
    assert.throws(redisConnection,/TLS/);
    process.env.QUEUE_REDIS_URL='rediss://:secret@redis.example.invalid/2';
    assert.equal(redisConnection().db,2);
    assert.equal(redisConnection().tls?.rejectUnauthorized,true);
    process.env.ENABLE_DEVELOPMENT_AUTH='true';
    assert.throws(()=>validateProduction('worker'),/Development authentication/);
  }finally{
    for(const [key,value] of prior)if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
