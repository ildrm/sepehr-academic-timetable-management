import { z } from 'zod';
import { Prisma, Transaction, Reader, decisionClock, first, numericId } from './db';
import { Actor } from './auth';
import { audit, recordEvent } from './events';
import { authorizeIntent, receipt } from './intent';
import { compileRule, evaluate, quantity, readPolicy, reason, Attempt, Facts } from './policy';
import { Problem, Reason, unavailable } from './problem';
import { Meeting, occurrences, absoluteInterval, scheduleIssues } from './meeting';

export const bundleDto=z.object({sectionId:z.string().min(1).max(64),componentIds:z.array(z.string().min(1).max(64)).min(1).max(24)}).strict();
export type Bundle=z.infer<typeof bundleDto>;
export type Change={add:Bundle[];dropEnrollmentIds:string[]};
type Selection={enrollment_id:bigint|null;section_id:bigint;offering_id:bigint;course_id:bigint;canonical_id:bigint;
  credit_value:string;course_code:string;pool_id:bigint;component_ids:bigint[];pools:bigint[]};
type Context={student_id:bigint;term_id:bigint;policy_id:bigint;program_code:string;curriculum_id:bigint;
  registration_stage:string;policy_state:string;edition:string;parameters:unknown;standing:string|null;gpa:string|null;zone:string};
type Decision={decision:'accepted'|'rejected'|'exception'|'review';policyVersion:string;evaluatedRules:string[]; reasons:Reason[];explanationKey:string};
const sortedIds=(ids:bigint[])=>[...new Set(ids)].sort((a,b)=>a<b?-1:a>b?1:0);

export async function guardTerm(tx:Transaction,term:bigint,queue=true){
  if(!await first(tx,Prisma.sql`SELECT id FROM term WHERE id=${term} FOR SHARE`)) throw new Problem('ERR-011');
  if(queue && !await first(tx,Prisma.sql`SELECT term_id FROM queue_guard WHERE term_id=${term} FOR UPDATE`)) unavailable('queue_guard_unconfigured');
}
export async function guardStudent(tx:Transaction,student:bigint,term:bigint){
  if(!await first(tx,Prisma.sql`SELECT student_id FROM student_term WHERE student_id=${student} AND term_id=${term} FOR UPDATE`))
    throw new Problem('ERR-003');
}
export async function guardPools(tx:Transaction,pools:bigint[]){
  if(pools.length) await tx.$queryRaw`SELECT id FROM capacity_pool WHERE id IN (${Prisma.join(sortedIds(pools))}) ORDER BY id FOR UPDATE`;
}
async function context(db:Reader,student:bigint,term:bigint){
  const result=await first<Context>(db,Prisma.sql`SELECT s.student_id,s.term_id,s.policy_id,s.registration_stage,s.standing,
      s.gpa::text,sp.curriculum_id,p.code AS program_code,pv.parameters,pv.edition,pv.state AS policy_state,t.zone
    FROM student_term s JOIN student_program sp ON sp.id=s.student_program_id JOIN program p ON p.id=sp.program_id
    JOIN policy_version pv ON pv.id=s.policy_id JOIN term t ON t.id=s.term_id
    WHERE s.student_id=${student} AND s.term_id=${term}`);
  if(!result) throw new Problem('ERR-003');
  if(!['approved','retired'].includes(result.policy_state)) unavailable('policy_unavailable');
  return result;
}
const selectionCols=Prisma.sql`s.id AS section_id,o.id AS offering_id,o.course_id,COALESCE(c.canonical_course_id,c.id) AS canonical_id,
  o.credit_value::text,c.code AS course_code,s.pool_id`;
