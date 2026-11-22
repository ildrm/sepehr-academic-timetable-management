import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Actor,lockSession} from './auth';
import {Database,Prisma,Reader,Transaction,decisionClock,first,numericId} from './db';
import {audit} from './events';
import {authorizeIntent,canonical} from './intent';
import {quantity} from './policy';
import {Problem,unavailable} from './problem';
import {allocationCandidate,allocationSeats,bundleDto,guardStudent,guardPools} from './registration';
import {scopedTerm} from './timetable';
import {allocationInputSchema,allocationResultSchema} from './allocation-model';
import {commitAllocation} from './allocation-registration';

const reference=z.string().trim().min(1).max(120);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const date=z.iso.datetime({offset:true});
const classifications=z.enum(['general','foundational','core','specialized','elective']);
export const campaignDto=z.object({
  policyRef:reference,seedCommitment:hash,requiredClassifications:z.array(classifications).min(1).max(5),
  opensAt:date,closesAt:date,applicantLimit:z.number().int().min(1).max(64),
}).strict();
export const applicationDto=z.object({alternatives:z.array(z.array(bundleDto).min(1).max(8)).max(4)}).strict();
export const approvalDto=z.object({approvalRef:reference}).strict();
export const revealDto=z.object({seed:hash}).strict();
export const publishAllocationDto=approvalDto.extend({revisionHash:hash});
type Campaign={
  id:bigint;term_id:bigint;created_by:bigint;approved_by:bigint|null;policy_ref:string;approval_ref:string|null;
  seed_commitment:string;required_classifications:string[];opens_at:Date;closes_at:Date;applicant_limit:number;state:string;
};
type Run={
  id:bigint;state:string;revision_hash:string;requested_by:bigint;result:unknown;input:unknown;seed:string;error_code:string|null;
};
const digest=(x:string)=>createHash('sha256').update(x,'utf8').digest('hex');

async function campaign(db:Reader,term:bigint,id:bigint){
  const row=await first<Campaign>(db,Prisma.sql`SELECT * FROM allocation_campaign WHERE id=${id} AND term_id=${term}`);
  if(!row)throw new Problem('ERR-011');
  return row;
}
function campaignDisplay(c:Campaign){
  return {id:String(c.id),state:c.state,policyRef:c.policy_ref,opensAt:c.opens_at,closesAt:c.closes_at,
    seedCommitment:c.seed_commitment,requiredClassifications:c.required_classifications};
}

export async function createCampaign(db:Database,actor:Actor,term:bigint,v:z.infer<typeof campaignDto>,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    await scopedTerm(tx,actor,term,'planner',true);
    const now=await decisionClock(tx),open=new Date(v.opensAt),close=new Date(v.closesAt);
    if(open<now||open>=close||new Set(v.requiredClassifications).size!==v.requiredClassifications.length)
      throw new Problem('ERR-001');
    const bounds=await first<{closes_at:Date}>(tx,Prisma.sql`SELECT closes_at FROM term WHERE id=${term}`);
    if(!bounds||close>=bounds.closes_at)throw new Problem('ERR-001');
    const saved=await first<Campaign>(tx,Prisma.sql`
      INSERT INTO allocation_campaign(term_id,created_by,policy_ref,seed_commitment,required_classifications,opens_at,closes_at,applicant_limit)
      VALUES(${term},${actor.id},${v.policyRef},${v.seedCommitment},
        ARRAY[${Prisma.join([...v.requiredClassifications].sort())}]::text[],${open},${close},${v.applicantLimit}) RETURNING *`);
    if(!saved)throw new Error('campaign_missing');
    await audit(tx,actor.id,null,term,'allocation.campaign.created',String(saved.id),requestId,now);
    return campaignDisplay(saved);
  });
}

export async function approveCampaign(db:Database,actor:Actor,term:bigint,id:bigint,reference:string,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    await scopedTerm(tx,actor,term,'academic_admin',true);
    const c=await campaign(tx,term,id),now=await decisionClock(tx);
    if(c.created_by===actor.id)throw new Problem('ERR-003');
    if(c.state!=='draft'||now>=c.opens_at)throw new Problem('ERR-013');
    await tx.$executeRaw`UPDATE allocation_campaign SET state='open',approved_by=${actor.id},approval_ref=${reference} WHERE id=${id}`;
    await audit(tx,actor.id,null,term,'allocation.campaign.approved',String(id),requestId,now);
    return {state:'open'};
  });
}

