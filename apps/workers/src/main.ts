import { spawn } from 'node:child_process';
import { createHash,randomUUID } from 'node:crypto';
import { Queue,Worker } from 'bullmq';
import { z } from 'zod';
import { connect,first,Prisma,numericId,Database } from '../../../packages/backend-core/db';
import { insertProposal,solverOutput,snapshotSchema } from '../../../packages/backend-core/timetable';
import { processWaitlist } from '../../../packages/backend-core/registration';
import { allocationInputSchema,allocationResultSchema } from '../../../packages/backend-core/allocation-model';
import { allocationBudget } from '../../../packages/backend-core/allocation';
import {dispatchNotification,notificationGateway} from '../../../packages/backend-core/notification';
import {redisConnection,validateProduction} from '../../../packages/backend-core/config';
import { nativeAccepts } from '../../../packages/contracts/runtime';

const configSchema=z.object({configurationId:z.string(),limit:z.number().int().min(1).max(999)});
type Lease={id:bigint;term_id:bigint;input_uri:string;snapshot_hash:string;config:unknown;generation:bigint;created_by:bigint};
type Pending={id:string;task:'event'|'solve'|'wait'|'allocate'|'notification';term?:string};
function runPython(input:string,path:string,args:string[],limit:number){
  return new Promise<unknown>((resolve,reject)=>{
    const proc=spawn(process.env.SOLVER_PYTHON??'.venv/bin/python',[path,...args],
      {stdio:['pipe','pipe','ignore']});
    let text=''; const timer=setTimeout(()=>proc.kill('SIGKILL'),(limit+15)*1000);
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data',(chunk:string)=>{text+=chunk;if(text.length>4_000_000)proc.kill('SIGKILL');});
    proc.stdin.on('error',reject);
    proc.once('error',reject);
    proc.once('close',code=>{clearTimeout(timer);
      if(code!==0){reject(new Error('solver_process_failed'));return;}
      try{resolve(JSON.parse(text));}catch(error){reject(error);}
    });
    proc.stdin.end(input);
  });
}
async function solve(db:Database,id:bigint){
  const row=await first<Lease>(db,Prisma.sql`UPDATE solve_job SET state='running',generation=generation+1,
    lease_until=clock_timestamp()+make_interval(secs=>(config->>'limit')::int+30)
    WHERE id=${id} AND generation<3 AND
      (state='queued' OR (state='running' AND lease_until<clock_timestamp())) RETURNING *`);
  if(!row) return;
  const snap=await first<{input:unknown;epoch:bigint}>(db,Prisma.sql`SELECT input,epoch FROM solve_snapshot WHERE id=${row.input_uri}`);
  try{
    if(!snap)throw new Error('snapshot_missing');
    const config=configSchema.parse(row.config),input=JSON.stringify(snapshotSchema.parse(snap.input));
    const result=solverOutput.parse(await runPython(input,'services/solver/solve.py',[config.configurationId,String(config.limit)],config.limit));
    if(!nativeAccepts('solver-output',result)||result.snapshotId!==row.input_uri||result.configurationId!==config.configurationId
      ||result.inputSha256!==row.snapshot_hash||result.inputSha256!==createHash('sha256').update(input).digest('hex'))
      throw new Error('solver_provenance_mismatch');
    await db.$transaction(async tx=>{
      const term=await first<{epoch:bigint}>(tx,Prisma.sql`SELECT epoch FROM term WHERE id=${row.term_id} FOR UPDATE`);
      const fenced=await first(tx,Prisma.sql`SELECT id FROM solve_job WHERE id=${id} AND generation=${row.generation}
        AND state='running' AND lease_until>clock_timestamp() FOR UPDATE`);
      if(!fenced)return;
      let reference:string|null=null;
      if(term?.epoch===snap.epoch&&['OPTIMAL','FEASIBLE'].includes(result.status)){
        const saved=await insertProposal(tx,row.term_id,row.input_uri,snap.epoch,result.assignments,row.created_by,randomUUID());
        reference=saved.versionId;
      }
      await tx.$executeRaw`UPDATE solve_job SET state='finished', result=${JSON.stringify(result)}::jsonb,result_uri=${reference},
        error_code=${term?.epoch===snap.epoch?null:'snapshot_stale'},lease_until=NULL WHERE id=${id}`;
    });
  }catch(error){
    await db.$executeRaw`UPDATE solve_job SET state=CASE WHEN generation>=3 THEN 'failed' ELSE 'queued' END,
      error_code='solver_execution_failed',lease_until=NULL WHERE id=${id} AND generation=${row.generation} AND state='running'`;
    throw error;
  }
}

