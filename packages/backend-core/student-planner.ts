import {Actor} from './auth';
import {Database,first,Prisma} from './db';
import {catalog} from './portal';
import {preview,Bundle} from './registration';
import {Problem} from './problem';

export async function suggest(db:Database,actor:Actor,term:bigint,filter:string,preferred:string[]){
  return db.$transaction(async tx=>{
    const offerings=await catalog(tx,actor,term,filter,undefined,0n,18,preferred);
    const version=await first<{id:string}>(tx,Prisma.sql`SELECT id::text FROM timetable_version
      WHERE term_id=${term} AND state='published'`);
    const candidates=[0,1,2,3].flatMap(variant=>offerings.flatMap(o=>{
      const b=o.bundles[variant];
      return b?[{title:o.title,code:o.code.toUpperCase(),bundle:{sectionId:b.sectionId,componentIds:b.componentIds}}]:[];
    }));
    const budget=32;
    const results:{titles:string[];bundles:Bundle[];policyVersion:string;matchedPreferences:string[];timetableVersion:string}[]=[];
    let examined=0;
    async function check(items:typeof candidates){
      if(examined>=budget)return;
      examined++;
      const bundles=items.map(x=>x.bundle);
      try{
        const decision=await preview(tx,actor,term,{add:bundles,dropEnrollmentIds:[]});
        if(version&&(decision.decision==='accepted'||decision.decision==='exception')){
          results.push({titles:items.map(x=>x.title),bundles,policyVersion:decision.policyVersion,
            timetableVersion:version.id,matchedPreferences:preferred.filter(code=>items.some(item=>item.code===code))});
        }
      }catch(e){if(!(e instanceof Problem)||e.code!=='ERR-004')throw e;}
    }
    if(version){
      const samples=candidates.slice(0,8);
      for(const item of samples)await check([item]);
      for(const [index,item] of samples.entries()){
        for(const other of candidates.slice(index+1,index+5)){
          if(item.code!==other.code)await check([item,other]);
        }
      }
    }
    results.sort((a,b)=>{
      for(const code of preferred){
        const gain=Number(b.matchedPreferences.includes(code))-Number(a.matchedPreferences.includes(code));
        if(gain)return gain;
      }
      return b.bundles.length-a.bundles.length;
    });
    return {results:results.slice(0,6),examined,limited:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
}
