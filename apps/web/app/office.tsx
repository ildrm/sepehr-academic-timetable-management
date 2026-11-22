'use client';
import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {api,ApiError} from './client';
import {fa,instant,messages,digits} from './locale';

const grantRows=z.array(z.object({id:z.string(),state:z.string(),ruleCode:z.string(),validUntil:z.string()}));
const grantResponse=z.object({id:z.string(),state:z.string()});
export function Exceptions({termId,zone,admin}:{termId:string;zone:string;admin:boolean}){
  const [rows,setRows]=useState<z.infer<typeof grantRows>>([]);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [reason,setReason]=useState('');
  const path=admin?'terms/'+termId+'/exceptions':'me/exceptions/'+termId;
  const issue=(e:unknown)=>setNotice(e instanceof ApiError?(messages[e.problem.messageKey]??fa.message):messages.outcome_uncertain);
  const refresh=useCallback(()=>api(path,grantRows).then(setRows).catch(issue),[path]);
  useEffect(()=>{if(termId)void refresh();},[termId,refresh]);
  async function send(endpoint:string,payload:unknown){
    setBusy(true);setNotice('');
    try{await api(endpoint,grantResponse,payload);setNotice(fa.confirmed);await refresh();}
    catch(e){issue(e);}finally{setBusy(false);}
  }
  return <section className="panel"><h1>{fa.exceptions}</h1>{notice&&<p role="status">{notice}</p>}
    {!admin&&<form className="actions" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void send(path,{ruleCode:f.get('rule'),reasonRef:f.get('reason'),validUntil:f.get('until')});}}>
      <label>{fa.ruleCode}<input name="rule" dir="ltr" required/></label><label>{fa.reasonRef}<input name="reason" required/></label>
      <label>{fa.expiryIso}<input name="until" placeholder="2030-03-01T10:00:00Z" dir="ltr" required/></label>
      <button className="button primary" disabled={busy}>{fa.commit}</button></form>}
    {admin&&<label>{fa.reasonRef}<input value={reason} onChange={e=>setReason(e.target.value)}/></label>}
    {rows.map(r=><div className="line-row" key={r.id}><span><bdi>{r.ruleCode}</bdi> · {messages[r.state]??r.state} · {instant(r.validUntil,zone)}</span>
      {admin&&<div className="actions">
        {r.state==='requested'&&<><button className="button primary" disabled={busy||!reason.trim()} onClick={()=>void send(path+'/'+r.id+'/decisions',{decision:'approve',reasonRef:reason})}>{fa.approve}</button>
          <button className="button light" disabled={busy||!reason.trim()} onClick={()=>void send(path+'/'+r.id+'/decisions',{decision:'reject',reasonRef:reason})}>{fa.reject}</button></>}
        {r.state==='approved'&&<button className="button light" disabled={busy||!reason.trim()} onClick={()=>void send(path+'/'+r.id+'/decisions',{decision:'revoke',reasonRef:reason})}>{fa.revoke}</button>}</div>}</div>)}
    {!rows.length&&<p className="muted">{fa.empty}</p>}</section>;
}
const faculty=z.object({workloadLimit:z.string(),availability:z.array(z.object({start:z.string(),end:z.string()})),
  meetings:z.array(z.object({course:z.string(),room:z.string(),duration:z.number()}))});
export function Instructor({termId,zone}:{termId:string;zone:string}){
  const [value,setValue]=useState<z.infer<typeof faculty>|null>(null);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const path='me/instructor/'+termId;
  const fail=(e:unknown)=>setNotice(e instanceof ApiError?(messages[e.problem.messageKey]??fa.message):messages.outcome_uncertain);
  const refresh=useCallback(()=>api(path,faculty).then(setValue).catch(fail),[path]);
  useEffect(()=>{if(termId)void refresh();},[termId,refresh]);
  return <section className="panel"><h1>{fa.faculty}</h1>{notice&&<p role="status">{notice}</p>}
    {value&&<><p>{fa.workload} {digits(value.workloadLimit)}</p>
      <h2>{fa.availability}</h2>{value.availability.map(v=><div className="line-row" key={v.start+v.end}><span>{instant(v.start,zone)}</span><span>{instant(v.end,zone)}</span></div>)}
      <form className="actions" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setNotice('');
        void api(path+'/availability',z.object({id:z.string()}),{start:f.get('start'),end:f.get('end')}).then(()=>{setNotice(fa.confirmed);return refresh();}).catch(fail).finally(()=>setBusy(false));}}>
        <label>{fa.startIso}<input name="start" placeholder="2030-03-01T09:00:00Z" dir="ltr" required/></label>
        <label>{fa.endIso}<input name="end" placeholder="2030-03-01T10:00:00Z" dir="ltr" required/></label>
        <button className="button primary" disabled={busy}>{fa.commit}</button></form>
      <h2>{fa.schedule}</h2>{value.meetings.map((m,i)=><div className="line-row" key={m.course+i}><span>{m.course}</span><bdi>{m.room}</bdi></div>)}
    </>}</section>;
}
