import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database,Reader,Transaction,first,Prisma,decisionClock,numericId } from './db';
import { Actor,allowed,lockSession } from './auth';
import { interval,overlaps,absoluteInterval } from './meeting';
import { nativeAccepts } from '../contracts/runtime';
import { Problem,unavailable } from './problem';
import { audit,recordEvent } from './events';
import { receipt } from './intent';
import { timetableImpact } from './timetable-impact';

const id=z.string().min(1).max(100);
const placement=z.object({id,room:id,instructor:id,campus:id,intervals:z.array(interval).min(1).max(128),
  penalty:z.number().int().nonnegative(),loadUnits:z.number().int().nonnegative(),preferenceCosts:z.array(z.number().int().nonnegative())});
const assignment=z.object({classId:id,placementId:id});
export const snapshotSchema=z.object({snapshotId:id,epoch:z.number().int().nonnegative(),zone:id,sourceFactsRef:id,
  configuration:z.object({seed:z.number().int().min(0).max(2147483647),objective:id,limitParameter:id}),
  classes:z.array(z.object({id,pinned:id.nullable(),placements:z.array(placement).max(500)})).min(1).max(250),
  constraints:z.object({forbiddenPairs:z.array(z.object({a:assignment,b:assignment,constraintId:id})).max(20000),
    workloadCaps:z.array(z.object({instructor:id,maxUnits:z.number().int().nonnegative()})),
    objectiveTiers:z.array(z.object({name:id,weight:z.number().int().positive()})).max(10)})});
export const assignmentsSchema=z.array(assignment).min(1).max(250);
type Snapshot=z.infer<typeof snapshotSchema>;
type Assigned=z.infer<typeof assignmentsSchema>;
type Placement=z.infer<typeof placement>;
type Term={id:bigint;unit_id:bigint;epoch:bigint;zone:string};
type Version={id:bigint;snapshot_id:string;content_hash:string;input_epoch:bigint;proposer_id:bigint;validator_ref:string|null;state:string;assignments:unknown};
type SnapRow={input:unknown;epoch:bigint;id:string};
type Job={id:bigint;state:string;input_uri:string;result:unknown;result_uri:string|null;error_code:string|null};
export const solverOutput=z.object({status:z.enum(['FEASIBLE','OPTIMAL','INFEASIBLE','UNKNOWN','MODEL_INVALID']),
  assignments:z.array(assignment),unassigned:z.array(id),snapshotId:id,inputSha256:z.string().regex(/^[a-f0-9]{64}$/),
  solverVersion:id,configurationId:id,objectiveVector:z.array(z.number().int().nonnegative()),
  objectiveScore:z.number().int().nullable(),boundVector:z.array(z.number().int()).nullable()});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');