type Applicant={id:string;student_id:bigint;alternatives:unknown};
export async function setApplication(db:Database,actor:Actor,term:bigint,id:bigint,v:z.infer<typeof applicationDto>,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    if(!await first(tx,Prisma.sql`SELECT id FROM term WHERE id=${term} FOR SHARE`))throw new Problem('ERR-011');
    await authorizeIntent(tx,actor.id,actor.id,term,'enroll');
    await tx.$queryRaw`SELECT id FROM allocation_campaign WHERE id=${id} AND term_id=${term} FOR UPDATE`;
    const c=await campaign(tx,term,id),now=await decisionClock(tx);
    if(c.state!=='open'||now<c.opens_at||now>=c.closes_at)throw new Problem('ERR-007');
    const alternatives=v.alternatives.map(option=>option.map(b=>({
      sectionId:String(numericId(b.sectionId)),componentIds:b.componentIds.map(x=>String(numericId(x))).sort(),
    })).sort((a,b)=>a.sectionId.localeCompare(b.sectionId)));
    const keys=alternatives.map(x=>JSON.stringify(x));
    if(new Set(keys).size!==keys.length||alternatives.some(option=>new Set(option.map(x=>x.sectionId)).size!==option.length
      ||option.some(b=>b.sectionId==='0'||b.componentIds.includes('0')||new Set(b.componentIds).size!==b.componentIds.length)))throw new Problem('ERR-001');
    for(const option of alternatives){
      // Resolve bundles from the authenticated student's offered term. Eligibility is assessed again at sealing.
      const found=await tx.$queryRaw<{id:string;component_ids:bigint[]}[]>`
        SELECT s.id::text AS id,b.component_ids FROM section_bundle b JOIN section s ON s.id=b.section_id JOIN offering o ON o.id=s.offering_id
        WHERE o.term_id=${term} AND s.id IN (${Prisma.join(option.map(x=>numericId(x.sectionId)))})`;
      if(option.some(b=>!found.some(row=>row.id===b.sectionId&&row.component_ids.map(String).sort().join(',')===b.componentIds.join(','))))
        throw new Problem('ERR-001');
    }
    if(alternatives.length){
      const total=await first<{active:number}>(tx,Prisma.sql`SELECT count(*)::int AS active FROM allocation_application
        WHERE campaign_id=${id} AND student_id<>${actor.id} AND jsonb_array_length(alternatives)>0`);
      if((total?.active??0)>=c.applicant_limit)throw new Problem('ERR-013');
    }
    await tx.$executeRaw`INSERT INTO allocation_application(id,campaign_id,student_id,alternatives)
      VALUES(${randomUUID()}::uuid,${id},${actor.id},${JSON.stringify(alternatives)}::jsonb)
      ON CONFLICT(campaign_id,student_id) DO UPDATE SET alternatives=EXCLUDED.alternatives,submitted_at=clock_timestamp()`;
    await audit(tx,actor.id,actor.id,term,'allocation.application.updated',String(id),requestId,now);
    return {state:alternatives.length?'submitted':'withdrawn',alternatives:alternatives.length};
  });
}