async function current(db:Reader,student:bigint,term:bigint){
  return db.$queryRaw<Selection[]>`SELECT ${selectionCols},e.id AS enrollment_id,
    ARRAY(SELECT component_id FROM enrollment_component WHERE enrollment_id=e.id ORDER BY component_id) AS component_ids,
    ARRAY(SELECT pool_id FROM seat_claim WHERE enrollment_id=e.id ORDER BY pool_id) AS pools
    FROM enrollment e JOIN section s ON s.id=e.section_id JOIN offering o ON o.id=s.offering_id
    JOIN course c ON c.id=o.course_id WHERE e.student_id=${student} AND e.term_id=${term} AND e.state='active' ORDER BY e.id`;
}
async function loadBundle(db:Reader,term:bigint,bundle:Bundle){
  const ids=sortedIds(bundle.componentIds.map(numericId));
  if(ids.includes(0n)||ids.length!==bundle.componentIds.length) throw new Problem('ERR-001');
  const row=await first<Selection>(db,Prisma.sql`SELECT ${selectionCols},NULL::bigint AS enrollment_id,b.component_ids,
     ARRAY(SELECT DISTINCT ids FROM (SELECT s.pool_id AS ids UNION ALL
       SELECT cp.pool_id FROM component cp WHERE cp.id=ANY(b.component_ids)) x ORDER BY ids) AS pools
    FROM section s JOIN section_bundle b ON b.section_id=s.id JOIN offering o ON o.id=s.offering_id
    JOIN course c ON c.id=o.course_id
    WHERE o.term_id=${term} AND s.id=${numericId(bundle.sectionId)}
      AND ARRAY(SELECT x FROM unnest(b.component_ids) x ORDER BY x)=ARRAY[${Prisma.join(ids)}]::bigint[]
      AND NOT EXISTS(SELECT 1 FROM unnest(b.component_ids) q(id) WHERE NOT EXISTS
      (SELECT 1 FROM component c2 WHERE c2.id=q.id AND c2.section_id=s.id))`);
  if(!row) throw new Problem('ERR-004',[reason('BR-006','bundle_incompatible')]);
  return row;
}
async function proposed(db:Reader,student:bigint,term:bigint,change:Change){
  const initial=await current(db,student,term);
  const toDrop=new Set(change.dropEnrollmentIds.map(numericId));
  const drops=initial.filter(x=>x.enrollment_id!==null&&toDrop.has(x.enrollment_id));
  if(toDrop.size!==change.dropEnrollmentIds.length || drops.length!==toDrop.size) throw new Problem('ERR-001');
  const additions:Selection[]=[];
  for(const b of change.add) additions.push(await loadBundle(db,term,b));
  return {drops,additions,final:[...initial.filter(x=>x.enrollment_id===null||!toDrop.has(x.enrollment_id)),...additions]};
}
async function windowOpen(db:Reader,c:Context,mode:string,operation:string,now:Date){
  return Boolean(await first(db,Prisma.sql`SELECT 1 FROM term t JOIN appointment a ON a.term_id=t.id
    WHERE t.id=${c.term_id} AND a.student_id=${c.student_id} AND a.opens_at<=${now} AND a.closes_at>${now}
    AND t.opens_at<=${now} AND t.closes_at>${now}
    AND (${mode}='term' OR EXISTS(SELECT 1 FROM operation_window w WHERE w.term_id=t.id
    AND w.operation=${operation} AND w.opens_at<=${now} AND w.closes_at>${now}))`));
}
async function checkSchedule(db:Reader,c:Context,items:Selection[],why:Reason[],travelMinutes:Record<string,number>|undefined){
  const components=sortedIds(items.flatMap(s=>s.component_ids));
  if(!components.length) return;
  const meetings=await db.$queryRaw<Meeting[]>`SELECT m.component_id,r.code AS room,r.campus,m.zone,m.duration_minutes,
      (EXTRACT(hour from m.local_start)*60+EXTRACT(minute FROM m.local_start))::int AS start_minute,
      ARRAY(SELECT to_char(d,'YYYY-MM-DD') FROM unnest(m.week_dates) d) AS dates,m.exception_dates
    FROM meeting m JOIN room r ON r.id=m.room_id JOIN timetable_version v ON v.id=m.version_id
    WHERE v.state='published' AND v.term_id=${c.term_id} AND m.component_id IN (${Prisma.join(components)})`;
  if(components.some(id=>!meetings.some(m=>m.component_id===id))) {
    why.push(reason('BR-006','schedule_unpublished'));return;
  }
  const slots=meetings.flatMap(m=>{
    if(m.zone!==c.zone) unavailable('recurrence_unconfigured');
    return occurrences(m).map(slot=>({...absoluteInterval(slot,m.zone),campus:m.campus}));
  });
  const issues=scheduleIssues(slots,travelMinutes);
  if(issues.includes('campus_travel_unconfigured'))unavailable('campus_travel_unconfigured');
  if(issues.length)why.push(reason('BR-002','schedule_conflict'));
}
async function evaluateFinal(db:Reader,c:Context,items:Selection[],now:Date,finalize:boolean):Promise<Decision>{
  const p=readPolicy(c.parameters);
  const reasons:Reason[]=[];
  const evaluatedRules=['BR-001','BR-002','BR-006','BR-007'];
  const active=items.map(s=>s.canonical_id);
  if(new Set(active).size!==active.length) reasons.push(reason('BR-002','duplicate_course'));
  const credits=items.reduce((sum,s)=>sum+quantity(s.credit_value,2),0n);
  if(credits>quantity(p.ceiling,2)) reasons.push(reason('BR-002','credit_ceiling'));
  if((finalize||c.registration_stage==='finalized')&&credits<quantity(p.floor,2)) reasons.push(reason('BR-007','credit_floor'));
  type RecordRow={code:string;outcome:string;grade:string|null;course_id:bigint};
  const outcomes=await db.$queryRaw<RecordRow[]>`SELECT c.code,ar.outcome,ar.grade::text,COALESCE(c.canonical_course_id,c.id) AS course_id
    FROM academic_record ar JOIN course c ON c.id=ar.course_id
    WHERE ar.student_id=${c.student_id} AND NOT EXISTS(SELECT 1 FROM academic_record next WHERE next.supersedes=ar.id)
    ORDER BY ar.id DESC`;
  const records=new Map<string,Attempt>();
  for(const row of outcomes){
    const previous=records.get(row.code);
    if(!previous || (p.repeatSelection==='highestGrade' && row.grade!==null &&
      (previous.grade===null||quantity(row.grade,3)>quantity(previous.grade,3)))){
      records.set(row.code,{state:row.outcome,grade:row.grade});
    }
  }
  if(!p.repeatPassed && items.some(i=>outcomes.some(r=>r.course_id===i.canonical_id&&r.outcome==='passed'))) reasons.push(reason('BR-002','repeat_course'));
  const equivalencies=await db.$queryRaw<{from_code:string;to_code:string}[]>`SELECT a.code AS from_code,b.code AS to_code
    FROM equivalency e JOIN course a ON a.id=e.source_course JOIN course b ON b.id=e.target_course
    WHERE e.curriculum_id=${c.curriculum_id} AND e.valid_from<=(${now}::timestamptz AT TIME ZONE ${c.zone})::date
      AND (e.valid_until IS NULL OR e.valid_until>(${now}::timestamptz AT TIME ZONE ${c.zone})::date)`;
  const grants=await db.$queryRaw<{rule_code:string}[]>`SELECT rule_code FROM exception_grant WHERE student_id=${c.student_id}
    AND term_id=${c.term_id} AND policy_id=${c.policy_id} AND state='approved' AND approver IS NOT NULL AND valid_until>${now}`;
  const knownCodes=await db.$queryRaw<{code:string}[]>`SELECT code FROM course`;
  const known=new Set(knownCodes.map(r=>r.code));
  const facts:Facts={records,concurrent:new Set(items.map(x=>x.course_code)),credits,gpa:c.gpa,standing:c.standing,program:c.program_code,
    equivalents:new Set(equivalencies.filter(x=>records.get(x.from_code)?.state==='passed').map(x=>x.to_code)),
    thresholds:p.thresholds,repeatPassed:p.repeatPassed,grants:new Set(grants.map(x=>x.rule_code)),known};
  const ids=items.map(i=>i.course_id);
  const rules=await db.$queryRaw<{rule_code:string;expression:unknown;waivable:boolean}[]>`SELECT rule_code,expression,waivable
    FROM academic_rule WHERE policy_id=${c.policy_id}
      AND (stage='registration' OR ${finalize||c.registration_stage==='finalized'})
      AND (target_course_id IS NULL ${ids.length?Prisma.sql`OR target_course_id IN (${Prisma.join(ids)})`:Prisma.empty})
    ORDER BY rule_code`;
  let exception=false;
  for(const rule of rules){
    evaluatedRules.push(rule.rule_code);
    const verdict=evaluate(compileRule(rule.expression),facts);
    if(verdict===true) continue;
    if(rule.waivable&&facts.grants.has(rule.rule_code)){exception=true;continue;}
    reasons.push(reason(rule.rule_code,verdict===null?'evidence_review':'academic_rule'));
  }
  await checkSchedule(db,c,items,reasons,p.travelMinutes);
  const decision=reasons.some(r=>r.reasonCode!=='evidence_review')?'rejected':reasons.length?'review':exception?'exception':'accepted';
  return {policyVersion:c.edition,evaluatedRules,reasons,decision,explanationKey:'preview.'+decision};
}

