import { Prisma, PrismaClient } from '@prisma/client';
import {databaseUrl} from './config';
import { PrismaPg } from '@prisma/adapter-pg';

export function connect() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
}

export type Database = PrismaClient;
export type Transaction = Prisma.TransactionClient;
export type Reader = Database | Transaction;
export { Prisma };

export function numericId(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value)) return 0n;
  const id = BigInt(value);
  return id <= 9223372036854775807n ? id : 0n;
}

export async function first<T>(db: Reader, query: Prisma.Sql): Promise<T | undefined> {
  return (await db.$queryRaw<T[]>(query))[0];
}

export async function decisionClock(db: Reader) {
  const row = await first<{ now: Date }>(db, Prisma.sql`SELECT clock_timestamp() AS now`);
  if (!row) throw new Error('Database clock unavailable');
  return row.now;
}
