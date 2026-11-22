import 'reflect-metadata';
import { Body, Controller, Get, HttpException, Inject, Module, Param, Post, Query, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express,{Request,Response,NextFunction} from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { connect,Database,numericId } from '../../../packages/backend-core/db';
import { checkCsrf,developmentAllowed,login,requireSession } from '../../../packages/backend-core/auth';
import { Problem } from '../../../packages/backend-core/problem';
import { apiAccepts,openApi } from '../../../packages/contracts/runtime';
import { runIntent,requestStatus,Operation } from '../../../packages/backend-core/intent';
import { bundleDto,joinWaitlist,respondWaitlist,preview,register } from '../../../packages/backend-core/registration';
import { catalog,offeringPage,portalHome,seatsReport,studentOverview } from '../../../packages/backend-core/portal';
import { assignmentsSchema,getProposal,getSolve,inspectImpact,reviewImpact,listProposals,publish,saveProposal,saveSnapshot,startSolve,validateProposal } from '../../../packages/backend-core/timetable';

import { degreeAudit } from "../../../packages/backend-core/degree";

import { addAvailability,availabilityDto,correctRecord,correctionDto,decideGrant,decideGrantDto,instructorView,
  myGrants,requestGrant,requestGrantDto,reviewGrants } from '../../../packages/backend-core/academic-office';

import { beginOidc,completeOidc,oidcReady } from '../../../packages/backend-core/oidc';

import { approveCurriculum,approvePolicy,capacityDto,createCurriculum,curriculumDto,draftPolicy,
  operationWindowDto,policyApproveDto,policyDraftDto,setCapacity,setOperationWindow } from '../../../packages/backend-core/academic-setup';
import { suggest } from '../../../packages/backend-core/student-planner';
import { importRecords,transferBatch } from '../../../packages/backend-core/import-records';
import { auditView,demandCsv,demandReport,disruptionCsv,disruptionReport,seatsCsv } from '../../../packages/backend-core/reports';
import { admissionDto,admit,courseDto,createCourse,createOffering,createRoom,createTerm,
  newTermDto,offeringDto,roomDto,createUnit,createProgram,unitDto,programDto } from '../../../packages/backend-core/inventory';
import {applicationDto,approvalDto,approveCampaign,campaignDto,createCampaign,listCampaigns,planCampaign,
  publishAllocationDto,publishCampaign,revealDto,setApplication} from '../../../packages/backend-core/allocation';

import { validateProduction } from '../../../packages/backend-core/config';
import {prometheusHttpStats,recordHttp} from '../../../packages/backend-core/metrics';
const DB=Symbol('Database');
const bounded=z.string().min(1).max(128);
const term=z.object({termId:bounded});
const delta=term.extend({add:z.array(bundleDto).max(24),dropEnrollmentIds:z.array(bounded).max(24)});
const enroll=term.extend({bundles:z.array(bundleDto).min(1).max(24)});
const drop=term.extend({enrollmentIds:z.array(bounded).min(1).max(24)});
const join=term.extend({bundle:bundleDto});
const respond=term.extend({response:z.enum(['accept','decline'])});
const snapshot=z.object({snapshotId:bounded,configurationId:bounded});
const content=z.object({contentHash:bounded});
const page=z.object({termId:bounded,department:bounded.optional(),cursor:z.string().max(1024).optional(),
  limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
function data<T>(schema:z.ZodType<T>,input:unknown,contract?:string):T{
  if(contract&&!apiAccepts(contract,input))throw new Problem('ERR-001');
  const parsed=schema.safeParse(input);
  if(!parsed.success)throw new Problem('ERR-001');
  return parsed.data;
}
function cookie(request:Request,name:string){
  return request.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1);
}
const reqId=(r:Response)=>String(r.getHeader('X-Request-ID'));
const opaque=(value:string)=>{const id=numericId(value);if(id===0n)throw new Problem('ERR-011');return id;};
class AuthenticatedTransport{
  constructor(@Inject(DB) readonly db:Database){}
  protected async actor(r:Request,write=false){
    const actor=await requireSession(this.db,cookie(r,'academic_session'));
    if(write)checkCsrf(actor,r.get('origin'),r.get('x-csrf-token'));
    return actor;
  }
}

@Controller()
class IdentityController extends AuthenticatedTransport {
  constructor(@Inject(DB) db:Database){super(db);}
  @Get('health/live') live(){return {status:'live'};}
  @Get('health/ready') async ready(){await this.db.$queryRaw`SELECT 1 FROM term,allocation_campaign,timetable_impact_review LIMIT 1`;return {status:'ready'};}
  @Get('internal/metrics')
  async metrics(@Res() r:Response){
    const rows=await this.db.$queryRaw<{age:number;waiting:number;pending:number;oldest:number;reviews:number}[]>`
      SELECT extract(epoch FROM clock_timestamp()-updated_at)::int AS age,queue_waiting AS waiting,
        outbox_pending AS pending,oldest_outbox_seconds AS oldest,notification_reviews AS reviews
      FROM worker_heartbeat WHERE name=${process.env.QUEUE_NAME??'academic-jobs'}`;
    const row=rows[0];
    const gauges=row?`academic_worker_heartbeat_age_seconds ${row.age}
academic_queue_waiting ${row.waiting}
academic_outbox_pending ${row.pending}
academic_outbox_oldest_seconds ${row.oldest}
academic_notification_reviews ${row.reviews}
`:'';
    r.type('text/plain').send(prometheusHttpStats()+gauges);
  }
  @Get('openapi.yaml') contract(@Res() r:Response){r.type('application/yaml').send(openApi());}
  @Get('session/config') config(){return {developmentLogin:developmentAllowed(),institutionalLogin:oidcReady()};}
  @Get('session/oidc/start')
  async oidcStart(@Res() out:Response){
    const flow=await beginOidc(this.db);
    out.cookie('academic_sso_flow',flow.browser,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/session/oidc',maxAge:480000});
    out.redirect(303,flow.url.href);
  }
  @Get('session/oidc/callback')
  async oidcFinish(@Req() r:Request,@Res() out:Response){
    const query=r.originalUrl.split('?').slice(1).join('?');
    const session=await completeOidc(this.db,query,cookie(r,'academic_sso_flow'));
    const attrs={path:'/',sameSite:'lax' as const,secure:true,maxAge:session.lifetimeSeconds*1000};
    out.clearCookie('academic_sso_flow',{path:'/api/session/oidc',sameSite:'lax',secure:true,httpOnly:true});
    out.cookie('academic_session',session.token,{...attrs,httpOnly:true});
    out.cookie('academic_csrf',session.csrf,attrs);
    out.redirect(303,new URL('/',process.env.WEB_ORIGIN).href);
  }
  @Post('session/development')
  async devLogin(@Body() body:unknown,@Req() r:Request,@Res() res:Response){
    if(r.get('origin')!==process.env.WEB_ORIGIN)throw new Problem('ERR-003');
    const v=data(z.object({login:bounded,password:z.string().min(12).max(128)}).strict(),body);
    const credentials=await login(this.db,v.login,v.password);
    const attrs={path:'/',sameSite:'lax' as const,secure:process.env.COOKIE_SECURE==='true',maxAge:28800000};
    res.cookie('academic_session',credentials.token,{...attrs,httpOnly:true});
    res.cookie('academic_csrf',credentials.csrf,attrs);
    res.status(200).json({authenticated:true});
  }
  @Post('session/logout')
  async logout(@Req() r:Request,@Res() res:Response){
    const actor=await this.actor(r,true);
    await this.db.$executeRaw`UPDATE web_session SET revoked_at=clock_timestamp() WHERE token_hash=${actor.tokenHash}`;
    const attrs={path:'/',sameSite:'lax' as const,secure:process.env.COOKIE_SECURE==='true'};
    res.clearCookie('academic_session',{...attrs,httpOnly:true});res.clearCookie('academic_csrf',attrs);
    res.status(200).json({authenticated:false});
  }
  @Get('me/portal') async home(@Req() r:Request){return portalHome(this.db,await this.actor(r));}

}

@Controller()
class RegistrationController extends AuthenticatedTransport {
  constructor(@Inject(DB) db:Database){super(db);}
  @Get('me/overview/:termId') async overview(@Req() r:Request,@Param('termId') id:string){return studentOverview(this.db,await this.actor(r),opaque(id));}
  @Get('me/catalog/:termId')
  async cards(@Req() r:Request,@Param('termId') id:string,@Query('q') q:unknown){
    return catalog(this.db,await this.actor(r),opaque(id),data(z.string().trim().max(100).optional(),q)??'',undefined,0n,100);
  }
  @Get('me/suggestions/:termId') async suggestions(@Req() r:Request,@Param('termId') id:string,@Query() raw:unknown){
    const input=data(z.object({q:z.string().max(100).optional(),
      preferred:z.string().regex(/^[a-z\d._-]{1,32}(,[a-z\d._-]{1,32}){0,4}$/i).optional()}).strict(),raw);
    const preferred=[...new Set(input.preferred?.toUpperCase().split(',')??[])];
    return suggest(this.db,await this.actor(r),opaque(id),input.q??'',preferred);
  }
  @Get('me/degree/:termId') async degree(@Req() r:Request,@Param('termId') id:string){return degreeAudit(this.db,await this.actor(r),opaque(id));}
  @Get('me/offerings') async offerings(@Req() r:Request,@Query() raw:unknown){
    const x=data(page,raw);return offeringPage(this.db,await this.actor(r),opaque(x.termId),x.department,x.cursor,x.limit);
  }
  @Get('me/requests/:operation/:key') async status(@Req() r:Request,@Param('operation') operation:string,@Param('key') key:string){
    return requestStatus(this.db,await this.actor(r),operation,key);
  }
  @Post('me/enrollment-previews')
  async verify(@Req() r:Request,@Res() res:Response,@Body() raw:unknown){
    const x=data(delta,raw,'previewEnrollmentInput');res.status(200).json(await preview(this.db,await this.actor(r,true),opaque(x.termId),x));
  }
  private async change(r:Request,res:Response,operation:Operation,x:{termId:string},raw:unknown,
    change:{add:z.infer<typeof bundleDto>[];dropEnrollmentIds:string[]},target?:string,caseRef?:string){
    const actor=await this.actor(r,true),student=target===undefined?actor.id:opaque(target),termId=opaque(x.termId),requestId=reqId(res);
    const out=await runIntent(this.db,{actor,subject:student,term:termId,operation,key:r.get('idempotency-key')??'',body:raw,requestId,caseRef},
      tx=>register(tx,actor,student,termId,operation,change,requestId,caseRef));
    res.status(out.status).json(out.body);
  }
  @Post('me/enrollments')
  acquire(@Req() r:Request,@Res() res:Response,@Body() raw:unknown){
    const x=data(enroll,raw,'enrollInput');return this.change(r,res,'enroll',x,raw,{add:x.bundles,dropEnrollmentIds:[]});
  }
  @Post('me/drops') release(@Req() r:Request,@Res() res:Response,@Body() raw:unknown){
    const x=data(drop,raw,'dropInput');return this.change(r,res,'drop',x,raw,{add:[],dropEnrollmentIds:x.enrollmentIds});
  }
  @Post('me/swaps') swap(@Req() r:Request,@Res() res:Response,@Body() raw:unknown){
    const x=data(delta,raw,'swapInput');return this.change(r,res,'swap',x,raw,x);
  }
  @Post('me/registration-finalizations') finalize(@Req() r:Request,@Res() res:Response,@Body() raw:unknown){
    const x=data(term,raw,'finalizeRegistrationInput');return this.change(r,res,'finalizeRegistration',x,raw,{add:[],dropEnrollmentIds:[]});
  }
  @Post('staff/students/:studentId/enrollment-changes')
  delegated(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('studentId') studentId:string){
    const x=data(delta.extend({caseRef:bounded}),raw,'changeForStudentInput');
    if(!x.add.length&&!x.dropEnrollmentIds.length)throw new Problem('ERR-001');
    return this.change(r,res,'changeForStudent',x,raw,x,studentId,x.caseRef);
  }
  @Post('me/waitlist-entries')
  async joinQueue(@Req() r:Request,@Res() res:Response,@Body() raw:unknown){
    const x=data(join,raw,'joinWaitlistInput'),actor=await this.actor(r,true),term=opaque(x.termId),requestId=reqId(res);
    const result=await runIntent(this.db,{actor,subject:actor.id,term,operation:'joinWaitlist',key:r.get('idempotency-key')??'',body:raw,requestId},
      tx=>joinWaitlist(tx,actor,term,x.bundle,requestId));
    res.status(result.status).json(result.body);
  }
  @Post('me/waitlist-entries/:entryId/responses')
  async respondToQueue(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('entryId') entry:string){
    const x=data(respond,raw,'respondToOfferInput'),actor=await this.actor(r,true),term=opaque(x.termId),requestId=reqId(res);
    const result=await runIntent(this.db,{actor,subject:actor.id,term,operation:'respondToOffer',key:r.get('idempotency-key')??'',body:{raw,entry},requestId},
      tx=>respondWaitlist(tx,actor,term,opaque(entry),x.response,requestId));
    res.status(result.status).json(result.body);
  }

}

@Controller()
class TimetablingController extends AuthenticatedTransport {
  constructor(@Inject(DB) db:Database){super(db);}
  @Post('terms/:termId/snapshots')
  async createSnapshot(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string){
    res.status(201).json(await saveSnapshot(this.db,await this.actor(r,true),opaque(term),raw,reqId(res)));
  }
  @Post('terms/:termId/solve-runs')
  async start(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string){
    const x=data(snapshot,raw,'startSolveInput');
    res.status(202).json(await startSolve(this.db,await this.actor(r,true),opaque(term),x.snapshotId,x.configurationId,reqId(res)));
  }
  @Get('terms/:termId/solve-runs/:runId')
  async run(@Req() r:Request,@Param('termId') term:string,@Param('runId') id:string){
    return getSolve(this.db,await this.actor(r),opaque(term),opaque(id));
  }
  @Get('terms/:termId/timetables')
  async list(@Req() r:Request,@Param('termId') term:string){return listProposals(this.db,await this.actor(r),opaque(term));}
  @Get('terms/:termId/timetables/:versionId')
  async proposal(@Req() r:Request,@Param('termId') t:string,@Param('versionId') id:string){return getProposal(this.db,await this.actor(r),opaque(t),opaque(id));}
  @Post('terms/:termId/timetables')
  async propose(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string){
    const x=data(z.object({snapshotId:bounded,assignments:assignmentsSchema}).strict(),raw);
    res.status(201).json(await saveProposal(this.db,await this.actor(r,true),opaque(term),x.snapshotId,x.assignments,reqId(res)));
  }
  @Post('terms/:termId/timetables/:versionId/validations')
  async validate(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string,@Param('versionId') id:string){
    const x=data(content,raw,'validateTimetableInput');
    res.status(200).json(await validateProposal(this.db,await this.actor(r,true),opaque(term),opaque(id),x.contentHash,reqId(res)));
  }
  @Get('terms/:termId/timetables/:versionId/impact')
  async inspectRepair(@Req() r:Request,@Param('termId') t:string,@Param('versionId') id:string){
    return inspectImpact(this.db,await this.actor(r),opaque(t),opaque(id));
  }
  @Post('terms/:termId/timetables/:versionId/impact')
  async approveRepair(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') t:string,@Param('versionId') id:string){
    const x=data(z.object({impactHash:z.string().regex(/^[a-f0-9]{64}$/),approvalRef:z.string().trim().min(1).max(120)}).strict(),raw);
    res.status(200).json(await reviewImpact(this.db,await this.actor(r,true),opaque(t),opaque(id),x.impactHash,x.approvalRef,reqId(res)));
  }
  @Post('terms/:termId/timetables/:versionId/publications')
  async publish(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') rawTerm:string,@Param('versionId') id:string){
    const x=data(content.extend({validationRef:bounded}),raw,'publishTimetableInput');
    const actor=await this.actor(r,true),term=opaque(rawTerm),requestId=reqId(res);
    const result=await runIntent(this.db,{actor,subject:actor.id,term,operation:'publishTimetable',key:r.get('idempotency-key')??'',body:{raw,id},requestId},
      tx=>publish(tx,actor,term,opaque(id),x.contentHash,x.validationRef,requestId));
    res.status(result.status).json(result.body);
  }

}

@Controller()
class AllocationController extends AuthenticatedTransport {
  constructor(@Inject(DB) db:Database){super(db);}
  @Get('me/allocations/:termId')
  async own(@Req() r:Request,@Param('termId') term:string){
    return listCampaigns(this.db,await this.actor(r),opaque(term),false);
  }
  @Post('me/allocations/:termId/:campaignId')
  async apply(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string,@Param('campaignId') campaign:string){
    res.status(200).json(await setApplication(this.db,await this.actor(r,true),opaque(term),opaque(campaign),data(applicationDto,raw),reqId(res)));
  }
  @Get('terms/:termId/allocations')
  async list(@Req() r:Request,@Param('termId') term:string){
    return listCampaigns(this.db,await this.actor(r),opaque(term),true);
  }
  @Post('terms/:termId/allocations')
  async create(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string){
    res.status(201).json(await createCampaign(this.db,await this.actor(r,true),opaque(term),data(campaignDto,raw),reqId(res)));
  }
  @Post('terms/:termId/allocations/:campaignId/approval')
  async approve(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string,@Param('campaignId') campaign:string){
    const input=data(approvalDto,raw);
    res.status(200).json(await approveCampaign(this.db,await this.actor(r,true),opaque(term),opaque(campaign),input.approvalRef,reqId(res)));
  }
  @Post('terms/:termId/allocations/:campaignId/runs')
  async plan(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string,@Param('campaignId') campaign:string){
    const input=data(revealDto,raw);
    res.status(202).json(await planCampaign(this.db,await this.actor(r,true),opaque(term),opaque(campaign),input.seed,reqId(res)));
  }
  @Post('terms/:termId/allocations/:campaignId/runs/:runId/publication')
  async publish(@Req() r:Request,@Res() res:Response,@Body() raw:unknown,@Param('termId') term:string,@Param('campaignId') campaign:string,@Param('runId') run:string){
    const input=data(publishAllocationDto,raw);
    res.status(200).json(await publishCampaign(this.db,await this.actor(r,true),opaque(term),opaque(campaign),opaque(run),input.revisionHash,input.approvalRef,reqId(res)));
  }
}

@Controller()
class AcademicOfficeController extends AuthenticatedTransport {
  constructor(@Inject(DB) db:Database){super(db);}
  @Get('me/exceptions/:termId')
  async grants(@Req() r:Request,@Param('termId') t:string){return myGrants(this.db,await this.actor(r),opaque(t));}
  @Post('me/exceptions/:termId')
  async requestException(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('termId') t:string){
    out.status(201).json(await requestGrant(this.db,await this.actor(r,true),opaque(t),data(requestGrantDto,raw),reqId(out)));
  }
  @Get('terms/:termId/exceptions')
  async reviewExceptions(@Req() r:Request,@Param('termId') t:string){return reviewGrants(this.db,await this.actor(r),opaque(t));}
  @Post('terms/:termId/exceptions/:grantId/decisions')
  async decideException(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('termId') t:string,@Param('grantId') g:string){
    out.status(200).json(await decideGrant(this.db,await this.actor(r,true),opaque(t),opaque(g),data(decideGrantDto,raw),reqId(out)));
  }
  @Post('staff/students/:studentId/records/:recordId/corrections')
  async correct(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('studentId') s:string,@Param('recordId') record:string){
    const x=data(correctionDto.extend({termId:bounded}).strict(),raw);
    out.status(200).json(await correctRecord(this.db,await this.actor(r,true),opaque(s),opaque(x.termId),opaque(record),x,reqId(out)));
  }
  @Get('me/instructor/:termId')
  async instructor(@Req() r:Request,@Param('termId') t:string){return instructorView(this.db,await this.actor(r),opaque(t));}
  @Post('me/instructor/:termId/availability')
  async availability(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('termId') t:string){
    out.status(201).json(await addAvailability(this.db,await this.actor(r,true),opaque(t),data(availabilityDto,raw),reqId(out)));
  }
  @Post('terms/:termId/registration-windows')
  async windows(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('termId') t:string){
    out.status(200).json(await setOperationWindow(this.db,await this.actor(r,true),opaque(t),data(operationWindowDto,raw),reqId(out)));
  }
  @Post('terms/:termId/capacity-pools/:poolId')
  async capacity(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('termId') t:string,@Param('poolId') pool:string){
    out.status(200).json(await setCapacity(this.db,await this.actor(r,true),opaque(t),opaque(pool),data(capacityDto,raw),reqId(out)));
  }
  @Post('academic/courses')
  async course(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createCourse(this.db,await this.actor(r,true),data(courseDto,raw),reqId(out)));
  }
  @Post('academic/rooms')
  async room(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createRoom(this.db,await this.actor(r,true),data(roomDto,raw),reqId(out)));
  }
  @Post('academic/offerings')
  async offering(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createOffering(this.db,await this.actor(r,true),data(offeringDto,raw),reqId(out)));
  }
  @Post('academic/terms')
  async term(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createTerm(this.db,await this.actor(r,true),data(newTermDto,raw),reqId(out)));
  }
  @Post('terms/:termId/admissions')
  async admission(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('termId') t:string){
    out.status(201).json(await admit(this.db,await this.actor(r,true),opaque(t),data(admissionDto,raw),reqId(out)));
  }
  @Post('academic/units')
  async unit(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createUnit(this.db,await this.actor(r,true),data(unitDto,raw),reqId(out)));
  }
  @Post('academic/programs')
  async program(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createProgram(this.db,await this.actor(r,true),data(programDto,raw),reqId(out)));
  }
  @Post('academic/imports')
  async importAcademic(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    const actor=await this.actor(r,true);
    const result=await importRecords(this.db,actor,data(transferBatch,raw),reqId(out));
    out.status(result.status==='blocked'?200:result.status==='committed'?201:200).json(result);
  }
  @Post('academic/policies')
  async policyDraft(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await draftPolicy(this.db,await this.actor(r,true),data(policyDraftDto,raw),reqId(out)));
  }
  @Post('academic/policies/:id/approval')
  async policyApproval(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('id') id:string){
    out.status(200).json(await approvePolicy(this.db,await this.actor(r,true),opaque(id),data(policyApproveDto,raw),reqId(out)));
  }
  @Post('academic/curricula')
  async curriculumDraft(@Req() r:Request,@Res() out:Response,@Body() raw:unknown){
    out.status(201).json(await createCurriculum(this.db,await this.actor(r,true),data(curriculumDto,raw),reqId(out)));
  }
  @Post('academic/curricula/:id/approval')
  async curriculumApproval(@Req() r:Request,@Res() out:Response,@Body() raw:unknown,@Param('id') id:string){
    out.status(200).json(await approveCurriculum(this.db,await this.actor(r,true),opaque(id),data(policyApproveDto,raw),reqId(out)));
  }

}

