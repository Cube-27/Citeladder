/** The docs site's public API reference is the document `GET /v1/openapi.json` serves. */
import { readFileSync, writeFileSync } from 'node:fs';
import { ROUTE_CONTRACTS } from '../src/openapi/routes.ts';
import { publicApiDocument } from '../src/public-api/openapi.ts';

const path = new URL('../../../apps/docs/src/data/public-api.json', import.meta.url);
const contents = `${JSON.stringify(publicApiDocument(ROUTE_CONTRACTS), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (
    JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(JSON.parse(contents))
  )
    throw new Error(
      'Public API reference is stale; run pnpm --filter @citeladder/api public-api:reference',
    );
} else writeFileSync(path, contents);
