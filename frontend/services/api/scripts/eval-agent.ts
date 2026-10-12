/**
 * Live Agent eval: drives fixed chats through the local Agent API as the
 * development login and records, per turn, the time to the first visible text,
 * the total time, model and tool calls, tokens (cached included) and the saved
 * reply and document. Operator-run only (it calls the configured model and
 * spends provider budget); never part of CI. It reads only the HTTP API and the
 * attempt rows, so the same cases measure any runtime that keeps them.
 *
 *   pnpm --filter @citeladder/api agent:eval --live --label baseline
 *   pnpm --filter @citeladder/api agent:eval --report baseline,native
 *
 * Records append to `agent-eval/<label>.jsonl` in the worktree's Git directory;
 * `--report` prints a metrics table and writes a side-by-side reply review.
 */
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

import { localEnvironment } from '../src/cli/local-environment.ts';
import { loadConfig } from '../src/config.ts';
import { createDatabase, type Database } from '../src/db/database.ts';
import { gitDirectory } from './git-directory.ts';
import raw from '../test/fixtures/agent/eval-cases.json' with { type: 'json' };

const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    label: { type: 'string' },
    case: { type: 'string' },
    project: { type: 'string' },
    api: { type: 'string', default: 'http://127.0.0.1:8100/api/v1' },
    report: { type: 'string' },
  },
});

const turnSchema = z.strictObject({
  message: z.string(),
  skill_id: z.string().optional(),
  action: z.strictObject({ skill_id: z.string(), target_kind: z.string().optional() }).optional(),
});
const cases = z
  .array(
    z.strictObject({
      id: z.string(),
      kind: z.string(),
      turns: z.array(turnSchema).min(1),
      review: z.string(),
    }),
  )
  .parse(raw);

const recordSchema = z.looseObject({
  case: z.string(),
  step: z.number(),
  failed: z.string().optional(),
  run_status: z.string().nullish(),
  run_error: z.string().nullish(),
  first_text_ms: z.number().nullish(),
  total_ms: z.number().nullish(),
  model_calls: z.number().optional(),
  tool_calls: z.number().optional(),
  input_tokens: z.number().optional(),
  cached_input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  message: z.string().optional(),
  reply: z.string().nullish(),
  output: z.unknown().optional(),
});
type EvalRecord = z.infer<typeof recordSchema>;

const directory = join(gitDirectory(process.cwd()), 'agent-eval');

async function live() {
  if (!values.live)
    throw new Error('The Agent eval calls the configured model provider; pass --live to run it');
  if (!values.label) throw new Error('Name the run with --label');
  const env = localEnvironment();
  const config = loadConfig(env);
  const target = new URL(config.databaseUrl);
  if (
    config.appEnv !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  )
    throw new Error('The Agent eval runs only against a local development database');
  if (!env.DEV_LOGIN_EMAIL || !env.DEV_LOGIN_PASSWORD)
    throw new Error('Set DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD for the local development login');
  const db = createDatabase(config);
  try {
    const project = await resolveProject(db, env.DEV_LOGIN_EMAIL, values.project);
    const vars = await placeholders(db, project.id);
    const client = await session(
      values.api,
      env.DEV_LOGIN_EMAIL,
      env.DEV_LOGIN_PASSWORD,
      project.workspaceId,
    );
    await mkdir(directory, { recursive: true });
    const log = join(directory, `${values.label}.jsonl`);
    for (const item of cases) {
      if (values.case && !item.id.startsWith(values.case)) continue;
      let chatId: string | null = null;
      for (const [index, spec] of item.turns.entries()) {
        const step = index + 1;
        try {
          const body = await requestBody(db, project.id, spec, vars, chatId === null);
          const result = await turn(db, client, project.id, chatId, body);
          chatId = result.chat_id;
          const record = { case: item.id, step, ...result };
          await appendFile(log, `${JSON.stringify({ label: values.label, ...record })}\n`);
          console.log(summaryLine(item.id, step, record));
        } catch (error) {
          const failed = error instanceof Error ? error.message : String(error);
          await appendFile(
            log,
            `${JSON.stringify({ label: values.label, case: item.id, step, failed })}\n`,
          );
          console.log(`${item.id}#${step} FAILED ${failed}`);
          break;
        }
      }
    }
    console.log(`Recorded ${log}`);
  } finally {
    await db.destroy();
  }
}

