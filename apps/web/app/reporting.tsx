'use client';

import {useState} from 'react';
import {z} from 'zod';
import {api,ApiError} from './client';
import {digits,fa,instant,messages} from './locale';

const seats=z.object({asOf:z.string(),rows:z.array(z.object({
  pool:z.string(),capacity:z.number(),enrolled:z.number(),offers:z.number(),utilization:z.number().nullable(),
}))});
const demand=z.object({asOf:z.string(),entries:z.array(z.object({
  bundle:z.object({sectionId:z.string(),componentIds:z.array(z.string())}),students:z.number(),
}))});
const disruption=z.object({before:z.string(),after:z.string(),affected:z.number()});
type Result={kind:'seats';data:z.infer<typeof seats>}|{kind:'demand';data:z.infer<typeof demand>}|
  {kind:'disruption';data:z.infer<typeof disruption>};

export function Reporting({termId,roles,zone}:{termId:string;roles:string[];zone:string}){
  const modes=[
    ...(roles.includes('academic_office')?[{id:'seats',name:'استفاده از ظرفیت'}]:[]),
    ...(roles.includes('planner')?[{id:'demand',name:'تقاضای در انتظار'}]:[]),
    ...(roles.includes('department_head')?[{id:'disruption',name:'اثر تغییر برنامه'}]:[]),
  ];
  const [kind,setKind]=useState(modes[0]?.id??'');
  const [report,setReport]=useState<Result|null>(null);
  const [download,setDownload]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  if(!modes.length)return null;
  return <section className="panel">
    <h1>گزارش‌ها</h1>
    <form className="actions" onSubmit={event=>{
      event.preventDefault();
      const fields=new FormData(event.currentTarget);
      const unit=String(fields.get('unit')??'');
      const before=String(fields.get('before')??'');
      const after=String(fields.get('after')??'');
      if((kind!=='demand'&&!/^\d{1,19}$/.test(unit))||
        (kind==='disruption'&&[before,after].some(id=>!/^\d{1,19}$/.test(id)))){
        setError('شناسه‌ها را به شکل عدد وارد کنید.');return;
      }
      const route='terms/'+termId+'/reports/'+kind+(kind==='demand'?'':'/'+unit);
      const query=kind==='disruption'?'?'+new URLSearchParams({before,after}):'';
      setError('');setLoading(true);setDownload('');setReport(null);
      void (async()=>{
        if(kind==='seats')setReport({kind,data:await api(route,seats)});
        else if(kind==='demand')setReport({kind,data:await api(route,demand)});
        else setReport({kind:'disruption',data:await api(route+query,disruption)});
        setDownload('/api/'+route+'/export'+query);
      })().catch(e=>setError(e instanceof ApiError?messages[e.problem.messageKey]??fa.message:messages.outcome_uncertain))
        .finally(()=>setLoading(false));
    }}>
      <label>نوع گزارش<select value={kind} disabled={loading} onChange={event=>{
        setKind(event.target.value);setReport(null);setDownload('');setError('');
      }}>{modes.map(mode=><option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label>
      {kind!=='demand'&&<label>شناسه واحد سازمانی<input name="unit" required inputMode="numeric" dir="ltr"/></label>}
      {kind==='disruption'&&<><label>نسخه قبلی<input name="before" required inputMode="numeric" dir="ltr"/></label>
        <label>نسخه بعدی<input name="after" required inputMode="numeric" dir="ltr"/></label></>}
      <button className="button primary" disabled={loading}>نمایش گزارش</button>
    </form>
    {error&&<p role="alert" className="notice bad">{error}</p>}
    {download&&<a className="plain" href={download}>دریافت CSV</a>}
    {report&&report.kind!=='disruption'&&<p className="muted">زمان گزارش · {instant(report.data.asOf,zone)}</p>}
    {report?.kind==='seats'&&<div className="scroll"><table><caption>ظرفیت</caption>
      <thead><tr><th scope="col">مخزن</th><th scope="col">ظرفیت</th><th scope="col">ثبت‌نام</th><th scope="col">پیشنهاد</th></tr></thead>
      <tbody>{report.data.rows.map(row=><tr key={row.pool}>
        <th scope="row">{digits(row.pool)}</th><td>{digits(row.capacity)}</td><td>{digits(row.enrolled)}</td><td>{digits(row.offers)}</td>
      </tr>)}</tbody></table></div>}
    {report?.kind==='demand'&&<div className="scroll"><table><caption>تقاضای در انتظار</caption>
      <thead><tr><th scope="col">بخش</th><th scope="col">اجزا</th><th scope="col">دانشجو در صف</th></tr></thead>
      <tbody>{report.data.entries.map(entry=><tr key={entry.bundle.sectionId+':'+entry.bundle.componentIds.join(',')}>
        <th scope="row">{digits(entry.bundle.sectionId)}</th><td>{entry.bundle.componentIds.map(digits).join('، ')}</td>
        <td>{digits(entry.students)}</td></tr>)}</tbody></table></div>}
    {report?.kind==='disruption'&&<p>دانشجویان متأثر · {digits(report.data.affected)}</p>}
  </section>;
}
