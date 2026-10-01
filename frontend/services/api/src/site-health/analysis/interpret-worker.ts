import { parentPort, workerData } from 'node:worker_threads';
import { analyzePage } from './analyze-page.ts';
import { extractPageFacts } from './facts.ts';
import type { Interpretation } from './off-thread.ts';

const input = workerData as Interpretation;
parentPort!.postMessage(
  input.kind === 'extract'
    ? extractPageFacts(Buffer.from(input.body), input.delivery, input.settings)
    : analyzePage(input.facts, input.context),
);
