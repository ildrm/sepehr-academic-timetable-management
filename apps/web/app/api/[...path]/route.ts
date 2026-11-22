import { NextRequest } from 'next/server';
const segment='[A-Za-z0-9_.~-]+';
const routes=[
  /^session\/(config|development|logout|oidc\/(start|callback))$/,
  /^(me\/(portal|offerings|enrollment-previews|enrollments|drops|swaps|waitlist-entries|registration-finalizations))$/,
  new RegExp('^me/(overview|catalog|degree|suggestions)/'+segment+'$'),
  new RegExp('^me/(requests/'+segment+'/'+segment+'|waitlist-entries/'+segment+'/responses)$'),
  new RegExp('^me/allocations/'+segment+'(?:/'+segment+')?$'),
  new RegExp('^terms/'+segment+'/allocations(?:/'+segment+'/(approval|runs(?:/'+segment+'/publication)?))?$'),
  /^academic\/(imports|courses|rooms|offerings|terms|units|programs)$/,
  new RegExp('^academic/(policies|curricula)(?:/'+segment+'/approval)?$'),
  new RegExp('^staff/students/'+segment+'/(enrollment-changes|records/'+segment+'/corrections)$'),
  new RegExp('^me/(exceptions/'+segment+'|instructor/'+segment+'(/availability)?)$'),
  new RegExp('^terms/'+segment+'/(admissions|registration-windows|capacity-pools/'+segment+'|exceptions(?:/'+segment+'/decisions)?|snapshots|solve-runs(?:/'+segment+')?|timetables(?:/'+segment+'(?:/(validations|publications|impact))?)?|audit|reports/(seats/'+segment+'(?:/export)?|demand(?:/export)?|disruption/'+segment+'(?:/export)?))$'),
];
function internalUrl(){
  const raw=process.env.INTERNAL_API_URL??'http://127.0.0.1:4100';
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid INTERNAL_API_URL');
  return url.origin;
}
async function proxy(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const endpoint=path.join('/');
  if(!routes.some(pattern=>pattern.test(endpoint)))return Response.json({messageKey:'not_found'},{status:404});
  const headers=new Headers();
  for(const key of ['cookie','origin','x-csrf-token','idempotency-key','content-type']){
    const value=req.headers.get(key);if(value)headers.set(key,value);
  }
  try{
    let body:string|undefined;
    if(req.method==='POST'&&req.body){
      const stream=req.body.getReader(),chunks:Uint8Array[]=[];
      let bytes=0;
      for(;;){
        const part=await stream.read();
        if(part.done)break;
        bytes+=part.value.byteLength;
        if(bytes>1_048_576){
          await stream.cancel();
          return Response.json({messageKey:'invalid_input'},{status:400});
        }
        chunks.push(part.value);
      }
      body=Buffer.concat(chunks).toString('utf8');
    }
    const upstream=await fetch(internalUrl()+'/'+endpoint+req.nextUrl.search,{method:req.method,headers,body,
      cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)});
    const out=new Headers({'cache-control':'private, no-store'});
    for(const key of ['content-type','content-disposition','x-request-id','retry-after']){const v=upstream.headers.get(key);if(v)out.set(key,v);}
    if(endpoint.startsWith('session/oidc/')&&upstream.status===303){
      const location=upstream.headers.get('location');
      if(!location||new URL(location).protocol!=='https:')throw new Error('OIDC redirect invalid');
      out.set('location',location);
    }
    for(const cookie of upstream.headers.getSetCookie())out.append('set-cookie',cookie);
    return new Response(upstream.body,{status:upstream.status,headers:out});
  }catch{return Response.json({messageKey:'outcome_uncertain'},{status:503,headers:{'cache-control':'private, no-store'}});}
}
export const GET=proxy;
export const POST=proxy;