export async function scopedTerm(db:Reader,actor:Actor,term:bigint,role:string,lock=false){
  const row=await first<Term>(db,Prisma.sql`SELECT t.id,s.unit_id,t.epoch,t.zone FROM term t JOIN term_scope s ON s.term_id=t.id
    WHERE t.id=${term} ${lock?Prisma.sql`FOR UPDATE OF t`:Prisma.empty}`);
  if(!row||!await allowed(db,actor.id,role,row.unit_id,term))throw new Problem('ERR-003');
  return row;
}
async function snapshot(db:Reader,term:bigint,key:string){
  const row=await first<SnapRow>(db,Prisma.sql`SELECT id,epoch,input FROM solve_snapshot WHERE id=${key} AND term_id=${term}`);
  if(!row)throw new Problem('ERR-011');
  return { ...row, input:snapshotSchema.parse(row.input) };
}
function resolveAssignments(input:Snapshot,assignments:Assigned){
  const resolved=new Map<string,Placement>();
  const conflicts:string[]=[];
  for(const a of assignments){
    const cls=input.classes.find(c=>c.id===a.classId);
    const p=cls?.placements.find(x=>x.id===a.placementId);
    if(!cls||!p||resolved.has(a.classId)|| (cls.pinned!==null&&cls.pinned!==a.placementId)){
      conflicts.push('CON-004:'+a.classId);continue;
    }
    resolved.set(a.classId,p);
  }
  for(const c of input.classes) if(!resolved.has(c.id)) conflicts.push('CON-003:'+c.id);
  const pairs=[...resolved];
  for(let i=0;i<pairs.length;i++) for(let j=0;j<i;j++){
    const [a,p]=pairs[i],[b,q]=pairs[j];
    if((p.room===q.room||p.instructor===q.instructor)&&p.intervals.some(x=>q.intervals.some(y=>overlaps(x,y))))
      conflicts.push('CON-002:'+a+':'+b);
  }
  for(const pair of input.constraints.forbiddenPairs)
    if(resolved.get(pair.a.classId)?.id===pair.a.placementId && resolved.get(pair.b.classId)?.id===pair.b.placementId)
      conflicts.push(pair.constraintId+':'+pair.a.classId+':'+pair.b.classId);
  for(const cap of input.constraints.workloadCaps)
    if(pairs.reduce((n,[,p])=>n+(p.instructor===cap.instructor?p.loadUnits:0),0)>cap.maxUnits)
      conflicts.push('CON-003:workload:'+cap.instructor);
  return {resolved,conflicts};
}
async function checkResources(db:Reader,t:Term,input:Snapshot,resolved:Map<string,Placement>){
  const conflicts:string[]=[];
  const required=await db.$queryRaw<{id:bigint}[]>`SELECT c.id FROM component c JOIN section s ON s.id=c.section_id
    JOIN offering o ON o.id=s.offering_id WHERE o.term_id=${t.id}`;
  if(required.length!==input.classes.length||required.some(c=>!resolved.has(String(c.id)))) conflicts.push('CON-003:term_component_inventory');
  for(const [classId,p] of resolved){
    const course=await first<{course_id:bigint;contact_minutes:number;capacity:number;room_capacity:number;campus:string}>(db,Prisma.sql`
      SELECT o.course_id,c.contact_minutes,cp.capacity,r.capacity AS room_capacity,r.campus
      FROM component c JOIN section s ON s.id=c.section_id JOIN offering o ON o.id=s.offering_id
      JOIN capacity_pool cp ON cp.id=c.pool_id JOIN room r ON r.code=${p.room}
      WHERE c.id=${numericId(classId)} AND o.term_id=${t.id}`);
    if(!course||course.capacity>course.room_capacity||course.campus!==p.campus
      || p.intervals.reduce((sum,d)=>sum+d.endMinute-d.startMinute,0)!==course.contact_minutes){
      conflicts.push('CON-001:'+classId);continue;
    }
    const inventory=await first<{workload:string;roomsOk:boolean}>(db,Prisma.sql`
      SELECT i.workload_limit::text AS workload,NOT EXISTS(
        SELECT 1 FROM component_room_requirement cr WHERE cr.component_id=${numericId(classId)}
        AND NOT EXISTS (SELECT 1 FROM room_feature f JOIN room r ON r.id=f.room_id
          WHERE r.code=${p.room} AND f.feature=cr.feature)
      ) AS "roomsOk" FROM instructor i WHERE i.id=${numericId(p.instructor)}`);
    if(!inventory?.roomsOk||!input.constraints.workloadCaps.some(c=>c.instructor===p.instructor&&c.maxUnits<=Number(inventory.workload))
      ||p.loadUnits<=0)conflicts.push('CON-001:resource_configuration:'+classId);
    for(const d of p.intervals){
      const times=absoluteInterval(d,t.zone);
      if(!await first(db,Prisma.sql`SELECT 1 FROM qualification q JOIN availability a ON a.instructor_id=q.instructor_id
         WHERE q.instructor_id=${numericId(p.instructor)} AND q.course_id=${course.course_id}
         AND a.term_id=${t.id} AND q.valid_from<=${d.weekDate}::date AND (q.valid_until IS NULL OR q.valid_until>${d.weekDate}::date)
         AND a.starts_at<=${times.start}
         AND a.ends_at>=${times.end}`))
        conflicts.push('CON-001:availability:'+classId+':'+d.weekDate);
    }
  }
  return conflicts;
}
export async function saveSnapshot(db:Database,actor:Actor,term:bigint,raw:unknown,requestId:string){
  if(!nativeAccepts('solver-input',raw))throw new Problem('ERR-001');
  const input=snapshotSchema.parse(raw);
  const names=new Set(input.classes.map(c=>c.id));
  if(names.size!==input.classes.length || input.classes.some(c=>new Set(c.placements.map(p=>p.id)).size!==c.placements.length)
    || input.classes.reduce((sum,c)=>sum+c.placements.length,0)>2500)throw new Problem('ERR-001');
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'planner',true);
    if(BigInt(input.epoch)!==t.epoch||input.zone!==t.zone) throw new Problem('ERR-008');
    if(!await tx.$executeRaw`INSERT INTO solve_snapshot(id,term_id,epoch,input,created_by)
      VALUES(${input.snapshotId},${term},${t.epoch},${JSON.stringify(input)}::jsonb,${actor.id}) ON CONFLICT DO NOTHING`)
      throw new Problem('ERR-008');
    await audit(tx,actor.id,null,term,'snapshot.created',input.snapshotId,requestId,await decisionClock(tx));
    return {snapshotId:input.snapshotId,epoch:input.epoch};
  });
}
export async function startSolve(db:Database,actor:Actor,term:bigint,key:string,configurationId:string,requestId:string){
  const limit=process.env.SOLVER_LIMIT_SECONDS;
  if(!limit||!/^([1-9]\d{0,2})$/.test(limit)) unavailable('solver_budget_unconfigured');
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'planner',true);
    const snap=await snapshot(tx,term,key);
    if(snap.epoch!==t.epoch)throw new Problem('ERR-008');
    const config={configurationId,limit:Number(limit)};
    const row=await first<Job>(tx,Prisma.sql`INSERT INTO solve_job(term_id,snapshot_hash,input_uri,solver_version,config,state,created_by)
      VALUES(${term},${sha(JSON.stringify(snap.input))},${key},'ortools-9.14.6206',${JSON.stringify(config)}::jsonb,'queued',${actor.id}) RETURNING *`);
    if(!row)throw new Error('Solve job unavailable');
    const now=await decisionClock(tx);
    await audit(tx,actor.id,null,term,'solver.requested',key,requestId,now);
    await recordEvent(tx,'SolveRequested',term,'solve-'+row.id,requestId,String(row.id),1,now);
    return runResponse(row);
  });
}
function runResponse(row:Job){
  const v=solverOutput.safeParse(row.result);
  return {runId:String(row.id),state:row.state,snapshotId:row.input_uri,resultRef:row.result_uri,solverStatus:v.success?v.data.status:null,
    unassignedCount:v.success?v.data.unassigned.length:null};
}
export async function getSolve(db:Database,actor:Actor,term:bigint,run:bigint){
  await scopedTerm(db,actor,term,'planner');
  const row=await first<Job>(db,Prisma.sql`SELECT * FROM solve_job WHERE term_id=${term} AND id=${run}`);
  if(!row)throw new Problem('ERR-011');
  return runResponse(row);
}
export async function saveProposal(db:Database,actor:Actor,term:bigint,key:string,assignments:Assigned,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'planner',true),snap=await snapshot(tx,term,key);
    if(snap.epoch!==t.epoch)throw new Problem('ERR-008');
    const a=[...assignments].sort((x,y)=>x.classId.localeCompare(y.classId,'en'));
    return insertProposal(tx,term,snap.id,t.epoch,a,actor.id,requestId);
  });
}
export async function insertProposal(tx:Transaction,term:bigint,key:string,epoch:bigint,assignments:Assigned,actor:bigint,requestId:string){
  const hash=sha(JSON.stringify({snapshotId:key,epoch:String(epoch),assignments}));
  const persisted=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO timetable_version(term_id,state,input_epoch,content_hash,proposer_id,snapshot_id,assignments)
     VALUES(${term},'proposed',${epoch},${hash},${actor},${key},${JSON.stringify(assignments)}::jsonb) RETURNING id`);
  if(!persisted)throw new Error('Timetable insert failed');
  await audit(tx,actor,null,term,'timetable.proposed',hash,requestId,await decisionClock(tx));
  return {versionId:String(persisted.id),contentHash:hash};
}
async function version(db:Reader,term:bigint,key:bigint){
  const row=await first<Version>(db,Prisma.sql`SELECT * FROM timetable_version WHERE id=${key} AND term_id=${term} FOR UPDATE`);
  if(!row)throw new Problem('ERR-011');
  return row;
}
export async function getProposal(db:Database,actor:Actor,term:bigint,key:bigint){
  try{await scopedTerm(db,actor,term,'planner');}catch(e){
    if(!(e instanceof Problem)||e.code!=='ERR-003')throw e;
    await scopedTerm(db,actor,term,'academic_admin');
  }
  const row=await first<Version>(db,Prisma.sql`SELECT * FROM timetable_version WHERE id=${key} AND term_id=${term}`);
  if(!row)throw new Problem('ERR-011');
  if(!row.snapshot_id)return {versionId:String(row.id),snapshotId:null,assignments:[]};
  return {versionId:String(row.id),snapshotId:row.snapshot_id,assignments:assignmentsSchema.parse(row.assignments)};
}
export async function listProposals(db:Database,actor:Actor,term:bigint){
  try { await scopedTerm(db,actor,term,'planner'); } catch(e) {
    if(!(e instanceof Problem)||e.code!=='ERR-003')throw e;
    await scopedTerm(db,actor,term,'academic_admin');
  }
  return db.$queryRaw`SELECT id::text AS "versionId",state,validator_ref AS "validationRef",content_hash AS "contentHash"
    FROM timetable_version WHERE term_id=${term} ORDER BY id DESC LIMIT 50`;
}
export async function validateProposal(db:Database,actor:Actor,term:bigint,versionId:bigint,hash:string,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'planner',true);
    const v=await version(tx,term,versionId);
    if(v.content_hash!==hash||v.input_epoch!==t.epoch)throw new Problem('ERR-008');
    if(!['proposed','validated'].includes(v.state))throw new Problem('ERR-013');
    const snap=await snapshot(tx,term,v.snapshot_id);
    const a=resolveAssignments(snap.input,assignmentsSchema.parse(v.assignments));
    const conflicts=[...a.conflicts,...await checkResources(tx,t,snap.input,a.resolved)];
    const validation=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO validation_record(version_id,content_hash,checked_epoch,validator_build,passed,conflict_report,checked_at)
      VALUES(${v.id},${hash},${t.epoch},'independent-0.1',${!conflicts.length},${JSON.stringify(conflicts)}::jsonb,clock_timestamp()) RETURNING id`);
    if(!validation)throw new Error('Validation record missing');
    await tx.$executeRaw`UPDATE timetable_version SET state=${conflicts.length?'proposed':'validated'},validator_ref=${String(validation.id)} WHERE id=${v.id}`;
    await audit(tx,actor.id,null,term,'timetable.validated',String(validation.id),requestId,await decisionClock(tx));
    return {versionId:String(v.id),valid:!conflicts.length,contentHash:hash,conflicts};
  });
}
async function assessRepair(db:Reader,t:Term,v:Version){
  if(v.state!=='validated'||!v.validator_ref)throw new Problem('ERR-013');
  if(v.input_epoch!==t.epoch)throw new Problem('ERR-008');
  const snap=await snapshot(db,t.id,v.snapshot_id);
  const {resolved,conflicts}=resolveAssignments(snap.input,assignmentsSchema.parse(v.assignments));
  if(conflicts.length)throw new Problem('ERR-008');
  return timetableImpact(db,t.id,t.zone,resolved);
}

