import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {connect} from '../../../packages/backend-core/db';
import {databaseUrl,validateProduction} from '../../../packages/backend-core/config';
import {readPolicy} from '../../../packages/backend-core/policy';

async function migrate(){
  validateProduction('migration');
  const child=spawn(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{
    env:{...process.env,DATABASE_URL:databaseUrl()},stdio:'inherit',
  });
  return new Promise<void>((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error('Migration command failed')));
  });
}

async function preflight(){
  validateProduction('api');
  const db=connect();
  try{
    await db.$queryRaw`SELECT 1 FROM allocation_campaign, timetable_impact_review, worker_heartbeat LIMIT 0`;
    const policy=await db.policy_version.findMany({where:{state:'approved'},select:{parameters:true}});
    let institution=0;
    for(const p of policy){
      try{
        if(readPolicy(p.parameters).mode==='institutional')institution++;
      }catch{/* Invalid or synthetic policies do not count toward activation. */}
    }
    if(!institution)throw new Error('Approve at least one validated institutional academic policy');
    const rows=await db.$queryRaw<{oidcBindings:number;activeScopes:number;queueGuardMissing:number}[]>`
      SELECT
      (SELECT count(*)::int FROM identity_account WHERE issuer=${process.env.OIDC_ISSUER??''}) AS "oidcBindings",
      (SELECT count(*)::int FROM role_assignment r JOIN identity_account a ON a.id=r.actor_id
        WHERE a.issuer=${process.env.OIDC_ISSUER??''} AND r.valid_from<=clock_timestamp()
        AND r.valid_until>clock_timestamp()) AS "activeScopes",
      (SELECT count(*)::int FROM term t JOIN term_scope s ON s.term_id=t.id
        WHERE t.closes_at>clock_timestamp() AND NOT EXISTS (SELECT 1 FROM queue_guard q WHERE q.term_id=t.id)) AS "queueGuardMissing"`;
    const gate=rows[0];
    if(!gate?.oidcBindings||!gate.activeScopes||gate.queueGuardMissing)throw new Error('Provision institutional identities, role scopes and term queue guards');
    if(!existsSync('docx/artifacts/openapi.yaml'))throw new Error('Specification artifacts are absent from the application image');
    console.log(JSON.stringify({status:'ready_for_institutional_acceptance',approvedPolicies:institution,checks:['configuration','schema','catalog_policy','identity_mapping','term_guard']}));
  }finally{await db.$disconnect();}
}

async function main(){
  if(process.argv[2]==='migrate')return migrate();
  if(process.argv[2]==='preflight')return preflight();
  throw new Error('Specify migrate or preflight');
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'Release check failed');process.exitCode=1;});
