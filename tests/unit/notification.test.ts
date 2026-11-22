import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sendNotification} from '../../packages/backend-core/notification';

const eventId='1a840fd8-9511-40e8-853a-59a08dc15d43';
const gateway={url:new URL('https://notification.example.invalid/events'),key:'synthetic-signing-key-32-char-123456'};
const event={eventId,type:'TimetablePublished',termId:'1',occurredAt:'2026-11-22T08:00:00Z',
  payload:{resourceId:'9',revision:1},aggregateKey:'private-aggregate',actor:'private-student'};

test('authenticated notification dispatch has bounded data and accepts a matching receipt',async()=>{
  const outcome=await sendNotification(gateway,event,async (url,request)=>{
    assert.equal(String(url),gateway.url.href);
    assert.equal(request?.redirect,'error');
    const headers=new Headers(request?.headers);
    assert.equal(headers.get('idempotency-key'),eventId);
    const raw=String(request?.body);
    const expected=createHmac('sha256',gateway.key).update(headers.get('x-event-timestamp')+'.'+raw).digest('hex');
    assert.equal(headers.get('x-event-signature'),'sha256='+expected);
    assert.ok(!raw.includes('private-student')&&!raw.includes('private-aggregate'));
    return Response.json({eventId,receipt:'synthetic-delivery'});
  });
  assert.deepEqual(outcome,{state:'sent',receipt:'synthetic-delivery'});
});

test('notification retries transient failures and quarantines invalid acknowledgement',async()=>{
  assert.deepEqual(await sendNotification(gateway,event,async()=>new Response(null,{status:503})),
    {state:'retry',failure:'provider_http_503'});
  assert.deepEqual(await sendNotification(gateway,event,async()=>Response.json({eventId:'not-the-event',receipt:'synthetic'})),
    {state:'review',failure:'provider_receipt_invalid'});
  assert.deepEqual(await sendNotification(gateway,event,async()=>new Response('x'.repeat(5000))),
    {state:'review',failure:'provider_receipt_invalid'});
});