export async function inspectImpact(db:Database,actor:Actor,term:bigint,versionId:bigint){
  return db.$transaction(async tx=>{
    let t:Term;
    try{t=await scopedTerm(tx,actor,term,'planner',true);}catch(e){
      if(!(e instanceof Problem)||e.code!=='ERR-003')throw e;
      t=await scopedTerm(tx,actor,term,'academic_admin',true);
    }
    const v=await version(tx,term,versionId);
    const {students,...impact}=await assessRepair(tx,t,v);
    const review=await first<{id:bigint}>(tx,Prisma.sql`
      SELECT id FROM timetable_impact_review WHERE version_id=${v.id}
      AND validation_id=${numericId(v.validator_ref??'')} AND impact_hash=${impact.impactHash}`);
    return {...impact,reviewed:!!review,affectedStudents:students.length};
  });
}

export async function reviewImpact(db:Database,actor:Actor,term:bigint,versionId:bigint,digest:string,reference:string,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await scopedTerm(tx,actor,term,'academic_admin',true),v=await version(tx,term,versionId);
    if(v.proposer_id===actor.id)throw new Problem('ERR-003');
    const impact=await assessRepair(tx,t,v);
    if(impact.impactHash!==digest)throw new Problem('ERR-008');
    if(!impact.affectedStudents||impact.blockedStudents)throw new Problem('ERR-013');
    await tx.$executeRaw`INSERT INTO timetable_impact_review
      (version_id,validation_id,previous_version_id,content_hash,impact_hash,reviewer_id,approval_ref,affected_students)
      VALUES(${v.id},${numericId(v.validator_ref??'')},${impact.previousVersionId?numericId(impact.previousVersionId):null},
        ${v.content_hash},${digest},${actor.id},${reference},${impact.affectedStudents})
      ON CONFLICT(version_id,validation_id,impact_hash) DO NOTHING`;
    await audit(tx,actor.id,null,term,'timetable.impact.reviewed',digest,requestId,await decisionClock(tx));
    return {reviewed:true,affectedStudents:impact.affectedStudents};
  });
}