type Pool={capacity:number;term_id:bigint};
type Claim={enrollment_id:bigint|null;waitlist_id:bigint|null;reservation_id:bigint|null};
type Reserve={id:bigint;eligibility_group:string;seats:number};
async function planClaims(db:Reader,c:Context,additions:Selection[],drops:Selection[],now:Date,offerId?:bigint){
  const p=readPolicy(c.parameters), removed=new Set(drops.map(x=>x.enrollment_id)), result=new Map<Selection,Map<bigint,bigint|null>>();
  const counts=new Map<bigint,{pool:Pool;claims:Claim[];reserves:Reserve[]}>();
  for(const id of sortedIds(additions.flatMap(x=>x.pools))){
    const pool=await first<Pool>(db,Prisma.sql`SELECT capacity,term_id FROM capacity_pool WHERE id=${id}`);
    if(!pool||pool.term_id!==c.term_id) unavailable('capacity_unconfigured');
    const claims=(await db.$queryRaw<Claim[]>`SELECT sc.enrollment_id,sc.waitlist_id,sc.reservation_id FROM seat_claim sc
      LEFT JOIN waitlist w ON w.id=sc.waitlist_id WHERE sc.pool_id=${id}
      AND (sc.waitlist_id IS NULL OR (w.state='offered' AND w.expires_at>${now}))`)
      .filter(x=>(x.enrollment_id===null||!removed.has(x.enrollment_id))&&(offerId===undefined||x.waitlist_id!==offerId));
    const reserves=await db.$queryRaw<Reserve[]>`SELECT id,eligibility_group,seats FROM reservation
      WHERE pool_id=${id} AND release_at>${now} ORDER BY id`;
    if(reserves.reduce((sum,r)=>sum+r.seats,0)>pool.capacity) unavailable('capacity_unconfigured');
    counts.set(id,{pool,claims,reserves});
  }
  const groups=p.queue.reservationGroups[c.program_code]??[];
  for(const selection of additions){
    const claims=new Map<bigint,bigint|null>();
    for(const poolId of selection.pools){
      const usage=counts.get(poolId);
      if(!usage) unavailable('capacity_unconfigured');
      const remaining=(r:Reserve)=>Math.max(0,r.seats-usage.claims.filter(claim=>claim.reservation_id===r.id).length);
      const reserved=usage.reserves.find(r=>groups.includes(r.eligibility_group)&&remaining(r)>0);
      if(usage.pool.capacity<=usage.claims.length || (!reserved&&usage.pool.capacity-usage.claims.length-usage.reserves.reduce((sum,r)=>sum+remaining(r),0)<=0))
        throw new Problem('ERR-005',[reason('BR-005','capacity_conflict')]);
      const reservationId=reserved?.id??null;
      claims.set(poolId,reservationId);
      usage.claims.push({reservation_id:reservationId,enrollment_id:null,waitlist_id:null});
    }
    result.set(selection,claims);
  }
  return result;
}

