/**
 * The route-ownership gate (TypeScript migration rules 1 and 4).
 *
 * Holds both stacks to the manifest in `@citeladder/contracts`: every
 * `/api/v1` family is served by exactly the stack the manifest names, a
 * TypeScript family publishes the frozen Python fragment it replaced, and
 * each ingress Caddyfile sends every operation's path to that stack.
 */
import type { RouteStack } from '@citeladder/contracts/route-ownership';

import type { OpenApiDocument } from './document.ts';
import { familyFragment, fragmentDifferences } from './fragment.ts';
import type { IngressOutcome } from './ingress.ts';

export type OwnershipInputs = {
  apiPrefix: string;
  manifest: Readonly<Record<string, RouteStack>>;
  python: OpenApiDocument;
  typescript: OpenApiDocument;
  /** Python fragments frozen before each TypeScript family's router was deleted. */
  frozen: Readonly<Record<string, OpenApiDocument>>;
  /** Each ingress file's router, keyed by its repository path. */
  ingress: Readonly<Record<string, (path: string) => Set<IngressOutcome>>>;
};

type Operation = { label: string; path: string };

const SAMPLE_SEGMENT = '00000000-0000-4000-8000-000000000000';

function familyOperations(
  document: OpenApiDocument,
  apiPrefix: string,
  stack: RouteStack,
  failures: string[],
): Map<string, Operation[]> {
  const families = new Map<string, Operation[]>();
  for (const [path, item] of Object.entries(document.paths)) {
    if (path !== apiPrefix && !path.startsWith(`${apiPrefix}/`)) continue;
    for (const [method, operation] of Object.entries(item)) {
      const label = `${method.toUpperCase()} ${path}`;
      const tags = [...new Set(operation.tags ?? [])];
      if (tags.length !== 1) {
        failures.push(`${stack}: ${label} must carry exactly one family tag, not [${tags}]`);
        continue;
      }
      const family = tags[0]!;
      families.set(family, [...(families.get(family) ?? []), { label, path }]);
    }
  }
  return families;
}

function checkTypeScriptFamily(
  family: string,
  inputs: OwnershipInputs,
  served: { python: Map<string, Operation[]>; typescript: Map<string, Operation[]> },
  failures: string[],
): void {
  const stale = served.python.get(family);
  if (stale) {
    failures.push(
      `'${family}' is TypeScript-owned, but Python still serves ${stale.map((op) => op.label).join(', ')}`,
    );
  }
  if (!served.typescript.has(family)) {
    failures.push(
      `'${family}' is TypeScript-owned, but the TypeScript service declares no route for it`,
    );
  }
  const golden = inputs.frozen[family];
  if (!golden) {
    failures.push(
      `'${family}' has no frozen Python fragment; run \`python -m scripts.export_ts_platform --freeze-family ${family}\` before deleting its Python router`,
    );
    return;
  }
  const differences = fragmentDifferences(
    familyFragment(inputs.typescript, family),
    familyFragment(golden, family),
  );
  for (const difference of differences) failures.push(`'${family}' parity: ${difference}`);
}

function checkIngress(
  inputs: OwnershipInputs,
  served: Map<string, Operation[]>[],
  failures: string[],
): void {
  const owners = new Map<string, { stack: RouteStack; family: string }>();
  for (const families of served) {
    for (const [family, operations] of families) {
      const stack = inputs.manifest[family];
      if (!stack) continue;
      for (const { path } of operations) {
        const existing = owners.get(path);
        if (existing && existing.stack !== stack) {
          failures.push(
            `${path} is shared by '${existing.family}' (${existing.stack}) and '${family}' (${stack}); ingress routes by path, so one path needs one stack`,
          );
        }
        owners.set(path, { stack, family });
      }
    }
  }
  for (const [file, route] of Object.entries(inputs.ingress)) {
    for (const [path, { stack, family }] of owners) {
      const reached = [...route(path.replaceAll(/\{[^}]+\}/gu, SAMPLE_SEGMENT))].filter(
        (outcome) => outcome !== 'respond',
      );
      if (reached.length !== 1 || reached[0] !== stack) {
        failures.push(
          `${file}: ${path} ('${family}') must reach only ${stack}, but reaches [${reached.join(', ')}]`,
        );
      }
    }
  }
}

/** Every way the stacks, frozen fragments and ingress disagree with the manifest. */
export function routeOwnershipFailures(inputs: OwnershipInputs): string[] {
  const failures: string[] = [];
  const served = {
    python: familyOperations(inputs.python, inputs.apiPrefix, 'python', failures),
    typescript: familyOperations(inputs.typescript, inputs.apiPrefix, 'typescript', failures),
  };
  for (const family of served.python.keys()) {
    if (!(family in inputs.manifest)) {
      failures.push(`Python family '${family}' is missing from the route-ownership manifest`);
    }
  }
  for (const family of served.typescript.keys()) {
    if (inputs.manifest[family] !== 'typescript') {
      failures.push(
        `The TypeScript service serves '${family}', which the manifest assigns to ${inputs.manifest[family] ?? 'no stack'}`,
      );
    }
  }
  for (const [family, stack] of Object.entries(inputs.manifest)) {
    if (stack === 'typescript') {
      checkTypeScriptFamily(family, inputs, served, failures);
    } else if (!served.python.has(family)) {
      failures.push(
        `The manifest assigns '${family}' to python, but Python serves no route for it`,
      );
    }
  }
  for (const family of Object.keys(inputs.frozen)) {
    if (inputs.manifest[family] !== 'typescript') {
      failures.push(`A frozen fragment exists for '${family}', which is not TypeScript-owned`);
    }
  }
  checkIngress(inputs, [served.python, served.typescript], failures);
  return failures;
}
