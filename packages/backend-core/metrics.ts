const bounds=[0.025,0.05,0.1,0.25,0.5,1,2.5,5,10,30];
type Series={count:number;sum:number;buckets:number[]};
const requests=new Map<string,Series>();
const retries=new Map<string,number>();

export function recordHttp(method:string,path:string,status:number,seconds:number){
  const known=path.match(/\/(enrollments|drops|swaps|registration-finalizations|publications|validations|allocations|solve-runs)(\/|$)/)?.[1]??'other';
  const verb=['GET','POST'].includes(method)?method:'other';
  const outcome=status>=500?'error':status===409?'conflict':status===429?'limited':status>=400?'rejected':'success';
  const key=`method="${verb}",operation="${known}",outcome="${outcome}"`;
  const series=requests.get(key)??{count:0,sum:0,buckets:bounds.map(()=>0)};
  series.count++;series.sum+=seconds;
  for(let i=0;i<bounds.length;i++)if(seconds<=bounds[i])series.buckets[i]++;
  requests.set(key,series);
}

export function recordTransactionRetry(reason:'deadlock'|'serialization'|'exhausted'){
  retries.set(reason,(retries.get(reason)??0)+1);
}

export function prometheusHttpStats(){
  const lines=['# TYPE academic_http_duration_seconds histogram','# TYPE academic_transaction_retries_total counter'];
  for(const [labels,data] of requests){
    for(let i=0;i<bounds.length;i++)lines.push(`academic_http_duration_seconds_bucket{${labels},le="${bounds[i]}"} ${data.buckets[i]}`);
    lines.push(`academic_http_duration_seconds_bucket{${labels},le="+Inf"} ${data.count}`);
    lines.push(`academic_http_duration_seconds_count{${labels}} ${data.count}`);
    lines.push(`academic_http_duration_seconds_sum{${labels}} ${data.sum}`);
  }
  for(const [reason,count] of retries)lines.push(`academic_transaction_retries_total{reason="${reason}"} ${count}`);
  return lines.join('\n')+'\n';
}
