import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Actor,allowed } from './auth';
import { authorizeIntent } from './intent';
import { Database,Reader,Prisma,decisionClock,numericId } from './db';
import { Problem,unavailable } from './problem';
import { occurrences,Meeting } from './meeting';
import {setting} from './config';
import { quantity } from './policy';

export function normalizeSearch(text:string){
  return text.normalize('NFC').replaceAll('ي','ی').replaceAll('ى','ی').replaceAll('ك','ک')
    .replace(/[۰-۹٠-٩]/g,d=>String(d.charCodeAt(0)-(d.charCodeAt(0)>=1776?1776:1632)));
}
type Card={id:string;title:string;code:string;credit:string;available:number;department:string;
  bundles:{sectionId:string;componentIds:string[];label:string;components:{id:string;kind:string}[]}[]};
const catalogColumns=Prisma.sql`o.id::text AS id,c.title,c.code,o.credit_value::text AS credit,u.code AS department,
  COALESCE((SELECT sum(GREATEST(p.capacity-(SELECT count(*) FROM seat_claim sc LEFT JOIN waitlist w ON w.id=sc.waitlist_id
    WHERE sc.pool_id=p.id AND (sc.waitlist_id IS NULL OR (w.state='offered' AND w.expires_at>clock_timestamp()))),0))::int FROM capacity_pool p
    WHERE p.id IN (SELECT DISTINCT s.pool_id FROM section s WHERE s.offering_id=o.id)),0) AS available,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('sectionId',s.id::text,'componentIds',ARRAY(SELECT x::text FROM unnest(b.component_ids) x),
    'label',s.code,'components', (SELECT jsonb_agg(jsonb_build_object('id',cp.id::text,'kind',cp.kind) ORDER BY cp.id) FROM component cp WHERE cp.id=ANY(b.component_ids))) ORDER BY s.id)
    FROM section s JOIN section_bundle b ON b.section_id=s.id WHERE s.offering_id=o.id),'[]'::jsonb) AS bundles`;
