/**
 * CPU-bound page interpretation stays off the network worker's event loop, on a
 * small persistent pool: spawning a thread (and loading the analyzer) per page
 * cost more than many analyses on a one-vCPU runner. Each job has a time
 * limit: a thread that overruns it is replaced, so one pathological page never
 * stalls the jobs queued behind it.
 */
import { Worker } from 'node:worker_threads';
import { policy } from '../../config.ts';
import { resolveSettingSpec } from '../../config/settings.ts';
import type { analyzePage, PageContext } from './analyze-page.ts';
import type { Delivery, factSettings, PageFacts } from './facts.ts';
import type { Facts } from './read-facts.ts';
import type { discoveryLinks } from '../discovery-links.ts';
import type { Scope } from '../url-admission.ts';

export type Interpretation =
  | {
      kind: 'extract';
      body: Uint8Array;
      delivery: Delivery;
      settings: ReturnType<typeof factSettings>;
    }
  | { kind: 'analyze'; facts: Facts; context: PageContext }
  | {
      kind: 'discover';
      body: Uint8Array;
      delivery: Delivery;
      settings: ReturnType<typeof factSettings>;
      scope: Scope;
    };

type Pending = {
  input: Interpretation;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
/** A thread runs its jobs in arrival order, so the first pending job is the running one. */
type Slot = {
  worker: Worker;
  pending: Map<number, Pending>;
  /** The running job the timer limits. */
  running?: number;
  timer?: NodeJS.Timeout;
};
type Reply = { id: number; result?: unknown; error?: string };

const slots: Slot[] = [];
let nextId = 0;

const settings = policy.site_health.settings;
const poolSize = () =>
  Math.max(1, Number(resolveSettingSpec(settings.interpretation_worker_threads, process.env)));
const jobTimeoutMs = () =>
  Number(resolveSettingSpec(settings.interpretation_job_timeout_seconds, process.env)) * 1000;

class InterpretationTimeoutError extends Error {
  constructor() {
    super('Page interpretation exceeded its time limit');
    this.name = 'InterpretationTimeoutError';
  }
}

/**
 * Idle threads never keep a draining job process alive, and the running job's
 * time limit starts when it reaches the head of its thread.
 */
function settle(slot: Slot) {
  if (slot.pending.size) slot.worker.ref();
  else slot.worker.unref();
  const running = slot.pending.keys().next().value;
  if (running === slot.running) return;
  clearTimeout(slot.timer);
  slot.running = running;
  slot.timer =
    running === undefined ? undefined : setTimeout(() => expire(slot, running), jobTimeoutMs());
}

/** The running job overran: fail it, retire its thread and move the queued jobs to another. */
function expire(slot: Slot, id: number) {
  const job = slot.pending.get(id);
  if (!job) return;
  const index = slots.indexOf(slot);
  if (index >= 0) slots.splice(index, 1);
  const queued = [...slot.pending].filter(([key]) => key !== id);
  slot.pending.clear();
  slot.running = undefined;
  slot.timer = undefined;
  void slot.worker.terminate();
  job.reject(new InterpretationTimeoutError());
  for (const [, waiting] of queued) post(waiting);
}

function start(): Slot {
  const worker = new Worker(new URL('./interpret-worker.ts', import.meta.url), {
    // Do not inherit a test runner's preload/loader into the native TS worker.
    execArgv: [],
  });
  const slot: Slot = { worker, pending: new Map() };
  worker.on('message', ({ id, result, error }: Reply) => {
    const job = slot.pending.get(id);
    if (!job) return;
    slot.pending.delete(id);
    settle(slot);
    if (error === undefined) job.resolve(result);
    else job.reject(new Error(error));
  });
  // A crashed thread fails only its own jobs; the next request starts a replacement.
  const fail = (error: Error) => {
    const index = slots.indexOf(slot);
    if (index >= 0) slots.splice(index, 1);
    for (const job of slot.pending.values()) job.reject(error);
    slot.pending.clear();
    clearTimeout(slot.timer);
    slot.running = undefined;
    slot.timer = undefined;
  };
  worker.on('error', fail);
  worker.on('exit', (code) => fail(new Error(`Page interpretation exited (${code})`)));
  slots.push(slot);
  return slot;
}

/** The least-busy thread, starting one while the pool is below its size. */
function slot(): Slot {
  const idle = slots.find((candidate) => candidate.pending.size === 0);
  if (idle) return idle;
  const [first, ...rest] = slots;
  if (!first || slots.length < poolSize()) return start();
  return rest.reduce(
    (best, candidate) => (candidate.pending.size < best.pending.size ? candidate : best),
    first,
  );
}

function post(job: Pending) {
  const target = slot();
  const id = nextId++;
  target.pending.set(id, job);
  settle(target);
  target.worker.postMessage({ id, input: job.input });
}

function interpret<T>(input: Interpretation): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    post({ input, resolve: resolve as (value: unknown) => void, reject });
  });
}

export const extractFactsAsync = (
  body: Uint8Array,
  delivery: Delivery,
  settings: ReturnType<typeof factSettings>,
) => interpret<Facts>({ kind: 'extract', body, delivery, settings });

export const analyzePageAsync = (facts: Facts, context: PageContext) =>
  interpret<ReturnType<typeof analyzePage>>({ kind: 'analyze', facts, context });

/** A discovered page's links and facts from one parse of the whole document. */
export const discoverAsync = (
  body: Uint8Array,
  delivery: Delivery,
  settings: ReturnType<typeof factSettings>,
  scope: Scope,
) =>
  interpret<{ discovery: ReturnType<typeof discoveryLinks>; facts: PageFacts }>({
    kind: 'discover',
    body,
    delivery,
    settings,
    scope,
  });
