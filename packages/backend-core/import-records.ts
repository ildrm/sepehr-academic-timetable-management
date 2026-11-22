import {createHash} from 'node:crypto';
import {z} from 'zod';
import {Actor,allowed,lockSession} from './auth';
import {Database,Prisma,Reader,first,numericId} from './db';
import {Problem} from './problem';
import {canonical} from './intent';
const id=z.string().trim().min(1).max(120);
export const transferBatch=z.object({termId:id,sourceRef:id,approvalReference:id,mode:z.enum(['preview','apply']),
  rows:z.array(z.object({studentId:id,courseCode:id,attemptKey:id,grade:z.string().regex(/^\d{1,4}(\.\d{1,3})?$/).nullable(),
    outcome:z.enum(['passed','failed','withdrawn','in_progress']),credits:z.string().regex(/^\d{1,4}(\.\d{1,2})?$/)}).strict()).min(1).max(100)}).strict();
type Batch=z.infer<typeof transferBatch>;
async function inspect(db:Reader,actor:Actor,term:bigint,rows:Batch['rows']){
  const seen=new Set<string>();
  const ready:{course:bigint;student:bigint;row:Batch['rows'][number]}[]=[];
  const diagnostics:{row:number;code:string}[]=[];
  for(const [i,row] of rows.entries()){
    const student=numericId(row.studentId),key=String(student)+':'+row.attemptKey;
    const scope=await first<{unit_id:bigint}>(db,Prisma.sql`SELECT p.unit_id FROM student_term s
      JOIN student_program sp ON sp.id=s.student_program_id JOIN program p ON p.id=sp.program_id
      WHERE s.student_id=${student} AND s.term_id=${term}`);
    let code:string|null=null;
    if(!scope||!await allowed(db,actor.id,'academic_office',scope.unit_id,term))code='scope_denied';
    if(code){diagnostics.push({row:i+1,code});continue;}
    const course=await db.course.findUnique({where:{code:row.courseCode},select:{id:true,credits:true}});
    if(!course)code='course_unknown';
    else if(seen.has(key)||await first(db,Prisma.sql`SELECT 1 FROM academic_record WHERE student_id=${student} AND attempt_key=${row.attemptKey}`))code='attempt_conflict';
    else if(course.credits.lt(row.credits)||(row.outcome!=='passed'&&Number(row.credits)>0))code='credits_invalid';
    if(code||!course){diagnostics.push({row:i+1,code:code??'course_unknown'});continue;}
    ready.push({row,student,course:course.id});seen.add(key);
  }
  return {ready,diagnostics};
}
export async function importRecords(db:Database,actor:Actor,input:Batch,requestId:string){
  const term=numericId(input.termId);
  if(term===0n)throw new Problem('ERR-001');
  if(input.mode==='preview'){
    const {ready,diagnostics}=await inspect(db,actor,term,input.rows);
    return {status:'preview',inserted:0,eligible:ready.length,diagnostics};
  }
  const payloadHash=createHash('sha256').update(JSON.stringify(canonical({rows:input.rows,approval:input.approvalReference}))).digest('hex');
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const students=[...new Set(input.rows.map(x=>numericId(x.studentId)))];
    await tx.$queryRaw`SELECT id FROM identity_account WHERE id IN (${Prisma.join(students)}) ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM term t WHERE t.id=${term} OR EXISTS(SELECT 1 FROM student_term st
      WHERE st.term_id=t.id AND st.student_id IN (${Prisma.join(students)})) ORDER BY id FOR UPDATE`;
    const prior=await first<{payload_hash:string;inserted:number}>(tx,Prisma.sql`SELECT payload_hash,inserted FROM import_batch WHERE actor_id=${actor.id}
      AND term_id=${term} AND source_ref=${input.sourceRef}`);
    if(prior){
      if(prior.payload_hash!==payloadHash)throw new Problem('ERR-006');
      const current=await inspect(tx,actor,term,input.rows);
      if(current.diagnostics.some(d=>d.code==='scope_denied'))throw new Problem('ERR-003');
      return {status:'committed',inserted:prior.inserted,eligible:prior.inserted,diagnostics:[]};
    }
    const {ready,diagnostics}=await inspect(tx,actor,term,input.rows);
    if(diagnostics.length) return {status:'blocked',inserted:0,eligible:ready.length,diagnostics};
    // Historical imports use append-only first revisions and require a declared source and approval.
    for(const {row,course,student} of ready)await tx.$executeRaw`INSERT INTO academic_record(student_id,course_id,attempt_key,revision,outcome,grade,earned_credits)
      VALUES(${student},${course},${row.attemptKey},1,${row.outcome},${row.grade}::numeric,${row.credits}::numeric)`;
    await tx.$executeRaw`INSERT INTO import_batch(actor_id,term_id,source_ref,payload_hash,inserted)
      VALUES(${actor.id},${term},${input.sourceRef},${payloadHash},${ready.length})`;
    await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id IN(SELECT term_id FROM student_term WHERE student_id IN (${Prisma.join(students)}))`;
    await tx.$executeRaw`INSERT INTO audit_entry(actor_id,term_id,action,decision_ref,request_id,occurred_at)
      VALUES(${actor.id},${term},'records.imported',${input.approvalReference},${requestId},clock_timestamp())`;
    return {status:'committed',inserted:ready.length,eligible:ready.length,diagnostics:[]};
  },{timeout:15000});
}
