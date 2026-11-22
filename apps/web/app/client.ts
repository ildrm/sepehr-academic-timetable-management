import {z} from 'zod';
export const termSchema=z.object({id:z.string(),code:z.string(),zone:z.string(),opensAt:z.string(),closesAt:z.string(),stage:z.string().nullable()});
export const profileSchema=z.object({roles:z.array(z.string()),terms:z.array(termSchema),subject:z.string(),synthetic:z.boolean()});
export type Profile=z.infer<typeof profileSchema>;
const bundle=z.object({sectionId:z.string(),componentIds:z.array(z.string()),label:z.string(),components:z.array(z.object({id:z.string(),kind:z.string()}))});
export const cardsSchema=z.array(z.object({id:z.string(),title:z.string(),code:z.string(),credit:z.string(),
  available:z.number(),department:z.string(),bundles:z.array(bundle)}));
export type Card=z.infer<typeof cardsSchema>[number];
export type Bundle=z.infer<typeof bundle>;
export const overviewSchema=z.object({enrollments:z.array(z.object({id:z.string(),code:z.string(),title:z.string(),credits:z.string(),section:z.string()})),
  waits:z.array(z.object({id:z.string(),state:z.string(),title:z.string(),expiresAt:z.string().nullable(),reason:z.string().nullable(),position:z.number()})),
  schedule:z.array(z.object({weekDate:z.string(),startMinute:z.number(),endMinute:z.number(),title:z.string(),code:z.string(),room:z.string(),campus:z.string(),zone:z.string()})),
  timetableNotices:z.array(z.object({versionId:z.string(),changedComponents:z.number(),publishedAt:z.string()})).default([]),
  credits:z.string()});
export type Overview=z.infer<typeof overviewSchema>;
const reason=z.object({ruleId:z.string(),reasonCode:z.string(),messageKey:z.string()});
export const errorSchema=z.object({messageKey:z.string(),requestId:z.string().optional(),details:z.array(reason).optional()});
export const decisionSchema=z.object({decision:z.string(),policyVersion:z.string(),reasons:z.array(reason)});
export const receiptSchema=z.object({outcome:z.literal('committed'),requestId:z.string(),resourceId:z.string(),revision:z.number()});
export const statusSchema=z.object({state:z.string(),originalHttpStatus:z.number().nullable(),outcome:z.union([receiptSchema,errorSchema,z.null()])});
export const runSchema=z.object({runId:z.string(),state:z.string(),snapshotId:z.string(),solverStatus:z.string().nullable(),resultRef:z.string().nullable()});
export const proposalsSchema=z.array(z.object({versionId:z.string(),state:z.string(),validationRef:z.string().nullable(),contentHash:z.string()}));
export class ApiError extends Error{
  constructor(readonly status:number,readonly problem:z.infer<typeof errorSchema>){super(problem.messageKey);}
}
export async function api<T>(path:string,schema:z.ZodType<T>,body?:unknown,idempotencyKey?:string):Promise<T>{
  const headers=new Headers();
  if(body!==undefined){
    headers.set('Content-Type','application/json');
    const csrf=document.cookie.split('; ').find(x=>x.startsWith('academic_csrf='))?.split('=')[1];
    if(csrf)headers.set('X-CSRF-Token',csrf);
  }
  if(idempotencyKey)headers.set('Idempotency-Key',idempotencyKey);
  const result=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers,
    body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const value:unknown=await result.json();
  if(!result.ok)throw new ApiError(result.status,errorSchema.parse(value));
  return schema.parse(value);
}
