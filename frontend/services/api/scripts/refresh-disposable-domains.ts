import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPOSITORY = 'disposable-email-domains/disposable-email-domains';
const LIST_PATH = 'disposable_email_blocklist.conf';
const OUTPUT = fileURLToPath(
  new URL('../src/config/disposable-email-domains.json', import.meta.url),
);
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/u;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

const commit = z
  .object({ sha: z.string().regex(/^[0-9a-f]{40}$/u) })
  .parse(
    JSON.parse(await fetchText(`https://api.github.com/repos/${REPOSITORY}/commits/main`)),
  ).sha;
const source = `https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${LIST_PATH}`;
const domains = [
  ...new Set(
    (await fetchText(source))
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('#')),
  ),
].sort((a, b) => (a < b ? -1 : Number(a > b)));
const malformed = domains.filter((domain) => !DOMAIN.test(domain));
if (malformed.length) throw new Error(`Unexpected entries: ${malformed.slice(0, 5).join(', ')}`);
if (domains.length < 1_000) throw new Error(`Only ${domains.length} domains; refusing to shrink.`);

const document = {
  source: `https://github.com/${REPOSITORY}/blob/${commit}/${LIST_PATH}`,
  license: 'CC0-1.0',
  retrieved_on: new Date().toISOString().slice(0, 10),
  refresh: 'pnpm --filter @citeladder/api disposable-domains:refresh',
  domains,
};
writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`Wrote ${domains.length} domains from ${commit}.\n`);