async function resolveProject(db: Database, email: string, requested: string | undefined) {
  const rows = await db
    .selectFrom('projects')
    .innerJoin('workspace_members', 'workspace_members.workspace_id', 'projects.workspace_id')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .select(['projects.id', 'projects.workspace_id', 'projects.name'])
    .where('users.email', '=', email.toLowerCase())
    .orderBy('projects.created_at')
    .execute();
  const project = requested ? rows.find((row) => row.id === requested) : rows[0];
  if (!project) throw new Error('No project for the development login; pass --project');
  console.log(`Project: ${project.name}`);
  return { id: project.id, workspaceId: project.workspace_id };
}

/** Values the cases name, read from the project so the cases fit any local data. */
async function placeholders(db: Database, projectId: string) {
  const project = await db
    .selectFrom('projects')
    .select(['name', 'brand_name'])
    .where('id', '=', projectId)
    .executeTakeFirstOrThrow();
  const prompt = await db
    .selectFrom('actions')
    .select('target_label')
    .where('project_id', '=', projectId)
    .where('target_kind', '=', 'prompt')
    .where('status', '=', 'open')
    .orderBy('priority_score', 'desc')
    .executeTakeFirst();
  const competitor = await db
    .selectFrom('competitors')
    .select('name')
    .where('project_id', '=', projectId)
    .orderBy('created_at')
    .executeTakeFirst();
  return {
    brand: project.brand_name ?? project.name,
    top_prompt: prompt?.target_label ?? 'our most important tracked prompt',
    competitor: competitor?.name ?? 'our closest competitor',
  } as Record<string, string>;
}

async function requestBody(
  db: Database,
  projectId: string,
  spec: z.infer<typeof turnSchema>,
  vars: Record<string, string>,
  first: boolean,
) {
  const message = spec.message.replaceAll(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? key);
  const body: Record<string, unknown> = { message };
  if (spec.skill_id) body.skill_id = spec.skill_id;
  if (spec.action && first) {
    let query = db
      .selectFrom('actions')
      .select('id')
      .where('project_id', '=', projectId)
      .where('status', '=', 'open')
      .where('skill_id', '=', spec.action.skill_id);
    if (spec.action.target_kind) query = query.where('target_kind', '=', spec.action.target_kind);
    const action = await query.orderBy('priority_score', 'desc').executeTakeFirst();
    if (!action) throw new Error(`No open ${spec.action.skill_id} Action in the project`);
    body.action_id = action.id;
  }
  return body;
}

type Client = { api: string; headers: Record<string, string> };

async function session(
  api: string,
  email: string,
  password: string,
  workspaceId: string,
): Promise<Client> {
  const response = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { api, headers: { Cookie: cookie, 'X-Workspace-Id': workspaceId } };
}

