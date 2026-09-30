/**
 * The route-ownership gate (TypeScript migration rule 1).
 *
 * Holds both stacks to the manifest in `@citeladder/contracts`: every
 * `/api/v1` family is served by exactly the stack the manifest names, and
 * each ingress Caddyfile sends every operation's path to that stack.
 */
import type { RouteStack } from '@citeladder/contracts/route-ownership';

import type { OpenApiDocument } from './document.ts';
import type { IngressOutcome } from './ingress.ts';

export type OwnershipInputs = {
  apiPrefix: string;
  manifest: Readonly<Record<string, RouteStack>>;
  python: OpenApiDocument;
  typescript: OpenApiDocument;
  /** Each ingress file's router, keyed by its repository path. */
  ingress: Readonly<Record<string, (path: string) => Set<IngressOutcome>>>;
  /** Non-browser protocol endpoints also have a single ingress owner. */
  protocolPaths?: readonly string[];
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
}

/** Each served path's owning stack, reporting paths that two stacks would share. */
function pathOwners(
  manifest: OwnershipInputs['manifest'],
  served: Map<string, Operation[]>[],
  failures: string[],
): Map<string, { stack: RouteStack; family: string }> {
  const owners = new Map<string, { stack: RouteStack; family: string }>();
  for (const families of served) {
    for (const [family, operations] of families) {
      const stack = manifest[family];
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
  return owners;
}

/** The stacks an ingress sends `path` to, or null when that is exactly `stack`. */
function misrouted(route: (path: string) => Set<IngressOutcome>, path: string, stack: RouteStack) {
  const reached = [...route(path)].filter((outcome) => outcome !== 'respond');
  return reached.length === 1 && reached[0] === stack ? null : reached.join(', ');
}

function checkIngress(
  inputs: OwnershipInputs,
  served: Map<string, Operation[]>[],
  failures: string[],
): void {
  const owners = pathOwners(inputs.manifest, served, failures);
  for (const [file, route] of Object.entries(inputs.ingress)) {
    for (const [path, { stack, family }] of owners) {
      // The negated class cannot match the closing brace, so matching is linear.
      const sample = path.replaceAll(/\{[^}]+\}/gu, SAMPLE_SEGMENT); // NOSONAR
      const reached = misrouted(route, sample, stack);
      if (reached !== null)
        failures.push(
          `${file}: ${path} ('${family}') must reach only ${stack}, but reaches [${reached}]`,
        );
    }
    for (const path of inputs.protocolPaths ?? []) {
      const reached = misrouted(route, path, 'typescript');
      if (reached !== null)
        failures.push(
          `${file}: protocol ${path} must reach only typescript, but reaches [${reached}]`,
        );
    }
  }
}

/** Every served family is in the manifest, on the stack the manifest names. */
function checkManifest(
  manifest: OwnershipInputs['manifest'],
  served: { python: Map<string, Operation[]>; typescript: Map<string, Operation[]> },
  failures: string[],
): void {
  for (const family of served.python.keys()) {
    if (!(family in manifest)) {
      failures.push(`Python family '${family}' is missing from the route-ownership manifest`);
    }
  }
  for (const family of served.typescript.keys()) {
    if (manifest[family] !== 'typescript') {
      failures.push(
        `The TypeScript service serves '${family}', which the manifest assigns to ${manifest[family] ?? 'no stack'}`,
      );
    }
  }
  for (const [family, stack] of Object.entries(manifest)) {
    if (stack === 'typescript') {
      checkTypeScriptFamily(family, served, failures);
    } else if (!served.python.has(family)) {
      failures.push(
        `The manifest assigns '${family}' to python, but Python serves no route for it`,
      );
    }
  }
}

/** Every way the stacks and ingress disagree with the manifest. */
export function routeOwnershipFailures(inputs: OwnershipInputs): string[] {
  const failures: string[] = [];
  const served = {
    python: familyOperations(inputs.python, inputs.apiPrefix, 'python', failures),
    typescript: familyOperations(inputs.typescript, inputs.apiPrefix, 'typescript', failures),
  };
  checkManifest(inputs.manifest, served, failures);
  checkIngress(inputs, [served.python, served.typescript], failures);
  return failures;
}
