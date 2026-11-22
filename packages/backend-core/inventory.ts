import {z} from 'zod';
import { Actor,allowed,lockSession } from './auth';
import { Database,Transaction,Prisma,first,numericId,decisionClock } from './db';
import { audit } from './events';
import { Problem } from './problem';
import { normalizeSearch } from './portal';

const word=z.string().trim().min(1).max(120);
const whole=z.number().int().nonnegative().max(100000);
const credits=z.string().regex(/^\d{1,4}(\.\d{1,2})?$/);
export const courseDto=z.object({unitId:word,code:word,title:word,credits}).strict();
export const roomDto=z.object({code:word,campus:word,capacity:whole,features:z.array(word).max(25)}).strict();
const cp=z.object({key:word,kind:z.enum(['lecture','lab','tutorial']),capacity:whole,contactMinutes:whole.min(1),
  features:z.array(word).max(20),sharedPoolId:word.optional()}).strict();
export const offeringDto=z.object({termId:word,unitId:word,courseCode:word,sectionCode:word,
  sectionCapacity:whole,sharedPoolId:word.optional(),components:z.array(cp).min(1).max(24),
  permittedBundles:z.array(z.array(word).min(1).max(24)).min(1).max(100)}).strict();
const validIana=z.string().min(1).max(64).refine(value=>{
  try {new Intl.DateTimeFormat('en',{timeZone:value}).format();return value.includes('/');}catch{return false;}
});
export const newTermDto=z.object({unitId:word,code:word,zone:validIana,opensAt:z.iso.datetime({offset:true}),closesAt:z.iso.datetime({offset:true})}).strict();
export const admissionDto=z.object({studentId:word,programId:word,curriculumId:word,policyId:word,specialization:word.optional(),
  admittedOn:z.iso.date(),appointmentOpens:z.iso.datetime({offset:true}),appointmentCloses:z.iso.datetime({offset:true}),approvalReference:word}).strict();

