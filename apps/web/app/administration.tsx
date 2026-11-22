'use client';
import {useState} from 'react';
import {z} from 'zod';
import {api,ApiError} from './client';
import {fa,messages} from './locale';

type Entry={label:string;route:string;admin?:boolean;term?:boolean};
const entries:Entry[]=[
  {label:'درس جدید',route:'academic/courses'},{label:'گروه و اجزای درس',route:'academic/offerings'},
  {label:'پذیرش دانشجو',route:'admissions',term:true},{label:'پیش‌نویس مقررات',route:'academic/policies'},
  {label:'پیش‌نویس سرفصل',route:'academic/curricula'},{label:'ورود سوابق آموزشی',route:'academic/imports'},
  {label:'واحد سازمانی',route:'academic/units',admin:true},{label:'برنامه تحصیلی',route:'academic/programs',admin:true},
  {label:'نیمسال جدید',route:'academic/terms',admin:true},{label:'مهلت عملیات',route:'registration-windows',term:true,admin:true},
  {label:'تأیید مقررات',route:'academic/policies',admin:true},{label:'تأیید سرفصل',route:'academic/curricula',admin:true},
  {label:'ظرفیت استخر مشترک',route:'capacity-pools',term:true,admin:true},
];
export function Administration({termId,admin}:{termId:string;admin:boolean}){
  const options=entries.filter(x=>Boolean(x.admin)===admin);
  const [active,setActive]=useState(0),[resource,setResource]=useState(''),[raw,setRaw]=useState('');
  const [busy,setBusy]=useState(false),[output,setOutput]=useState(''),[error,setError]=useState('');
  const entry=options[active];
  const approval=admin&&['academic/policies','academic/curricula'].includes(entry.route);
  const pool=entry.route==='capacity-pools';
  return <section className="panel"><h1>{fa.administration}</h1>
    <form onSubmit={event=>{
      event.preventDefault();setError('');setOutput('');
      const parsed=z.record(z.string(),z.unknown()).safeParse((()=>{
        try{return JSON.parse(raw);}catch{return null;}
      })());
      if(!parsed.success){setError(messages.invalid_input);return;}
      const base=entry.term?'terms/'+termId+'/'+entry.route:entry.route;
      if((approval||pool)&&!/^\d+$/.test(resource)){setError(messages.invalid_input);return;}
      const path=approval?base+'/'+resource+'/approval':pool?base+'/'+resource:base;
      setBusy(true);
      void api(path,z.record(z.string(),z.unknown()),parsed.data)
        .then(value=>setOutput(JSON.stringify(value,null,2)))
        .catch(e=>setError(e instanceof ApiError?(messages[e.problem.messageKey]??fa.message):messages.outcome_uncertain))
        .finally(()=>setBusy(false));
    }}>
      <div className="actions"><label>{fa.operation}<select value={active} onChange={e=>{
        setActive(Number(e.target.value));setOutput('');setError('');setResource('');setRaw('');
      }}>{options.map((x,i)=><option key={x.label} value={i}>{x.label}</option>)}</select></label>
      {(approval||pool)&&<label>{fa.resourceId}<input value={resource} onChange={e=>setResource(e.target.value)} inputMode="numeric" dir="ltr" required/></label>}</div>
      <label>{fa.operationData}<textarea rows={9} dir="ltr" value={raw} onChange={e=>setRaw(e.target.value)} required spellCheck={false}/></label>
      <button className="button primary" disabled={busy}>{fa.commit}</button>
    </form>
    {output&&<pre dir="ltr" role="status">{output}</pre>}
    {error&&<p role="alert" className="notice bad">{error}</p>}
  </section>;
}
