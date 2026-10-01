/** CPU-bound page interpretation stays off the network worker's event loop. */
import { Worker } from 'node:worker_threads';
import type { analyzePage, PageContext } from './analyze-page.ts';
import type { Delivery, factSettings } from './facts.ts';
import type { Facts } from './read-facts.ts';

export type Interpretation =
  | {
      kind: 'extract';
      body: Uint8Array;
      delivery: Delivery;
      settings: ReturnType<typeof factSettings>;
    }
  | { kind: 'analyze'; facts: Facts; context: PageContext };

function interpret<T>(input: Interpretation): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./interpret-worker.ts', import.meta.url), {
      workerData: input,
      // Do not inherit a test runner's preload/loader into the native TS worker.
      execArgv: [],
    });
    let received = false;
    worker.once('message', (result: T) => {
      received = true;
      resolve(result);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (!received) reject(new Error(`Page interpretation exited without a result (${code})`));
    });
  });
}

export const extractFactsAsync = (
  body: Uint8Array,
  delivery: Delivery,
  settings: ReturnType<typeof factSettings>,
) => interpret<Facts>({ kind: 'extract', body, delivery, settings });

export const analyzePageAsync = (facts: Facts, context: PageContext) =>
  interpret<ReturnType<typeof analyzePage>>({ kind: 'analyze', facts, context });