type Candidate=NonNullable<Awaited<ReturnType<typeof allocationCandidate>>>;
async function snapshotAllocation(tx:Transaction,c:Campaign,epoch:bigint,seed:string,now:Date){
  const applications=await tx.$queryRaw<Applicant[]>`SELECT id::text,student_id,alternatives FROM allocation_application
    WHERE campaign_id=${c.id} AND jsonb_array_length(alternatives)>0 ORDER BY id`;
  if(applications.length>c.applicant_limit)unavailable('allocation_workload_unconfigured');
  const students=[...new Set(applications.map(a=>a.student_id))].sort((a,b)=>a<b?-1:a>b?1:0);
  for(const s of students)await guardStudent(tx,s,c.term_id);
  const choices:(Candidate & {application:string;alternative:string;credits:number})[]=[];
  const applicants:{id:string;tier:number;requested:number}[]=[];
  const diagnostics:{id:string;unavailable:boolean;policy:string|null;revision:number|null}[]=[];
  for(const a of applications){
    const options=applicationDto.shape.alternatives.parse(a.alternatives);
    let requested=0,tier:number|undefined,policy:string|null=null,revision:number|null=null;
    for(const [i,option] of options.entries()){
      const found=await allocationCandidate(tx,a.student_id,c.term_id,option,now);
      if(!found)continue;
      tier=found.tier;policy=found.context.edition;revision=found.revision;
      const required=await tx.$queryRaw<{course_id:bigint}[]>`
        SELECT DISTINCT course_id FROM curriculum_course WHERE curriculum_id=${found.context.curriculum_id}
          AND classification IN (${Prisma.join(c.required_classifications)})`;
      const groups=new Set(required.map(r=>r.course_id));
      const credits=found.plan.additions.filter(x=>groups.has(x.course_id)||groups.has(x.canonical_id))
        .reduce((sum,x)=>sum+Number(quantity(x.credit_value,2)),0);
      requested=Math.max(requested,credits);
      if(found.eligible)choices.push({...found,application:a.id,alternative:a.id+':'+i,credits});
    }
    diagnostics.push({id:a.id,unavailable:tier===undefined,policy,revision});
    if(tier!==undefined)applicants.push({id:a.id,tier,requested});
  }
  const pools=choices.flatMap(x=>x.plan.additions.flatMap(s=>s.pools));
  await guardPools(tx,pools);
  const seats=await allocationSeats(tx,c.term_id,pools,now);
  const byPool=new Map<bigint,typeof seats>();
  for(const seat of seats){
    const group=byPool.get(seat.pool)??[];
    group.push(seat);
    byPool.set(seat.pool,group);
  }
  const input=allocationInputSchema.parse({algorithm:'tier-minimum-then-total-v1',seed,
    applicants:applicants.map(a=>({...a,options:choices.filter(o=>o.application===a.id).map(o=>({
      id:o.alternative,credits:o.credits,
      claims:o.plan.additions.flatMap((b,index)=>b.pools.map(p=>({index,
        seats:(byPool.get(p)??[]).filter(s=>s.group===null||o.reserveGroups.includes(s.group)).map(s=>s.id),
      }))),
    }))})),seats:seats.map(s=>({id:s.id,capacity:s.capacity}))});
  const revisions=choices.map(o=>[o.alternative,o.plan.additions.map(a=>[String(a.section_id),a.component_ids.map(String)])]);
  const revisionHash=digest(JSON.stringify(canonical({epoch:String(epoch),input,diagnostics,revisions,policy:c.policy_ref,approval:c.approval_ref})));
  return {input,revisionHash,choices,seats};
}

export function allocationBudget(){
  const raw=process.env.SOLVER_LIMIT_SECONDS;
  if(!raw||!/^[1-9]\d{0,2}$/.test(raw))unavailable('solver_budget_unconfigured');
  return Number(raw);
}

