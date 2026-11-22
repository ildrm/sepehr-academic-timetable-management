import {z} from 'zod';

const id=z.string().min(1).max(150);
const integer=z.number().int().min(0).max(10_000_000);
export const allocationInputSchema=z.object({
  algorithm:z.literal('tier-minimum-then-total-v1'),
  seed:z.string().regex(/^[a-f0-9]{64}$/),
  applicants:z.array(z.object({
    id:z.string().uuid(),tier:integer,requested:integer,
    options:z.array(z.object({
      id,credits:integer,claims:z.array(z.object({index:integer,seats:z.array(id).max(65)})).max(96),
    })).max(4),
  })).max(64),
  seats:z.array(z.object({id,capacity:integer})).max(4096),
});
export type AllocationInput=z.infer<typeof allocationInputSchema>;
export const allocationResultSchema=z.object({
  status:z.enum(['OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN','MODEL_INVALID']),
  selected:z.array(z.object({application:z.string().uuid(),option:id,seats:z.array(id).max(96)})).max(64),
  objective:z.array(integer).max(200),
  solverVersion:id,
});
export type AllocationOutput=z.infer<typeof allocationResultSchema>;
