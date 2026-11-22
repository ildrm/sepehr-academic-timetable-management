import {connect,first,Prisma} from '../../../packages/backend-core/db';

async function check(){
  const db=connect();
  try{
    const heartbeat=await first(db,Prisma.sql`SELECT 1 FROM worker_heartbeat
      WHERE name=${process.env.QUEUE_NAME??'academic-jobs'} AND updated_at>clock_timestamp()-interval '30 seconds'`);
    if(!heartbeat)process.exitCode=1;
  }finally{await db.$disconnect();}
}
void check().catch(()=>{process.exitCode=1;});
