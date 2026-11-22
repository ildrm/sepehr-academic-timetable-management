import { z } from 'zod';
import { Actor,allowed,lockSession } from './auth';
import { Database,Prisma,Reader,Transaction,decisionClock,first } from './db';
import { audit,recordEvent } from './events';
import { Problem } from './problem';

const value=z.string().min(1).max(120);
export const requestGrantDto=z.object({ruleCode:value,reasonRef:value,validUntil:z.iso.datetime({offset:true})}).strict();
export const decideGrantDto=z.object({decision:z.enum(['approve','reject','revoke']),reasonRef:value}).strict();
export const correctionDto=z.object({caseRef:value,reasonRef:value,outcome:z.enum(['in_progress','passed','failed','withdrawn']),
  grade:z.string().regex(/^\d{1,4}(\.\d{1,3})?$/).nullable(),earnedCredits:z.string().regex(/^\d{1,4}(\.\d{1,2})?$/)}).strict();
export const availabilityDto=z.object({start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true})}).strict();
type StudentScope={unit_id:bigint;policy_id:bigint};
async function lockTerm(tx:Transaction,term:bigint){
  if(!await first(tx,Prisma.sql`SELECT id FROM term WHERE id=${term} FOR UPDATE`))throw new Problem('ERR-011');
}
async function scope(db:Reader,student:bigint,term:bigint){
  const row=await first<StudentScope>(db,Prisma.sql`SELECT p.unit_id,st.policy_id FROM student_term st JOIN student_program sp ON sp.id=st.student_program_id
    JOIN program p ON p.id=sp.program_id WHERE st.student_id=${student} AND st.term_id=${term}`);
  if(!row)throw new Problem('ERR-003');
  return row;
}
export async function requestGrant(db:Database,actor:Actor,term:bigint,input:z.infer<typeof requestGrantDto>,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);await lockTerm(tx,term);
    const who=await scope(tx,actor.id,term),now=await decisionClock(tx);
    if(!await allowed(tx,actor.id,'student',who.unit_id,term))throw new Problem('ERR-003');
    const expiry=new Date(input.validUntil);
    if(expiry<=now)throw new Problem('ERR-013');
    const row=await first<{id:bigint}>(tx,Prisma.sql`SELECT id FROM academic_rule WHERE policy_id=${who.policy_id} AND rule_code=${input.ruleCode} AND waivable`);
    if(!row)throw new Problem('ERR-013');
    const pushed=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO exception_grant(student_id,term_id,rule_code,policy_id,requestor,reason_ref,valid_until,state)
      VALUES(${actor.id},${term},${input.ruleCode},${who.policy_id},${actor.id},${input.reasonRef},${expiry},'requested') RETURNING id`);
    if(!pushed)throw new Error('Approval request missing');
    await audit(tx,actor.id,actor.id,term,'exception.requested',input.reasonRef,requestId,now);
    return {id:String(pushed.id),state:'requested'};
  });
}
export async function myGrants(db:Database,actor:Actor,term:bigint){
  const who=await scope(db,actor.id,term);
  if(!await allowed(db,actor.id,'student',who.unit_id,term))throw new Problem('ERR-003');
  return db.$queryRaw`SELECT id::text,rule_code AS "ruleCode",state,valid_until AS "validUntil"
    FROM exception_grant WHERE student_id=${actor.id} AND term_id=${term} ORDER BY id DESC LIMIT 25`;
}
export async function reviewGrants(db:Database,actor:Actor,term:bigint){
  const rows=await db.$queryRaw<{id:string;unit_id:bigint;state:string;ruleCode:string;validUntil:Date}[]>`
    SELECT g.id::text,p.unit_id,g.state,g.rule_code AS "ruleCode",g.valid_until AS "validUntil" FROM exception_grant g
    JOIN student_term st ON st.student_id=g.student_id AND st.term_id=g.term_id
    JOIN student_program sp ON sp.id=st.student_program_id JOIN program p ON p.id=sp.program_id
    WHERE g.term_id=${term} ORDER BY g.id DESC LIMIT 100`;
  const visible=[];
  const grants=new Map<bigint,boolean>();
  for(const {unit_id,id,state,ruleCode,validUntil} of rows){
    if(!grants.has(unit_id))grants.set(unit_id,await allowed(db,actor.id,'academic_admin',unit_id,term));
    if(grants.get(unit_id))visible.push({id,state,ruleCode,validUntil});
  }
  return visible;
}
export async function decideGrant(db:Database,actor:Actor,term:bigint,grant:bigint,input:z.infer<typeof decideGrantDto>,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);await lockTerm(tx,term);
    const row=await first<{student_id:bigint;requestor:bigint;policy_id:bigint;state:string;valid_until:Date;rule_code:string}>(tx,
      Prisma.sql`SELECT * FROM exception_grant WHERE id=${grant} AND term_id=${term} FOR UPDATE`);
    if(!row)throw new Problem('ERR-011');
    const who=await scope(tx,row.student_id,term),now=await decisionClock(tx);
    if(row.requestor===actor.id||!await allowed(tx,actor.id,'academic_admin',who.unit_id,term))throw new Problem('ERR-003');
    if(row.state!==(input.decision==='revoke'?'approved':'requested')||
      (input.decision==='approve'&&(row.valid_until<=now||row.policy_id!==who.policy_id)))throw new Problem('ERR-013');
    if(input.decision==='approve'&&!await first(tx,Prisma.sql`SELECT 1 FROM academic_rule WHERE policy_id=${row.policy_id} AND rule_code=${row.rule_code} AND waivable`))
      throw new Problem('ERR-013');
    const state={approve:'approved',reject:'rejected',revoke:'revoked'}[input.decision];
    await tx.$executeRaw`UPDATE exception_grant SET approver=${actor.id},state=${state} WHERE id=${grant}`;
    await audit(tx,actor.id,row.student_id,term,'exception.'+state,input.reasonRef,requestId,now);
    await recordEvent(tx,'ExceptionDecided',term,'grant-'+grant,requestId,String(grant),1,now);
    return {id:String(grant),state};
  });
}
export async function correctRecord(db:Database,actor:Actor,student:bigint,term:bigint,record:bigint,input:z.infer<typeof correctionDto>,requestId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    if(!await first(tx,Prisma.sql`SELECT id FROM identity_account WHERE id=${student} FOR UPDATE`))throw new Problem('ERR-011');
    await tx.$queryRaw`SELECT t.id FROM term t JOIN student_term st ON st.term_id=t.id WHERE st.student_id=${student} ORDER BY t.id FOR UPDATE OF t`;
    const who=await scope(tx,student,term);
    if(!await allowed(tx,actor.id,'academic_office',who.unit_id,term)||!await first(tx,Prisma.sql`
      SELECT 1 FROM case_delegation WHERE case_ref=${input.caseRef} AND actor_id=${actor.id} AND student_id=${student} AND term_id=${term}
      AND valid_until>clock_timestamp()`))throw new Problem('ERR-003');
    const r=await first<{course_id:bigint;attempt_key:string;revision:number}>(tx,Prisma.sql`
      SELECT course_id,attempt_key,revision FROM academic_record a WHERE id=${record} AND student_id=${student}
      AND NOT EXISTS(SELECT 1 FROM academic_record b WHERE b.supersedes=a.id)`);
    if(!r)throw new Problem('ERR-008');
    if(input.outcome!=='passed'&&Number(input.earnedCredits)>0)throw new Problem('ERR-001');
    const newRecord=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO academic_record(student_id,course_id,attempt_key,revision,outcome,grade,earned_credits,supersedes)
      VALUES(${student},${r.course_id},${r.attempt_key},${r.revision+1},${input.outcome},${input.grade}::numeric,${input.earnedCredits}::numeric,${record}) RETURNING id`);
    if(!newRecord)throw new Error('Academic correction record missing');
    const now=await decisionClock(tx);
    await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id IN(SELECT term_id FROM student_term WHERE student_id=${student})`;
    await audit(tx,actor.id,student,term,'record.corrected',input.reasonRef,requestId,now);
    await recordEvent(tx,'RecordCorrected',term,`term-${term}/student-${student}`,requestId,String(newRecord.id),r.revision+1,now);
    return {id:String(newRecord.id),revision:r.revision+1};
  });
}
export async function instructorView(db:Database,actor:Actor,term:bigint){
  const row=await db.instructor.findUnique({where:{id:actor.id},select:{unit_id:true,workload_limit:true}});
  if(!row||!await allowed(db,actor.id,'instructor',row.unit_id,term))throw new Problem('ERR-003');
  const availability=await db.availability.findMany({where:{instructor_id:actor.id,term_id:term},orderBy:{starts_at:'asc'},take:100});
  const meetings=await db.$queryRaw<{course:string;room:string;duration:number}[]>`SELECT c.title AS course,r.code AS room,m.duration_minutes AS duration
    FROM meeting m JOIN timetable_version tv ON tv.id=m.version_id JOIN component cp ON cp.id=m.component_id
    JOIN section s ON s.id=cp.section_id JOIN offering o ON o.id=s.offering_id JOIN course c ON c.id=o.course_id
    JOIN room r ON r.id=m.room_id WHERE m.instructor_id=${actor.id} AND tv.term_id=${term} AND tv.state='published' LIMIT 200`;
  return {workloadLimit:row.workload_limit.toString(),availability:availability.map(a=>({start:a.starts_at,end:a.ends_at})),meetings};
}
export async function addAvailability(db:Database,actor:Actor,term:bigint,input:z.infer<typeof availabilityDto>,requestId:string){
  const start=new Date(input.start), end=new Date(input.end);
  if(start>=end)throw new Problem('ERR-001');
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);await lockTerm(tx,term);
    const row=await tx.instructor.findUnique({where:{id:actor.id},select:{unit_id:true}});
    if(!row||!await allowed(tx,actor.id,'instructor',row.unit_id,term))throw new Problem('ERR-003');
    const result=await tx.availability.create({data:{instructor_id:actor.id,term_id:term,starts_at:start,ends_at:end}});
    await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id=${term}`;
    await audit(tx,actor.id,null,term,'instructor.availability',String(result.id),requestId,await decisionClock(tx));
    return {id:String(result.id)};
  });
}
