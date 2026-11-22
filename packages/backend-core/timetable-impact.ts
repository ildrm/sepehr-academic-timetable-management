import {createHash} from 'node:crypto';
import {Prisma,Reader,first} from './db';
import {absoluteInterval,Interval,Meeting,occurrences,scheduleIssues} from './meeting';
import {readPolicy} from './policy';

type Placement = {room:string;campus:string;instructor:string;intervals:Interval[]};
type Published = Meeting & {instructor:string};
type Active = {student:string;enrollment:string;revision:number;components:string[];parameters:unknown};
type StudentImpact = {student:string;enrollmentRevisions:string[];changedComponents:string[];issues:string[]};

function signature(value:Placement[]) {
  return JSON.stringify(value.flatMap(p=>p.intervals.map(i=>JSON.stringify([
    p.room,p.campus,p.instructor,i.weekDate,i.startMinute,i.endMinute,
  ]))).sort());
}

export async function timetableImpact(db:Reader,term:bigint,zone:string,next:Map<string,Placement>) {
  const prior=await first<{id:bigint}>(db,Prisma.sql`
    SELECT id FROM timetable_version WHERE term_id=${term} AND state='published'`);
  const priorRows=prior ? await db.$queryRaw<Published[]>`
    SELECT m.component_id,m.instructor_id::text AS instructor,r.code AS room,r.campus,m.zone,m.duration_minutes,
      (extract(hour FROM m.local_start)*60+extract(minute FROM m.local_start))::int AS start_minute,
      ARRAY(SELECT to_char(d,'YYYY-MM-DD') FROM unnest(m.week_dates) d) AS dates,m.exception_dates
    FROM meeting m JOIN room r ON r.id=m.room_id WHERE m.version_id=${prior.id}` : [];
  const before=new Map<string,Placement[]>();
  for(const row of priorRows){
    const key=String(row.component_id);
    const entries=before.get(key)??[];
    entries.push({...row,intervals:occurrences(row)});
    before.set(key,entries);
  }
  const changed=[...new Set([...before.keys(),...next.keys()])]
    .filter(key=>signature(before.get(key)??[])!==signature(next.has(key)?[next.get(key)!]:[])).sort();
  const students:StudentImpact[]=[];
  if(changed.length){
    const enrollments=await db.$queryRaw<Active[]>`
      WITH affected AS (
        SELECT DISTINCT e.student_id FROM enrollment_component ec JOIN enrollment e ON e.id=ec.enrollment_id
        WHERE e.term_id=${term} AND e.state='active' AND ec.component_id::text IN (${Prisma.join(changed)})
      )
      SELECT e.student_id::text AS student,e.id::text AS enrollment,e.revision,
        ARRAY(SELECT c.component_id::text FROM enrollment_component c WHERE c.enrollment_id=e.id ORDER BY c.component_id) AS components,
        pv.parameters FROM enrollment e JOIN affected a ON a.student_id=e.student_id
      JOIN student_term st ON st.term_id=e.term_id AND st.student_id=e.student_id
      JOIN policy_version pv ON pv.id=st.policy_id
      WHERE e.term_id=${term} AND e.state='active' ORDER BY e.student_id,e.id`;
    const byStudent=new Map<string,Active[]>();
    for(const row of enrollments){
      const group=byStudent.get(row.student)??[];
      group.push(row);
      byStudent.set(row.student,group);
    }
    const occurrencesByComponent=new Map([...next].map(([component,p])=>[component,p.intervals.map(i=>({
      ...absoluteInterval(i,zone),campus:p.campus,
    }))]));
    for(const [student,group] of byStudent){
      const components=[...new Set(group.flatMap(e=>e.components))];
      const missing=components.some(c=>!occurrencesByComponent.get(c)?.length);
      const slots=components.flatMap(c=>occurrencesByComponent.get(c)??[]);
      const policy=readPolicy(group[0].parameters);
      students.push({
        student,
        enrollmentRevisions:group.map(e=>e.enrollment+':'+e.revision),
        changedComponents:components.filter(c=>changed.includes(c)).sort(),
        issues:missing?['schedule_unpublished']:scheduleIssues(slots,policy.travelMinutes),
      });
    }
  }
  const previousVersionId=prior?String(prior.id):null;
  const impactHash=createHash('sha256').update(JSON.stringify({previousVersionId,changed,students})).digest('hex');
  return {
    previousVersionId,impactHash,changedComponents:changed,
    affectedStudents:students.length,blockedStudents:students.filter(s=>s.issues.length>0).length,
    issues:[...new Set(students.flatMap(s=>s.issues))].sort(),students,
  };
}
