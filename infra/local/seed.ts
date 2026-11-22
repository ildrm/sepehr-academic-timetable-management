import { readFile } from 'node:fs/promises';
import { connect,Prisma,first } from '../../packages/backend-core/db';
import { passwordHash,developmentAllowed } from '../../packages/backend-core/auth';

async function main(){
  const url=process.env.DATABASE_URL;
  const secret=process.env.DEV_BOOTSTRAP_PASSWORD;
  if(!url||!/^\/academic_(?:local|test(?:_[a-z0-9]+)?)$/.test(new URL(url).pathname)||!developmentAllowed()
    ||process.env.ALLOW_SYNTHETIC_SEED!=='true'||!secret||secret.length<16)
    throw new Error('Synthetic seed requires an isolated academic_local/academic_test database, development authentication and a generated bootstrap password.');
  const db=connect();
  try{
    const hash=await passwordHash(secret), fixture=await readFile('tests/fixtures/academic.sql','utf8');
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(758201)`;
      const prior=await first(tx,Prisma.sql`SELECT 1 FROM org_unit WHERE code='SYN-INSTITUTION'`);
      if(!prior){
        if(await first(tx,Prisma.sql`SELECT 1 FROM org_unit LIMIT 1`))throw new Error('Fixture requires an empty or previously seeded synthetic database.');
        await tx.$executeRawUnsafe(fixture);
      }
      await tx.$executeRaw`INSERT INTO development_credential(actor_id,login,password_hash)
        SELECT id,subject,${hash} FROM identity_account WHERE issuer='local-development'
        ON CONFLICT(actor_id) DO UPDATE SET password_hash=EXCLUDED.password_hash`;
    });
  }finally{await db.$disconnect();}
  console.log('Synthetic academic fixture is ready.');
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'Seed failed');process.exitCode=1;});