async function log(tx:Transaction,actor:Actor,action:string,ref:string,requestId:string){
  await tx.$executeRaw`INSERT INTO audit_entry(actor_id,action,decision_ref,request_id,occurred_at)
    VALUES(${actor.id},${action},${ref},${requestId},clock_timestamp())`;
}
export async function createCourse(db:Database,actor:Actor,v:z.infer<typeof courseDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    if(!await allowed(tx,actor.id,'academic_office',numericId(v.unitId)))throw new Problem('ERR-003');
    const course=await tx.course.create({data:{code:v.code,title:v.title,credits:v.credits}});
    await log(tx,actor,'catalog.course.created',String(course.id),reqId);
    return {id:String(course.id)};
  });
}
export async function createRoom(db:Database,actor:Actor,v:z.infer<typeof roomDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const root=await first<{id:bigint}>(tx,Prisma.sql`SELECT id FROM org_unit WHERE kind='institution' AND parent_id IS NULL ORDER BY id LIMIT 1`);
    if(!root||!await allowed(tx,actor.id,'planner',root.id))throw new Problem('ERR-003');
    if(new Set(v.features).size!==v.features.length)throw new Problem('ERR-001');
    const room=await tx.room.create({data:{code:v.code,campus:v.campus,capacity:v.capacity,
      room_feature:{createMany:{data:v.features.map(feature=>({feature}))}}}});
    await log(tx,actor,'room.created',String(room.id),reqId);
    return {id:String(room.id)};
  });
}
type Term={id:bigint;unit_id:bigint;opens_at:Date;closes_at:Date};
async function termLock(tx:Transaction,id:bigint){
  const t=await first<Term>(tx,Prisma.sql`SELECT t.id,s.unit_id,t.opens_at,t.closes_at FROM term t JOIN term_scope s ON s.term_id=t.id
    WHERE t.id=${id} FOR UPDATE OF t`);
  if(!t)throw new Problem('ERR-011');
  return t;
}
export async function createTerm(db:Database,actor:Actor,v:z.infer<typeof newTermDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const unit=numericId(v.unitId);
    if(!await allowed(tx,actor.id,'academic_admin',unit))throw new Problem('ERR-003');
    const opens=new Date(v.opensAt),closes=new Date(v.closesAt);
    if(opens>=closes)throw new Problem('ERR-001');
    const newTerm=await tx.term.create({data:{code:v.code,zone:v.zone,opens_at:opens,closes_at:closes}});
    await tx.$executeRaw`INSERT INTO term_scope(term_id,unit_id) VALUES(${newTerm.id},${unit})`;
    await tx.$executeRaw`INSERT INTO queue_guard(term_id) VALUES(${newTerm.id})`;
    await audit(tx,actor.id,null,newTerm.id,'term.created',v.code,reqId,await decisionClock(tx));
    return {id:String(newTerm.id)};
  });
}
export async function createOffering(db:Database,actor:Actor,v:z.infer<typeof offeringDto>,reqId:string){
  const keyset=new Set(v.components.map(x=>x.key));
  if(keyset.size!==v.components.length||v.permittedBundles.some(b=>new Set(b).size!==b.length||b.some(x=>!keyset.has(x))))
    throw new Problem('ERR-001');
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const t=await termLock(tx,numericId(v.termId)),unit=numericId(v.unitId);
    if(!await allowed(tx,actor.id,'academic_office',unit,t.id))throw new Problem('ERR-003');
    const inTerm=await first(tx,Prisma.sql`WITH RECURSIVE chain AS (
      SELECT id,parent_id FROM org_unit WHERE id=${unit}
      UNION SELECT u.id,u.parent_id FROM org_unit u JOIN chain c ON u.id=c.parent_id)
      SELECT id FROM chain WHERE id=${t.unit_id}`);
    if(!inTerm)throw new Problem('ERR-003');
    if(await first(tx,Prisma.sql`SELECT 1 FROM timetable_version WHERE term_id=${t.id} AND state='published'`))
      throw new Problem('ERR-013');
    async function pool(sharedPoolId:string|undefined,capacity:number){
      if(!sharedPoolId)return (await tx.capacity_pool.create({data:{term_id:t.id,capacity}})).id;
      const id=numericId(sharedPoolId);
      const current=await first<{id:bigint;capacity:number}>(tx,Prisma.sql`SELECT p.id,p.capacity FROM capacity_pool p
        WHERE p.id=${id} AND p.term_id=${t.id} AND EXISTS(SELECT 1 FROM section s JOIN offering o ON o.id=s.offering_id
          WHERE s.pool_id=p.id AND o.unit_id=${unit}) FOR UPDATE`);
      if(!current||current.capacity!==capacity)throw new Problem('ERR-005');
      return id;
    }
    const course=await tx.course.findUnique({where:{code:v.courseCode}});
    if(!course)throw new Problem('ERR-011');
    const existing=await tx.offering.findFirst({where:{term_id:t.id,unit_id:unit,course_id:course.id}});
    const offering=existing??await tx.offering.create({data:{term_id:t.id,unit_id:unit,course_id:course.id,
      credit_value:course.credits,search_title:normalizeSearch(course.title)}});
    if(await tx.section.findFirst({where:{offering_id:offering.id,code:v.sectionCode}}))throw new Problem('ERR-013');
    const section=await tx.section.create({data:{offering_id:offering.id,code:v.sectionCode,pool_id:await pool(v.sharedPoolId,v.sectionCapacity)}});
    const ids=new Map<string,bigint>();
    for(const c of v.components){
      const row=await tx.component.create({data:{section_id:section.id,kind:c.kind,pool_id:await pool(c.sharedPoolId,c.capacity),
        required_pattern:'explicit_bundles',contact_minutes:c.contactMinutes}});
      ids.set(c.key,row.id);
      for(const feature of new Set(c.features))await tx.$executeRaw`INSERT INTO component_room_requirement(component_id,feature) VALUES(${row.id},${feature})`;
    }
    for(const b of v.permittedBundles){
      const bs=b.map(x=>ids.get(x)??0n).sort((a,b)=>a<b?-1:1);
      if(bs.includes(0n))throw new Error('Component mapping failed');
      await tx.$executeRaw`INSERT INTO section_bundle(section_id,component_ids) VALUES(${section.id},ARRAY[${Prisma.join(bs)}]::bigint[]) ON CONFLICT DO NOTHING`;
    }
    await tx.$executeRaw`UPDATE term SET epoch=epoch+1 WHERE id=${t.id}`;
    await audit(tx,actor.id,null,t.id,'offering.created',String(offering.id),reqId,await decisionClock(tx));
    return {id:String(offering.id),sectionId:String(section.id)};
  });
}
export async function admit(db:Database,actor:Actor,term:bigint,v:z.infer<typeof admissionDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const student=numericId(v.studentId);
    if(!await first(tx,Prisma.sql`SELECT id FROM identity_account WHERE id=${student} FOR UPDATE`))throw new Problem('ERR-011');
    const t=await termLock(tx,term);
    const program=await tx.program.findUnique({where:{id:numericId(v.programId)},select:{id:true,unit_id:true}});
    if(!program||!await allowed(tx,actor.id,'academic_office',program.unit_id,term))throw new Problem('ERR-003');
    const curriculum=numericId(v.curriculumId),policy=numericId(v.policyId);
    const valid=await first(tx,Prisma.sql`WITH RECURSIVE org AS (
      SELECT id,parent_id FROM org_unit WHERE id=${program.unit_id}
      UNION SELECT u.id,u.parent_id FROM org_unit u JOIN org a ON a.parent_id=u.id
    ) SELECT 1 FROM curriculum_version cv JOIN curriculum_review cr ON cr.curriculum_id=cv.id
      WHERE cv.id=${curriculum} AND cv.program_id=${program.id} AND cr.state='approved' AND cv.effective_from<=${v.admittedOn}::date
      AND EXISTS(SELECT 1 FROM policy_version pv JOIN org ON org.id=pv.unit_id WHERE pv.id=${policy} AND pv.state='approved')
      AND EXISTS(SELECT 1 FROM org WHERE id=${t.unit_id})`);
    if(!valid||!await allowed(tx,student,'student',program.unit_id,term))throw new Problem('ERR-013');
    const start=new Date(v.appointmentOpens),stop=new Date(v.appointmentCloses);
    if(start>=stop||start<t.opens_at||stop>t.closes_at)throw new Problem('ERR-001');
    if(await tx.student_term.findFirst({where:{student_id:student,term_id:term}}))throw new Problem('ERR-013');
    const studentProgram=await tx.student_program.create({data:{student_id:student,program_id:program.id,curriculum_id:curriculum,
      specialization:v.specialization,admitted_on:new Date(v.admittedOn)}});
    await tx.student_term.create({data:{student_id:student,term_id:term,student_program_id:studentProgram.id,policy_id:policy}});
    await tx.appointment.create({data:{student_id:student,term_id:term,opens_at:start,closes_at:stop}});
    await audit(tx,actor.id,student,term,'student.admitted',v.approvalReference,reqId,await decisionClock(tx));
    return {id:String(studentProgram.id)};
  });
}