export async function planCampaign(db:Database,actor:Actor,term:bigint,id:bigint,seed:string,requestId:string){
  allocationBudget();
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'planner',true);
    const c=await campaign(tx,term,id),now=await decisionClock(tx);
    if(!['open','sealed'].includes(c.state)||now<c.closes_at||!c.approved_by||!c.approval_ref)throw new Problem('ERR-013');
    if(digest(seed)!==c.seed_commitment)throw new Problem('ERR-001');
    const existing=await first<Run>(tx,Prisma.sql`SELECT * FROM allocation_run WHERE campaign_id=${id} AND state IN ('queued','running','ready')`);
    if(existing&&existing.state!=='ready')return {runId:String(existing.id),status:existing.state,revisionHash:existing.revision_hash};
    const frozen=await snapshotAllocation(tx,c,t.epoch,seed,now);
    if(existing?.revision_hash===frozen.revisionHash)return {runId:String(existing.id),status:existing.state,revisionHash:existing.revision_hash};
    if(existing)await tx.$executeRaw`UPDATE allocation_run SET state='stale' WHERE id=${existing.id}`;
    const run=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO allocation_run(campaign_id,requested_by,input,revision_hash,seed)
      VALUES(${id},${actor.id},${JSON.stringify(frozen.input)}::jsonb,${frozen.revisionHash},${seed}) RETURNING id`);
    if(!run)throw new Error('allocation_run_missing');
    await tx.$executeRaw`UPDATE allocation_campaign SET state='sealed' WHERE id=${id}`;
    await audit(tx,actor.id,null,term,'allocation.run.queued',String(run.id),requestId,now);
    return {runId:String(run.id),status:'queued',revisionHash:frozen.revisionHash};
  },{timeout:30000,maxWait:5000});
}

export async function publishCampaign(db:Database,actor:Actor,term:bigint,id:bigint,runId:bigint,revisionHash:string,reference:string,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'academic_admin',true),c=await campaign(tx,term,id);
    const run=await first<Run>(tx,Prisma.sql`SELECT * FROM allocation_run WHERE id=${runId} AND campaign_id=${id} FOR UPDATE`);
    if(!run)throw new Problem('ERR-011');
    if(c.created_by===actor.id||run.requested_by===actor.id)throw new Problem('ERR-003');
    if(run.revision_hash!==revisionHash)throw new Problem('ERR-008');
    if(run.state==='published'&&c.state==='published')return {status:'published',runId:String(run.id)};
    if(run.state!=='ready'||c.state!=='sealed')throw new Problem('ERR-013');
    const result=allocationResultSchema.parse(run.result);
    if(result.status!=='OPTIMAL')throw new Problem('ERR-013');
    const now=await decisionClock(tx),current=await snapshotAllocation(tx,c,t.epoch,run.seed,now);
    if(current.revisionHash!==revisionHash){
      await tx.$executeRaw`UPDATE allocation_run SET state='stale',error_code='source_changed' WHERE id=${runId}`;
      await audit(tx,actor.id,null,term,'allocation.run.stale',String(run.id),requestId,now);
      return {status:'stale',runId:String(run.id)};
    }
    const count=await commitAllocation(tx,current.input,result,current.choices,current.seats,actor.id,requestId,now);
    await tx.$executeRaw`UPDATE allocation_run SET state='published',published_by=${actor.id},published_at=${now},publication_ref=${reference} WHERE id=${runId}`;
    await tx.$executeRaw`UPDATE allocation_campaign SET state='published' WHERE id=${id}`;
    await audit(tx,actor.id,null,term,'allocation.run.published',String(run.id),requestId,now);
    return {status:'published',runId:String(run.id),enrollments:count};
  },{timeout:30000,maxWait:5000});
}

function summarize(run:Run){
  const input=allocationInputSchema.parse(run.input),result=allocationResultSchema.safeParse(run.result);
  const winners=new Map(result.success?result.data.selected.map(x=>[x.application,x.option]):[]);
  const tiers=new Map<number,{tier:number;applicants:number;matched:number;requested:number;awarded:number}>();
  for(const a of input.applicants){
    const pool=tiers.get(a.tier)??{tier:a.tier,applicants:0,matched:0,requested:0,awarded:0};
    const match=a.options.find(o=>o.id===winners.get(a.id));
    pool.applicants++;
    if(match)pool.matched++;
    pool.requested+=a.requested;
    pool.awarded+=match?.credits??0;
    tiers.set(a.tier,pool);
  }
  return {runId:String(run.id),status:run.state,revisionHash:run.revision_hash,solverStatus:result.success?result.data.status:null,
    failure:run.error_code,tiers:[...tiers.values()].sort((a,b)=>a.tier-b.tier),zeroDemand:input.applicants.filter(a=>!a.requested).length};
}
export async function listCampaigns(db:Database,actor:Actor,term:bigint,staff:boolean){
  if(staff){
    try{await scopedTerm(db,actor,term,'planner');}catch(e){
      if(!(e instanceof Problem)||e.code!=='ERR-003')throw e;
      await scopedTerm(db,actor,term,'academic_admin');
    }
  }else await authorizeIntent(db,actor.id,actor.id,term,'enroll');
  const rows=await db.$queryRaw<Campaign[]>`SELECT * FROM allocation_campaign WHERE term_id=${term} AND (${staff} OR state<>'draft') ORDER BY id DESC LIMIT 30`;
  return Promise.all(rows.map(async c=>{
    const run=await first<Run>(db,Prisma.sql`SELECT * FROM allocation_run WHERE campaign_id=${c.id} ORDER BY id DESC LIMIT 1`);
    if(staff)return {...campaignDisplay(c),run:run?summarize(run):null};
    const app=await first<Applicant>(db,Prisma.sql`SELECT * FROM allocation_application WHERE campaign_id=${c.id} AND student_id=${actor.id}`);
    const alternatives=app?applicationDto.shape.alternatives.parse(app.alternatives):[];
    const result=run?.state==='published'?allocationResultSchema.parse(run.result):null;
    const match=result?.selected.find(s=>s.application===app?.id);
    return {...campaignDisplay(c),alternatives,selectedAlternative:match?Number(match.option.split(':').at(-1)):null};
  }));
}
