/** Every API operation carries one declared route family, and every family is served. */
import type { OpenApiDocument } from './document.ts';
import { onlyOf } from '../lists.ts';

export type OwnershipInputs = {
  /** The browser API and API-host machine prefixes. */
  prefixes: readonly string[];
  families: readonly string[];
  typescript: OpenApiDocument;
};

export function routeOwnershipFailures(inputs: OwnershipInputs): string[] {
  const failures: string[] = [];
  const declared = new Set<string>();
  for (const family of inputs.families) {
    if (declared.has(family)) failures.push(`'${family}' is listed more than once`);
    declared.add(family);
  }
  const served = new Set<string>();
  for (const [path, item] of Object.entries(inputs.typescript.paths)) {
    if (!inputs.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))
      continue;
    for (const [method, operation] of Object.entries(item)) {
      const family = onlyOf(new Set(operation.tags ?? []));
      if (family === undefined) {
        failures.push(`${method.toUpperCase()} ${path} must carry exactly one family tag`);
        continue;
      }
      served.add(family);
      if (!declared.has(family))
        failures.push(`${method.toUpperCase()} ${path} serves '${family}', which is not a family`);
    }
  }
  for (const family of declared)
    if (!served.has(family)) failures.push(`'${family}' has no declared route`);
  return failures;
}
