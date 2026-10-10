/**
 * The docs guide's Google Cloud sink filter comes from the live crawler catalog.
 * Rewrites the marked block in the AI Traffic article; `--check` fails when it is stale.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gcpLogFilter } from '../src/crawl-logs/gcp-filter.ts';

const path = new URL('../../../apps/docs/src/content/ai-traffic.md', import.meta.url);
const START = '<!-- gcp-log-filter:start -->';
const END = '<!-- gcp-log-filter:end -->';

// A checkout may convert line endings; the article's text is what must match.
const current = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
const start = current.indexOf(START);
const end = current.indexOf(END);
if (start < 0 || end < start) throw new Error(`ai-traffic.md lacks the ${START} block`);
const block = `${START}\n\n\`\`\`text\n${gcpLogFilter()}\n\`\`\`\n\n${END}`;
const next = current.slice(0, start) + block + current.slice(end + END.length);
if (process.argv.includes('--check')) {
  if (next !== current)
    throw new Error(
      'The docs Google Cloud sink filter is stale; run pnpm --filter @citeladder/api crawl:gcp-filter',
    );
} else await writeFile(path, next);
