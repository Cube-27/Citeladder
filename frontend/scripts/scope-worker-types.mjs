import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2] === 'marketing' ? 'marketing' : 'app';
const path = new URL(`../apps/${target}/worker-configuration.d.ts`, import.meta.url);
const generated = await readFile(path, 'utf8');
if (!generated.includes('interface Env extends __BaseEnv_Env {}')) {
  throw new Error('Wrangler environment type shape changed.');
}
const withoutNodeEnvironment = generated.replace(/declare namespace NodeJS \{[\s\S]*?\n\}\s*$/, '');
const scoped = `export {};
type Fetcher = { fetch(request: Request): Promise<Response> };
${withoutNodeEnvironment}
export type WorkerEnv = Env;
`;
await writeFile(path, scoped);
