import assert from 'node:assert/strict';
import {createHash, createHmac, generateKeyPairSync, randomUUID, sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:https';
import type {AddressInfo} from 'node:net';
import {test} from 'node:test';
import {beginOidc, completeOidc} from '../../packages/backend-core/oidc';
import {checkCsrf, requireSession} from '../../packages/backend-core/auth';
import {connect} from '../../packages/backend-core/db';
import {dispatchNotification} from '../../packages/backend-core/notification';
import {Problem} from '../../packages/backend-core/problem';

function encoded(value:unknown){
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

test('OIDC session assurance and notification acknowledgement over verified HTTPS', {timeout:20000}, async()=>{
  const cert=process.env.NODE_EXTRA_CA_CERTS;
  const key=process.env.TEST_HTTPS_KEY;
  if(!cert||!key)throw new Error('Run with the isolated TLS fixture from infra/local/integration.sh');
  const db=connect();
  const jwtKeys=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...jwtKeys.publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
  const clientSecret=randomUUID();
  const signingKey=randomUUID();
  const codes=new Map<string,{sub:string;acr:string;nonce:string|null;challenge:string|null}>();
  let issuer:string;
  let notificationRequests=0;
  const server=createServer({cert:readFileSync(cert),key:readFileSync(key)},async(req,res)=>{
    const reply=(code:number,content:unknown)=>{
      res.writeHead(code,{'content-type':'application/json'});
      res.end(JSON.stringify(content));
    };
    try{
      if(req.url==='/.well-known/openid-configuration'){
        reply(200,{issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',
          response_types_supported:['code'],grant_types_supported:['authorization_code'],subject_types_supported:['public'],
          code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_basic'],
          id_token_signing_alg_values_supported:['RS256']});
        return;
      }
      if(req.url==='/jwks'){reply(200,{keys:[jwk]});return;}
      const chunks:Buffer[]=[];
      for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks).toString('utf8');
      if(req.url==='/token'){
        const form=new URLSearchParams(body);
        const code=form.get('code')??'';
        const attempt=codes.get(code);
        const challenge=createHash('sha256').update(form.get('code_verifier')??'').digest('base64url');
        const header=req.headers.authorization??'';
        const basic=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString('utf8'):'';
        const credentials=basic.split(':').map(field=>decodeURIComponent(field.replaceAll('+',' '))).join(':');
        const authorized=credentials==='fixture:'+clientSecret;
        if(!attempt||challenge!==attempt.challenge||!authorized){
          console.error('Fixture rejected code exchange', {codeFound:!!attempt,pkce:challenge===attempt?.challenge,
            credentials:authorized});
          reply(400,{error:'invalid_grant'});return;
        }
        codes.delete(code);
        const now=Math.floor(Date.now()/1000);
        const payload=encoded({alg:'RS256',kid:'fixture'})+'.'+encoded({
          iss:issuer,aud:'fixture',sub:attempt.sub,nonce:attempt.nonce,acr:attempt.acr,
          iat:now,auth_time:now,exp:now+300,
        });
        const signature=sign('RSA-SHA256',Buffer.from(payload),jwtKeys.privateKey).toString('base64url');
        reply(200,{access_token:randomUUID(),token_type:'Bearer',id_token:payload+'.'+signature});
        return;
      }
      if(req.url==='/notify'){
        notificationRequests++;
        const event=JSON.parse(body);
        const timestamp=req.headers['x-event-timestamp'];
        const expected='sha256='+createHmac('sha256',signingKey).update(timestamp+'.'+body).digest('hex');
        if(req.headers['idempotency-key']!==event.eventId||req.headers['x-event-signature']!==expected){
          reply(400,{error:'invalid_request'});return;
        }
        reply(notificationRequests===1?503:200,{eventId:event.eventId,receipt:'fixture-receipt'});
        return;
      }
      reply(404,{error:'not_found'});
    }catch(err){
      console.error('Synthetic HTTPS receiver rejected a request',err instanceof Error?err.name:'unknown');
      reply(500,{error:'fixture_failed'});
    }
  });
  await new Promise<void>((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  try{
    issuer='https://127.0.0.1:'+(server.address() as AddressInfo).port;
    Object.assign(process.env,{
      OIDC_ISSUER:issuer,OIDC_CLIENT_ID:'fixture',OIDC_CLIENT_SECRET:clientSecret,
      OIDC_STAFF_ACR:'fixture-mfa',WEB_ORIGIN:'https://academic.example.test',
    });
    await db.identity_account.createMany({data:[{issuer,subject:'fixture-student'},{issuer,subject:'fixture-staff'}]});
    const [student,staff,unit]=await Promise.all([
      db.identity_account.findUniqueOrThrow({where:{issuer_subject:{issuer,subject:'fixture-student'}}}),
      db.identity_account.findUniqueOrThrow({where:{issuer_subject:{issuer,subject:'fixture-staff'}}}),
      db.org_unit.findFirstOrThrow({where:{kind:'institution'},select:{id:true}}),
    ]);
    async function enableStaffRole(actor:bigint){
      await db.$executeRaw`INSERT INTO role_assignment(actor_id,role_code,unit_id,valid_from,valid_until)
        VALUES(${actor},'planner',${unit.id},clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`;
    }
    async function authorization(sub:string,acr:string){
      const attempt=await beginOidc(db);
      assert.equal(attempt.url.searchParams.get('code_challenge_method'),'S256');
      assert.equal(attempt.url.searchParams.get('acr_values'),'fixture-mfa');
      const code=randomUUID();
      codes.set(code,{sub,acr,nonce:attempt.url.searchParams.get('nonce'),challenge:attempt.url.searchParams.get('code_challenge')});
      const query=new URLSearchParams({code,state:attempt.url.searchParams.get('state')??''}).toString();
      return {query,browser:attempt.browser};
    }
    const denies=(code:string)=>(e:unknown)=>e instanceof Problem&&e.code===code;
    const low=await authorization('fixture-student','fixture-password');
    await assert.rejects(completeOidc(db,low.query,'x'.repeat(43)),denies('ERR-002'));
    const session=await completeOidc(db,low.query,low.browser);
    const actor=await requireSession(db,session.token);
    assert.equal(actor.id,student.id);
    assert.doesNotThrow(()=>checkCsrf(actor,process.env.WEB_ORIGIN,session.csrf));
    await assert.rejects(completeOidc(db,low.query,low.browser),denies('ERR-002'));
    await enableStaffRole(student.id);
    await assert.rejects(requireSession(db,session.token),denies('ERR-002'));
    await enableStaffRole(staff.id);
    const insufficient=await authorization('fixture-staff','fixture-password');
    await assert.rejects(completeOidc(db,insufficient.query,insufficient.browser),denies('ERR-003'));
    const sufficient=await authorization('fixture-staff','fixture-mfa');
    const verified=await completeOidc(db,sufficient.query,sufficient.browser);
    assert.equal((await requireSession(db,verified.token)).id,staff.id);

    const eventId=randomUUID();
    const envelope={eventId,type:'timetable.published.v1',occurredAt:new Date().toISOString(),
      termId:'1',payload:{resourceId:'1',revision:1}};
    await db.$executeRaw`INSERT INTO outbox_event(id,aggregate_key,sequence,event_type,envelope,occurred_at,published_at)
      VALUES(${eventId}::uuid,${eventId},1,${envelope.type},${JSON.stringify(envelope)}::jsonb,clock_timestamp(),clock_timestamp())`;
    await db.$executeRaw`INSERT INTO notification_intent(event_id,state) VALUES(${eventId}::uuid,'pending')`;
    const gateway={url:new URL('/notify',issuer),key:signingKey};
    async function notificationState(){
      const [row]=await db.$queryRaw<{state:string;attempt:number;provider_receipt:string|null}[]>`
        SELECT state,attempt,provider_receipt FROM notification_intent WHERE event_id=${eventId}::uuid`;
      return row;
    }
    await Promise.all([dispatchNotification(db,gateway,eventId),dispatchNotification(db,gateway,eventId)]);
    assert.deepEqual(await notificationState(),{state:'pending',attempt:1,provider_receipt:null});
    assert.equal(notificationRequests,1);
    await db.$executeRaw`UPDATE notification_intent SET next_attempt_at=clock_timestamp() WHERE event_id=${eventId}::uuid`;
    await dispatchNotification(db,gateway,eventId);
    await dispatchNotification(db,gateway,eventId);
    assert.deepEqual(await notificationState(),{state:'sent',attempt:2,provider_receipt:'fixture-receipt'});
    assert.equal(notificationRequests,2);
  }finally{
    server.closeAllConnections();
    server.close();
    await db.$disconnect();
  }
});
