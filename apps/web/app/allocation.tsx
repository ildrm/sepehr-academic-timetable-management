'use client';

import {useEffect,useState} from 'react';
import {z} from 'zod';
import {api,ApiError,cardsSchema,type Card} from './client';
import {digits,instant,messages} from './locale';

const bundle=z.object({sectionId:z.string(),componentIds:z.array(z.string())});
type Bundle=z.infer<typeof bundle>;
const campaigns=z.array(z.object({
  id:z.string(),state:z.string(),policyRef:z.string(),opensAt:z.string(),closesAt:z.string(),seedCommitment:z.string(),
  alternatives:z.array(z.array(bundle)).optional(),selectedAlternative:z.number().nullable().optional(),
  run:z.object({runId:z.string(),status:z.string(),revisionHash:z.string(),solverStatus:z.string().nullable(),
    tiers:z.array(z.object({tier:z.number(),applicants:z.number(),matched:z.number(),requested:z.number(),awarded:z.number()})),
  }).nullable().optional(),
}));
const response=z.object({status:z.string().optional()}).passthrough();
const states:Record<string,string>={draft:'پیش‌نویس',open:'ثبت درخواست',sealed:'در حال بررسی',published:'منتشر شده',
  queued:'در صف',running:'در حال اجرا',ready:'آمادهٔ بررسی',failed:'ناموفق',stale:'نیازمند محاسبهٔ دوباره'};

