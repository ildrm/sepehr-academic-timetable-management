import { z } from 'zod';
import { Actor,allowed,lockSession } from './auth';
import { Database,Reader,Prisma,first,decisionClock,numericId } from './db';
import { compileRule,readPolicy } from './policy';
import { audit,recordEvent } from './events';
import { Problem } from './problem';

const word=z.string().trim().min(1).max(120);
const timestamp=z.iso.datetime({offset:true});
export const operationWindowDto=z.object({operation:z.enum(['enroll','drop','swap','joinWaitlist','respondToOffer','finalizeRegistration','changeForStudent']),
  opensAt:timestamp,closesAt:timestamp,approvalReference:word,epoch:z.number().int().nonnegative()}).strict();
export const capacityDto=z.object({capacity:z.number().int().min(0).max(100000),approvalReference:word,epoch:z.number().int().nonnegative()}).strict();
const ruleDto=z.object({code:word,stage:z.enum(['registration','finalization']),expression:z.unknown(),waivable:z.boolean(),courseCode:word.optional()}).strict();
export const policyDraftDto=z.object({unitId:word,edition:word,parameters:z.unknown(),rules:z.array(ruleDto).max(100)}).strict();
export const policyApproveDto=z.object({approvalReference:word}).strict();
export const curriculumDto=z.object({programId:word,edition:word,effectiveFrom:z.iso.date(),
  requirements:z.object({groups:z.array(z.object({id:word,courses:z.array(word).min(1).max(100),credits:z.string().regex(/^\d{1,4}(\.\d{1,2})?$/),
    minimumGrade:z.string().regex(/^\d{1,4}(\.\d{1,3})?$/).optional(),sharingKey:word.optional()}).strict()).min(1).max(24)}).strict()}).strict();