async function allocate(db:Database,id:bigint){
  const limit=allocationBudget();
  const row=await first<{attempt:number;input:unknown}>(db,Prisma.sql`
    UPDATE allocation_run SET state='running',attempt=attempt+1,lease_until=clock_timestamp()+make_interval(secs=>${limit+30}::int)
    WHERE id=${id} AND attempt<3 AND (state='queued' OR state='running' AND lease_until<clock_timestamp()) RETURNING attempt,input`);
  if(!row)return;
  try{
    const input=allocationInputSchema.parse(row.input);
    const result=allocationResultSchema.parse(await runPython(JSON.stringify(input),'services/solver/allocate.py',[String(limit)],limit));
    await db.$executeRaw`UPDATE allocation_run SET state=${result.status==='OPTIMAL'?'ready':'failed'},result=${JSON.stringify(result)}::jsonb,
      error_code=${result.status==='OPTIMAL'?null:result.status},lease_until=NULL WHERE id=${id} AND attempt=${row.attempt}
      AND state='running' AND lease_until>clock_timestamp()`;
  }catch(error){
    await db.$executeRaw`UPDATE allocation_run SET state=CASE WHEN attempt>=3 THEN 'failed' ELSE 'queued' END,
      error_code='allocation_solver_failed',lease_until=NULL WHERE id=${id} AND attempt=${row.attempt} AND state='running'`;
    throw error;
  }
}

async function deliver(db:Database,id:string,gateway:boolean){
  await db.$transaction(async tx=>{
    const evt=await first<{envelope:unknown;aggregate_key:string;sequence:bigint;event_type:string}>(tx,
      Prisma.sql`SELECT envelope,aggregate_key,sequence,event_type FROM outbox_event WHERE id=${id}::uuid FOR UPDATE`);
    if(!evt)return;
    if(!nativeAccepts('event',evt.envelope)){
      await tx.$executeRaw`INSERT INTO quarantine_event(event_id,reason) VALUES(${id}::uuid,'event_invalid') ON CONFLICT DO NOTHING`;return;
    }
    if(await first(tx,Prisma.sql`SELECT 1 FROM outbox_event e WHERE e.aggregate_key=${evt.aggregate_key}
      AND e.sequence<${evt.sequence} AND NOT EXISTS (SELECT 1 FROM consumer_receipt r WHERE r.event_id=e.id AND r.consumer='portal-inbox')`))
      throw new Error('earlier_event_pending');
    const inserted=await tx.$executeRaw`INSERT INTO consumer_receipt(consumer,event_id,processed_at)
      VALUES('portal-inbox',${id}::uuid,clock_timestamp()) ON CONFLICT DO NOTHING`;
    if(inserted&&evt.event_type==='RecordCorrected'){
      await tx.$executeRaw`INSERT INTO review_case(student_id,term_id,trigger_event,reason,state)
        SELECT st.student_id,st.term_id,${id}::uuid,'record_corrected','open' FROM academic_record a
        JOIN student_term st ON st.student_id=a.student_id
        WHERE a.id=(${JSON.stringify(evt.envelope)}::jsonb->'payload'->>'resourceId')::bigint
        AND EXISTS(SELECT 1 FROM enrollment e WHERE e.student_id=a.student_id AND e.term_id=st.term_id AND e.state='active')
        ON CONFLICT DO NOTHING`;
    }
    if(inserted&&['TimetablePublished','WaitlistChanged','ExceptionDecided','RecordCorrected'].includes(evt.event_type))
      await tx.$executeRaw`INSERT INTO notification_intent(event_id,state) VALUES(${id}::uuid,${gateway?'pending':'unconfigured'}) ON CONFLICT DO NOTHING`;
  });
}

