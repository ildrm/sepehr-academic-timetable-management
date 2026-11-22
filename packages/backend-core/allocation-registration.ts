import { Transaction } from './db';
import { Problem } from './problem';
import {
  applyChanges, allocationCandidate, allocationSeats,
} from './registration';
import type { AllocationInput, AllocationOutput } from './allocation-model';

type Candidate=NonNullable<Awaited<ReturnType<typeof allocationCandidate>>>;
type Choice=Candidate & {application:string;alternative:string};
type Seats=Awaited<ReturnType<typeof allocationSeats>>;

function reserveAssignments(input:AllocationInput,result:AllocationOutput,choices:Choice[],seats:Seats) {
  const candidates=new Map(choices.map(c=>[c.alternative,c]));
  const options=new Map(input.applicants.flatMap(a=>a.options.map(o=>[o.id,o] as const)));
  const remaining=new Map(seats.map(s=>[s.id,s.capacity]));
  const seen=new Set<string>();
  return result.selected.map(picked=>{
    const candidate=candidates.get(picked.option),option=options.get(picked.option);
    if(!candidate||!option||candidate.application!==picked.application||seen.has(picked.application)
      ||picked.seats.length!==option.claims.length)throw new Problem('ERR-008');
    seen.add(picked.application);
    const assignment=new Map<Candidate['plan']['additions'][number],Map<bigint,bigint|null>>();
    for(const [i,key] of picked.seats.entries()){
      const claim=option.claims[i],remainingCount=remaining.get(key);
      const seat=seats.find(s=>s.id===key);
      if(!seat||!claim.seats.includes(key)||remainingCount===undefined||remainingCount<1)throw new Problem('ERR-008');
      remaining.set(key,remainingCount-1);
      const selection=candidate.plan.additions[claim.index];
      if(!selection||!selection.pools.includes(seat.pool))throw new Problem('ERR-008');
      const entry=assignment.get(selection)??new Map<bigint,bigint|null>();
      if(entry.has(seat.pool))throw new Problem('ERR-008');
      entry.set(seat.pool,seat.reservation);
      assignment.set(selection,entry);
    }
    return {candidate,assignment};
  });
}

export async function commitAllocation(tx:Transaction,input:AllocationInput,result:AllocationOutput,choices:Choice[],seats:Seats,actor:bigint,requestId:string,now:Date){
  const assignments=reserveAssignments(input,result,choices,seats);
  let count=0;
  for(const {candidate,assignment} of assignments){
    await applyChanges(tx,candidate.context,candidate.plan,assignment,actor,'allocation.enrolled',requestId,now);
    count+=candidate.plan.additions.length;
  }
  return count;
}