export async function catalog(db:Reader,actor:Actor,term:bigint,search:string,department:string|undefined,after:bigint,limit:number,preferred:string[]=[]){
  await authorizeIntent(db,actor.id,actor.id,term,'listOfferings');
  const query=normalizeSearch(search).replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_');
  return db.$queryRaw<Card[]>`SELECT ${catalogColumns} FROM offering o JOIN course c ON c.id=o.course_id JOIN org_unit u ON u.id=o.unit_id
    WHERE o.term_id=${term} AND o.id>${after} AND (${department??null}::text IS NULL OR u.code=${department??null})
    AND (${query}='' OR COALESCE(o.search_title,translate(c.title,'يىك','ییک')) ILIKE '%'||${query}||'%' OR c.code ILIKE '%'||${query}||'%')
    AND EXISTS(SELECT 1 FROM section ss JOIN section_bundle b ON b.section_id=ss.id WHERE ss.offering_id=o.id)
    ORDER BY array_position(${preferred}::text[],upper(c.code)) NULLS LAST,o.id LIMIT ${limit}`;
}
const cursorShape=z.object({after:z.string(),asOf:z.iso.datetime(),actor:z.string(),term:z.string(),department:z.string().nullable()});
function cursorMac(value:string){
  const secret=setting('CURSOR_SECRET');
  if(!secret||secret.length<32)unavailable('cursor_unconfigured');
  return createHmac('sha256',secret).update(value).digest('base64url');
}
export async function offeringPage(db:Database,actor:Actor,term:bigint,department:string|undefined,cursor:string|undefined,limit:number){
  const scope={actor:String(actor.id),term:String(term),department:department??null};
  let after=0n, asOf=(await decisionClock(db)).toISOString();
  if(cursor){
    const [payload,mac,extra]=cursor.split('.');
    if(!payload||!mac||extra||mac.length!==43||!timingSafeEqual(Buffer.from(mac),Buffer.from(cursorMac(payload)))) throw new Problem('ERR-001');
    try{
      const c=cursorShape.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')));
      if(c.actor!==scope.actor||c.term!==scope.term||c.department!==scope.department)throw new Problem('ERR-001');
      after=numericId(c.after);asOf=c.asOf;
    }catch{throw new Problem('ERR-001');}
  }
  const all=await catalog(db,actor,term,'',department,after,limit+1);
  const rows=all.slice(0,limit), last=rows.at(-1);
  const payload=last?Buffer.from(JSON.stringify({...scope,after:last.id,asOf})).toString('base64url'):null;
  return {asOf,nextCursor:all.length>limit&&payload?payload+'.'+cursorMac(payload):null,items:rows.map(r=>({id:r.id,label:r.title}))};
}
export async function portalHome(db:Database,actor:Actor){
  const roles=await db.$queryRaw<{role:string}[]>`SELECT DISTINCT role_code AS role FROM role_assignment WHERE actor_id=${actor.id}
    AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()`;
  const terms=await db.$queryRaw<{id:string;code:string;zone:string;opensAt:Date;closesAt:Date;stage:string|null}[]>`
    SELECT DISTINCT t.id::text AS id,t.code,t.zone,t.opens_at AS "opensAt",t.closes_at AS "closesAt",s.registration_stage AS stage
    FROM term t JOIN term_scope ts ON ts.term_id=t.id LEFT JOIN student_term s ON s.term_id=t.id AND s.student_id=${actor.id}
    WHERE s.student_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM role_assignment a WHERE a.actor_id=${actor.id} AND (a.unit_id=ts.unit_id
      OR EXISTS(SELECT 1 FROM offering o WHERE o.term_id=t.id AND o.unit_id=a.unit_id)
      OR EXISTS(SELECT 1 FROM availability aa WHERE aa.term_id=t.id AND aa.instructor_id=a.actor_id))
      AND (a.term_id IS NULL OR a.term_id=t.id) AND a.valid_from<=clock_timestamp() AND a.valid_until>clock_timestamp())
    ORDER BY t.opens_at DESC LIMIT 30`;
  const profile=await db.identity_account.findUnique({where:{id:actor.id},select:{subject:true,issuer:true}});
  return {roles:roles.map(x=>x.role),terms,subject:profile?.subject??'',synthetic:profile?.issuer==='local-development'};
}
type Enrolled={id:string;code:string;title:string;credits:string;section:string};
export async function studentOverview(db:Database,actor:Actor,term:bigint){
  await authorizeIntent(db,actor.id,actor.id,term,'previewEnrollment');
  const enrollments=await db.$queryRaw<Enrolled[]>`SELECT e.id::text AS id,c.code,c.title,e.credit_value::text AS credits,s.code AS section
    FROM enrollment e JOIN course c ON c.id=e.course_id JOIN section s ON s.id=e.section_id
    WHERE e.student_id=${actor.id} AND e.term_id=${term} AND e.state='active' ORDER BY c.code`;
  const waits=await db.$queryRaw<{id:string;state:string;title:string;expiresAt:Date|null;reason:string|null;position:number}[]>`
    SELECT w.id::text AS id,w.state,c.title,w.expires_at AS "expiresAt",w.reason_code AS reason,(1+(SELECT count(*) FROM waitlist x
      WHERE x.term_id=w.term_id AND x.state='queued' AND x.pool_ids && w.pool_ids AND (x.tier,x.joined_at,x.id)<(w.tier,w.joined_at,w.id)))::int AS position
    FROM waitlist w JOIN section s ON s.id=(w.bundle->>'sectionId')::bigint JOIN offering o ON o.id=s.offering_id JOIN course c ON c.id=o.course_id
    WHERE w.student_id=${actor.id} AND w.term_id=${term} ORDER BY w.joined_at DESC LIMIT 50`;
  const rows=await db.$queryRaw<(Meeting&{title:string;code:string})[]>`SELECT m.component_id,r.code AS room,r.campus,m.zone,m.duration_minutes,
    (EXTRACT(hour FROM m.local_start)*60+EXTRACT(minute FROM m.local_start))::int AS start_minute,
    ARRAY(SELECT to_char(d,'YYYY-MM-DD') FROM unnest(m.week_dates) d) AS dates,m.exception_dates,c.title,c.code
    FROM meeting m JOIN room r ON r.id=m.room_id JOIN timetable_version v ON v.id=m.version_id
    JOIN enrollment_component ec ON ec.component_id=m.component_id JOIN enrollment e ON e.id=ec.enrollment_id JOIN course c ON c.id=e.course_id
    WHERE v.state='published' AND v.term_id=${term} AND e.student_id=${actor.id} AND e.state='active'`;
  const schedule=rows.flatMap(r=>occurrences(r).map(slot=>({...slot,title:r.title,code:r.code,room:r.room,campus:r.campus,zone:r.zone})))
    .sort((a,b)=>a.weekDate.localeCompare(b.weekDate,'en')||a.startMinute-b.startMinute);
  const count=enrollments.reduce((n,e)=>n+quantity(e.credits,2),0n);
  const timetableNotices=await db.$queryRaw<{versionId:string;changedComponents:number;publishedAt:Date}[]>`
    SELECT version_id::text AS "versionId",changed_components AS "changedComponents",published_at AS "publishedAt"
    FROM timetable_change_notice WHERE student_id=${actor.id} AND term_id=${term}
    ORDER BY published_at DESC LIMIT 10`;
  return {enrollments,waits,schedule,timetableNotices,credits:(count/100n).toString()+'.'+(count%100n).toString().padStart(2,'0')};
}

export async function seatsReport(db:Database,actor:Actor,term:bigint,unit:bigint){
  if(!await allowed(db,actor.id,'academic_office',unit,term)) throw new Problem('ERR-003');
  return db.$transaction(async tx=>{
    const asOf=await decisionClock(tx);
    const rows=await tx.$queryRaw<{pool:string;capacity:number;enrolled:number;offers:number}[]>`
      SELECT p.id::text AS pool,p.capacity,(count(sc.id) FILTER(WHERE sc.enrollment_id IS NOT NULL))::int AS enrolled,
      (count(sc.id) FILTER(WHERE w.state='offered' AND w.expires_at>${asOf}))::int AS offers
      FROM capacity_pool p LEFT JOIN seat_claim sc ON sc.pool_id=p.id LEFT JOIN waitlist w ON w.id=sc.waitlist_id
      WHERE p.term_id=${term} AND EXISTS(SELECT 1 FROM section s JOIN offering o ON o.id=s.offering_id WHERE s.pool_id=p.id AND o.unit_id=${unit})
      AND NOT EXISTS(SELECT 1 FROM section s JOIN offering o ON o.id=s.offering_id WHERE s.pool_id=p.id AND o.unit_id<>${unit})
      GROUP BY p.id,p.capacity ORDER BY p.id LIMIT 250`;
    return {asOf,rows:rows.map(r=>({...r,utilization:r.capacity===0?null:r.enrolled/r.capacity}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