async function activeQueuePrecedes(db:Reader,term:bigint,pools:bigint[],entry?:bigint){
  if(!pools.length) return false;
  return Boolean(await first(db,Prisma.sql`SELECT 1 FROM waitlist w WHERE term_id=${term} AND state='queued'
    AND w.pool_ids && ARRAY[${Prisma.join(pools)}]::bigint[]
    ${entry===undefined?Prisma.empty:Prisma.sql`AND (w.tier,w.joined_at,w.id) < (SELECT tier,joined_at,id FROM waitlist WHERE id=${entry})`}
    LIMIT 1`));
}

async function bump(tx:Transaction,student:bigint,term:bigint,finalize:boolean,requestId:string){
  const state=await first<{revision:number}>(tx,Prisma.sql`UPDATE student_term SET revision=revision+1,
    registration_stage=CASE WHEN ${finalize} THEN 'finalized' ELSE registration_stage END,
    finalization_ref=CASE WHEN ${finalize} THEN ${requestId} ELSE finalization_ref END
    WHERE student_id=${student} AND term_id=${term} RETURNING revision`);
  if(!state) throw new Error('Student revision unavailable');
  return state.revision;
}
export async function applyChanges(tx:Transaction,c:Context,change:Awaited<ReturnType<typeof proposed>>,
  claims:Awaited<ReturnType<typeof planClaims>>,actor:bigint,operation:string,requestId:string,now:Date,offerId?:bigint){
  let id:bigint|string=c.student_id;
  for(const old of change.drops){
    await tx.$executeRaw`DELETE FROM seat_claim WHERE enrollment_id=${old.enrollment_id}`;
    await tx.$executeRaw`UPDATE enrollment SET state='dropped',revision=revision+1 WHERE id=${old.enrollment_id}`;
    id=old.enrollment_id??id;
  }
  if(offerId!==undefined) await tx.$executeRaw`DELETE FROM seat_claim WHERE waitlist_id=${offerId}`;
  for(const item of change.additions){
    const row=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO enrollment(student_id,term_id,offering_id,section_id,course_id,credit_value,state)
      VALUES(${c.student_id},${c.term_id},${item.offering_id},${item.section_id},${item.course_id},${item.credit_value}::numeric,'active') RETURNING id`);
    if(!row) throw new Error('Enrollment persistence error');
    id=row.id;
    for(const component of item.component_ids) await tx.$executeRaw`INSERT INTO enrollment_component VALUES(${row.id},${component})`;
    for(const [pool,reservation] of claims.get(item)??[]) await tx.$executeRaw`
      INSERT INTO seat_claim(pool_id,reservation_id,enrollment_id) VALUES(${pool},${reservation},${row.id})`;
  }
  if(offerId!==undefined) await tx.$executeRaw`UPDATE waitlist SET state='enrolled' WHERE id=${offerId}`;
  const revision=await bump(tx,c.student_id,c.term_id,operation==='finalizeRegistration',requestId);
  await audit(tx,actor,c.student_id,c.term_id,operation,'policy:'+String(c.policy_id),requestId,now);
  await recordEvent(tx,'EnrollmentChanged',c.term_id,`term-${c.term_id}/student-${c.student_id}`,requestId,String(id),revision,now);
  return receipt(requestId,id,revision);
}
export async function preview(db:Reader,actor:Actor,term:bigint,change:Change){
  await authorizeIntent(db,actor.id,actor.id,term,'previewEnrollment');
  const c=await context(db,actor.id,term);
  const plan=await proposed(db,actor.id,term,change);
  const now=await decisionClock(db);
  const decision=await evaluateFinal(db,c,plan.final,now,false);
  const p=readPolicy(c.parameters);
  if(!await windowOpen(db,c,p.windowMode,'enroll',now)) decision.reasons.push(reason('BR-004','window_closed'));
  try{ await planClaims(db,c,plan.additions,plan.drops,now); }
  catch(e){ if(!(e instanceof Problem)||e.code!=='ERR-005') throw e;decision.reasons.push(...e.details); }
  if(await activeQueuePrecedes(db,term,plan.additions.flatMap(x=>x.pools))) decision.reasons.push(reason('BR-005','queue_priority'));
  if(decision.reasons.some(x=>x.reasonCode!=='evidence_review')){
    decision.decision='rejected';decision.explanationKey='preview.rejected';
  }
  return decision;
}
export async function register(tx:Transaction,actor:Actor,student:bigint,term:bigint,operation:string,change:Change,
  requestId:string,caseRef?:string){
  await guardTerm(tx,term);
  await guardStudent(tx,student,term);
  await authorizeIntent(tx,actor.id,student,term,operation,caseRef);
  const c=await context(tx,student,term), p=readPolicy(c.parameters);
  const plan=await proposed(tx,student,term,change);
  await guardPools(tx,[...plan.additions,...plan.drops].flatMap(x=>x.pools));
  const now=await decisionClock(tx);
  if(!await windowOpen(tx,c,p.windowMode,operation,now)) throw new Problem('ERR-007');
  const decision=await evaluateFinal(tx,c,plan.final,now,operation==='finalizeRegistration');
  if(decision.decision==='rejected'||decision.decision==='review') throw new Problem('ERR-004',decision.reasons);
  if(await activeQueuePrecedes(tx,term,plan.additions.flatMap(x=>x.pools))) throw new Problem('ERR-009');
  const claims=await planClaims(tx,c,plan.additions,plan.drops,now);
  return applyChanges(tx,c,plan,claims,actor.id,operation,requestId,now);
}
type Wait={id:bigint;student_id:bigint;term_id:bigint;pool_ids:bigint[];state:string;expires_at:Date|null;bundle:unknown};
export async function joinWaitlist(tx:Transaction,actor:Actor,term:bigint,bundle:Bundle,requestId:string){
  await guardTerm(tx,term);await guardStudent(tx,actor.id,term);
  await authorizeIntent(tx,actor.id,actor.id,term,'joinWaitlist');
  const c=await context(tx,actor.id,term), p=readPolicy(c.parameters);
  const tier=p.queue.tiers[c.program_code];
  if(tier===undefined) unavailable('queue_tier_unconfigured');
  const item=await loadBundle(tx,term,bundle);await guardPools(tx,item.pools);
  const now=await decisionClock(tx);
  if(!await windowOpen(tx,c,p.windowMode,'joinWaitlist',now)) throw new Problem('ERR-007');
  const plan=await proposed(tx,actor.id,term,{add:[bundle],dropEnrollmentIds:[]});
  const decision=await evaluateFinal(tx,c,plan.final,now,false);
  if(['rejected','review'].includes(decision.decision)) throw new Problem('ERR-004',decision.reasons);
  if(await first(tx,Prisma.sql`SELECT 1 FROM waitlist WHERE student_id=${actor.id} AND term_id=${term} AND state IN('queued','offered')
    AND pool_ids && ARRAY[${Prisma.join(item.pools)}]::bigint[]`)) throw new Problem('ERR-013');
  const entry=await first<{id:bigint}>(tx,Prisma.sql`INSERT INTO waitlist(student_id,term_id,pool_id,bundle,pool_ids,tier,joined_at,state)
    VALUES(${actor.id},${term},${item.pool_id},${JSON.stringify(bundle)}::jsonb,ARRAY[${Prisma.join(item.pools)}]::bigint[],${tier},${now},'queued') RETURNING id`);
  if(!entry) throw new Error('Waitlist insert failed');
  const revision=await bump(tx,actor.id,term,false,requestId);
  await audit(tx,actor.id,actor.id,term,'joinWaitlist','policy:'+c.policy_id,requestId,now);
  await recordEvent(tx,'WaitlistChanged',term,`term-${term}/student-${actor.id}`,requestId,String(entry.id),revision,now);
  return receipt(requestId,entry.id,revision);
}
async function transitionWait(tx:Transaction,w:Wait,actor:bigint,state:string,requestId:string,now:Date,code?:string){
  await tx.$executeRaw`DELETE FROM seat_claim WHERE waitlist_id=${w.id}`;
  await tx.$executeRaw`UPDATE waitlist SET state=${state},reason_code=${code??null} WHERE id=${w.id}`;
  const revision=await bump(tx,w.student_id,w.term_id,false,requestId);
  await audit(tx,actor,w.student_id,w.term_id,'waitlist.'+state,code??state,requestId,now);
  await recordEvent(tx,'WaitlistChanged',w.term_id,`term-${w.term_id}/student-${w.student_id}`,requestId,String(w.id),revision,now);
  return receipt(requestId,w.id,revision);
}
export async function respondWaitlist(tx:Transaction,actor:Actor,term:bigint,entry:bigint,response:string,requestId:string){
  await guardTerm(tx,term);await guardStudent(tx,actor.id,term);
  await authorizeIntent(tx,actor.id,actor.id,term,'respondToOffer');
  const w=await first<Wait>(tx,Prisma.sql`SELECT * FROM waitlist WHERE id=${entry} AND term_id=${term} AND student_id=${actor.id}`);
  if(!w) throw new Problem('ERR-011');
  await guardPools(tx,w.pool_ids);
  const now=await decisionClock(tx);
  if(w.state==='offered'&&w.expires_at&&w.expires_at<=now) return transitionWait(tx,w,actor.id,'expired',requestId,now);
  if(response==='decline'&&['queued','offered'].includes(w.state)) return transitionWait(tx,w,actor.id,'declined',requestId,now);
  if(w.state!=='offered'||!w.expires_at) throw new Problem('ERR-013');
  const holds=await first<{count:bigint}>(tx,Prisma.sql`SELECT count(*) AS count FROM seat_claim WHERE waitlist_id=${entry}`);
  if(holds?.count!==BigInt(w.pool_ids.length)) unavailable('offer_claims_inconsistent');
  const c=await context(tx,actor.id,term), p=readPolicy(c.parameters);
  if(!await windowOpen(tx,c,p.windowMode,'respondToOffer',now)) throw new Problem('ERR-007');
  const plan=await proposed(tx,actor.id,term,{add:[bundleDto.parse(w.bundle)],dropEnrollmentIds:[]});
  const decision=await evaluateFinal(tx,c,plan.final,now,false);
  if(decision.decision==='review') throw new Problem('ERR-004',decision.reasons);
  if(decision.decision==='rejected') return transitionWait(tx,w,actor.id,'ineligible',requestId,now,decision.reasons[0]?.reasonCode);
  const claims=await planClaims(tx,c,plan.additions,[],now,w.id);
  return applyChanges(tx,c,plan,claims,actor.id,'respondToOffer',requestId,now,w.id);
}
export async function processWaitlist(tx:Transaction,term:bigint,entry:bigint,serviceActor:bigint,requestId:string){
  await guardTerm(tx,term);
  if(!await first(tx,Prisma.sql`SELECT 1 FROM identity_account WHERE id=${serviceActor} AND issuer='internal-worker' AND subject='waitlist'`))
    unavailable('worker_identity_unconfigured');
  const w=await first<Wait>(tx,Prisma.sql`SELECT * FROM waitlist WHERE id=${entry} AND term_id=${term}`);
  if(!w||!['offered','queued'].includes(w.state))return;
  await guardStudent(tx,w.student_id,term);await guardPools(tx,w.pool_ids);
  const now=await decisionClock(tx);
  if(w.state==='offered'){
    if(w.expires_at&&w.expires_at<=now) await transitionWait(tx,w,serviceActor,'expired',requestId,now);
    return;
  }
  if(await activeQueuePrecedes(tx,term,w.pool_ids,w.id))return;
  const c=await context(tx,w.student_id,term),p=readPolicy(c.parameters);
  if(!await windowOpen(tx,c,p.windowMode,'respondToOffer',now)) return;
  const plan=await proposed(tx,w.student_id,term,{add:[bundleDto.parse(w.bundle)],dropEnrollmentIds:[]});
  const decision=await evaluateFinal(tx,c,plan.final,now,false);
  if(decision.decision==='review') return;
  if(decision.decision==='rejected'){
    await transitionWait(tx,w,serviceActor,'ineligible',requestId,now,decision.reasons[0]?.reasonCode);return;
  }
  let claims:Awaited<ReturnType<typeof planClaims>>;
  try{claims=await planClaims(tx,c,plan.additions,[],now);}
  catch(e){if(e instanceof Problem&&e.code==='ERR-005')return;throw e;}
  for(const poolClaims of claims.values()) for(const [pool,reserve] of poolClaims)
    await tx.$executeRaw`INSERT INTO seat_claim(pool_id,reservation_id,waitlist_id) VALUES(${pool},${reserve},${w.id})`;
  await tx.$executeRaw`UPDATE waitlist SET state='offered',expires_at=${new Date(now.getTime()+p.queue.offerMinutes*60000)} WHERE id=${w.id}`;
  const revision=await bump(tx,w.student_id,term,false,requestId);
  await audit(tx,serviceActor,w.student_id,term,'waitlist.offered','policy:'+c.policy_id,requestId,now);
  await recordEvent(tx,'WaitlistChanged',term,`term-${term}/student-${w.student_id}`,requestId,String(w.id),revision,now);
}

export async function allocationCandidate(db:Reader,student:bigint,term:bigint,bundles:Bundle[],now:Date){
  try{
    await authorizeIntent(db,student,student,term,'enroll');
    const c=await context(db,student,term),policy=readPolicy(c.parameters);
    const plan=await proposed(db,student,term,{add:bundles,dropEnrollmentIds:[]});
    const decision=await evaluateFinal(db,c,plan.final,now,false);
    const tier=policy.queue.tiers[c.program_code];
    if(tier===undefined) unavailable('queue_tier_unconfigured');
    const eligible=await windowOpen(db,c,policy.windowMode,'enroll',now)
      && ['accepted','exception'].includes(decision.decision)
      && !await activeQueuePrecedes(db,term,plan.additions.flatMap(x=>x.pools));
    const revision=await first<{revision:number}>(db,Prisma.sql`SELECT revision FROM student_term WHERE student_id=${student} AND term_id=${term}`);
    return {context:c,plan,tier,eligible,revision:revision?.revision??0,reserveGroups:policy.queue.reservationGroups[c.program_code]??[]};
  }catch(e){
    if(e instanceof Problem&&['ERR-003','ERR-004'].includes(e.code))return null;
    throw e;
  }
}

export async function allocationSeats(db:Reader,term:bigint,pools:bigint[],now:Date){
  const seats:{id:string;pool:bigint;reservation:bigint|null;group:string|null;capacity:number}[]=[];
  for(const pool of sortedIds(pools)){
    const row=await first<{capacity:number;occupied:number}>(db,Prisma.sql`
      SELECT p.capacity,(SELECT count(*)::int FROM seat_claim sc LEFT JOIN waitlist w ON w.id=sc.waitlist_id
        WHERE sc.pool_id=p.id AND (sc.waitlist_id IS NULL OR (w.state='offered' AND w.expires_at>${now}))) AS occupied
      FROM capacity_pool p WHERE p.id=${pool} AND p.term_id=${term}`);
    if(!row)unavailable('capacity_unconfigured');
    const quotas=await db.$queryRaw<{id:bigint;group:string;seats:number;occupied:number}[]>`
      SELECT r.id,r.eligibility_group AS "group",r.seats,(SELECT count(*)::int FROM seat_claim sc LEFT JOIN waitlist w ON w.id=sc.waitlist_id
        WHERE sc.reservation_id=r.id AND (sc.waitlist_id IS NULL OR (w.state='offered' AND w.expires_at>${now}))) AS occupied
      FROM reservation r WHERE r.pool_id=${pool} AND r.release_at>${now} ORDER BY r.id`;
    if(quotas.reduce((total,q)=>total+q.seats,0)>row.capacity||row.occupied>row.capacity)unavailable('capacity_unconfigured');
    const reserved=quotas.map(q=>({id:pool+':'+q.id,pool,reservation:q.id,group:q.group,capacity:Math.max(0,q.seats-q.occupied)}));
    const general=row.capacity-row.occupied-reserved.reduce((total,q)=>total+q.capacity,0);
    if(general<0)unavailable('capacity_unconfigured');
    seats.push({id:pool+':general',pool,reservation:null,group:null,capacity:general},...reserved);
  }
  return seats;
}
