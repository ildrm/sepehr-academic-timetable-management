'use client';
import {useEffect,useState,useCallback,type FormEvent} from 'react';
import { z } from 'zod';
import { ArrowLeft,BookOpen,CalendarDays,Check,ChevronDown,ClipboardList,Clock3,GraduationCap,LayoutDashboard,LogOut,Menu,Search,Settings2,X } from 'lucide-react';
import { api,ApiError,Profile,profileSchema,Overview,overviewSchema,Card,cardsSchema,Bundle,decisionSchema,receiptSchema,statusSchema,
  runSchema,proposalsSchema } from './client';
import {fa,messages,digits,instant,day,clock} from './locale';

import {Exceptions,Instructor} from './office';

import {Administration} from './administration';

import Allocation from './allocation';
import {Reporting} from './reporting';

type View='dashboard'|'catalog'|'schedule'|'waitlist'|'planner'|'reports'|'profile'|'faculty'|'exceptions'|'administration'|'allocation';
type Notice={text:string;bad:boolean;id?:string};
type Pending={operation:string;key:string;path:string;payload:unknown};
const pendingSchema=z.object({operation:z.string(),key:z.string().uuid(),path:z.string(),payload:z.unknown()});
function getError(e:unknown):Notice{
  if(e instanceof ApiError){
    const key=e.problem.details?.[0]?.messageKey??e.problem.messageKey;
    return {text:messages[key]??messages[e.problem.messageKey]??fa.message,bad:true,id:e.problem.requestId};
  }
  return {text:messages.outcome_uncertain,bad:true};
}
const minimal=(x:Bundle)=>({sectionId:x.sectionId,componentIds:x.componentIds});
const stateLabel=(x:string)=>messages[x]??x;
function Brand(){return <div className="brand"><span><GraduationCap size={24}/></span><div><strong>{fa.brand}</strong><small>{fa.subbrand}</small></div></div>;}

