import { parentPort } from 'node:worker_threads';
import { analyzePage } from './analyze-page.ts';
import { extractPageFacts } from './facts.ts';
import type { Interpretation } from './off-thread.ts';

/** A persistent interpreter: one reply per id-tagged request, for the life of the pool. */
parentPort!.on('message', ({ id, input }: { id: number; input: Interpretation }) => {
  try {
    const result =
      input.kind === 'extract'
        ? extractPageFacts(Buffer.from(input.body), input.delivery, input.settings)
        : analyzePage(input.facts, input.context);
    parentPort!.postMessage({ id, result });
  } catch (error) {
    parentPort!.postMessage({
      id,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
});