async function call(client: Client, path: string, init: RequestInit = {}) {
  const response = await fetch(`${client.api}${path}`, {
    ...init,
    headers: {
      ...client.headers,
      'X-Request-ID': randomUUID(),
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}

const acceptedSchema = z.looseObject({
  chat_id: z.string(),
  run: z.looseObject({ id: z.string() }),
});
const detailSchema = z.looseObject({
  messages: z.array(z.looseObject({ role: z.string(), content: z.string() })),
  latest_run: z.looseObject({ status: z.string(), error_code: z.string().nullish() }).nullable(),
  output: z
    .looseObject({
      phase: z.string(),
      latest_revision: z
        .looseObject({
          number: z.number(),
          title: z.string(),
          body: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

async function turn(
  db: Database,
  client: Client,
  projectId: string,
  chatId: string | null,
  body: Record<string, unknown>,
) {
  const path = chatId ? `/agent/chats/${chatId}/messages` : `/projects/${projectId}/agent/chats`;
  const accepted = acceptedSchema.parse(
    await (
      await call(client, path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify(body),
      })
    ).json(),
  );
  const timing = await stream(client, accepted.chat_id, accepted.run.id);
  const detail = detailSchema.parse(
    await (await call(client, `/agent/chats/${accepted.chat_id}`)).json(),
  );
  const reply = detail.messages.findLast((message) => message.role === 'agent');
  const usage = await attempts(db, accepted.run.id);
  return {
    chat_id: accepted.chat_id,
    run_id: accepted.run.id,
    message: String(body.message),
    run_status: detail.latest_run?.status ?? null,
    run_error: detail.latest_run?.error_code ?? timing.error,
    ...timing,
    ...usage,
    reply: reply?.content ?? null,
    output: detail.output?.latest_revision
      ? {
          phase: detail.output.phase,
          revision: detail.output.latest_revision.number,
          title: detail.output.latest_revision.title,
          body: detail.output.latest_revision.body,
        }
      : null,
  };
}

/** Times the first visible text whatever the event shape, so old and new runtimes compare. */
async function stream(client: Client, chatId: string, runId: string) {
  const started = performance.now();
  const response = await call(client, `/agent/chats/${chatId}/runs/${runId}/run`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
  });
  const timing = {
    first_event_ms: null as number | null,
    first_text_ms: null as number | null,
    total_ms: 0,
    events: {} as Record<string, number>,
    error: null as string | null,
  };
  if (!response.body) throw new Error('The run answered without a stream');
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    for (let cut = buffer.indexOf('\n\n'); cut >= 0; cut = buffer.indexOf('\n\n')) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data) continue;
      const event = z.looseObject({ type: z.string() }).safeParse(JSON.parse(data));
      if (!event.success) continue;
      const at = Math.round(performance.now() - started);
      const { type } = event.data;
      timing.first_event_ms ??= at;
      timing.events[type] = (timing.events[type] ?? 0) + 1;
      const fields = event.data as Record<string, unknown>;
      const visible =
        type === 'reply_delta' ||
        type === 'document_delta' ||
        (type === 'text' && Boolean(fields.reply || fields.body));
      if (visible) timing.first_text_ms ??= at;
      if (type === 'error') timing.error = String(fields.code);
    }
  }
  timing.total_ms = Math.round(performance.now() - started);
  return timing;
}

async function attempts(db: Database, runId: string) {
  const calls = await db
    .selectFrom('agent_model_attempts')
    .select([
      'ordinal',
      'latency_ms',
      'input_tokens',
      'cached_input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'finish_status',
    ])
    .where('run_id', '=', runId)
    .orderBy('ordinal')
    .execute();
  const tools = await db
    .selectFrom('agent_tool_attempts')
    .select(['ordinal', 'tool_name', 'status'])
    .where('run_id', '=', runId)
    .orderBy('ordinal')
    .execute();
  const sum = (
    key: 'input_tokens' | 'cached_input_tokens' | 'output_tokens' | 'reasoning_tokens',
  ) => calls.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  return {
    model_calls: calls.length,
    tool_calls: tools.length,
    input_tokens: sum('input_tokens'),
    cached_input_tokens: sum('cached_input_tokens'),
    output_tokens: sum('output_tokens'),
    reasoning_tokens: sum('reasoning_tokens'),
    calls: calls.map((row) => ({ ...row, latency_ms: Number(row.latency_ms) })),
    tools: tools.map((row) => `${row.ordinal}:${row.tool_name}:${row.status}`),
  };
}

function summaryLine(id: string, step: number, record: EvalRecord) {
  return (
    `${id}#${step} ${record.run_status}${record.run_error ? ` ${record.run_error}` : ''} ` +
    `first_text=${record.first_text_ms}ms total=${record.total_ms}ms calls=${record.model_calls} ` +
    `tools=${record.tool_calls} in=${record.input_tokens} cached=${record.cached_input_tokens} out=${record.output_tokens}`
  );
}

async function load(label: string) {
  const text = await readFile(join(directory, `${label}.jsonl`), 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => recordSchema.parse(JSON.parse(line)));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

function metrics(records: EvalRecord[]) {
  const done = records.filter((record) => !record.failed);
  const numbers = (key: keyof EvalRecord) =>
    done.map((record) => record[key]).filter((value): value is number => typeof value === 'number');
  const total = (key: keyof EvalRecord) => numbers(key).reduce((sum, value) => sum + value, 0);
  const seconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
  const input = total('input_tokens');
  return {
    Turns: `${done.length} of ${records.length}`,
    Succeeded: String(done.filter((record) => record.run_status === 'succeeded').length),
    'First text, median': seconds(percentile(numbers('first_text_ms'), 50)),
    'First text, p90': seconds(percentile(numbers('first_text_ms'), 90)),
    'Total, median': seconds(percentile(numbers('total_ms'), 50)),
    'Total, p90': seconds(percentile(numbers('total_ms'), 90)),
    'Model calls per turn': (total('model_calls') / Math.max(1, done.length)).toFixed(1),
    'Tool calls per turn': (total('tool_calls') / Math.max(1, done.length)).toFixed(1),
    'Input tokens per turn': Math.round(input / Math.max(1, done.length)).toLocaleString('en'),
    'Cached share of input': input
      ? `${((100 * total('cached_input_tokens')) / input).toFixed(0)}%`
      : '—',
    'Output tokens per turn': Math.round(
      total('output_tokens') / Math.max(1, done.length),
    ).toLocaleString('en'),
  } as Record<string, string>;
}

async function report(labels: string[]) {
  const runs = await Promise.all(
    labels.map(async (label) => ({ label, records: await load(label) })),
  );
  const tables = runs.map((run) => metrics(run.records));
  const rows = Object.keys(tables[0] ?? {}).map(
    (metric) => `| ${metric} | ${tables.map((table) => table[metric]).join(' | ')} |`,
  );
  const table = [
    `| Metric | ${labels.join(' | ')} |`,
    `|---|${labels.map(() => '---').join('|')}|`,
    ...rows,
  ].join('\n');
  console.log(table);
  const review = cases.flatMap((item) =>
    item.turns.map((_, index) => {
      const step = index + 1;
      const answers = runs.map((run) => {
        const record = run.records.find(
          (candidate) => candidate.case === item.id && candidate.step === step,
        );
        const output = z
          .object({ phase: z.string(), title: z.string(), body: z.string() })
          .nullish()
          .safeParse(record?.output);
        const document =
          output.success && output.data
            ? `\n\n**Document (${output.data.phase}): ${output.data.title}**\n\n${output.data.body}`
            : '';
        return `### ${run.label}\n\n${record?.failed ? `Failed: ${record.failed}` : `${record?.reply ?? '(no turn)'}${document}`}`;
      });
      const asked = runs
        .map(
          (run) =>
            run.records.find((record) => record.case === item.id && record.step === step)?.message,
        )
        .find(Boolean);
      return [
        `## ${item.id} · turn ${step}`,
        `**Asked:** ${asked ?? item.turns[index]!.message}`,
        `**Check:** ${item.review}`,
        ...answers,
      ].join('\n\n');
    }),
  );
  const file = join(directory, `report-${labels.join('-vs-')}.md`);
  await writeFile(file, [`# Agent eval: ${labels.join(' vs ')}`, table, ...review].join('\n\n'));
  console.log(`\nReview written to ${file}`);
}

// Runs after every declaration above is initialised.
if (values.report) await report(values.report.split(','));
else await live();
