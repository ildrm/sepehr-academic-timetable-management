import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { z } from 'zod';

const root = resolve(process.env.SPECIFICATION_ROOT ?? 'docx', 'artifacts');
const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: true });
addFormats(ajv);
const schemaRef = (name: string) => resolve(root, 'schemas', name + '.schema.json');
const spec = parse(readFileSync(resolve(root, 'openapi.yaml'), 'utf8'), { maxAliasCount: 20000 });
const apiShapes = z.object({ components: z.object({ schemas: z.record(z.string(), z.record(z.string(), z.unknown())) }) }).parse(spec).components.schemas;
const validators = new Map<string, ReturnType<Ajv2020['compile']>>();
const publicContract = readFileSync(resolve(root, 'openapi.yaml'), 'utf8');
export function openApi() { return publicContract; }
export function apiAccepts(name: string, data: unknown): boolean {
  const shape = apiShapes[name];
  if (!shape) throw new Error('Unregistered API schema');
  let validate=validators.get(name);
  if(!validate){validate=ajv.compile({ components: { schemas: apiShapes }, ...shape });validators.set(name,validate);}
  return Boolean(validate(data));
}
export function nativeAccepts(name: string, data: unknown): boolean {
  const key = schemaRef(name);
  let validate = ajv.getSchema(key);
  if (!validate) {
    const shape = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(key, 'utf8')));
    ajv.addSchema(shape, key);
    validate = ajv.getSchema(key);
  }
  return Boolean(validate?.(data));
}
