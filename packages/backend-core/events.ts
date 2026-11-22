import { randomUUID } from 'node:crypto';
import { Transaction, Prisma, first } from './db';
import { nativeAccepts } from '../contracts/runtime';
const sources = { EnrollmentChanged:'Enrollment', WaitlistChanged:'Enrollment', TimetablePublished:'Timetabling',
  SolveRequested:'Timetabling', RecordCorrected:'Records', ExceptionDecided:'Approvals', CapacityChanged:'Offerings' } as const;
export async function recordEvent(tx: Transaction,type:keyof typeof sources,term:bigint,aggregateKey:string,
  requestId:string,resourceId:string,revision:number,now:Date) {
  const eventId=randomUUID();
  const last=await first<{ sequence:bigint }>(tx,Prisma.sql`
    SELECT COALESCE(MAX(sequence),0)::bigint AS sequence FROM outbox_event WHERE aggregate_key=${aggregateKey}`);
  const sequence=Number(last?.sequence ?? 0n)+1;
  const envelope={eventId,type,source:sources[type],schemaVersion:1,occurredAt:now.toISOString(),termId:String(term),
    aggregateKey,sequence,correlationId:requestId,causationId:requestId,payload:{resourceId,revision}};
  if(!nativeAccepts('event',envelope)) throw new Error('Event contract violation');
  await tx.$executeRaw`INSERT INTO outbox_event(id,aggregate_key,sequence,event_type,envelope,occurred_at)
     VALUES(${eventId}::uuid,${aggregateKey},${sequence}::bigint,${type},${JSON.stringify(envelope)}::jsonb,${now})`;
}
export async function audit(tx:Transaction,actor:bigint,subject:bigint|null,term:bigint,action:string,
  decision:string,requestId:string,now:Date){
  await tx.$executeRaw`INSERT INTO audit_entry(actor_id,subject_id,term_id,action,decision_ref,request_id,occurred_at)
    VALUES(${actor},${subject},${term},${action},${decision},${requestId},${now})`;
}
