import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {connect,first,Prisma,decisionClock} from '../../packages/backend-core/db';
import {recordEvent} from '../../packages/backend-core/events';

async function until(check:()=>Promise<boolean>,message:string){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    if(await check())return;
    await delay(250);
  }
  throw new Error(message);
}

async function run(){
  const url=process.env.DATABASE_URL;
  assert.ok(url&&/^academic_test_[a-z0-9]+$/.test(new URL(url).pathname.slice(1)),
    'Use an isolated, migrated and seeded academic_test database');
  const queue='academic-recovery-'+randomUUID();
  const db=connect();
  const start=()=>spawn(process.execPath,['--import','tsx','apps/workers/src/main.ts'],
    {stdio:'inherit',env:{...process.env,APP_ENV:'development',QUEUE_NAME:queue}});
  const terminated=start();
  let replacement:ReturnType<typeof start>|undefined;
  try{
    await until(async()=>!!await first(db,Prisma.sql`SELECT 1 FROM worker_heartbeat WHERE name=${queue}`),
      'Initial worker did not start');
    const stopped=once(terminated,'exit');
    assert.ok(terminated.kill('SIGKILL'));
    assert.deepEqual(await stopped,[null,'SIGKILL']);

    const term=await db.term.findUniqueOrThrow({where:{code:'SYN-OPEN'},select:{id:true}});
    const aggregate='recovery-check/'+randomUUID();
    await db.$transaction(async tx=>{
      await recordEvent(tx,'TimetablePublished',term.id,aggregate,randomUUID(),'1',1,await decisionClock(tx));
    });
    const event=await first<{id:string;published_at:Date|null}>(db,Prisma.sql`
      SELECT id::text,published_at FROM outbox_event WHERE aggregate_key=${aggregate}`);
    assert.ok(event);
    assert.equal(event.published_at,null);
    replacement=start();
    await until(async()=>!!await first(db,Prisma.sql`SELECT 1 FROM consumer_receipt
      WHERE event_id=${event.id}::uuid AND consumer='portal-inbox'`),'Replacement did not process the committed event');
    const receipt=await first<{receipts:number;intents:number}>(db,Prisma.sql`
      SELECT (SELECT count(*)::int FROM consumer_receipt WHERE event_id=${event.id}::uuid) AS receipts,
        (SELECT count(*)::int FROM notification_intent WHERE event_id=${event.id}::uuid) AS intents`);
    assert.deepEqual(receipt,{receipts:1,intents:1});
    console.log('Replacement worker recovered one committed outbox event and created one receipt and notification intent.');
  }finally{
    if(replacement&&replacement.exitCode===null&&replacement.signalCode===null){
      const exited=once(replacement,'exit');
      replacement.kill('SIGTERM');
      await exited;
    }
    if(terminated.exitCode===null&&terminated.signalCode===null)terminated.kill('SIGTERM');
    await db.$disconnect();
  }
}
void run().catch(err=>{console.error(err);process.exitCode=1;});
