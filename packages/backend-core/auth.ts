import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Database, Reader, first, Prisma } from './db';
import {production} from './config';
import { Problem, unavailable } from './problem';

const derive = (password:string,salt:string) => new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key)));
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export function developmentAllowed() {
  return process.env.APP_ENV === 'development' && process.env.NODE_ENV !== 'production'
    && process.env.ENABLE_DEVELOPMENT_AUTH === 'true';
}
export async function passwordHash(password: string, salt = randomBytes(16).toString('hex')) {
  const result = await derive(password, salt);
  return salt + ':' + Buffer.from(result).toString('hex');
}
export type Actor = { id: bigint; tokenHash: string; csrfHash: string };

export async function login(db: Database, loginId: string, password: string) {
  if (!developmentAllowed()) unavailable('identity_provider_unconfigured');
  const row = await first<{ actor_id: bigint; password_hash: string }>(db,
    Prisma.sql`SELECT actor_id,password_hash FROM development_credential WHERE login=${loginId}`);
  const stored = row?.password_hash ?? ('0'.repeat(32) + ':' + '0'.repeat(128));
  const candidate = await passwordHash(password, stored.split(':')[0]);
  if (!timingSafeEqual(Buffer.from(candidate),Buffer.from(stored)) || !row) throw new Problem('ERR-002');
  return connectSession(db,row.actor_id,28800);
}

export async function connectSession(db:Database,actorId:bigint,lifetimeSeconds:number,proof?:{staffAssurance:boolean}){
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  await db.$executeRaw`INSERT INTO web_session(token_hash,csrf_hash,actor_id,expires_at,authentication_source,staff_assurance)
    VALUES(${tokenHash(token)},${tokenHash(csrf)},${actorId},clock_timestamp()+make_interval(secs=>${lifetimeSeconds}::int),
      ${proof?'oidc':'development'},${proof?.staffAssurance??false})`;
  return {token,csrf,sessionId:tokenHash(token),lifetimeSeconds};
}

const currentSession=Prisma.sql`w.revoked_at IS NULL AND w.expires_at>clock_timestamp()
  AND (w.authentication_source='oidc' OR ${!production()})
  AND (w.authentication_source='development' OR w.staff_assurance OR NOT EXISTS(
    SELECT 1 FROM role_assignment r WHERE r.actor_id=w.actor_id AND r.role_code<>'student'
      AND r.valid_from<=clock_timestamp() AND r.valid_until>clock_timestamp()
  ))`;

export async function requireSession(db:Reader,token:string|undefined){
  if(!token||!tokenPattern.test(token))throw new Problem('ERR-002');
  const session=await first<{actor_id:bigint;csrf_hash:string}>(db,Prisma.sql`
    SELECT w.actor_id,w.csrf_hash FROM web_session w WHERE w.token_hash=${tokenHash(token)} AND ${currentSession}`);
  if(!session)throw new Problem('ERR-002');
  return {id:session.actor_id,csrfHash:session.csrf_hash,tokenHash:tokenHash(token)};
}

export function checkCsrf(actor: Actor, origin: string | undefined, token: string | undefined) {
  if (!origin || origin !== process.env.WEB_ORIGIN || !token || !tokenPattern.test(token)
    || !timingSafeEqual(Buffer.from(actor.csrfHash),Buffer.from(tokenHash(token)))) throw new Problem('ERR-003');
}

export async function lockSession(db: Reader, actor: Actor) {
  if (!await first(db, Prisma.sql`SELECT 1 FROM web_session w WHERE w.token_hash=${actor.tokenHash} AND w.actor_id=${actor.id} AND ${currentSession} FOR SHARE OF w`)) throw new Problem('ERR-002');
}

export async function allowed(db: Reader, actorId: bigint, role: string, unitId: bigint, termId?: bigint) {
  return Boolean(await first(db, Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id,ARRAY[id] AS seen FROM org_unit WHERE id=${unitId}
      UNION ALL SELECT u.id,u.parent_id,a.seen||u.id FROM org_unit u JOIN ancestors a ON a.parent_id=u.id
      WHERE NOT u.id=ANY(a.seen)
    )
    SELECT 1 FROM role_assignment r JOIN ancestors a ON a.id=r.unit_id
    WHERE r.actor_id=${actorId} AND r.role_code=${role}
    AND (r.term_id IS NULL OR r.term_id=${termId ?? null}::bigint)
    AND clock_timestamp()>=r.valid_from AND clock_timestamp()<r.valid_until LIMIT 1`));
}