export async function publish(tx:Transaction,actor:Actor,term:bigint,versionId:bigint,hash:string,validationRef:string,requestId:string){
  const t=await scopedTerm(tx,actor,term,'academic_admin',true),v=await version(tx,term,versionId);
  if(v.proposer_id===actor.id) throw new Problem('ERR-003');
  if(v.content_hash!==hash||v.input_epoch!==t.epoch||v.validator_ref!==validationRef)throw new Problem('ERR-008');
  if(v.state!=='validated'||!await first(tx,Prisma.sql`SELECT 1 FROM validation_record WHERE id=${numericId(validationRef)}
    AND version_id=${v.id} AND passed AND checked_epoch=${t.epoch} AND content_hash=${hash}`)) throw new Problem('ERR-013');
  const snap=await snapshot(tx,term,v.snapshot_id), a=resolveAssignments(snap.input,assignmentsSchema.parse(v.assignments));
  if(a.conflicts.length || (await checkResources(tx,t,snap.input,a.resolved)).length)throw new Problem('ERR-008');
  const impact=await timetableImpact(tx,term,t.zone,a.resolved);
  if(impact.blockedStudents)throw new Problem('ERR-004',impact.issues.map(reasonCode=>({
    ruleId:'timetable_impact',reasonCode,messageKey:reasonCode,
  })));
  if(impact.affectedStudents&&!await first(tx,Prisma.sql`SELECT 1 FROM timetable_impact_review
    WHERE version_id=${v.id} AND validation_id=${numericId(validationRef)} AND content_hash=${hash}
      AND impact_hash=${impact.impactHash}`))throw new Problem('ERR-008',[{
      ruleId:'timetable_impact',reasonCode:'impact_review_required',messageKey:'impact_review_required',
    }]);
  for(const [c,p] of a.resolved)for(const i of p.intervals){
    await tx.$executeRaw`INSERT INTO meeting(version_id,component_id,instructor_id,room_id,local_day,local_start,duration_minutes,week_dates,zone,exception_dates)
      SELECT ${v.id},${numericId(c)},${numericId(p.instructor)},r.id,EXTRACT(ISODOW FROM ${i.weekDate}::date)::smallint,
      make_time(${Math.floor(i.startMinute/60)}::int,${i.startMinute%60}::int,0),
      ${i.endMinute-i.startMinute}::int,ARRAY[${i.weekDate}::date],${t.zone},'{}'::jsonb FROM room r WHERE r.code=${p.room}`;
  }
  await tx.$executeRaw`UPDATE timetable_version SET state='superseded' WHERE term_id=${term} AND state='published'`;
  await tx.$executeRaw`UPDATE timetable_version SET state='published' WHERE id=${v.id}`;
  await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id=${term}`;
  const now=await decisionClock(tx);
  if(impact.students.length)await tx.$executeRaw`INSERT INTO timetable_change_notice
    (version_id,student_id,term_id,changed_components,published_at)
    SELECT ${v.id},student::bigint,${term},components,${now}
    FROM jsonb_to_recordset(${JSON.stringify(impact.students.map(s=>({student:s.student,components:s.changedComponents.length})))}::jsonb)
    AS changed(student text,components integer)`;
  await audit(tx,actor.id,null,term,'timetable.published',hash,requestId,now);
  await recordEvent(tx,'TimetablePublished',term,'timetable-'+term,requestId,String(v.id),1,now);
  return receipt(requestId,v.id,1);
}
export const requestId=()=>randomUUID();
