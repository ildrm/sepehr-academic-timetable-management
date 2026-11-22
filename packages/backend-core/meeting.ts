import { z } from 'zod';
import { unavailable } from './problem';

export const interval=z.object({weekDate:z.iso.date(),startMinute:z.number().int().min(0).max(1439),
  endMinute:z.number().int().min(1).max(1440)}).refine(x=>x.startMinute<x.endMinute);
export type Interval=z.infer<typeof interval>;
export function overlaps(a:Interval,b:Interval){
  return a.weekDate===b.weekDate && a.startMinute<b.endMinute && b.startMinute<a.endMinute;
}
export type Meeting={component_id:bigint;room:string;campus:string;zone:string; start_minute:number;
  duration_minutes:number; dates:string[]; exception_dates:unknown};
const exceptions=z.object({cancelled:z.array(z.iso.date()).default([]),added:z.array(interval).default([])}).strict();
export function occurrences(row:Meeting):Interval[]{
  const parsed=exceptions.safeParse(row.exception_dates);
  if(!parsed.success) unavailable('recurrence_unconfigured');
  const data=[...row.dates.filter(d=>!parsed.data.cancelled.includes(d)).map(weekDate=>({
    weekDate,startMinute:row.start_minute,endMinute:row.start_minute+row.duration_minutes
  })),...parsed.data.added];
  const checked=z.array(interval).safeParse(data);
  if(!checked.success) unavailable('recurrence_unconfigured');
  return checked.data;
}

/** Resolve each local boundary using the offsets valid around that date. */
export function absoluteInterval(slot:Interval,zone:string){
  const midnight=Date.parse(slot.weekDate+'T00:00:00Z');
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeZoneName:'longOffset'});
  function resolve(minute:number){
    const local=midnight+minute*60000;
    function offset(at:number){
      const name=format.formatToParts(at).find(x=>x.type==='timeZoneName')?.value;
      if(name==='GMT')return 0;
      const match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(name??'');
      if(!match)unavailable('recurrence_unconfigured');
      return (match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3]))*60000;
    }
    const offsets=new Set([-1,0,1].map(days=>offset(local+days*86400000)));
    const choices=[...offsets].map(o=>({time:local-o,offset:o})).filter(o=>offset(o.time)===o.offset);
    if(choices.length!==1)unavailable('ambiguous_local_time');
    return new Date(choices[0].time);
  }
  const start=resolve(slot.startMinute),end=resolve(slot.endMinute);
  if(start>=end)unavailable('recurrence_unconfigured');
  return {start,end};
}

type DatedSlot = {start:Date;end:Date;campus:string};

export function scheduleIssues(slots:DatedSlot[],travelMinutes?:Record<string,number>) {
  const ordered=[...slots].sort((a,b)=>a.start.getTime()-b.start.getTime());
  const issues=new Set<string>();
  for(let i=1;i<ordered.length;i++){
    const previous=ordered[i-1],current=ordered[i];
    const gap=(current.start.getTime()-previous.end.getTime())/60000;
    if(gap<0){issues.add('schedule_conflict');continue;}
    if(previous.campus===current.campus||gap>=1440)continue;
    const travel=travelMinutes?.[previous.campus+'>'+current.campus];
    if(travel===undefined)issues.add('campus_travel_unconfigured');
    else if(gap<travel)issues.add('schedule_conflict');
  }
  return [...issues].sort();
}
