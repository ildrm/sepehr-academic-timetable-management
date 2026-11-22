import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Actor, allowed, lockSession } from './auth';
import { Database, Reader, Transaction, Prisma, decisionClock,first } from './db';
import { audit } from './events';
import {recordTransactionRetry} from './metrics';
import { Problem } from './problem';

const keyPattern=/^[A-Za-z0-9_.~-]{8,128}$/;
export type Receipt={requestId:string; outcome:'committed'; resourceId:string;revision:number};
export type Outcome={status:number; body:Receipt|ReturnType<Problem['body']>};
export function receipt(requestId:string,id:bigint|string,revision:number):Receipt{
  return {requestId,outcome:'committed',resourceId:String(id),revision};
}
export const operationNames = ['enroll','drop','swap','joinWaitlist','respondToOffer','finalizeRegistration','changeForStudent','publishTimetable'] as const;
export type Operation = typeof operationNames[number];
export type Intent={ actor:Actor; subject:bigint; term:bigint; operation:Operation; key:string; body:unknown; caseRef?:string; requestId:string };
type Saved={subject_id:bigint;term_id:bigint;case_ref:string|null;payload_hash:string;state:string;
  http_status:number|null;outcome:Outcome['body']|null;live:boolean};
const terminal=new Set([400,409,422]);
export function canonical(data:unknown):unknown{
  if(Array.isArray(data)) return data.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
  const record=z.record(z.string(),z.unknown()).safeParse(data);
  return record.success ? Object.fromEntries(Object.keys(record.data).sort().map(key=>[key,canonical(record.data[key])])) : data;
}
export async function readSaved(db:Reader,actor:bigint,operation:string,key:string, lock=false){
  return first<Saved>(db,Prisma.sql`SELECT *,expires_at>clock_timestamp() AS live FROM idempotency_record
    WHERE actor_id=${actor} AND operation=${operation} AND request_key=${key} ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`);
}
export async function authorizeIntent(db:Reader,actor:bigint,subject:bigint,term:bigint,operation:string,caseRef?:string|null){
  if(operation==='publishTimetable'){
    const scope=await first<{unit_id:bigint}>(db,Prisma.sql`SELECT unit_id FROM term_scope WHERE term_id=${term}`);
    if(!scope || !await allowed(db,actor,'academic_admin',scope.unit_id,term)) throw new Problem('ERR-003');
    return;
  }
  const student=await first<{unit_id:bigint}>(db,Prisma.sql`SELECT p.unit_id FROM student_term s
    JOIN student_program sp ON sp.id=s.student_program_id JOIN program p ON p.id=sp.program_id
    WHERE s.student_id=${subject} AND s.term_id=${term}`);
  if(!student) throw new Problem('ERR-003');
  if(operation==='changeForStudent'){
    if(!caseRef || !await allowed(db,actor,'academic_office',student.unit_id,term) || !await first(db,Prisma.sql`
      SELECT 1 FROM case_delegation WHERE case_ref=${caseRef} AND actor_id=${actor} AND student_id=${subject}
      AND term_id=${term} AND clock_timestamp()<valid_until`)) throw new Problem('ERR-003');
    return;
  }
  if(actor!==subject || !await allowed(db,actor,'student',student.unit_id,term)) throw new Problem('ERR-003');
}

export async function runIntent(db:Database, intent:Intent, work:(tx:Transaction)=>Promise<Receipt>):Promise<Outcome>{
  if(!keyPattern.test(intent.key)) throw new Problem('ERR-001');
  const hash=createHash('sha256').update(JSON.stringify(canonical({subject:String(intent.subject),term:String(intent.term),body:intent.body}))).digest('hex');
  for(let attempt=0; attempt<3; attempt++){
    try{
      return await db.$transaction(async(tx)=>{
        await lockSession(tx,intent.actor);
        await authorizeIntent(tx,intent.actor.id,intent.subject,intent.term,intent.operation,intent.caseRef);
        const {actor,operation,key,subject,term,requestId}=intent;
        const ttl=process.env.REQUEST_RETENTION_HOURS;
        if(!ttl || !/^[1-9]\d{0,3}$/.test(ttl)) throw new Problem('ERR-010');
        const inserted=await tx.$executeRaw`INSERT INTO idempotency_record(actor_id,operation,request_key,subject_id,term_id,payload_hash,state,expires_at,case_ref)
          VALUES(${actor.id},${operation},${key},${subject},${term},${hash},'processing',
          clock_timestamp()+make_interval(hours=>${Number(ttl)}::int),${intent.caseRef??null})
          ON CONFLICT DO NOTHING`;
        if(!inserted){
          const saved=await readSaved(tx,actor.id,operation,key,true);
          if(!saved || saved.payload_hash!==hash || !saved.live) throw new Problem('ERR-006');
          await authorizeIntent(tx,actor.id,saved.subject_id,saved.term_id,operation,saved.case_ref);
          if(!saved.outcome || saved.http_status===null) throw new Problem('ERR-010');
          return {status:saved.http_status,body:saved.outcome};
        }
        let result:Outcome;
        try{ result={status:200,body:await work(tx)}; }
        catch(error){
          if(!(error instanceof Problem) || !terminal.has(error.status)) throw error;
          result={status:error.status,body:error.body(requestId)};
          await audit(tx,actor.id,subject,term,operation,error.code,requestId,await decisionClock(tx));
        }
        await tx.$executeRaw`UPDATE idempotency_record SET state='finished',http_status=${result.status},
          outcome=${JSON.stringify(result.body)}::jsonb WHERE actor_id=${actor.id} AND operation=${operation} AND request_key=${key}`;
        return result;
      },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:3500,timeout:8000});
    }catch(error){
      if(error instanceof Problem) throw error;
      if(!(error instanceof Prisma.PrismaClientKnownRequestError) ||
         !(error.code==='P2034' || (error.code==='P2010' && ['40P01','40001'].includes(String(error.meta?.code))))) throw error;
      recordTransactionRetry(String(error.meta?.code)==='40P01'?'deadlock':'serialization');
      if(attempt===2){recordTransactionRetry('exhausted');throw new Problem('ERR-010');}
      await new Promise(resolve=>setTimeout(resolve,20*(2**attempt)+Math.floor(Math.random()*15)));
    }
  }
  throw new Problem('ERR-010');
}
export async function requestStatus(db:Database,actor:Actor,operation:string,key:string){
  if(!operationNames.some(x=>x===operation)||!keyPattern.test(key)) throw new Problem('ERR-001');
  const record=await readSaved(db,actor.id,operation,key);
  if(!record || !record.live) throw new Problem('ERR-011');
  await authorizeIntent(db,actor.id,record.subject_id,record.term_id,operation,record.case_ref);
  return {state:record.state,originalHttpStatus:record.http_status,outcome:record.outcome};
}