export default function Allocation({termId,zone,student,planner,admin}:{termId:string;zone:string;student:boolean;planner:boolean;admin:boolean}){
  const root=student?'me/allocations/'+termId:'terms/'+termId+'/allocations';
  const [list,setList]=useState<z.infer<typeof campaigns>>([]);
  const [cards,setCards]=useState<Card[]>([]);
  const [active,setActive]=useState('');
  const [drafts,setDrafts]=useState<Bundle[][]>([[]]);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);

  function failed(value:unknown){
    setError(true);
    setNotice(value instanceof ApiError?messages[value.problem.details?.[0]?.messageKey??value.problem.messageKey]??'انجام عملیات ممکن نبود.':'ارتباط با سامانه برقرار نشد.');
  }
  useEffect(()=>{
    async function load(){try{
      setList(await api(root,campaigns));
      if(student)setCards(await api('me/catalog/'+termId,cardsSchema));
    }catch(e){failed(e);}}
    if(termId)void load();
  },[root,student,termId]);

  async function action(path:string,data:unknown){
    setBusy(true);setError(false);setNotice('');
    try{
      const result=await api(path,response,data);
      setList(await api(root,campaigns));
      setNotice(result.status==='stale'?'داده‌ها تغییر کرده‌اند. طرح تازه‌ای محاسبه کنید.':'درخواست ثبت شد.');
    }catch(e){failed(e);}finally{setBusy(false);}
  }
  function choose(c:typeof list[number]){
    setActive(c.id);setDrafts(c.alternatives?.length?c.alternatives:[[]]);
  }
  function toggle(index:number,group:Bundle){
    setDrafts(items=>items.map((selection,i)=>{
      if(i!==index)return selection;
      const same=(v:Bundle)=>v.sectionId===group.sectionId&&v.componentIds.join(',')===group.componentIds.join(',');
      return selection.some(same)?selection.filter(x=>!same(x)):[...selection.filter(x=>x.sectionId!==group.sectionId),group];
    }));
  }
  const campaign=list.find(c=>c.id===active);
  return <section className="panel" aria-labelledby="allocation-heading">
    <h1 id="allocation-heading">تخصیص گروهی درس‌ها</h1>
    {notice&&<p role={error?'alert':'status'}>{notice}</p>}
    <button className="button light" disabled={busy} onClick={()=>void api(root,campaigns).then(setList).catch(failed)}>به‌روزرسانی وضعیت</button>
    {!!list.length&&<label>دورهٔ تخصیص
      <select value={active} onChange={e=>{const item=list.find(c=>c.id===e.target.value);if(item)choose(item);}}>
        <option value="">یک دوره را انتخاب کنید</option>
        {list.map(c=><option key={c.id} value={c.id}>{digits(c.id)} — {c.policyRef} — {states[c.state]??c.state}</option>)}
      </select></label>}
    {campaign&&<div>
      <p>از {instant(campaign.opensAt,zone)} تا {instant(campaign.closesAt,zone)}</p>
      <p>تعهد قرعه‌کشی <bdi>{campaign.seedCommitment}</bdi></p>
      {student&&campaign.state==='open'&&<form onSubmit={e=>{e.preventDefault();void action(root+'/'+campaign.id,{alternatives:drafts.filter(x=>x.length)});}}>
        <p>هر گزینه مجموعه‌ای از درس‌هاست. حداکثر یک گزینه به شما تخصیص می‌یابد.</p>
        {drafts.map((items,i)=><fieldset key={i}><legend>گزینهٔ {digits(i+1)}</legend>
          {cards.flatMap(c=>c.bundles.map((b,j)=>{
            const group={sectionId:b.sectionId,componentIds:[...b.componentIds].sort()};
            const selected=items.some(x=>x.sectionId===group.sectionId&&x.componentIds.join(',')===group.componentIds.join(','));
            return <label className="allocation-choice" key={c.id+':'+j}>
              <input type="checkbox" checked={selected} onChange={()=>toggle(i,group)}/><span>{c.title} · گروه {digits(b.label)}</span>
            </label>;
          }))}
        </fieldset>)}
        <div className="actions">
          <button type="button" className="button light" disabled={drafts.length>=4||busy} onClick={()=>setDrafts(x=>[...x,[]])}>افزودن گزینه</button>
          <button className="button primary" disabled={busy}>ثبت گزینه‌ها</button>
        </div>
      </form>}
      {student&&campaign.state==='published'&&<p role="status">{campaign.selectedAlternative===null?'گزینه‌ای تخصیص نیافت.':`گزینهٔ ${digits(1+(campaign.selectedAlternative??0))} تخصیص یافت.`}</p>}
      {admin&&campaign.state==='draft'&&<form onSubmit={e=>{
        e.preventDefault();const data=new FormData(e.currentTarget);void action(root+'/'+campaign.id+'/approval',{approvalRef:data.get('approval')});
      }}><label>مرجع تصویب سیاست<input name="approval" maxLength={120} required/></label><button className="button primary" disabled={busy}>تصویب دوره</button></form>}
      {planner&&['open','sealed'].includes(campaign.state)&&<form onSubmit={e=>{
        e.preventDefault();const data=new FormData(e.currentTarget);void action(root+'/'+campaign.id+'/runs',{seed:data.get('seed')});
      }}><label>بذر ثبت‌شدهٔ قرعه‌کشی<input name="seed" pattern="[0-9a-f]{64}" dir="ltr" required/></label>
        <button className="button primary" disabled={busy}>محاسبهٔ تخصیص</button></form>}
      {campaign.run&&<div><p>نتیجهٔ محاسبه: {states[campaign.run.status]??campaign.run.status}</p>
        {campaign.run.tiers.length>0&&<div className="scroll"><table><caption>نتیجه بر اساس ردهٔ اولویت</caption>
          <thead><tr><th scope="col">رده</th><th scope="col">متقاضی</th><th scope="col">دارای تخصیص</th><th scope="col">واحد درخواست‌شده</th><th scope="col">واحد تخصیص‌یافته</th></tr></thead>
          <tbody>{campaign.run.tiers.map(t=><tr key={t.tier}><td>{digits(t.tier)}</td><td>{digits(t.applicants)}</td><td>{digits(t.matched)}</td>
            <td>{digits(t.requested/100)}</td><td>{digits(t.awarded/100)}</td></tr>)}</tbody>
        </table></div>}
        {admin&&campaign.run.status==='ready'&&<form onSubmit={e=>{
          e.preventDefault();const data=new FormData(e.currentTarget),run=campaign.run;
          if(run)void action(root+'/'+campaign.id+'/runs/'+run.runId+'/publication',{approvalRef:data.get('approval'),revisionHash:run.revisionHash});
        }}><label>مرجع تصویب نتیجه<input name="approval" maxLength={120} required/></label>
          <button className="button primary" disabled={busy}>انتشار و ثبت‌نام</button></form>}
      </div>}
    </div>}
    {planner&&<details><summary>ایجاد دورهٔ تخصیص</summary><form onSubmit={e=>{
      e.preventDefault();const data=new FormData(e.currentTarget);
      void action(root,{policyRef:data.get('policy'),seedCommitment:data.get('commitment'),
        opensAt:data.get('opens'),closesAt:data.get('closes'),applicantLimit:Number(data.get('limit')),
        requiredClassifications:data.getAll('classification'),
      });
    }}>
      <label>مرجع سیاست<input name="policy" required maxLength={120}/></label>
      <label>تعهد بذر SHA-256<input name="commitment" dir="ltr" pattern="[0-9a-f]{64}" required/></label>
      <label>زمان آغاز با اختلاف ساعت<input name="opens" dir="ltr" placeholder="YYYY-MM-DDTHH:mm:ssZ" required/></label>
      <label>زمان پایان با اختلاف ساعت<input name="closes" dir="ltr" placeholder="YYYY-MM-DDTHH:mm:ssZ" required/></label>
      <label>سقف متقاضی<input name="limit" type="number" min="1" max="64" required/></label>
      <fieldset><legend>طبقه‌بندی درس‌های الزامی بر اساس سیاست</legend>
        {[['general','عمومی'],['foundational','پایه'],['core','اصلی'],['specialized','تخصصی'],['elective','اختیاری']].map(([v,l])=>
          <label className="allocation-choice" key={v}><input type="checkbox" name="classification" value={v}/>{l}</label>)}
      </fieldset><button className="button primary" disabled={busy}>ایجاد پیش‌نویس</button>
    </form></details>}
  </section>;
}
