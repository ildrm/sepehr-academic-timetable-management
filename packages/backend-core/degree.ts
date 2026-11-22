import {createHash} from 'node:crypto';
import { z } from 'zod';
import { Actor } from './auth';
import { Database,Prisma,first } from './db';
import { authorizeIntent } from './intent';
import { quantity,readPolicy } from './policy';
import { unavailable } from './problem';

const decimal=z.string().regex(/^\d+(\.\d{1,2})?$/);
const degreeShape=z.object({groups:z.array(z.object({id:z.string().min(1),courses:z.array(z.string()).min(1),credits:decimal,
  minimumGrade:z.string().regex(/^\d+(\.\d{1,3})?$/).optional(),sharingKey:z.string().optional()})).min(1).max(24)});
type Group=z.infer<typeof degreeShape>['groups'][number];
export type Completion={id:string;course:string;credits:string;grade:string|null;equivalents:string[]};
const format=(value:bigint)=>String(value/100n)+'.'+String(value%100n).padStart(2,'0');

export function allocate(groups:Group[],attempts:Completion[]){
  const targets=groups.map(g=>quantity(g.credits,2));
  const candidates=attempts.map(a=>groups.flatMap((g,i)=>{
    const allowed=g.courses.includes(a.course)||a.equivalents.some(c=>g.courses.includes(c));
    return allowed&&(!g.minimumGrade||(a.grade!==null&&quantity(a.grade,3)>=quantity(g.minimumGrade,3)))?[i]:[];
  }));
  let visited=0;
  type Choice={score:bigint[];next:bigint[];groups:number[]};
  const memo=new Map<string,Choice>();
  const better=(a:bigint[],b:bigint[])=>a.some((x,i)=>x>b[i]&&a.slice(0,i).every((v,j)=>v===b[j]));
  const keyFor=(i:number,earned:bigint[])=>i+':'+earned.join(',');
  const solve=(i:number,earned:bigint[]):bigint[]=>{
    if(i===attempts.length)return earned;
    const key=keyFor(i,earned);
    const known=memo.get(key);
    if(known)return known.score;
    if(++visited>100000)unavailable('degree_model_limit');
    let best:Choice={score:solve(i+1,earned),next:earned,groups:[]};
    const choices=candidates[i].map(j=>[j]);
    for(const groupId of new Set(candidates[i].map(j=>groups[j].sharingKey).filter(Boolean))){
      const group=candidates[i].filter(j=>groups[j].sharingKey===groupId);
      if(group.length>1)choices.push(group);
    }
    const amount=quantity(attempts[i].credits,2);
    for(const choice of choices){
      const target=earned.map((v,j)=>!choice.includes(j)?v:v+amount>targets[j]?targets[j]:v+amount);
      if(target.every((v,j)=>v===earned[j]))continue;
      const score=solve(i+1,target);
      if(better(score,best.score))best={score,next:target,groups:choice};
    }
    memo.set(key,best);return best.score;
  };
  let current=groups.map(()=>0n);
  const values=solve(0,current);
  const allocations=groups.map(()=>[] as {recordId:string;credits:string}[]);
  for(const [i,attempt] of attempts.entries()){
    const choice=memo.get(keyFor(i,current));
    if(!choice)throw new Error('Degree allocation path missing');
    for(const j of choice.groups){
      const amount=choice.next[j]-current[j];
      if(amount>0n)allocations[j].push({recordId:attempt.id,credits:format(amount)});
    }
    current=choice.next;
  }
  return groups.map((g,i)=>({id:g.id,earned:format(values[i]),required:format(targets[i]),unmet:format(targets[i]-values[i]),
    allocations:allocations[i]}));
}
export async function degreeAudit(db:Database,actor:Actor,term:bigint){
  await authorizeIntent(db,actor.id,actor.id,term,'degree');
  return db.$transaction(async tx=>{
    const plan=await first<{edition:string;requirements:unknown;id:bigint;parameters:unknown;zone:string}>(tx,Prisma.sql`
      SELECT cv.edition,cv.requirements,cv.id,pv.parameters,t.zone FROM student_term st
      JOIN student_program sp ON sp.id=st.student_program_id JOIN curriculum_version cv ON cv.id=sp.curriculum_id
      JOIN policy_version pv ON pv.id=st.policy_id JOIN term t ON t.id=st.term_id WHERE st.student_id=${actor.id} AND st.term_id=${term}`);
    if(!plan)unavailable('curriculum_unconfigured');
    const shape=degreeShape.safeParse(plan.requirements);
    if(!shape.success)unavailable('curriculum_unconfigured');
    const policy=readPolicy(plan.parameters);
    const records=await tx.$queryRaw<(Completion&{outcome:string})[]>`SELECT ar.id::text AS id,c.code AS course,ar.earned_credits::text AS credits,
      ar.grade::text,ar.outcome,ARRAY(SELECT target.code FROM equivalency e JOIN course target ON target.id=e.target_course
        WHERE e.source_course=c.id AND e.curriculum_id=${plan.id}
        AND e.valid_from<=(transaction_timestamp() AT TIME ZONE ${plan.zone})::date
        AND (e.valid_until IS NULL OR e.valid_until>(transaction_timestamp() AT TIME ZONE ${plan.zone})::date)
        ORDER BY target.code) AS equivalents
      FROM academic_record ar JOIN course c ON c.id=ar.course_id WHERE ar.student_id=${actor.id}
      AND NOT EXISTS(SELECT 1 FROM academic_record rev WHERE rev.supersedes=ar.id) ORDER BY ar.id DESC LIMIT 501`;
    if(records.length>500)unavailable('degree_model_limit');
    const chosen=new Map<string,typeof records[number]>();
    for(const attempt of records){
      const previous=chosen.get(attempt.course);
      if(!previous || (policy.repeatSelection==='highestGrade'&&attempt.grade!==null
        &&(previous.grade===null||quantity(attempt.grade,3)>quantity(previous.grade,3)))) chosen.set(attempt.course,attempt);
    }
    const passing=[...chosen.values()].filter(x=>x.outcome==='passed');
    const recordRevision=createHash('sha256').update(JSON.stringify(records)).digest('hex');
    return {edition:plan.edition,recordRevision,groups:allocate(shape.data.groups,passing),
      evidence:passing.map(x=>({recordId:x.id,course:x.course,recognizedAs:x.equivalents})),
      provisional:records.filter(x=>x.outcome==='in_progress').map(x=>x.course)};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