@Controller()
class ReportingController extends AuthenticatedTransport {
  constructor(@Inject(DB) db:Database){super(db);}
  @Get('terms/:termId/reports/seats/:unitId/export')
  async exportSeats(@Req() r:Request,@Res() out:Response,@Param('termId') t:string,@Param('unitId') u:string){
    const csv=await seatsCsv(this.db,await this.actor(r),opaque(t),opaque(u));
    out.attachment('seats.csv').type('text/csv').send(csv);
  }
  @Get('terms/:termId/reports/demand')
  async demand(@Req() r:Request,@Param('termId') term:string){return demandReport(this.db,await this.actor(r),opaque(term));}
  @Get('terms/:termId/reports/demand/export')
  async exportDemand(@Req() r:Request,@Res() out:Response,@Param('termId') term:string){
    const csv=await demandCsv(this.db,await this.actor(r),opaque(term));
    out.attachment('demand.csv').type('text/csv').send(csv);
  }
  @Get('terms/:termId/reports/disruption/:unitId')
  async disruption(@Req() r:Request,@Param('termId') t:string,@Param('unitId') u:string,@Query() raw:unknown){
    const q=data(z.object({before:bounded,after:bounded}).strict(),raw);
    return disruptionReport(this.db,await this.actor(r),opaque(t),opaque(u),opaque(q.before),opaque(q.after));
  }
  @Get('terms/:termId/reports/disruption/:unitId/export')
  async exportDisruption(@Req() r:Request,@Res() out:Response,@Param('termId') t:string,@Param('unitId') u:string,@Query() raw:unknown){
    const q=data(z.object({before:bounded,after:bounded}).strict(),raw);
    const csv=await disruptionCsv(this.db,await this.actor(r),opaque(t),opaque(u),opaque(q.before),opaque(q.after));
    out.attachment('disruption.csv').type('text/csv').send(csv);
  }
  @Get('terms/:termId/audit')
  async audit(@Req() r:Request,@Param('termId') t:string){return auditView(this.db,await this.actor(r),opaque(t));}
  @Get('terms/:termId/reports/seats/:unitId')
  async report(@Req() r:Request,@Param('termId') term:string,@Param('unitId') unit:string){
    return seatsReport(this.db,await this.actor(r),opaque(term),opaque(unit));
  }
}
@Module({providers:[{provide:DB,useFactory:connect}],exports:[DB]})
class DatabaseModule{}
@Module({imports:[DatabaseModule],controllers:[IdentityController]})
class IdentityModule{}
@Module({imports:[DatabaseModule],controllers:[RegistrationController,AllocationController]})
class RegistrationModule{}
@Module({imports:[DatabaseModule],controllers:[TimetablingController]})
class TimetablingModule{}
@Module({imports:[DatabaseModule],controllers:[AcademicOfficeController]})
class AcademicOfficeModule{}
@Module({imports:[DatabaseModule],controllers:[ReportingController]})
class ReportingModule{}
@Module({imports:[IdentityModule,RegistrationModule,TimetablingModule,AcademicOfficeModule,ReportingModule]})
class AcademicModule{}