export default function Portal({initial}:{initial:Profile|null}){
  const [profile,setProfile]=useState(initial);
  const [termId,setTerm]=useState(initial?.terms[0]?.id??'');
  const [view,setView]=useState<View>('dashboard');
  const [notice,setNotice]=useState<Notice|null>(null);
  const [busy,setBusy]=useState(false);
  const [flag,setFlag]=useState<{developmentLogin:boolean;institutionalLogin:boolean}|null>(null);
  const [mobile,setMobile]=useState(false);
  const [overview,setOverview]=useState<Overview|null>(null);
  const [cards,setCards]=useState<Card[]>([]);
  const [query,setQuery]=useState('');
  const [fetching,setFetching]=useState(false);
  const [basket,setBasket]=useState<{card:Card;bundle:Bundle}[]>([]);
  const [suggestions,setSuggestions]=useState<{titles:string[];matchedPreferences:string[];timetableVersion:string}[]|null>(null);
  const [drops,setDrops]=useState<string[]>([]);
  const [pending,setPending]=useState<Pending|null>(null);
  const [planId,setPlanId]=useState('');
  const [selectedPlan,setSelectedPlan]=useState('');
  const [run,setRun]=useState<z.infer<typeof runSchema>|null>(null);
  const impactShape=z.object({impactHash:z.string(),affectedStudents:z.number(),blockedStudents:z.number(),reviewed:z.boolean()});
  const [impacts,setImpacts]=useState<Record<string,z.infer<typeof impactShape>>>({});
  const [versions,setVersions]=useState<z.infer<typeof proposalsSchema>>([]);
  const [degree,setDegree]=useState<{edition:string;groups:{id:string;earned:string;required:string}[]}|null>(null);
  const student=profile?.roles.includes('student')??false;
  const term=profile?.terms.find(x=>x.id===termId);
  function selectView(next:View){setView(next);setMobile(false);setNotice(null);}
  const refreshOverview=useCallback(async()=>{
    if(!student||!termId)return;
    try{setOverview(await api('me/overview/'+termId,overviewSchema));}
    catch(e){setNotice(getError(e));if(e instanceof ApiError&&e.status===401)setProfile(null);}
  },[student,termId]);
  useEffect(()=>{if(!profile)api('session/config',z.object({developmentLogin:z.boolean(),institutionalLogin:z.boolean()}))
    .then(setFlag).catch(()=>setFlag({developmentLogin:false,institutionalLogin:false}));},[profile]);
  useEffect(()=>{setOverview(null);setSuggestions(null);setBasket([]);setDrops([]);setCards([]);setRun(null);setImpacts({});setVersions([]);void refreshOverview();},[refreshOverview,termId]);
  useEffect(()=>{
    if(!student||!termId||!['dashboard','catalog'].includes(view))return;
    let current=true;
    const timer=setTimeout(()=>{
      setFetching(true);
      api('me/catalog/'+termId+'?q='+encodeURIComponent(view==='dashboard'?'':query),cardsSchema)
        .then(data=>{if(current)setCards(data);}).catch(e=>{if(current)setNotice(getError(e));}).finally(()=>{if(current)setFetching(false);});
    },query?200:0);
    return()=>{current=false;clearTimeout(timer);};
  },[student,termId,query,view]);
  useEffect(()=>{
    if(!profile)return;
    try{
      const raw=sessionStorage.getItem('academic-pending:'+profile.subject);
      if(raw){const saved=pendingSchema.safeParse(JSON.parse(raw));if(saved.success)setPending(saved.data);}
    }catch{setPending(null);}
  },[profile]);
  const getVersions=useCallback(async()=>{
    if(!termId)return;
    try{setVersions(await api('terms/'+termId+'/timetables',proposalsSchema));}catch(e){setNotice(getError(e));}
  },[termId]);
  useEffect(()=>{if(view==='planner')void getVersions();},[view,getVersions]);
  useEffect(()=>{
    if(view!=='planner'||!run||!['queued','running'].includes(run.state))return;
    const timer=setTimeout(()=>void api('terms/'+termId+'/solve-runs/'+run.runId,runSchema).then(x=>{setRun(x);if(x.state==='finished')void getVersions();})
      .catch(e=>setNotice(getError(e))),1200);
    return()=>clearTimeout(timer);
  },[run,termId,view,getVersions]);
  useEffect(()=>{
    if(view==='profile'&&student&&termId)void api('me/degree/'+termId,z.object({
      edition:z.string(),groups:z.array(z.object({id:z.string(),earned:z.string(),required:z.string()}))
    })).then(setDegree).catch(e=>setNotice(getError(e)));
  },[view,student,termId]);
  function persist(value:Pending|null){
    setPending(value);
    if(!profile)return;
    try{if(value)sessionStorage.setItem('academic-pending:'+profile.subject,JSON.stringify(value));
      else sessionStorage.removeItem('academic-pending:'+profile.subject);}catch{/* Recovery stays available while this page is open. */}
  }
  async function signIn(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);setBusy(true);setNotice(null);
    try{
      await api('session/development',z.object({authenticated:z.boolean()}),{login:f.get('login'),password:f.get('password')});
      const actor=await api('me/portal',profileSchema);
      setProfile(actor);setTerm(actor.terms[0]?.id??'');setView('dashboard');setMobile(false);
    }catch(e){setNotice(getError(e));}finally{setBusy(false);}
  }
  async function logout(){
    try{await api('session/logout',z.object({authenticated:z.boolean()}),{});setProfile(null);setPending(null);setNotice(null);setMobile(false);}
    catch(e){setNotice(getError(e));if(e instanceof ApiError&&e.status===401)setProfile(null);}
  }
  async function submit(operation:string,path:string,payload:unknown,retry?:Pending){
    if(!retry&&pending){setNotice({text:messages.outcome_uncertain,bad:true});return;}
    const intent=retry??{operation,path,payload,key:crypto.randomUUID()};persist(intent);
    setBusy(true);setNotice({text:messages.pending,bad:false});
    try{
      const saved=await api(path,receiptSchema,payload,intent.key);
      persist(null);setNotice({text:fa.confirmed,bad:false,id:saved.requestId});await refreshOverview();
      if(['enroll','swap','drop'].includes(operation)){setBasket([]);setDrops([]);}
      if(operation==='publishTimetable')await getVersions();
    }catch(e){
      if(e instanceof ApiError&&e.status<500&&e.status!==401&&e.status!==429)persist(null);
      setNotice(getError(e));
      if(e instanceof ApiError&&e.status===401)setProfile(null);
    }finally{setBusy(false);}
  }
  async function recover(){
    if(!pending)return;
    setBusy(true);
    try{
      const existing=await api('me/requests/'+pending.operation+'/'+pending.key,statusSchema);
      if(existing.state==='finished'&&existing.outcome){
        persist(null);
        if('outcome' in existing.outcome){setNotice({text:fa.confirmed,bad:false,id:existing.outcome.requestId});await refreshOverview();}
        else setNotice(getError(new ApiError(existing.originalHttpStatus??400,existing.outcome)));
      }else setNotice({text:messages.pending,bad:false});
    }catch(e){setNotice(getError(e));if(e instanceof ApiError&&e.status===401)setProfile(null);}
    finally{setBusy(false);}
  }
  async function preview(){
    setBusy(true);
    try{const result=await api('me/enrollment-previews',decisionSchema,{termId,add:basket.map(i=>minimal(i.bundle)),dropEnrollmentIds:drops});
      setNotice({text:result.reasons.map(x=>messages[x.messageKey]??x.ruleId).join('، ')||stateLabel(result.decision),bad:['rejected','review'].includes(result.decision)});
    }catch(e){setNotice(getError(e));}finally{setBusy(false);}
  }
  function commit(){
    const add=basket.map(i=>minimal(i.bundle));
    if(add.length&&drops.length)return submit('swap','me/swaps',{termId,add,dropEnrollmentIds:drops});
    if(drops.length)return submit('drop','me/drops',{termId,enrollmentIds:drops});
    return submit('enroll','me/enrollments',{termId,bundles:add});
  }
  function addItem(card:Card,bundle:Bundle){
    setBasket(old=>[...old.filter(i=>i.card.id!==card.id),{card,bundle}]);
    setNotice({text:'درس به سبد اضافه شد.',bad:false});
  }
  function offering(card:Card){
    const b=card.bundles[0];
    return <article className="course-card" key={card.id}><div className="course-top"><span className="course-icon"><BookOpen size={21}/></span><bdi>{card.code}</bdi></div>
      <h3>{card.title}</h3><div className="muted">{digits(Number(card.credit))} {fa.countUnit} · {b?.components.map(c=>c.kind==='lab'?fa.lab:fa.lecture).join(' + ')}</div>
      <div className="course-bottom"><span className={card.available>0?'space':'full'}>{digits(card.available)} {fa.available}</span>
      {b&&<button className="button light small" onClick={()=>addItem(card,b)}>{fa.add}</button>}</div>
      {view==='catalog'&&card.bundles.map(option=><div className="bundle-row" key={option.sectionId+option.componentIds.join('-')}>
        <span>{fa.section} {digits(option.label)}</span><button className="plain" onClick={()=>addItem(card,option)}>{fa.add}</button>
        <button disabled={busy} className="plain" onClick={()=>void submit('joinWaitlist','me/waitlist-entries',{termId,bundle:minimal(option)})}>{fa.reserve}</button></div>)}
    </article>;
  }
  if(!profile)return <main id="main" className="login"><section className="login-panel">
    <Brand/><div className="login-copy"><h1>{fa.login}</h1><p>{fa.welcome}</p></div>
    {flag===null&&<p role="status">{fa.loading}</p>}
    {flag&&!flag.developmentLogin&&!flag.institutionalLogin&&<p role="status" className="muted">{fa.provider}</p>}
    {flag?.institutionalLogin&&<a className="button primary" href="/api/session/oidc/start">ورود سازمانی</a>}
    {flag?.developmentLogin&&<form onSubmit={signIn}>
      <p className="login-hint">{fa.development}</p><p className="muted">{fa.authHint}</p>
      <label>{fa.labelUser}<input name="login" placeholder="student.demo" required autoComplete="username" dir="ltr"/></label>
      <label>{fa.labelPassword}<input type="password" name="password" required autoComplete="current-password" dir="ltr"/></label>
      <button className="button primary" disabled={busy}>{busy?fa.loading:fa.login}<ArrowLeft size={18}/></button>
    </form>}
    {notice&&<p role="alert" className="notice bad">{notice.text}</p>}
  </section><aside className="login-art"><div className="geometry"/><div><GraduationCap size={50}/><h2>{fa.subbrand}</h2><p>{fa.heroDetail}</p></div></aside></main>;
  const nav=[{id:'dashboard' as const,label:fa.dashboard,icon:LayoutDashboard},
    ...(student?[{id:'catalog' as const,label:fa.catalog,icon:BookOpen},{id:'schedule' as const,label:fa.schedule,icon:CalendarDays},
      {id:'waitlist' as const,label:fa.waitlist,icon:Clock3},{id:'profile' as const,label:fa.profile,icon:GraduationCap}]:[]),
    ...(profile.roles.some(r=>['planner','academic_admin'].includes(r))?[{id:'planner' as const,label:fa.planner,icon:Settings2}]:[]),
    ...(student||profile.roles.some(r=>['academic_admin','planner'].includes(r))?[{id:'allocation' as const,label:'تخصیص گروهی',icon:ClipboardList}]:[]),
    ...(profile.roles.includes('instructor')?[{id:'faculty' as const,label:fa.faculty,icon:CalendarDays}]:[]),
    ...(student||profile.roles.includes('academic_admin')?[{id:'exceptions' as const,label:fa.exceptions,icon:ClipboardList}]:[]),
    ...(profile.roles.some(r=>['academic_admin','academic_office'].includes(r))?[{id:'administration' as const,label:fa.administration,icon:Settings2}]:[]),
    ...(profile.roles.some(r=>['academic_office','planner','department_head'].includes(r))?[{id:'reports' as const,label:fa.reports,icon:ClipboardList}]:[])];
  const active=nav.find(n=>n.id===view);
  return <div className="shell">
    <aside className={'sidebar '+(mobile?'visible':'')}><Brand/><nav aria-label="ناوبری اصلی">
      {nav.map(({id,label,icon:Icon})=><button key={id} onClick={()=>selectView(id)} aria-current={view===id?'page':undefined}><Icon size={20}/><span>{label}</span></button>)}
    </nav><div className="sidebar-bottom"><span className="avatar"><GraduationCap size={18}/></span><div><bdi>{profile.subject}</bdi><small>{fa.session}</small></div><button className="icon" title={fa.logout} aria-label={fa.logout} onClick={()=>void logout()}><LogOut size={18}/></button></div></aside>
    <main id="main" className="main"><header className="topbar"><button className="icon mobile-menu" aria-label="باز کردن منو" onClick={()=>setMobile(x=>!x)}><Menu/></button><strong>{active?.label??fa.dashboard}</strong>
      <div className="top-end">{profile.synthetic&&<span className="dev-dot">{fa.development}</span>}
      <label className="term-select"><CalendarDays size={17}/><span className="sr">{fa.selectTerm}</span><select value={termId} onChange={e=>{setTerm(e.target.value);setNotice(null);}}>
      {profile.terms.map(t=><option key={t.id} value={t.id}>{t.code==='SYN-OPEN'?'نیمسال جاری':t.code==='SYN-CLOSED'?'نیمسال بسته':t.code}</option>)}</select><ChevronDown size={14}/></label></div></header>
      <div className="content">
        {notice&&<div role={notice.bad?'alert':'status'} className={'notice '+(notice.bad?'bad':'success')}><span>{notice.text} {notice.id&&<bdi>{notice.id}</bdi>}</span><button className="icon" aria-label={fa.cancel} onClick={()=>setNotice(null)}><X size={17}/></button></div>}
        {pending&&<div className="notice"><span>{fa.request} <bdi>{pending.key}</bdi></span><button className="plain" disabled={busy} onClick={()=>void recover()}>{fa.request}</button>
          <button className="plain" disabled={busy} onClick={()=>void submit(pending.operation,pending.path,pending.payload,pending)}>{fa.retry}</button></div>}
        {view==='dashboard'&&<><section className="hero"><div className="geometry"/><div className="hero-inner"><div className="hero-icon"><GraduationCap size={27}/></div><h1>{student?fa.studentWelcome:fa.welcome}</h1><p>{fa.heroDetail}</p>{student&&<button className="button white" onClick={()=>selectView('catalog')}>{fa.browse}<ArrowLeft size={17}/></button>}</div></section>
          {student&&<><div className="metrics">{([[fa.termCredits,digits(Number(overview?.credits??0)),BookOpen],[fa.courseCount,digits(overview?.enrollments.length??0),ClipboardList],[fa.waitCount,digits(overview?.waits.filter(w=>['queued','offered'].includes(w.state)).length??0),Clock3]] as const).map(([label,value,Icon])=>{
            const Glyph=typeof Icon==='string'?BookOpen:Icon;
            return <div className="metric" key={String(label)}><span className="course-icon"><Glyph size={21}/></span><div><strong>{String(value)}</strong><small>{String(label)}</small></div></div>;
          })}</div><div className="section-heading"><h2>{fa.offered}</h2><button className="plain" onClick={()=>selectView('catalog')}>{fa.all}<ArrowLeft size={16}/></button></div>
          <div className="course-grid">{cards.slice(0,3).map(offering)}</div>{!cards.length&&<p>{fetching?fa.loading:fa.empty}</p>}</>}
          {term&&<p className="muted deadline">{fa.selectTerm} · {instant(term.closesAt,term.zone)} · <bdi>{term.zone}</bdi></p>}</>}
        {view==='catalog'&&<><div className="section-heading"><h1>{fa.catalog}</h1><label className="search"><Search size={18}/><input aria-label={fa.search} placeholder={fa.search} value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
          <section className="panel basket"><div className="section-heading"><h2>{fa.cart}</h2><span>{digits(basket.length+drops.length)}</span></div>
          {basket.length===0&&drops.length===0&&<p className="muted">{fa.empty}</p>}
          {basket.map(i=><div className="line-row" key={i.card.id}><span>{i.card.title} · {fa.section} {digits(i.bundle.label)}</span><button className="icon" aria-label={fa.drop} onClick={()=>setBasket(items=>items.filter(v=>v.card.id!==i.card.id))}><X size={17}/></button></div>)}
          {drops.map(id=><div className="line-row" key={id}><span>{fa.drop} · {overview?.enrollments.find(e=>e.id===id)?.title}</span><button className="icon" aria-label={fa.cancel} onClick={()=>setDrops(items=>items.filter(x=>x!==id))}><X size={17}/></button></div>)}
          <p className="muted">{fa.previewNote}</p><div className="actions"><button disabled={busy||!basket.length&&!drops.length} className="button light" onClick={()=>void preview()}>{fa.preview}</button>
          <button disabled={busy||!basket.length&&!drops.length} className="button primary" onClick={()=>void commit()}><Check size={16}/>{fa.commit}</button>
          <button disabled={busy||term?.stage==='finalized'} className="button light" onClick={()=>void submit('finalizeRegistration','me/registration-finalizations',{termId})}>{fa.finalize}</button></div></section>
          <section className="panel"><h2>{fa.suggestions}</h2>
            <form className="actions" onSubmit={e=>{
              e.preventDefault();
              const fields=new FormData(e.currentTarget);
              const codes=String(fields.get('preferred')??'').replaceAll('،',',').split(',').map(s=>s.trim()).filter(Boolean);
              if(codes.length>5||codes.some(s=>!/^[a-z\d._-]{1,32}$/i.test(s))){
                setNotice({text:'حداکثر پنج کد درس را با ویرگول جدا کنید.',bad:true});return;
              }
              const params=new URLSearchParams({q:query});
              if(codes.length)params.set('preferred',codes.join(','));
              setBusy(true);
              void api('me/suggestions/'+termId+'?'+params,z.object({results:z.array(z.object({
                titles:z.array(z.string()),matchedPreferences:z.array(z.string()),timetableVersion:z.string(),
              }))})).then(x=>setSuggestions(x.results)).catch(e=>setNotice(getError(e))).finally(()=>setBusy(false));
            }}>
              <label>کد درس‌ها به‌ترتیب اولویت<input name="preferred" dir="ltr" maxLength={180}/></label>
              <button className="button light" disabled={busy}>{fa.suggestions}</button>
            </form>
            <p className="muted">{fa.suggestionNote}</p>
            {suggestions?.map((a,i)=><div className="line-row" key={i}>
              <span>{a.titles.join(' + ')}</span>
              <small>نسخه {digits(a.timetableVersion)}{a.matchedPreferences.length>0&&<> · اولویت‌ها <bdi>{a.matchedPreferences.join(', ')}</bdi></>}</small>
            </div>)}{suggestions?.length===0&&<p>{fa.empty}</p>}</section>
          <div className="course-grid">{cards.map(offering)}</div>{!cards.length&&<p>{fetching?fa.loading:fa.empty}</p>}</>}
        {view==='schedule'&&<><div className="section-heading"><h1>{fa.schedule}</h1><button className="plain" onClick={()=>void refreshOverview()}>{fa.refresh}</button></div>
          <section className="panel"><h2>{fa.termHistory}</h2>{overview?.enrollments.length?overview.enrollments.map(e=><div className="line-row" key={e.id}><span>{e.title} · <bdi>{e.code}</bdi></span><button className="plain" onClick={()=>{setDrops(old=>[...new Set([...old,e.id])]);selectView('catalog');}}>{fa.drop} / {fa.swap}</button></div>):<p className="muted">{fa.empty}</p>}</section>
          {term&&overview?.timetableNotices.map(n=><p key={n.versionId} className="notice" role="status">
            برنامهٔ {digits(n.changedComponents)} بخش در {instant(n.publishedAt,term.zone)} تغییر کرد.
          </p>)}
          <div className="panel scroll"><table><caption>{fa.schedule}</caption><thead><tr>{[fa.course,fa.day,fa.time,fa.room].map(v=><th scope="col" key={v}>{v}</th>)}</tr></thead>
          <tbody>{overview?.schedule.map((x,i)=><tr key={x.code+x.weekDate+i}><td>{x.title}</td><td>{day(x.weekDate)}</td><td><bdi>{clock(x.startMinute)}–{clock(x.endMinute)}</bdi></td><td><bdi>{x.room}</bdi></td></tr>)}</tbody></table>{!overview?.schedule.length&&<p className="muted">{fa.empty}</p>}</div></>}
        {view==='waitlist'&&<section className="panel"><h1>{fa.waitlist}</h1>{overview?.waits.map(w=><div className="line-row" key={w.id}><div>{w.title}<p className="muted">{stateLabel(w.state)}{w.state==='queued'?' · رتبه '+digits(w.position):''}
          {w.expiresAt&&term?' · '+instant(w.expiresAt,term.zone):''}</p></div><div className="actions">
          {w.state==='offered'&&<button className="button primary" disabled={busy} onClick={()=>void submit('respondToOffer','me/waitlist-entries/'+w.id+'/responses',{termId,response:'accept'})}>{fa.accept}</button>}
          {['offered','queued'].includes(w.state)&&<button className="button light" disabled={busy} onClick={()=>void submit('respondToOffer','me/waitlist-entries/'+w.id+'/responses',{termId,response:'decline'})}>{fa.decline}</button>}</div></div>)}
          {!overview?.waits.length&&<p className="muted">{fa.empty}</p>}</section>}
        {view==='profile'&&<section className="panel"><h1>{fa.profile}</h1>{degree?<><p className="muted"><bdi>{degree.edition}</bdi></p>
          {degree.groups.map(g=><div className="line-row" key={g.id}><bdi>{g.id}</bdi><span>{digits(Number(g.earned))} / {digits(Number(g.required))} {fa.countUnit}</span></div>)}</>:<p className="muted">{fa.empty}</p>}</section>}
        {view==='allocation'&&term&&<Allocation key={termId} termId={termId} zone={term.zone} student={student&&!profile.roles.some(r=>['academic_admin','planner'].includes(r))}
          planner={profile.roles.includes('planner')} admin={profile.roles.includes('academic_admin')}/>}
        {view==='planner'&&<section className="panel"><h1>{fa.planner}</h1><p>{fa.plannerDetail}</p>
          {profile.roles.includes('planner')&&<form className="actions" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
            void api('terms/'+termId+'/solve-runs',runSchema,{snapshotId:planId,configurationId:f.get('configurationId')}).then(setRun).catch(e=>setNotice(getError(e)));}}>
            <label>{fa.snapshot}<input value={planId} onChange={e=>setPlanId(e.target.value)} required dir="ltr"/></label>
            <label>{fa.config}<input name="configurationId" required dir="ltr"/></label><button className="button primary">{fa.solve}</button></form>}
          {profile.roles.includes('planner')&&<details><summary>{fa.snapshotImport}</summary>
            <label>{fa.snapshotFile}<input type="file" accept="application/json,.json" onChange={e=>{
              const file=e.target.files?.[0];if(!file)return;
              if(file.size>1000000){setNotice({text:messages.invalid_input,bad:true});return;}
              void file.text().then(text=>api('terms/'+termId+'/snapshots',z.object({snapshotId:z.string()}),JSON.parse(text)))
                .then(x=>{setPlanId(x.snapshotId);setNotice({text:fa.confirmed,bad:false});}).catch(e=>setNotice(getError(e)));
            }}/></label>
            <label>{fa.manualPlacements}<textarea value={selectedPlan} onChange={e=>setSelectedPlan(e.target.value)} rows={6} dir="ltr"/></label>
            <button className="button light" disabled={!planId||!selectedPlan.trim()} onClick={()=>{
              try{void api('terms/'+termId+'/timetables',z.object({versionId:z.string()}),{snapshotId:planId,assignments:JSON.parse(selectedPlan)})
                .then(()=>{setNotice({text:fa.confirmed,bad:false});void getVersions();}).catch(e=>setNotice(getError(e)));}
              catch{setNotice({text:messages.invalid_input,bad:true});}
            }}>{fa.commit}</button>
          </details>}
          {run&&<p role="status">{stateLabel(run.state)} <bdi>{run.solverStatus??run.runId}</bdi> {run.resultRef&&<> · {fa.version} <bdi>{run.resultRef}</bdi></>}</p>}
          {versions.map(v=><div className="line-row" key={v.versionId}><span>{fa.version} {digits(v.versionId)} · {stateLabel(v.state)}</span><div className="actions">
            {profile.roles.includes('planner')&&<button className="button light" onClick={()=>void api('terms/'+termId+'/timetables/'+v.versionId,
              z.object({snapshotId:z.string().nullable(),assignments:z.array(z.object({classId:z.string(),placementId:z.string()}))}))
              .then(x=>{setPlanId(x.snapshotId??'');setSelectedPlan(JSON.stringify(x.assignments,null,2));}).catch(e=>setNotice(getError(e)))}>{fa.inspect}</button>}
            {profile.roles.includes('planner')&&v.state==='proposed'&&<button className="button light" onClick={()=>void api('terms/'+termId+'/timetables/'+v.versionId+'/validations',
              z.object({valid:z.boolean(),conflicts:z.array(z.string())}),{contentHash:v.contentHash}).then(x=>{setNotice({text:x.valid?fa.confirmed:x.conflicts.join('، '),bad:!x.valid});void getVersions();}).catch(e=>setNotice(getError(e)))}>{fa.validate}</button>}
            {v.state==='validated'&&<button className="button light" onClick={()=>void api('terms/'+termId+'/timetables/'+v.versionId+'/impact',impactShape)
              .then(x=>setImpacts(items=>({...items,[v.versionId]:x}))).catch(e=>setNotice(getError(e)))}>بررسی اثر تغییر</button>}
            {impacts[v.versionId]&&<span role="status">{digits(impacts[v.versionId].affectedStudents)} دانشجوی متأثر · {digits(impacts[v.versionId].blockedStudents)} مورد تعارض</span>}
            {profile.roles.includes('academic_admin')&&impacts[v.versionId]?.affectedStudents>0&&!impacts[v.versionId].blockedStudents&&!impacts[v.versionId].reviewed&&
              <form className="actions" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);
                void api('terms/'+termId+'/timetables/'+v.versionId+'/impact',z.object({reviewed:z.boolean()}),
                  {impactHash:impacts[v.versionId].impactHash,approvalRef:data.get('approval')})
                .then(x=>setImpacts(items=>({...items,[v.versionId]:{...items[v.versionId],reviewed:x.reviewed}}))).catch(e=>setNotice(getError(e)));}}>
                <label>مرجع تصویب تغییر<input name="approval" required maxLength={120}/></label><button className="button light">تأیید اثر تغییر</button></form>}
            {profile.roles.includes('academic_admin')&&v.state==='validated'&&v.validationRef&&<button className="button primary" disabled={busy} onClick={()=>void submit('publishTimetable',
              'terms/'+termId+'/timetables/'+v.versionId+'/publications',{contentHash:v.contentHash,validationRef:v.validationRef})}>{fa.publish}</button>}</div></div>)}</section>}
        {view==='exceptions'&&term&&<Exceptions key={termId} termId={termId} zone={term.zone} admin={profile.roles.includes('academic_admin')}/>}
        {view==='faculty'&&term&&<Instructor key={termId} termId={termId} zone={term.zone}/>}
        {view==='administration'&&<Administration key={termId} termId={termId} admin={profile.roles.includes('academic_admin')}/>}
        {view==='reports'&&term&&<Reporting key={termId} termId={termId} zone={term.zone} roles={profile.roles}/>}
      </div>
    </main>
  </div>;
}
