import { Actor,allowed } from './auth';
import {z} from 'zod';
import { Database,Prisma,first,decisionClock } from './db';
import { Problem,unavailable } from './problem';
import { scopedTerm } from './timetable';
import { seatsReport } from './portal';

export async function demandReport(db:Database,actor:Actor,term:bigint){
  await scopedTerm(db,actor,term,'planner');
  return db.$transaction(async tx=>{
    const asOf=await decisionClock(tx);
    const entries=await tx.$queryRaw<{bundle:unknown;students:number}[]>`SELECT bundle,count(DISTINCT student_id)::int AS students
      FROM waitlist WHERE term_id=${term} AND state='queued' GROUP BY bundle ORDER BY students DESC,bundle::text LIMIT 250`;
    return {asOf,entries};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
export async function disruptionReport(db:Database,actor:Actor,term:bigint,unit:bigint,before:bigint,after:bigint){
  if(!await allowed(db,actor.id,'department_head',unit,term))throw new Problem('ERR-003');
  return db.$transaction(async tx=>{
    const versions=await tx.$queryRaw<{id:bigint;content_hash:string}[]>`SELECT id,content_hash FROM timetable_version
      WHERE term_id=${term} AND id IN (${before},${after}) AND state IN ('published','superseded')`;
    const a=versions.find(v=>v.id===before),b=versions.find(v=>v.id===after);
    if(!a||!b||a.id===b.id)throw new Problem('ERR-011');
    const row=await first<{affected:number}>(tx,Prisma.sql`WITH components AS (
      SELECT c.id FROM component c JOIN section s ON s.id=c.section_id JOIN offering o ON o.id=s.offering_id
      WHERE o.term_id=${term} AND o.unit_id=${unit}
    ), signatures AS (
      SELECT c.id,(SELECT jsonb_agg(to_jsonb(m)-'id'-'version_id' ORDER BY m.local_start,m.room_id,m.week_dates)
        FROM meeting m WHERE m.version_id=${before} AND m.component_id=c.id) AS prior,
        (SELECT jsonb_agg(to_jsonb(m)-'id'-'version_id' ORDER BY m.local_start,m.room_id,m.week_dates)
        FROM meeting m WHERE m.version_id=${after} AND m.component_id=c.id) AS current FROM components c
    ) SELECT count(DISTINCT e.student_id)::int AS affected FROM signatures s JOIN enrollment_component ec ON ec.component_id=s.id
    JOIN enrollment e ON e.id=ec.enrollment_id WHERE e.state='active' AND e.term_id=${term} AND s.prior IS DISTINCT FROM s.current`);
    return {before:a.content_hash,after:b.content_hash,affected:row?.affected??0};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
function suppression(){
  const min=process.env.REPORT_MIN_CELL;
  if(!min||!/^[1-9]\d{0,4}$/.test(min))unavailable('report_policy_unconfigured');
  return (count:number)=>count<Number(min)?'suppressed':count;
}
export async function seatsCsv(db:Database,actor:Actor,term:bigint,unit:bigint){
  const report=await seatsReport(db,actor,term,unit);
  const mask=suppression();
  const header='term,unit,pool,capacity,enrolled,offers,as_of,formula_version';
  const values=report.rows.map(row=>[term,unit,row.pool,row.capacity,mask(row.enrolled),mask(row.offers),
    report.asOf.toISOString(),'REP-001-v1'].join(','));
  return [header,...values].join('\n');
}
const bundleShape=z.object({sectionId:z.string().regex(/^\d+$/),
  componentIds:z.array(z.string().regex(/^\d+$/))});
export async function demandCsv(db:Database,actor:Actor,term:bigint){
  const report=await demandReport(db,actor,term);
  const mask=suppression();
  const rows=report.entries.flatMap(({bundle,students})=>{
    const parsed=bundleShape.safeParse(bundle);
    if(!parsed.success)return [];
    return [[term,parsed.data.sectionId,parsed.data.componentIds.join('|'),mask(students),
      report.asOf.toISOString(),'REP-002-v1'].join(',')];
  });
  return ['term,section,components,queued_students,as_of,formula_version',...rows].join('\n');
}
export async function disruptionCsv(db:Database,actor:Actor,term:bigint,unit:bigint,before:bigint,after:bigint){
  const report=await disruptionReport(db,actor,term,unit,before,after);
  const mask=suppression();
  const boundedHash=(value:string)=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)?value:'';
  return [
    'term,unit,before,after,before_hash,after_hash,affected_students,formula_version',
    [term,unit,before,after,boundedHash(report.before),boundedHash(report.after),mask(report.affected),'REP-004-v1'].join(','),
  ].join('\n');
}
export async function auditView(db:Database,actor:Actor,term:bigint){
  await scopedTerm(db,actor,term,'auditor');
  return db.$queryRaw`SELECT id::text,action,request_id AS "requestId",occurred_at AS "occurredAt"
    FROM audit_entry WHERE term_id=${term} ORDER BY id DESC LIMIT 100`;
}
