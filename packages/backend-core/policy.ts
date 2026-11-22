import { z } from 'zod';
import { nativeAccepts } from '../contracts/runtime';
import { Reason, unavailable } from './problem';

const decimal = z.string().regex(/^\d{1,6}(\.\d{1,3})?$/);
const credit = decimal.refine(v => !v.includes('.') || v.split('.')[1].length <= 2);
const policy = z.object({
  mode: z.enum(['synthetic','institutional']), approvalReference: z.string().min(1),
  ceiling: credit, floor: credit, windowMode: z.enum(['term','operation']),
  repeatSelection: z.enum(['latest','highestGrade']),
  repeatPassed: z.boolean(), thresholds: z.record(z.string(),decimal),
  travelMinutes:z.record(z.string(),z.number().int().min(0).max(1440)).optional(),
  queue: z.object({ order: z.literal('strict'), offerMinutes: z.number().int().min(1).max(10080),
    tiers: z.record(z.string(), z.number().int().min(0)),
    reservationGroups: z.record(z.string(),z.array(z.string())) }),
});

export function quantity(raw: string, scale: number): bigint {
  const [whole,fraction=''] = raw.split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > scale) throw new Error('Invalid decimal scale');
  return BigInt(whole + fraction.padEnd(scale,'0'));
}
export function readPolicy(value: unknown) {
  const result = policy.safeParse(value);
  if (!result.success || quantity(result.data.floor,2)>quantity(result.data.ceiling,2)
      || (result.data.mode==='synthetic' && (process.env.APP_ENV !== 'development' || process.env.NODE_ENV === 'production'))) {
    unavailable('policy_unavailable');
  }
  return result.data;
}

export type Attempt = { state: string; grade: string | null };
export type Truth = boolean | null;
export type Facts = { records: Map<string,Attempt>; concurrent: Set<string>; equivalents: Set<string>;
  grants: Set<string>; credits: bigint; gpa: string | null; standing: string | null; program: string;
  thresholds: Record<string,string>; repeatPassed: boolean; known:Set<string> };

const courseOps = ['completed','concurrent','inProgress','recognizedEquivalent','repeatAllowed'] as const;
type Rule =
  | {op:'AND'|'OR';children:Rule[]} | {op:'NOT';child:Rule}
  | {op:typeof courseOps[number];course:string}
  | {op:'minimumGrade';course:string;thresholdParam:string}
  | {op:'creditRange';minParam:string;maxParam:string}
  | {op:'minimumGpa';thresholdParam:string}
  | {op:'standing';value:string} | {op:'program';code:string} | {op:'exception';ruleId:string};
const node: z.ZodType<Rule> = z.lazy(() => z.union([
  z.object({op:z.enum(['AND','OR']),children:z.array(node)}), z.object({op:z.literal('NOT'),child:node}),
  z.object({op:z.enum(courseOps),course:z.string()}),
  z.object({op:z.literal('minimumGrade'),course:z.string(),thresholdParam:z.string()}),
  z.object({op:z.literal('creditRange'),minParam:z.string(),maxParam:z.string()}),
  z.object({op:z.literal('minimumGpa'),thresholdParam:z.string()}),
  z.object({op:z.literal('standing'),value:z.string()}),
  z.object({op:z.literal('program'),code:z.string()}),z.object({op:z.literal('exception'),ruleId:z.string()}),
]));
export function compileRule(input: unknown) {
  let count=0;
  const pending: [unknown,number][]=[[input,0]];
  while(pending.length){
    const entry=pending.pop();
    if (!entry) break;
    const [value,depth]=entry;
    if (++count>512 || depth>16) unavailable('rule_complexity');
    if (value && typeof value==='object') {
      if ('children' in value && Array.isArray(value.children)){
        if (value.children.length>64) unavailable('rule_complexity');
        pending.push(...value.children.map((child):[unknown,number]=>[child,depth+1]));
      }
      if ('child' in value) pending.push([value.child,depth+1]);
    }
  }
  if (!nativeAccepts('academic-rule',input)) unavailable('rule_invalid');
  return node.parse(input);
}
export function evaluate(rule: Rule,facts: Facts): Truth {
  const threshold=(key:string,scale=3)=>{
    const v=facts.thresholds[key];
    if (v===undefined) unavailable('threshold_unconfigured');
    try { return quantity(v,scale); } catch { return unavailable('threshold_precision'); }
  };
  if ('course' in rule && !facts.known.has(rule.course)) unavailable('rule_course_unconfigured');
  switch(rule.op){
    case 'AND': { const terms=rule.children.map(x=>evaluate(x,facts));return terms.includes(false)?false:terms.includes(null)?null:true; }
    case 'OR': { const terms=rule.children.map(x=>evaluate(x,facts));return terms.includes(true)?true:terms.includes(null)?null:false; }
    case 'NOT': {const v=evaluate(rule.child,facts);return v===null?null:!v;}
    case 'completed': return facts.records.get(rule.course)?.state==='passed';
    case 'concurrent': return facts.concurrent.has(rule.course);
    case 'inProgress': return facts.records.get(rule.course)?.state==='in_progress';
    case 'recognizedEquivalent': return facts.equivalents.has(rule.course);
    case 'repeatAllowed': return facts.repeatPassed || facts.records.get(rule.course)?.state!=='passed';
    case 'minimumGrade': {const v=facts.records.get(rule.course);return v?.state!=='passed'?false:v.grade===null?null:quantity(v.grade,3)>=threshold(rule.thresholdParam);}
    case 'creditRange': return facts.credits>=threshold(rule.minParam,2)&&facts.credits<=threshold(rule.maxParam,2);
    case 'minimumGpa': return facts.gpa===null?null:quantity(facts.gpa,3)>=threshold(rule.thresholdParam);
    case 'standing': return facts.standing===null?null:facts.standing===rule.value;
    case 'program': return facts.program===rule.code;
    case 'exception': return facts.grants.has(rule.ruleId);
  }
}
export const reason=(ruleId:string,reasonCode:string):Reason=>({ruleId,reasonCode,messageKey:reasonCode});
