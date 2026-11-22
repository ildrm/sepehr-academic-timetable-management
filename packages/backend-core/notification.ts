import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {Database,first,Prisma} from './db';
import {setting} from './config';

const notificationEvent=z.object({
  eventId:z.string().uuid(),type:z.string(),occurredAt:z.iso.datetime(),termId:z.string(),
  payload:z.object({resourceId:z.string(),revision:z.number().int()}),
});
const receiptSchema=z.object({eventId:z.string().uuid(),receipt:z.string().min(1).max(120)});
export function notificationGateway(){
  const raw=setting('NOTIFICATION_GATEWAY_URL'),key=setting('NOTIFICATION_SIGNING_KEY');
  if(!raw&&!key)return null;
  if(!raw||!key||key.length<32)throw new Error('Notification gateway requires an HTTPS URL and a signing key of at least 32 characters');
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Use an HTTPS notification gateway without embedded credentials');
  if(process.env.NOTIFICATION_IDEMPOTENCY_CONTRACT!=='event-id-v1')
    throw new Error('Confirm the versioned idempotent notification gateway contract');
  return {url,key};
}
type Gateway=NonNullable<ReturnType<typeof notificationGateway>>;
const maxAttempts=5;
const retryStatuses=new Set([408,429]);

export async function sendNotification(gateway:Gateway,envelope:unknown,fetcher:typeof fetch=fetch){
  const event=notificationEvent.parse(envelope);
  const body=JSON.stringify(event);
  const seconds=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',gateway.key).update(seconds+'.'+body).digest('hex');
  try{
    const response=await fetcher(gateway.url,{
      method:'POST',body,redirect:'error',signal:AbortSignal.timeout(5000),
      headers:{'content-type':'application/json','idempotency-key':event.eventId,
        'x-event-timestamp':seconds,'x-event-signature':'sha256='+signature},
    });
    if(!response.ok){
      await response.body?.cancel();
      return {state:retryStatuses.has(response.status)||response.status>=500?'retry':'review',failure:'provider_http_'+response.status} as const;
    }
    if(!response.body)return {state:'review',failure:'provider_receipt_invalid'} as const;
    const reader=response.body.getReader();
    const chunks:Uint8Array[]=[];
    let size=0;
    for(;;){
      const part=await reader.read();
      if(part.done)break;
      size+=part.value.byteLength;
      if(size>4096){await reader.cancel();return {state:'review',failure:'provider_receipt_invalid'} as const;}
      chunks.push(part.value);
    }
    let raw:unknown;
    try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return {state:'review',failure:'provider_receipt_invalid'} as const;}
    const receipt=receiptSchema.safeParse(raw);
    if(!receipt.success||receipt.data.eventId!==event.eventId)
      return {state:'review',failure:'provider_receipt_invalid'} as const;
    return {state:'sent',receipt:receipt.data.receipt} as const;
  }catch{return {state:'retry',failure:'delivery_unknown'} as const;}
}

export async function dispatchNotification(db:Database,gateway:Gateway,eventId:string){
  const job=await first<{attempt:number;envelope:unknown}>(db,Prisma.sql`
    UPDATE notification_intent n SET attempt=attempt+1,lease_until=clock_timestamp()+interval '15 seconds'
    FROM outbox_event e WHERE e.id=n.event_id AND n.event_id=${eventId}::uuid AND n.state='pending'
      AND n.attempt<${maxAttempts} AND n.next_attempt_at<=clock_timestamp()
      AND (n.lease_until IS NULL OR n.lease_until<clock_timestamp())
      AND NOT EXISTS (
        SELECT 1 FROM notification_intent n0 JOIN outbox_event e0 ON e0.id=n0.event_id
        WHERE e0.aggregate_key=e.aggregate_key AND e0.sequence<e.sequence AND n0.state IN ('pending','review')
      )
    RETURNING n.attempt,e.envelope`);
  if(!job)return;
  let result:Awaited<ReturnType<typeof sendNotification>>;
  try{result=await sendNotification(gateway,job.envelope);}
  catch{result={state:'review',failure:'event_invalid'};}
  if(result.state==='sent'){
    await db.$executeRaw`UPDATE notification_intent SET state='sent',sent_at=clock_timestamp(),provider_receipt=${result.receipt},
      lease_until=NULL,last_failure=NULL WHERE event_id=${eventId}::uuid AND state='pending' AND attempt=${job.attempt}`;
    return;
  }
  const status=result.state==='retry'&&job.attempt<maxAttempts?'pending':'review';
  const retrySeconds=15*2**(job.attempt-1);
  await db.$executeRaw`UPDATE notification_intent SET state=${status},lease_until=NULL,last_failure=${result.failure},
    next_attempt_at=clock_timestamp()+make_interval(secs=>${retrySeconds}::int)
    WHERE event_id=${eventId}::uuid AND state='pending' AND attempt=${job.attempt}`;
}