type Guard={id:bigint;unit_id:bigint;epoch:bigint;opens_at:Date;closes_at:Date};
async function termGuard(db:Reader,term:bigint){
  const row=await first<Guard>(db,Prisma.sql`SELECT t.id,s.unit_id,t.epoch,t.opens_at,t.closes_at FROM term t
    JOIN term_scope s ON s.term_id=t.id WHERE t.id=${term} FOR UPDATE OF t`);
  if(!row)throw new Problem('ERR-011');
  return row;
}
export async function setOperationWindow(db:Database,actor:Actor,term:bigint,input:z.infer<typeof operationWindowDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);const state=await termGuard(tx,term);
    if(!await allowed(tx,actor.id,'academic_admin',state.unit_id,term))throw new Problem('ERR-003');
    if(state.epoch!==BigInt(input.epoch))throw new Problem('ERR-008');
    const opens=new Date(input.opensAt),closes=new Date(input.closesAt);
    if(opens>=closes||opens<state.opens_at||closes>state.closes_at)throw new Problem('ERR-001');
    await tx.$executeRaw`INSERT INTO operation_window(term_id,operation,opens_at,closes_at) VALUES(${term},${input.operation},${opens},${closes})
      ON CONFLICT(term_id,operation) DO UPDATE SET opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at`;
    await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id=${term}`;
    await audit(tx,actor.id,null,term,'calendar.window',input.approvalReference,reqId,await decisionClock(tx));
    return {epoch:Number(state.epoch)+1};
  });
}
export async function setCapacity(db:Database,actor:Actor,term:bigint,pool:bigint,input:z.infer<typeof capacityDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);const state=await termGuard(tx,term);
    if(!await allowed(tx,actor.id,'academic_admin',state.unit_id,term))throw new Problem('ERR-003');
    if(state.epoch!==BigInt(input.epoch))throw new Problem('ERR-008');
    await tx.$queryRaw`SELECT term_id FROM queue_guard WHERE term_id=${term} FOR UPDATE`;
    if(!await first(tx,Prisma.sql`SELECT id FROM capacity_pool WHERE id=${pool} AND term_id=${term} FOR UPDATE`))throw new Problem('ERR-011');
    const count=await first<{claims:bigint;reserved:bigint;roomLimit:number|null}>(tx,Prisma.sql`SELECT
      (SELECT count(*) FROM seat_claim sc LEFT JOIN waitlist w ON w.id=sc.waitlist_id WHERE sc.pool_id=${pool}
      AND (sc.waitlist_id IS NULL OR (w.state='offered' AND w.expires_at>clock_timestamp()))) AS claims,
      (SELECT COALESCE(sum(seats),0) FROM reservation WHERE pool_id=${pool} AND release_at>clock_timestamp()) AS reserved,
      (SELECT min(r.capacity) FROM meeting m JOIN room r ON r.id=m.room_id JOIN component c ON c.id=m.component_id
      JOIN section s ON s.id=c.section_id JOIN timetable_version v ON v.id=m.version_id
      WHERE v.term_id=${term} AND v.state='published' AND (c.pool_id=${pool} OR s.pool_id=${pool})) AS "roomLimit"`);
    const proposed=BigInt(input.capacity);
    if(!count||count.roomLimit===null||input.capacity>count.roomLimit||proposed<count.claims||proposed<count.reserved)throw new Problem('ERR-005');
    await tx.$executeRaw`UPDATE capacity_pool SET capacity=${input.capacity} WHERE id=${pool}`;
    await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id=${term}`;
    const now=await decisionClock(tx),revision=Number(state.epoch)+1;
    await audit(tx,actor.id,null,term,'capacity.updated',input.approvalReference,reqId,now);
    await recordEvent(tx,'CapacityChanged',term,'capacity-'+pool,reqId,String(pool),revision,now);
    return {epoch:revision};
  });
}
export async function draftPolicy(db:Database,actor:Actor,input:z.infer<typeof policyDraftDto>,reqId:string){
  const policy=readPolicy(input.parameters);
  if(new Set(input.rules.map(r=>r.code)).size!==input.rules.length)throw new Problem('ERR-001');
  const scope=numericId(input.unitId);
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    if(!await allowed(tx,actor.id,'academic_office',scope))throw new Problem('ERR-003');
    const codes=await tx.course.findMany({select:{id:true,code:true}});
    const courses=new Map(codes.map(c=>[c.code,c.id]));
    if(await tx.policy_version.findFirst({where:{unit_id:scope,edition:input.edition}}))throw new Problem('ERR-008');
    const saved=await tx.policy_version.create({data:{unit_id:scope,edition:input.edition,state:'draft',
      parameters:policy}});
    for(const rule of input.rules){
      const compiled=compileRule(rule.expression);
      const pending=[compiled];
      while(pending.length){
        const node=pending.pop();if(!node)break;
        if('child' in node)pending.push(node.child);
        if('children' in node)pending.push(...node.children);
        if('course' in node&&!courses.has(node.course))throw new Problem('ERR-001');
        if('thresholdParam' in node&&policy.thresholds[node.thresholdParam]===undefined)throw new Problem('ERR-001');
        if('minParam' in node&&(policy.thresholds[node.minParam]===undefined||policy.thresholds[node.maxParam]===undefined))throw new Problem('ERR-001');
        if(node.op==='exception')throw new Problem('ERR-001');
      }
      const target=rule.courseCode?courses.get(rule.courseCode):null;
      if(rule.courseCode&&!target)throw new Problem('ERR-001');
      await tx.academic_rule.create({data:{policy_id:saved.id,rule_code:rule.code,stage:rule.stage,target_course_id:target,
        expression:compiled,waivable:rule.waivable}});
    }
    await tx.$executeRaw`INSERT INTO policy_author(policy_id,actor_id) VALUES(${saved.id},${actor.id})`;
    await tx.$executeRaw`INSERT INTO audit_entry(actor_id,action,decision_ref,request_id,occurred_at)
      VALUES(${actor.id},'policy.drafted',${String(saved.id)},${reqId},clock_timestamp())`;
    return {id:String(saved.id),state:'draft'};
  });
}
export async function approvePolicy(db:Database,actor:Actor,policy:bigint,input:z.infer<typeof policyApproveDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const row=await first<{unit_id:bigint;state:string;author:bigint;parameters:unknown}>(tx,Prisma.sql`
      SELECT p.unit_id,p.state,p.parameters,a.actor_id AS author FROM policy_version p JOIN policy_author a ON a.policy_id=p.id
      WHERE p.id=${policy} FOR UPDATE OF p`);
    if(!row)throw new Problem('ERR-011');
    if(row.author===actor.id||!await allowed(tx,actor.id,'academic_admin',row.unit_id))throw new Problem('ERR-003');
    if(row.state!=='draft'||await first(tx,Prisma.sql`SELECT 1 FROM student_term WHERE policy_id=${policy}`))throw new Problem('ERR-013');
    const options=readPolicy(row.parameters);
    await tx.policy_version.update({where:{id:policy},data:{state:'approved',parameters:{...options,approvalReference:input.approvalReference}}});
    await tx.$executeRaw`INSERT INTO audit_entry(actor_id,action,decision_ref,request_id,occurred_at)
      VALUES(${actor.id},'policy.approved',${input.approvalReference},${reqId},clock_timestamp())`;
    return {id:String(policy),state:'approved'};
  });
}
export async function createCurriculum(db:Database,actor:Actor,input:z.infer<typeof curriculumDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const program=await tx.program.findUnique({where:{id:numericId(input.programId)},select:{id:true,unit_id:true}});
    if(!program||!await allowed(tx,actor.id,'academic_office',program.unit_id))throw new Problem('ERR-003');
    for(const group of input.requirements.groups){
      if(group.courses.length!==await tx.course.count({where:{code:{in:group.courses}}}))throw new Problem('ERR-001');
    }
    if(new Set(input.requirements.groups.map(g=>g.id)).size!==input.requirements.groups.length)throw new Problem('ERR-001');
    const saved=await tx.curriculum_version.create({data:{program_id:program.id,edition:input.edition,effective_from:new Date(input.effectiveFrom),requirements:input.requirements}});
    await tx.$executeRaw`INSERT INTO curriculum_review(curriculum_id,author_id,state) VALUES(${saved.id},${actor.id},'draft')`;
    await tx.$executeRaw`INSERT INTO audit_entry(actor_id,action,decision_ref,request_id,occurred_at)
      VALUES(${actor.id},'curriculum.drafted',${String(saved.id)},${reqId},clock_timestamp())`;
    return {id:String(saved.id),state:'draft'};
  });
}
export async function approveCurriculum(db:Database,actor:Actor,id:bigint,input:z.infer<typeof policyApproveDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const row=await first<{author_id:bigint;state:string;unit_id:bigint}>(tx,Prisma.sql`SELECT x.author_id,x.state,p.unit_id FROM curriculum_review x
      JOIN curriculum_version v ON v.id=x.curriculum_id JOIN program p ON p.id=v.program_id WHERE x.curriculum_id=${id} FOR UPDATE OF x`);
    if(!row)throw new Problem('ERR-011');
    if(row.author_id===actor.id||!await allowed(tx,actor.id,'academic_admin',row.unit_id))throw new Problem('ERR-003');
    if(row.state!=='draft')throw new Problem('ERR-013');
    await tx.$executeRaw`UPDATE curriculum_review SET state='approved',approved_by=${actor.id} WHERE curriculum_id=${id}`;
    await tx.$executeRaw`INSERT INTO audit_entry(actor_id,action,decision_ref,request_id,occurred_at)
      VALUES(${actor.id},'curriculum.approved',${input.approvalReference},${reqId},clock_timestamp())`;
    return {id:String(id),state:'approved'};
  });
}