async function launch(){
  validateProduction('worker');
  const db=connect(),connection=redisConnection(),gateway=notificationGateway();
  const queueName=process.env.QUEUE_NAME??'academic-jobs';
  const queue=new Queue<Pending>(queueName,{connection});
  const worker=new Worker<Pending>(queueName,async job=>{
    const msg=job.data;
    if(msg.task==='event'){ await deliver(db,msg.id,!!gateway);return;}
    if(msg.task==='notification'){if(gateway)await dispatchNotification(db,gateway,msg.id);return;}
    if(msg.task==='solve'){ await solve(db,numericId(msg.id));return;}
    if(msg.task==='allocate'){ await allocate(db,numericId(msg.id));return;}
    const actor=await first<{id:bigint}>(db,Prisma.sql`SELECT id FROM identity_account WHERE issuer='internal-worker' AND subject='waitlist'`);
    if(actor)await db.$transaction(tx=>processWaitlist(tx,numericId(msg.term??''),numericId(msg.id),actor.id,randomUUID()),{timeout:8000});
  },{connection,concurrency:4});
  let busy=false,stopping=false;
  const options={attempts:4,backoff:{type:'exponential',delay:1500},removeOnComplete:true,removeOnFail:true};
  worker.on('error',()=>console.error(JSON.stringify({component:'worker',event:'broker_error'})));
  worker.on('failed',job=>console.error(JSON.stringify({component:'worker',event:'job_failed',task:job?.data.task})));
  async function tick(){
    if(busy||stopping)return;
    busy=true;
    try{
      const events=await db.$queryRaw<{id:string}[]>`SELECT id::text FROM outbox_event e
        WHERE NOT EXISTS(SELECT 1 FROM consumer_receipt r WHERE r.event_id=e.id AND r.consumer='portal-inbox')
        AND NOT EXISTS(SELECT 1 FROM quarantine_event q WHERE q.event_id=e.id)
        AND NOT EXISTS(SELECT 1 FROM outbox_event prior WHERE prior.aggregate_key=e.aggregate_key AND prior.sequence<e.sequence
          AND NOT EXISTS(SELECT 1 FROM consumer_receipt r WHERE r.event_id=prior.id AND r.consumer='portal-inbox'))
        ORDER BY occurred_at,id LIMIT 40`;
      for(const {id} of events){
        await queue.add('outbox',{id,task:'event'},{...options,jobId:'evt-'+id});
        await db.$executeRaw`UPDATE outbox_event SET published_at=clock_timestamp() WHERE id=${id}::uuid AND published_at IS NULL`;
      }
      await db.$executeRaw`UPDATE solve_job SET state='failed',error_code='lease_exhausted' WHERE state='running' AND generation>=3 AND lease_until<clock_timestamp()`;
      const solves=await db.$queryRaw<{id:string}[]>`SELECT id::text FROM solve_job
         WHERE state='queued' OR (state='running' AND lease_until<clock_timestamp()) ORDER BY id LIMIT 20`;
      for(const {id} of solves)await queue.add('solve',{id,task:'solve'},{...options,jobId:'solve-'+id});
      await db.$executeRaw`UPDATE allocation_run SET state='failed',error_code='lease_exhausted'
        WHERE state='running' AND attempt>=3 AND lease_until<clock_timestamp()`;
      const allocations=await db.$queryRaw<{id:string}[]>`SELECT id::text FROM allocation_run
        WHERE state='queued' OR (state='running' AND lease_until<clock_timestamp()) ORDER BY id LIMIT 20`;
      for(const {id} of allocations)await queue.add('allocation',{id,task:'allocate'},{...options,jobId:'allocation-'+id});
      const entries=await db.$queryRaw<{id:string;term:string}[]>`SELECT w.id::text,w.term_id::text AS term FROM waitlist w
        WHERE (w.state='offered' AND w.expires_at<=clock_timestamp()) OR (w.state='queued' AND NOT EXISTS(
          SELECT 1 FROM waitlist p WHERE p.term_id=w.term_id AND p.state='queued' AND p.pool_ids && w.pool_ids
            AND (p.tier,p.joined_at,p.id)<(w.tier,w.joined_at,w.id))) ORDER BY w.tier,w.joined_at,w.id LIMIT 30`;
      for(const {id,term} of entries)await queue.add('waitlist',{id,term,task:'wait'},{...options,jobId:'wait-'+id});
      if(gateway){
        // Leave previously unconfigured historical notifications for an operator to review.
        await db.$executeRaw`UPDATE notification_intent SET state='review',last_failure='lease_exhausted',lease_until=NULL
          WHERE state='pending' AND attempt>=5 AND lease_until<clock_timestamp()`;
        const due=await db.$queryRaw<{id:string}[]>`SELECT n.event_id::text AS id FROM notification_intent n JOIN outbox_event e ON e.id=n.event_id
          WHERE n.state='pending' AND n.next_attempt_at<=clock_timestamp() AND (n.lease_until IS NULL OR n.lease_until<clock_timestamp())
          AND NOT EXISTS (SELECT 1 FROM notification_intent n0 JOIN outbox_event e0 ON e0.id=n0.event_id
            WHERE e0.aggregate_key=e.aggregate_key AND e0.sequence<e.sequence AND n0.state IN ('pending','review'))
          ORDER BY n.next_attempt_at,n.event_id LIMIT 20`;
        for(const {id} of due)await queue.add('notification',{id,task:'notification'},{...options,jobId:'notification-'+id});
      }
      const waiting=await queue.getWaitingCount();
      await db.$executeRaw`INSERT INTO worker_heartbeat(name,updated_at,queue_waiting,outbox_pending,oldest_outbox_seconds,notification_reviews)
        SELECT ${queueName},clock_timestamp(),${waiting},
          (SELECT count(*)::int FROM outbox_event e WHERE NOT EXISTS(SELECT 1 FROM consumer_receipt r WHERE r.event_id=e.id AND r.consumer='portal-inbox')),
          COALESCE((SELECT extract(epoch FROM clock_timestamp()-min(e.occurred_at))::int FROM outbox_event e
            WHERE NOT EXISTS(SELECT 1 FROM consumer_receipt r WHERE r.event_id=e.id AND r.consumer='portal-inbox')),0),
          (SELECT count(*)::int FROM notification_intent WHERE state='review')
        ON CONFLICT(name) DO UPDATE SET updated_at=EXCLUDED.updated_at,queue_waiting=EXCLUDED.queue_waiting,
          outbox_pending=EXCLUDED.outbox_pending,oldest_outbox_seconds=EXCLUDED.oldest_outbox_seconds,
          notification_reviews=EXCLUDED.notification_reviews`;

    }catch{console.error(JSON.stringify({component:'relay',event:'poll_failed'}));}
    finally{busy=false;}
  }
  const timer=setInterval(()=>void tick(),1250);
  async function stop(){stopping=true;clearInterval(timer);await worker.close();await queue.close();await db.$disconnect();}
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>void stop());
  await worker.waitUntilReady();console.log('Academic worker ready');
  await tick();
}
void launch().catch(e=>{console.error(e instanceof Error?e.message:'Worker startup failed');process.exitCode=1;});