async function main(){
  validateProduction('api');
  if(!process.env.WEB_ORIGIN||!/^https?:\/\/[^/]+$/.test(process.env.WEB_ORIGIN))throw new Error('Set WEB_ORIGIN to the browser origin.');
  if(process.env.APP_ENV!=='development'&&process.env.COOKIE_SECURE!=='true')throw new Error('Secure session cookies are required.');
  const api=await NestFactory.create(AcademicModule,{bodyParser:false,logger:['error','warn']});
  api.use(helmet());
  api.use((r:Request,res:Response,next:NextFunction)=>{
    const started=performance.now(),requestId=randomUUID();
    res.setHeader('X-Request-ID',requestId);res.setHeader('Cache-Control','private, no-store');
    res.on('finish',()=>{
      recordHttp(r.method,r.path,res.statusCode,(performance.now()-started)/1000);
      if(res.statusCode===403)console.info(JSON.stringify({event:'scope_denied',requestId,method:r.method}));
    });
    next();
  });
  const loginAttempts=new Map<string,{start:number;attempts:number}>();
  api.use('/session/development',(r:Request,res:Response,next:NextFunction)=>{
    const now=Date.now();
    for(const [key,v] of loginAttempts)if(now-v.start>60000)loginAttempts.delete(key);
    const identity=r.ip??'unknown', current=loginAttempts.get(identity)??{start:now,attempts:0};
    if(loginAttempts.size>=10000||++current.attempts>20){res.setHeader('Retry-After','60');res.status(429).json(new Problem('ERR-012').body(reqId(res)));return;}
    loginAttempts.set(identity,current);next();
  });
  api.use(express.json({limit:'1mb'}));
  api.use((e:unknown,_r:Request,res:Response,_next:NextFunction)=>{
    void e;void _r;void _next;
    res.status(400).json(new Problem('ERR-001').body(reqId(res)));
  });
  api.useGlobalFilters({catch(err:unknown,host:import('@nestjs/common').ArgumentsHost){
    const res=host.switchToHttp().getResponse<Response>(),req=host.switchToHttp().getRequest<Request>();
    const known=err instanceof Problem?err:err instanceof z.ZodError?new Problem('ERR-001'):
      err instanceof HttpException && err.getStatus()===404 ? new Problem('ERR-011') : new Problem('ERR-010');
    if(!(err instanceof Problem)&&!(err instanceof z.ZodError)) console.error(JSON.stringify({level:'error',requestId:reqId(res),method:req.method,category:err instanceof Error?err.name:'Unknown'}));
    if(!res.headersSent)res.status(known.status).json(known.body(reqId(res)));
  }});
  api.enableShutdownHooks();
  api.getHttpServer().on('close',()=>void api.get<Database>(DB).$disconnect());
  await api.listen(Number(process.env.API_PORT??4100),process.env.API_HOST??'127.0.0.1');
  console.log('Academic API ready');
}
void main().catch(err=>{console.error(err instanceof Error?err.message:'API startup failed');process.exitCode=1;});
