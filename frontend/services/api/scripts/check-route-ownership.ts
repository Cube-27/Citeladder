/** Check that every native route declares one manifest family and every family is served. */
import { ROUTE_OWNERSHIP } from '@citeladder/contracts/route-ownership';

import { policy } from '../src/config.ts';
import { openApiDocument } from '../src/openapi/document.ts';
import { routeOwnershipFailures } from '../src/openapi/ownership.ts';
import { ROUTE_CONTRACTS } from '../src/openapi/routes.ts';

const failures = routeOwnershipFailures({
  prefixes: [policy.api.prefix, policy.api.machine_prefix],
  manifest: ROUTE_OWNERSHIP,
  typescript: openApiDocument(ROUTE_CONTRACTS),
});

if (failures.length > 0) {
  process.stderr.write(
    `Route ownership failed:\n${failures.map((line) => `- ${line}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Route ownership passed: ${Object.keys(ROUTE_OWNERSHIP).length} native families.\n`,
);
