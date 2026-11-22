import { randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import { connectSession,tokenHash } from './auth';
import { Database,first,Prisma } from './db';
import {setting} from './config';
import { Problem,unavailable } from './problem';

export function oidcReady(){
  return Boolean(process.env.OIDC_ISSUER&&process.env.OIDC_CLIENT_ID&&setting('OIDC_CLIENT_SECRET')&&process.env.WEB_ORIGIN?.startsWith('https://'));
}
let cached:Promise<oidc.Configuration>|null=null;
async function configuration(){
  const issuer=process.env.OIDC_ISSUER, id=process.env.OIDC_CLIENT_ID, secret=setting('OIDC_CLIENT_SECRET');
  if(!issuer||!id||!secret||!oidcReady())unavailable('identity_provider_unconfigured');
  const url=new URL(issuer);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)unavailable('identity_provider_unconfigured');
  if(!cached) cached=oidc.discovery(url,id,secret,oidc.ClientSecretBasic(secret),{timeout:8,execute:[oidc.enableNonRepudiationChecks]})
    .catch(()=>{cached=null;return unavailable('identity_provider_unavailable');});
  return cached;
}
const redirectUri=()=>new URL('/api/session/oidc/callback',process.env.WEB_ORIGIN);
export async function beginOidc(db:Database){
  const client=await configuration();
  const browser=randomBytes(32).toString('base64url');
  const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=oidc.randomPKCECodeVerifier();
  const url=oidc.buildAuthorizationUrl(client,{redirect_uri:redirectUri().href,scope:'openid',state,nonce,
    code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',max_age:'300',
    ...(process.env.OIDC_STAFF_ACR?{acr_values:process.env.OIDC_STAFF_ACR}:{})});
  await db.$executeRaw`DELETE FROM oidc_attempt WHERE expires_at<=clock_timestamp()`;
  await db.$executeRaw`INSERT INTO oidc_attempt(state_hash,browser_hash,nonce,verifier,expires_at)
    VALUES(${tokenHash(state)},${tokenHash(browser)},${nonce},${verifier},clock_timestamp()+interval '8 minutes')`;
  return {url,browser};
}
export async function completeOidc(db:Database,query:string,browser:string|undefined){
  const client=await configuration(),url=redirectUri();
  url.search=query;
  const state=url.searchParams.get('state');
  if(!state||state.length>256||!browser||!/^[A-Za-z0-9_-]{43}$/.test(browser))throw new Problem('ERR-002');
  const attempt=await first<{verifier:string;nonce:string}>(db,Prisma.sql`DELETE FROM oidc_attempt
    WHERE state_hash=${tokenHash(state)} AND browser_hash=${tokenHash(browser)} AND expires_at>clock_timestamp()
    RETURNING verifier,nonce`);
  if(!attempt)throw new Problem('ERR-002');
  try{
    const tokens=await oidc.authorizationCodeGrant(client,url,{pkceCodeVerifier:attempt.verifier,expectedState:state,
      expectedNonce:attempt.nonce,idTokenExpected:true,maxAge:300});
    const claims=tokens.claims();
    if(!claims)throw new Problem('ERR-002');
    const account=await db.identity_account.findUnique({where:{issuer_subject:{issuer:claims.iss,subject:claims.sub}},select:{id:true}});
    if(!account)throw new Problem('ERR-003');
    const staff=await first(db,Prisma.sql`SELECT 1 FROM role_assignment WHERE actor_id=${account.id} AND role_code<>'student'
      AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()`);
    const staffAssurance=!!process.env.OIDC_STAFF_ACR&&claims.acr===process.env.OIDC_STAFF_ACR;
    if(staff&&!staffAssurance)throw new Problem('ERR-003');
    return connectSession(db,account.id,900,{staffAssurance});
  }catch(e){
    if(e instanceof Problem)throw e;
    const code=e&&typeof e==='object'&&'code' in e&&typeof e.code==='string'&&/^[A-Z0-9_]{1,60}$/.test(e.code)?e.code:'unclassified';
    console.warn(JSON.stringify({event:'oidc_callback_rejected',code}));
    throw new Problem('ERR-002');
  }
}