export const unitDto=z.object({parentId:word,code:word,kind:z.enum(['faculty','department']),approvalReference:word}).strict();
export const programDto=z.object({unitId:word,code:word,degreeLevel:word,approvalReference:word}).strict();
export async function createUnit(db:Database,actor:Actor,v:z.infer<typeof unitDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const parent=await tx.org_unit.findUnique({where:{id:numericId(v.parentId)},select:{id:true,kind:true}});
    if(!parent||!await allowed(tx,actor.id,'academic_admin',parent.id))throw new Problem('ERR-003');
    if((parent.kind==='institution'&&v.kind!=='faculty')||(parent.kind==='faculty'&&v.kind!=='department')||parent.kind==='department')
      throw new Problem('ERR-013');
    const saved=await tx.org_unit.create({data:{code:v.code,kind:v.kind,parent_id:parent.id}});
    await log(tx,actor,'structure.unit.created',v.approvalReference,reqId);
    return {id:String(saved.id)};
  });
}
export async function createProgram(db:Database,actor:Actor,v:z.infer<typeof programDto>,reqId:string){
  return db.$transaction(async tx=>{
    await lockSession(tx,actor);
    const unit=await tx.org_unit.findUnique({where:{id:numericId(v.unitId)},select:{id:true,kind:true}});
    if(!unit||!await allowed(tx,actor.id,'academic_admin',unit.id))throw new Problem('ERR-003');
    if(!['faculty','department'].includes(unit.kind))throw new Problem('ERR-013');
    const saved=await tx.program.create({data:{unit_id:unit.id,code:v.code,degree_level:v.degreeLevel}});
    await log(tx,actor,'structure.program.created',v.approvalReference,reqId);
    return {id:String(saved.id)};
  });
}
