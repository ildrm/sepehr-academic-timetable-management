import {test} from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import {connect,Prisma,first} from '../../packages/backend-core/db';
import { apiAccepts } from '../../packages/contracts/runtime';
import { z } from 'zod';

const base=process.env.TEST_API_URL??'http://127.0.0.1:4100';
const origin=process.env.WEB_ORIGIN??'http://localhost:3000';
const token=z.object({code:z.string()});
const receipt=z.object({requestId:z.string(),resourceId:z.string(),revision:z.number()});
const bundle=z.object({sectionId:z.string(),componentIds:z.array(z.string())});
type Bundle=z.infer<typeof bundle>;
type Account={cookie:string;csrf:string};
async function login(subject:string){
  const r=await fetch(base+'/session/development',{method:'POST',headers:{origin,'content-type':'application/json'},
    body:JSON.stringify({login:subject,password:process.env.DEV_BOOTSTRAP_PASSWORD})});
  assert.equal(r.status,200,await r.text());
  const cookies=r.headers.getSetCookie().map(x=>x.split(';')[0]);
  const csrf=cookies.find(x=>x.startsWith('academic_csrf='))?.split('=')[1];
  if(!csrf)throw new Error('Login did not set CSRF cookies');
  return {cookie:cookies.join('; '),csrf};
}
async function call(actor:Account,path:string,body?:unknown,key?:string,csrf=actor.csrf){
  const headers=new Headers({cookie:actor.cookie});
  if(body!==undefined){headers.set('origin',origin);headers.set('content-type','application/json');headers.set('x-csrf-token',csrf);}
  if(key)headers.set('idempotency-key',key);
  const r=await fetch(base+'/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json() as unknown};
}
async function expectCode(result:Awaited<ReturnType<typeof call>>,code:string){
  assert.equal(token.parse(result.body).code,code);assert.ok(apiAccepts('Error',result.body));
}
const recurring=z.object({id:z.string(),state:z.string(),title:z.string()});
test('real API, PostgreSQL guard contention, durable recovery, waitlist and solver publication', {timeout:120000}, async(t)=>{
  assert.ok(process.env.DATABASE_URL && /\/academic_test(?:_[a-z0-9]+)?(?:[?#]|$)/.test(process.env.DATABASE_URL),'Use an isolated academic_test database');
  const db=connect();
  try{
    const term=await first<{id:bigint;code:string}>(db,Prisma.sql`SELECT id,code FROM term WHERE code='SYN-OPEN'`);
    assert.ok(term);const termId=String(term.id);
    const before=await first<{count:bigint}>(db,Prisma.sql`SELECT count(*) FROM enrollment`);
    assert.equal(before?.count,0n,'Run against a freshly seeded test database');
    const [a,b,c,planner,approver,office]=await Promise.all(['student.demo','student.second','student.arts','planner.demo','approver.demo','office.demo'].map(login));
    const choices=await db.$queryRaw<{code:string;bundle:Bundle}[]>`SELECT c.code,jsonb_build_object('sectionId',s.id::text,
      'componentIds',ARRAY(SELECT x::text FROM unnest(sb.component_ids)x)) AS bundle
      FROM section_bundle sb JOIN section s ON s.id=sb.section_id JOIN offering o ON o.id=s.offering_id JOIN course c ON c.id=o.course_id WHERE o.term_id=${term.id}`;
    const pick=(code:string)=>bundle.parse(choices.find(x=>x.code==='SYN-'+code)?.bundle);
    const request=(actor:Account,items:Bundle[],key=randomUUID())=>call(actor,'me/enrollments',{termId,bundles:items},key);
    const pending=(actor:Account,items:Bundle[])=>request(actor,items);
    async function race<T>(operations:(()=>Promise<T>)[]){
      let release:()=>void=()=>{};
      let acquired:()=>void=()=>{};
      const held=new Promise<void>(resolve=>{acquired=resolve;});
      const done=new Promise<void>(resolve=>{release=resolve;});
      const lock=db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT term_id FROM queue_guard WHERE term_id=${term?.id} FOR UPDATE`;
        acquired();await done;
      },{timeout:10000});
      await held;
      const calls=Promise.allSettled(operations.map(op=>op()));
      try{
        const until=Date.now()+4500;
        let count=0n;
        while(Date.now()<until){
          count=(await first<{n:bigint}>(db,Prisma.sql`SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock' AND application_name<> 'psql'
            AND query LIKE '%queue_guard%' AND pid<>pg_backend_pid()`))?.n??0n;
          if(count>=BigInt(operations.length))break;
          await pause(25);
        }
        assert.ok(count>=BigInt(operations.length),'Expected both independent API commands to wait on the term guard');
      }finally{release();await lock;}
      const results=await calls;
      return results.map(x=>{if(x.status==='rejected')throw x.reason;return x.value;});
    }
    await t.test('scoped API, registration windows, self progress and CSRF',async()=>{
      const degree=await call(a,'me/degree/'+termId);
      assert.equal(degree.status,200);
      assert.match(z.object({recordRevision:z.string()}).parse(degree.body).recordRevision,/^[a-f0-9]{64}$/);
      const suggestions=await call(a,'me/suggestions/'+termId+'?q=MA205&preferred=SYN-MA205');
      assert.equal(suggestions.status,200,JSON.stringify(suggestions.body));
      const ranked=z.object({results:z.array(z.object({matchedPreferences:z.array(z.string()),timetableVersion:z.string()}))});
      assert.deepEqual(ranked.parse(suggestions.body).results[0]?.matchedPreferences,['SYN-MA205']);
      await expectCode(await call(c,'terms/'+termId+'/timetables'),'ERR-003');
      await expectCode(await call(a,'me/enrollments',{termId,bundles:[pick('MA205')]},randomUUID(),'mismatch'),'ERR-003');
      const closed=await first<{id:bigint}>(db,Prisma.sql`SELECT id FROM term WHERE code='SYN-CLOSED'`);
      assert.ok(closed);
      await expectCode(await call(a,'me/registration-finalizations',{termId:String(closed.id)},randomUUID()),'ERR-007');
      await expectCode(await call(a,'me/registration-finalizations',{termId},randomUUID()),'ERR-004');
    });
    await t.test('independent publication of a real CP-SAT result',async()=>{
      const source=await db.$queryRaw<{id:string;instructor:string;room:string;campus:string;weekDate:string;startMinute:number;duration:number}[]>`
        SELECT m.component_id::text AS id,m.instructor_id::text AS instructor,r.code AS room,r.campus,
               to_char(m.week_dates[1],'YYYY-MM-DD') AS "weekDate",
               (extract(hour FROM m.local_start)*60+extract(minute FROM m.local_start))::int AS "startMinute",m.duration_minutes AS duration
        FROM meeting m JOIN timetable_version v ON v.id=m.version_id JOIN room r ON r.id=m.room_id
        WHERE v.term_id=${term.id} AND v.state='published' ORDER BY m.component_id`;
      const snapshotId='tests-'+randomUUID();
      const input={snapshotId,epoch:0,zone:'Etc/UTC',sourceFactsRef:'synthetic-inventory-A',configuration:{seed:11,objective:'preference',limitParameter:'SOLVER_LIMIT_SECONDS'},
        classes:source.map(m=>({id:m.id,pinned:'fixed',placements:[{id:'fixed',instructor:m.instructor,room:m.room,campus:m.campus,
          intervals:[{weekDate:m.weekDate,startMinute:m.startMinute,endMinute:m.startMinute+m.duration}],penalty:0,loadUnits:1,preferenceCosts:[0]}]})),
        constraints:{forbiddenPairs:[],workloadCaps:[{instructor:source[0].instructor,maxUnits:60}],objectiveTiers:[{name:'preference',weight:1}]}};
      const root='terms/'+termId;
      assert.equal((await call(planner,root+'/snapshots',input)).status,201);
      const submitted=await call(planner,root+'/solve-runs',{snapshotId,configurationId:'test-config'});
      assert.equal(submitted.status,202,JSON.stringify(submitted.body));
      const runShape=z.object({runId:z.string(),state:z.string(),resultRef:z.string().nullable(),solverStatus:z.string().nullable()});
      const id=runShape.parse(submitted.body).runId;
      let run=runShape.parse(submitted.body);
      for(let i=0;i<35&&!['finished','failed'].includes(run.state);i++){
        await pause(400);run=runShape.parse((await call(planner,root+'/solve-runs/'+id)).body);
      }
      assert.equal(run.state,'finished');assert.equal(run.solverStatus,'OPTIMAL');assert.ok(run.resultRef);
      const versions=z.array(z.object({versionId:z.string(),contentHash:z.string(),validationRef:z.string().nullable()}));
      const v=versions.parse((await call(planner,root+'/timetables')).body).find(x=>x.versionId===run.resultRef);
      assert.ok(v);
      const validation=await call(planner,root+'/timetables/'+v.versionId+'/validations',{contentHash:v.contentHash});
      assert.equal(validation.status,200);assert.equal(z.object({valid:z.boolean()}).parse(validation.body).valid,true,JSON.stringify(validation.body));
      const after=versions.parse((await call(approver,root+'/timetables')).body).find(x=>x.versionId===run.resultRef);
      assert.ok(after?.validationRef);
      const written=await call(approver,root+'/timetables/'+v.versionId+'/publications',{contentHash:v.contentHash,validationRef:after.validationRef},randomUUID());
      assert.equal(written.status,200,JSON.stringify(written.body));
      await expectCode(await call(planner,root+'/timetables/'+v.versionId+'/validations',{contentHash:v.contentHash}),'ERR-008');
    });
    await t.test('linked lab failure leaves lecture claims and enrollment untouched',async()=>{
      const ids=pick('CS210').componentIds.map(BigInt);
      const lab=await first<{pool_id:bigint}>(db,Prisma.sql`SELECT pool_id FROM component WHERE id=${ids[1]}`);
      assert.ok(lab);
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM term WHERE id=${term.id} FOR UPDATE`;
        await tx.$executeRaw`UPDATE capacity_pool SET capacity=0 WHERE id=${lab.pool_id}`;
      });
      try{
        await expectCode(await request(a,[pick('CS210')]),'ERR-005');
        const n=await first<{n:bigint}>(db,Prisma.sql`SELECT count(*) AS n FROM enrollment WHERE section_id=${BigInt(pick('CS210').sectionId)}`);
        assert.equal(n?.n,0n);
        assert.equal((await first<{n:bigint}>(db,Prisma.sql`SELECT count(*) AS n FROM seat_claim`))?.n,0n);
      }finally{
        await db.$transaction(async tx=>{
          await tx.$queryRaw`SELECT id FROM term WHERE id=${term.id} FOR UPDATE`;
          await tx.$executeRaw`UPDATE capacity_pool SET capacity=6 WHERE id=${lab.pool_id}`;
        });
      }
    });
    let winner=a, loser=b, winnerId='';
    await t.test('last seat is decided under a real competing connection',async()=>{
      const scores=await race([()=>pending(a,[pick('CS320')]),()=>pending(b,[pick('CS320')])]);
      assert.deepEqual(scores.map(x=>x.status).sort(),[200,409],JSON.stringify(scores));
      const winnerIndex=scores.findIndex(x=>x.status===200);
      winner=winnerIndex===0?a:b;loser=winnerIndex===0?b:a;winnerId=receipt.parse(scores[winnerIndex].body).resourceId;
      await expectCode(scores[1-winnerIndex],'ERR-005');
    });
    await t.test('atomic swap, complete laboratory bundle, corequisite removal and stable replay',async()=>{
      const swap=await call(winner,'me/swaps',{termId,add:[pick('CS410')],dropEnrollmentIds:[winnerId]},randomUUID());
      await expectCode(swap,'ERR-005');
      const count=await first<{n:bigint}>(db,Prisma.sql`SELECT count(*) AS n FROM enrollment WHERE id=${BigInt(winnerId)} AND state='active'`);
      assert.equal(count?.n,1n);
      const key=randomUUID(), payload=[pick('CS210'),pick('CS211')];
      const [x,y]=await Promise.all([request(loser,payload,key),request(loser,[...payload].reverse(),key)]);
      assert.equal(x.status,200,JSON.stringify(x.body));assert.deepEqual(x,y);
      assert.ok(apiAccepts('Receipt',x.body));
      const recovered=await call(loser,'me/requests/enroll/'+key);
      assert.equal(recovered.status,200);
      assert.deepEqual(z.object({outcome:z.unknown()}).parse(recovered.body).outcome,x.body);
      await expectCode(await request(loser,[pick('MA205')],key),'ERR-006');
      await expectCode(await call(winner,'me/requests/enroll/'+key),'ERR-011');
      const original=await first<{id:bigint;count:bigint}>(db,Prisma.sql`SELECT e.id,count(ec.component_id) AS count FROM enrollment e
        JOIN course c ON c.id=e.course_id JOIN enrollment_component ec ON ec.enrollment_id=e.id WHERE c.code='SYN-CS210' GROUP BY e.id`);
      assert.equal(original?.count,2n);
      assert.ok(original);
      await expectCode(await call(loser,'me/drops',{termId,enrollmentIds:[String(original.id)]},randomUUID()),'ERR-004');
      const scoped=await db.$queryRaw<{id:string}[]>`SELECT id::text FROM identity_account WHERE subject='student.arts'`;
      await expectCode(await call(office,'staff/students/'+scoped[0].id+'/enrollment-changes',{termId,add:[pick('MA205')],dropEnrollmentIds:[],caseRef:'SYN-CASE'},randomUUID()),'ERR-003');
    });
    await t.test('one student, overlapping credit decisions',async()=>{
      const result=await request(c,[pick('FA101'),pick('CS101'),pick('MA205')]);
      assert.equal(result.status,200,JSON.stringify(result.body));
      // This student holds 8 credits. The lab-only course needs its missing prerequisite, so use
      // two concurrent eligible 3-credit selections in the fixture by giving an isolated 11-credit ceiling.
      const prov=await first<{id:bigint}>(db,Prisma.sql`SELECT id FROM policy_version WHERE edition='SYN-HYPOTHETICAL-A'`);
      assert.ok(prov);
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM term WHERE id=${term.id} FOR UPDATE`;
        await tx.$executeRaw`UPDATE policy_version SET parameters=jsonb_set(parameters,'{ceiling}','"11.00"') WHERE id=${prov.id}`;
      });
      const outcomes=await race([()=>pending(c,[pick('CS450')]),()=>pending(c,[pick('CS460')])]);
      assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,422],JSON.stringify(outcomes));
      assert.ok(outcomes.some(r=>r.status===422&&token.parse(r.body).code==='ERR-004'));
    });
    await t.test('waitlist consumes a durable hold and outbox consumer deduplicates',async()=>{
      const queued=await call(loser,'me/waitlist-entries',{termId,bundle:pick('CS320')},randomUUID());
      assert.equal(queued.status,200,JSON.stringify(queued.body));
      const entryId=receipt.parse(queued.body).resourceId;
      assert.equal((await call(winner,'me/drops',{termId,enrollmentIds:[winnerId]},randomUUID())).status,200);
      let offered=false;
      for(let i=0;i<30;i++){
        const result=await call(loser,'me/overview/'+termId);
        const entries=z.object({waits:z.array(recurring)}).parse(result.body).waits;
        if(entries.find(x=>x.id===entryId)?.state==='offered'){offered=true;break;}
        await pause(350);
      }
      assert.ok(offered,'Worker did not create an offer');
      const accept=await call(loser,'me/waitlist-entries/'+entryId+'/responses',{termId,response:'accept'},randomUUID());
      assert.equal(accept.status,200,JSON.stringify(accept.body));
      assert.ok(await first(db,Prisma.sql`SELECT 1 FROM consumer_receipt WHERE consumer='portal-inbox'`));
    });
    await t.test('separate exception requester and approver, plus dry-run import and replay',async()=>{
      const opened=await call(c,'me/exceptions/'+termId,{ruleCode:'SYN-PREREQ',reasonRef:'fictional-case',validUntil:new Date(Date.now()+3600000).toISOString()});
      assert.equal(opened.status,201,JSON.stringify(opened.body));
      const grant=z.object({id:z.string()}).parse(opened.body).id;
      const decision='terms/'+termId+'/exceptions/'+grant+'/decisions';
      await expectCode(await call(c,decision,{decision:'approve',reasonRef:'self-denied'}),'ERR-003');
      assert.equal((await call(approver,decision,{decision:'approve',reasonRef:'synthetic-approval'})).status,200);
      const student=await first<{id:bigint}>(db,Prisma.sql`SELECT id FROM identity_account WHERE subject='student.demo'`);
      assert.ok(student);
      const row={studentId:String(student.id),courseCode:'SYN-CS450',attemptKey:'SYN-IMPORT-1',grade:'17.00',outcome:'passed',credits:'3.00'};
      const incoming={termId,sourceRef:'SYN-BATCH-1',approvalReference:'synthetic-review',mode:'preview',rows:[row,row]};
      const preview=await call(office,'academic/imports',incoming);
      assert.equal(preview.status,200,JSON.stringify(preview.body));
      const result=z.object({status:z.string(),inserted:z.number(),diagnostics:z.array(z.object({row:z.number(),code:z.string()}))});
      assert.equal(result.parse(preview.body).diagnostics[0].code,'attempt_conflict');
      const apply={...incoming,mode:'apply',rows:[row]};
      const saved=await call(office,'academic/imports',apply);
      assert.equal(saved.status,201,JSON.stringify(saved.body));
      assert.equal(result.parse(saved.body).inserted,1);
      assert.deepEqual(await call(office,'academic/imports',apply),saved);
      assert.equal((await first<{n:bigint}>(db,Prisma.sql`SELECT count(*) AS n FROM academic_record WHERE attempt_key='SYN-IMPORT-1'`))?.n,1n);
      await expectCode(await call(office,'academic/imports',{...apply,rows:[{...row,credits:'2.00'}]}),'ERR-006');
    });
    await t.test('scoped academic setup and maker-checker metadata',async()=>{
      const college=await first<{id:bigint}>(db,Prisma.sql`SELECT id FROM org_unit WHERE code='SYN-ENGINEERING'`);
      assert.ok(college);
      const dept=await call(approver,'academic/units',{parentId:String(college.id),code:'SYN-TEST-DEPT',kind:'department',approvalReference:'synthetic'});
      assert.equal(dept.status,201,JSON.stringify(dept.body));
      const unitId=z.object({id:z.string()}).parse(dept.body).id;
      const program=await call(approver,'academic/programs',{unitId,code:'SYN-TEST-NEW',degreeLevel:'bachelor',approvalReference:'synthetic'});
      assert.equal(program.status,201,JSON.stringify(program.body));
      const programId=z.object({id:z.string()}).parse(program.body).id;
      const curriculum=await call(office,'academic/curricula',{programId,edition:'SYN-SECOND',effectiveFrom:'2026-01-01',
        requirements:{groups:[{id:'core',courses:['SYN-CS101'],credits:'3.00'}]}});
      assert.equal(curriculum.status,201,JSON.stringify(curriculum.body));
      const curriculumId=z.object({id:z.string()}).parse(curriculum.body).id;
      await expectCode(await call(office,'academic/curricula/'+curriculumId+'/approval',{approvalReference:'self'}),'ERR-003');
      assert.equal((await call(approver,'academic/curricula/'+curriculumId+'/approval',{approvalReference:'synthetic-review'})).status,200);
      const instructor=await login('instructor.demo');
      const wanted=await call(instructor,'me/instructor/'+termId);
      assert.equal(wanted.status,200);
      await expectCode(await call(instructor,'academic/courses',{unitId,code:'NO',title:'Denied',credits:'1.00'}),'ERR-003');
      const capacitySummary=await call(office,'terms/'+termId+'/reports/seats/'+college.id);
      assert.equal(capacitySummary.status,200);
      const seatsPath=base+'/terms/'+termId+'/reports/seats/'+college.id+'/export';
      const exported=await fetch(seatsPath,{headers:{cookie:office.cookie}});
      assert.equal(exported.status,200);
      assert.match(await exported.text(),/suppressed[^\n]*REP-001-v1/);
      assert.equal((await fetch(seatsPath,{headers:{cookie:a.cookie}})).status,403);
      const demand=await fetch(base+'/terms/'+termId+'/reports/demand/export',{headers:{cookie:planner.cookie}});
      assert.equal(demand.status,200);
      assert.match(await demand.text(),/^term,section,components,queued_students,as_of,formula_version/);
    });
    await t.test('timetable repair requires distinct impact review and creates scoped student notice',async()=>{
      const current=await first<{epoch:bigint}>(db,Prisma.sql`SELECT epoch FROM term WHERE id=${term.id}`);
      assert.ok(current);
      const source=await db.$queryRaw<{id:string;instructor:string;room:string;campus:string;weekDate:string;startMinute:number;duration:number}[]>`
        SELECT m.component_id::text AS id,m.instructor_id::text AS instructor,r.code AS room,r.campus,
               to_char(m.week_dates[1],'YYYY-MM-DD') AS "weekDate",
               (extract(hour FROM m.local_start)*60+extract(minute FROM m.local_start))::int AS "startMinute",m.duration_minutes AS duration
        FROM meeting m JOIN timetable_version v ON v.id=m.version_id JOIN room r ON r.id=m.room_id
        WHERE v.term_id=${term.id} AND v.state='published' ORDER BY m.component_id`;
      const target=pick('CS320').componentIds[0],snapshotId='repair-'+randomUUID();
      const input={snapshotId,epoch:Number(current.epoch),zone:'Etc/UTC',sourceFactsRef:'synthetic-impact-case',
        configuration:{seed:11,objective:'preference',limitParameter:'SOLVER_LIMIT_SECONDS'},
        classes:source.map(m=>{
          const start=m.startMinute+(m.id===target?30:0);
          return {id:m.id,pinned:'fixed',placements:[{id:'fixed',instructor:m.instructor,room:m.room,campus:m.campus,
            intervals:[{weekDate:m.weekDate,startMinute:start,endMinute:start+m.duration}],penalty:0,loadUnits:1,preferenceCosts:[0]}]};
        }),
        constraints:{forbiddenPairs:[],workloadCaps:[{instructor:source[0].instructor,maxUnits:60}],objectiveTiers:[{name:'preference',weight:1}]}};
      const root='terms/'+termId+'/timetables';
      assert.equal((await call(planner,'terms/'+termId+'/snapshots',input)).status,201);
      const raw=await call(planner,root,{snapshotId,assignments:input.classes.map(c=>({classId:c.id,placementId:'fixed'}))});
      const candidate=z.object({versionId:z.string(),contentHash:z.string()}).parse(raw.body);
      const path=root+'/'+candidate.versionId;
      const valid=await call(planner,path+'/validations',{contentHash:candidate.contentHash});
      assert.equal(z.object({valid:z.boolean()}).parse(valid.body).valid,true);
      const versions=z.array(z.object({versionId:z.string(),validationRef:z.string().nullable()}));
      const found=versions.parse((await call(approver,root)).body).find(v=>v.versionId===candidate.versionId);
      assert.ok(found?.validationRef);
      const publish={contentHash:candidate.contentHash,validationRef:found.validationRef};
      await expectCode(await call(approver,path+'/publications',publish,randomUUID()),'ERR-008');
      const impact=z.object({impactHash:z.string(),affectedStudents:z.number(),blockedStudents:z.number()}).parse((await call(approver,path+'/impact')).body);
      assert.equal(impact.affectedStudents,1);
      assert.equal(impact.blockedStudents,0);
      await expectCode(await call(planner,path+'/impact',{impactHash:impact.impactHash,approvalRef:'wrong role'}),'ERR-003');
      assert.equal((await call(approver,path+'/impact',{impactHash:impact.impactHash,approvalRef:'synthetic approval'})).status,200);
      assert.equal((await call(approver,path+'/publications',publish,randomUUID())).status,200);
      const overview=z.object({timetableNotices:z.array(z.object({versionId:z.string()}))});
      assert.equal(overview.parse((await call(loser,'me/overview/'+termId)).body).timetableNotices[0].versionId,candidate.versionId);
      assert.deepEqual(overview.parse((await call(winner,'me/overview/'+termId)).body).timetableNotices,[]);
    });
    await t.test('allocation runs use committed seed, reject stale seats and publish once',async()=>{
      const seed='8'.repeat(64),seedCommitment=createHash('sha256').update(seed).digest('hex');
      const root='terms/'+termId+'/allocations',studentRoot='me/allocations/'+termId;
      const created=await call(planner,root,{seedCommitment,policyRef:'synthetic lottery policy',applicantLimit:8,
        requiredClassifications:['elective'],opensAt:new Date(Date.now()+60000).toISOString(),closesAt:new Date(Date.now()+120000).toISOString()});
      assert.equal(created.status,201,JSON.stringify(created.body));
      const id=z.object({id:z.string()}).parse(created.body).id;
      await expectCode(await call(planner,root+'/'+id+'/approval',{approvalRef:'wrong role'}),'ERR-003');
      assert.equal((await call(approver,root+'/'+id+'/approval',{approvalRef:'synthetic approval'})).status,200);
      const options={alternatives:[[pick('MA205')]]};
      await expectCode(await call(a,studentRoot+'/'+id,options),'ERR-007');
      const pool=await first<{pool_id:bigint}>(db,Prisma.sql`SELECT pool_id FROM section WHERE id=${BigInt(pick('MA205').sectionId)}`);
      assert.ok(pool);
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM term WHERE id=${term.id} FOR UPDATE`;
        await tx.$executeRaw`UPDATE allocation_campaign SET opens_at=clock_timestamp()-interval '1 minute' WHERE id=${BigInt(id)}`;
        await tx.$executeRaw`UPDATE capacity_pool SET capacity=2 WHERE id=${pool.pool_id}`;
      });
      for(const applicant of [a,b])assert.equal((await call(applicant,studentRoot+'/'+id,options)).status,200);
      await db.$executeRaw`UPDATE allocation_campaign SET closes_at=clock_timestamp()-interval '1 second' WHERE id=${BigInt(id)}`;
      await expectCode(await call(planner,root+'/'+id+'/runs',{seed:'9'.repeat(64)}),'ERR-001');
      const runShape=z.object({runId:z.string(),status:z.string(),revisionHash:z.string()});
      const campaigns=z.array(z.object({id:z.string(),run:runShape.nullable()}));
      async function ready(){
        const response=await call(planner,root+'/'+id+'/runs',{seed});
        assert.equal(response.status,202,JSON.stringify(response.body));
        const queued=runShape.parse(response.body);
        for(let i=0;i<40;i++){
          const row=campaigns.parse((await call(planner,root)).body).find(x=>x.id===id);
          if(row?.run?.runId===queued.runId&&['ready','failed'].includes(row.run.status)){
            assert.equal(row.run.status,'ready');
            return row.run;
          }
          await pause(250);
        }
        throw new Error('allocation not ready');
      }
      const run=await ready();
      const publish=(r:typeof run)=>call(approver,root+'/'+id+'/runs/'+r.runId+'/publication',{revisionHash:r.revisionHash,approvalRef:'synthetic result'});
      await db.$executeRaw`UPDATE capacity_pool SET capacity=3 WHERE id=${pool.pool_id}`;
      assert.equal(z.object({status:z.string()}).parse((await publish(run)).body).status,'stale');
      await db.$executeRaw`UPDATE capacity_pool SET capacity=2 WHERE id=${pool.pool_id}`;
      const next=await ready();
      const published=await publish(next);
      assert.equal(published.status,200,JSON.stringify(published.body));
      assert.equal(z.object({status:z.string(),enrollments:z.number()}).parse(published.body).enrollments,1);
      assert.equal((await publish(next)).status,200);
      const students=z.array(z.object({id:z.string(),selectedAlternative:z.number().nullable()}));
      const candidates=await Promise.all([a,b].map(async student=>students.parse((await call(student,studentRoot)).body).find(x=>x.id===id)));
      assert.deepEqual(candidates.map(x=>x?.selectedAlternative).sort(),[0,null]);
      const claims=await first<{n:number}>(db,Prisma.sql`SELECT count(*)::int AS n FROM seat_claim WHERE pool_id=${pool.pool_id}`);
      assert.equal(claims?.n,2);
    });
    await t.test('expired role assignment and missing policy fail safely',async()=>{
      const student=await first<{id:bigint}>(db,Prisma.sql`SELECT id FROM identity_account WHERE subject='student.arts'`);
      assert.ok(student);
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM term WHERE id=${term.id} FOR UPDATE`;
        await tx.$executeRaw`UPDATE role_assignment SET valid_until=clock_timestamp()-interval '1 second' WHERE actor_id=${student.id}`;
      });
      await expectCode(await call(c,'me/overview/'+termId),'ERR-003');
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM term ORDER BY id FOR UPDATE`;
        await tx.$executeRaw`UPDATE policy_version SET parameters=parameters-'floor' WHERE edition='SYN-HYPOTHETICAL-A'`;
      });
      await expectCode(await request(a,[pick('CS460')]),'ERR-010');
    });
  }finally{await db.$disconnect();}
});
