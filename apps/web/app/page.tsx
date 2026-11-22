import { cookies } from 'next/headers';
import { profileSchema } from './client';
import Portal from './portal';
export default async function Page(){
  const jar=await cookies();
  let profile=null;
  if(jar.has('academic_session')){
    try{
      const url=process.env.INTERNAL_API_URL??'http://127.0.0.1:4100';
      const result=await fetch(new URL('/me/portal',url),{headers:{cookie:jar.toString()},cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(result.ok)profile=profileSchema.parse(await result.json());
    }catch{profile=null;}
  }
  return <Portal initial={profile}/>;
}
