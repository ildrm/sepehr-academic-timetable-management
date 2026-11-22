import {readFileSync} from 'node:fs';

export function setting(name:string){
  const direct=process.env[name],file=process.env[name+'_FILE'];
  if(direct!==undefined&&file!==undefined)throw new Error('Set one source for '+name);
  if(!file)return direct;
  try{
    const value=readFileSync(file,'utf8').trimEnd();
    if(!value||value.includes('\n'))throw new Error('invalid file');
    return value;
  }catch{throw new Error('Could not read a single value from '+name+'_FILE');}
}

export function requiredSetting(name:string){
  const value=setting(name);
  if(!value)throw new Error('Set '+name);
  return value;
}

export function production(){
  return process.env.APP_ENV==='production'||process.env.NODE_ENV==='production';
}
export function databaseUrl(){
  const value=requiredSetting('DATABASE_URL');
  const url=new URL(value);
  if(!['postgresql:','postgres:'].includes(url.protocol))throw new Error('Set a PostgreSQL DATABASE_URL');
  if(production()&&(url.searchParams.get('sslmode')!=='verify-full'||!url.username||!url.password))
    throw new Error('Production PostgreSQL requires credentials and sslmode=verify-full');
  return value;
}
export function redisConnection(){
  const url=new URL(requiredSetting('QUEUE_REDIS_URL'));
  if(!['redis:','rediss:'].includes(url.protocol)||url.search||url.hash||!/^\/(?:[0-9]+)?$|^$/.test(url.pathname))
    throw new Error('Set an authenticated Redis URL with an optional database number');
  if(production()&&(url.protocol!=='rediss:'||!url.password))throw new Error('Production Redis requires TLS and credentials');
  const ca=process.env.QUEUE_REDIS_CA_FILE ? readFileSync(process.env.QUEUE_REDIS_CA_FILE,'utf8') : undefined;
  return {
    host:url.hostname,port:Number(url.port||6379),username:url.username?decodeURIComponent(url.username):undefined,
    password:url.password?decodeURIComponent(url.password):undefined,db:Number(url.pathname.slice(1)||0),
    maxRetriesPerRequest:null,
    ...(url.protocol==='rediss:'?{tls:{servername:url.hostname,ca,rejectUnauthorized:true}}:{}),
  };
}

export function validateProduction(role:'api'|'worker'|'migration'){
  if(!production())return;
  if(process.env.ENABLE_DEVELOPMENT_AUTH==='true'||process.env.ALLOW_SYNTHETIC_SEED==='true')
    throw new Error('Development authentication and synthetic seeding must be disabled in production');
  databaseUrl();
  if(role==='migration')return;
  if(!/^[1-9]\d{0,2}$/.test(requiredSetting('SOLVER_LIMIT_SECONDS')))
    throw new Error('Set the approved solver time budget in seconds');
  if(role==='worker'){
    redisConnection();
    return;
  }
  const origin=new URL(requiredSetting('WEB_ORIGIN'));
  const issuer=new URL(requiredSetting('OIDC_ISSUER'));
  if(origin.protocol!=='https:'||origin.origin!==process.env.WEB_ORIGIN||issuer.protocol!=='https:'||
    issuer.username||issuer.password||issuer.search||issuer.hash||process.env.COOKIE_SECURE!=='true')
    throw new Error('Use HTTPS institutional origins, verified OIDC and secure cookies');
  for(const name of ['OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','OIDC_STAFF_ACR'])requiredSetting(name);
  if(requiredSetting('CURSOR_SECRET').length<32)throw new Error('Use at least 32 characters for CURSOR_SECRET');
  if(!/^[1-9]\d{0,3}$/.test(requiredSetting('REQUEST_RETENTION_HOURS')))
    throw new Error('Set the approved request retention hours');
  if(!/^[1-9]\d{0,4}$/.test(requiredSetting('REPORT_MIN_CELL')))
    throw new Error('Set the approved positive report suppression threshold');
}
